import { searchChunksFromQuery } from './search.ts';

export const GET = async (req: Request): Promise<Response> => {
  const url = new URL(req.url);
  const query = url.searchParams.get('query') || '';
  const page = parseInt(url.searchParams.get('page') || '1', 10);
  const pageSize = parseInt(
    url.searchParams.get('pageSize') || '20',
    10,
  );
  const rerankCount = parseInt(
    url.searchParams.get('rerankCount') || '30',
    10,
  );

  if (!query.trim()) {
    return Response.json(
      { error: 'query parameter is required' },
      { status: 400 },
    );
  }

  const { routerOutput, results } = await searchChunksFromQuery({
    query,
    rerankCount,
  });

  const totalChunks = results.length;
  const avgChars = totalChunks
    ? Math.round(
        results.reduce((sum, c) => sum + c.chunk.length, 0) /
          totalChunks,
      )
    : 0;
  const pageCount = Math.max(1, Math.ceil(totalChunks / pageSize));

  const startIndex = (page - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedChunks = results.slice(startIndex, endIndex);

  const pageScores = paginatedChunks.map((c) => c.rrfScore);
  const minScore =
    pageScores.length > 0 ? Math.min(...pageScores) : 0;
  const maxScore =
    pageScores.length > 0 ? Math.max(...pageScores) : 0;

  const chunksWithIndices = paginatedChunks.map((item, idx) => ({
    index: startIndex + idx,
    content: item.chunk,
    bm25Score: item.bm25Score,
    embeddingScore: item.embeddingScore,
    rrfScore: item.rrfScore,
    rerankStatus: item.rerankStatus,
  }));

  return Response.json({
    chunks: chunksWithIndices,
    router: routerOutput,
    stats: {
      total: totalChunks,
      avgChars,
      pageCount,
      currentPage: page,
      minScore,
      maxScore,
    },
  });
};
