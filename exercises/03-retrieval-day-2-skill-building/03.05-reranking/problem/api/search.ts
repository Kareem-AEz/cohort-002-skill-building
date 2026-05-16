import { rerank } from 'ai';
import { searchViaBM25 } from './bm25.ts';
import { searchChunksViaEmbeddings } from './embeddings.ts';
import { routeQuery, type RetrievalMode } from './router.ts';
import {
  createChunks,
  fusionWeightsForMode,
  weightedReciprocalRankFusion,
} from './utils.ts';

export type RerankStatus =
  | 'approved'
  | 'rejected'
  | 'not-passed';

export type ChunkWithScores = {
  chunk: string;
  bm25Score: number;
  embeddingScore: number;
  rrfScore: number;
  rerankStatus: RerankStatus;
  rerankOrder?: number; // Position in reranker's output (lower = more relevant)
};

type SearchOpts = {
  keywordsForBM25?: string[];
  embeddingsQuery?: string;
  hydePassage?: string | null;
  queryVariants?: string[];
  mode?: RetrievalMode;
  rerankCount?: number;
};

export const searchChunks = async (
  opts: SearchOpts,
): Promise<ChunkWithScores[]> => {
  const chunks = await createChunks();
  const chunkTexts = chunks.map((c) => c.content);
  const mode: RetrievalMode = opts.mode ?? 'balanced';
  const weights = fusionWeightsForMode(mode);

  // --- Lexical ---
  const bm25SearchResults =
    opts.keywordsForBM25 && opts.keywordsForBM25.length > 0
      ? await searchViaBM25(chunkTexts, opts.keywordsForBM25)
      : [];

  // --- Semantic: run primary + HyDE + variants in parallel ---
  // Track each source's role so we can weight them differently in fusion.
  type EmbedSourceKind = 'primary' | 'hyde' | 'variant';
  const embeddingSources: { query: string; kind: EmbedSourceKind }[] = [];
  if (opts.embeddingsQuery)
    embeddingSources.push({
      query: opts.embeddingsQuery,
      kind: 'primary',
    });
  if (mode === 'hyde' && opts.hydePassage)
    embeddingSources.push({
      query: opts.hydePassage,
      kind: 'hyde',
    });
  if (opts.queryVariants?.length)
    embeddingSources.push(
      ...opts.queryVariants.map(
        (q): { query: string; kind: EmbedSourceKind } => ({
          query: q,
          kind: 'variant',
        }),
      ),
    );

  const embeddingRankings = await Promise.all(
    embeddingSources.map((s) =>
      searchChunksViaEmbeddings(chunks, s.query),
    ),
  );

  // --- Weighted fusion ---
  // Primary semantic query dominates the embedding budget. HyDE is a
  // strong secondary signal. Variants are tertiary — each contributes
  // a little, collectively they don't drown the primary.
  const BASE_WEIGHTS: Record<EmbedSourceKind, number> = {
    primary: 1.0,
    hyde: 0.4,
    variant: 0.15,
  };

  const totalBase = embeddingSources.reduce(
    (sum, s) => sum + BASE_WEIGHTS[s.kind],
    0,
  );

  const embeddingFusionSources = embeddingRankings.map(
    (ranking, i) => ({
      ranking,
      weight:
        totalBase > 0
          ? (BASE_WEIGHTS[embeddingSources[i]!.kind] / totalBase) *
            weights.embedding
          : 0,
    }),
  );

  const rrfResults = weightedReciprocalRankFusion([
    ...(bm25SearchResults.length > 0
      ? [{ ranking: bm25SearchResults, weight: weights.bm25 }]
      : []),
    ...embeddingFusionSources,
  ]);

  // --- Per-chunk score maps for UI display ---
  const bm25Map = new Map(
    bm25SearchResults.map((r) => [r.chunk, r.score]),
  );
  // Show the best embedding score across all sources (semantic + HyDE + variants).
  const embeddingMap = new Map<string, number>();
  for (const ranking of embeddingRankings) {
    for (const r of ranking) {
      const prev = embeddingMap.get(r.chunk) ?? -Infinity;
      if (r.score > prev) embeddingMap.set(r.chunk, r.score);
    }
  }

  if (!opts.rerankCount || opts.rerankCount === 0) {
    return rrfResults.map((result) => ({
      chunk: result.chunk,
      bm25Score: bm25Map.get(result.chunk) || 0,
      embeddingScore: embeddingMap.get(result.chunk) || 0,
      rrfScore: result.score,
      rerankStatus: 'not-passed' as RerankStatus,
    }));
  }

  // --- Rerank top N ---
  const topResultsForReranking = rrfResults.slice(
    0,
    opts.rerankCount,
  );

  const searchQuery = [
    opts.keywordsForBM25?.join(' '),
    opts.embeddingsQuery,
  ]
    .filter(Boolean)
    .join(' ');

  const { ranking } = await rerank({
    model: 'voyage/rerank-2.5-lite',
    documents: topResultsForReranking.map((r) => r.chunk),
    query: searchQuery,
  });

  // Precision filter: keep only chunks the reranker is actually confident about.
  // Cap at 10 to avoid runaway approvals on very-relevant corpora.
  const SCORE_THRESHOLD = 0.3;
  const MAX_APPROVED = 10;
  const approvedRanking = ranking
    .filter((r) => r.score >= SCORE_THRESHOLD)
    .slice(0, MAX_APPROVED);

  const rerankOrderMap = new Map(
    approvedRanking.map((r, index) => [
      topResultsForReranking[r.originalIndex]!.chunk,
      index,
    ]),
  );

  const passedToRerankerSet = new Set(
    topResultsForReranking.map((r) => r.chunk),
  );

  const chunksWithStatus = rrfResults.map((result) => {
    const rerankOrder = rerankOrderMap.get(result.chunk);
    let rerankStatus: RerankStatus;

    if (rerankOrder !== undefined) {
      rerankStatus = 'approved';
    } else if (passedToRerankerSet.has(result.chunk)) {
      rerankStatus = 'rejected';
    } else {
      rerankStatus = 'not-passed';
    }

    return {
      chunk: result.chunk,
      bm25Score: bm25Map.get(result.chunk) || 0,
      embeddingScore: embeddingMap.get(result.chunk) || 0,
      rrfScore: result.score,
      rerankStatus,
      rerankOrder,
    };
  });

  return chunksWithStatus.sort((a, b) => {
    if (
      a.rerankStatus === 'approved' &&
      b.rerankStatus === 'approved'
    ) {
      return (a.rerankOrder ?? 0) - (b.rerankOrder ?? 0);
    }
    if (a.rerankStatus === 'approved') return -1;
    if (b.rerankStatus === 'approved') return 1;

    if (
      a.rerankStatus === 'rejected' &&
      b.rerankStatus === 'rejected'
    ) {
      return b.rrfScore - a.rrfScore;
    }
    if (a.rerankStatus === 'rejected') return -1;
    if (b.rerankStatus === 'rejected') return 1;

    return b.rrfScore - a.rrfScore;
  });
};

/**
 * Entry point: takes a raw user query, runs it through the router,
 * and executes the full retrieval pipeline using the router's decisions.
 */
export const searchChunksFromQuery = async (opts: {
  query: string;
  rerankCount?: number;
}): Promise<{
  routerOutput: Awaited<ReturnType<typeof routeQuery>>;
  results: ChunkWithScores[];
}> => {
  const routerOutput = await routeQuery(opts.query);

  const results = await searchChunks({
    keywordsForBM25: routerOutput.keywords,
    embeddingsQuery: routerOutput.semanticQuery,
    hydePassage: routerOutput.hydePassage,
    queryVariants: routerOutput.queryVariants,
    mode: routerOutput.mode,
    rerankCount: opts.rerankCount,
  });

  return { routerOutput, results };
};
