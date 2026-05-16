import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { readFileSync } from 'fs';
import path from 'path';

const splitter = new RecursiveCharacterTextSplitter({
  // TODO: Set chunk size and overlap
  chunkSize: 2000,
  chunkOverlap: 100,
  separators: [
    '\n--- CHAPTER ---\n', // Chapter boundaries (highest priority)
    '\n## ', // h2 sections
    '\n### ', // h3 subsections
    '\n#### ', // h4
    '\n##### ', // h5
    '\n###### ', // h6
    '```\n\n', // Code block ends
    '\n\n***\n\n', // Horizontal rules
    '\n\n---\n\n', // Horizontal rules (alt)
    '\n\n___\n\n', // Horizontal rules (alt)
    '\n\n', // Paragraph breaks
    '\n', // Line breaks
  ],
});

const bookText = readFileSync(
  path.join(
    import.meta.dirname,
    '../../../../../datasets/total-typescript-book.md',
  ),
  'utf-8',
);

export const GET = async (req: Request): Promise<Response> => {
  const url = new URL(req.url);
  const search = url.searchParams.get('search') || '';
  const page = parseInt(url.searchParams.get('page') || '1', 10);
  const pageSize = parseInt(
    url.searchParams.get('pageSize') || '20',
    10,
  );

  // Split text into chunks
  const allChunks = await splitter.splitText(bookText);

  // Filter chunks based on search query
  const filteredChunks = search
    ? allChunks.filter((chunk) =>
        chunk.toLowerCase().includes(search.toLowerCase()),
      )
    : allChunks;

  // Calculate stats
  const totalChunks = filteredChunks.length;
  const avgChars =
    totalChunks > 0
      ? Math.round(
          filteredChunks.reduce(
            (sum, chunk) => sum + chunk.length,
            0,
          ) / totalChunks,
        )
      : 0;
  const pageCount = Math.ceil(totalChunks / pageSize);

  // Paginate
  const startIdx = (page - 1) * pageSize;
  const endIdx = startIdx + pageSize;
  const paginatedChunks = filteredChunks.slice(startIdx, endIdx);

  // Return chunks with their original indices
  const chunksWithIndices = paginatedChunks.map(
    (chunk, localIdx) => ({
      index: startIdx + localIdx,
      content: chunk,
    }),
  );

  return Response.json({
    chunks: chunksWithIndices,
    stats: {
      total: totalChunks,
      avgChars,
      pageCount,
      currentPage: page,
    },
  });
};
