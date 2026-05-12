import { searchEmailsViaBM25 } from './bm25.ts';
import { searchEmailsViaEmbeddings } from './embeddings.ts';
import { reciprocalRankFusion, type Email } from './utils.ts';

export type EmailWithScores = {
  email: Email;
  bm25Score: number;
  embeddingScore: number;
  rrfScore: number;
};

export const searchEmails = async (opts: {
  keywordsForBM25: string[];
  embeddingsQuery: string;
}): Promise<EmailWithScores[]> => {
  const bm25SearchResults = await searchEmailsViaBM25(
    opts.keywordsForBM25,
  );

  const embeddingsSearchResults =
    await searchEmailsViaEmbeddings(opts.embeddingsQuery);

  console.dir(
    {
      bm5: bm25SearchResults[0],
      semantics: embeddingsSearchResults[0],
    },
    {
      depth: null,
    },
  );

  const rrfResults = reciprocalRankFusion([
    bm25SearchResults,
    embeddingsSearchResults,
  ]);

  // Create maps for quick lookup of individual scores
  const bm25Map = new Map(
    bm25SearchResults.map((r) => [r.email.id, r.score]),
  );
  const embeddingMap = new Map(
    embeddingsSearchResults.map((r) => [r.email.id, r.score]),
  );

  // Combine all scores for each email
  return rrfResults.map((result) => ({
    email: result.email,
    bm25Score: bm25Map.get(result.email.id) || 0,
    embeddingScore: embeddingMap.get(result.email.id) || 0,
    rrfScore: result.score,
  }));
};
