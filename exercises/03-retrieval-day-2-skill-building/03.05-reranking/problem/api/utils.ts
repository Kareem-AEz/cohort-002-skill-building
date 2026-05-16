import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { createHash } from 'crypto';
import { readFile } from 'fs/promises';
import path from 'path';

export type Chunk = {
  id: string;
  content: string;
};

export const loadBookText = async (): Promise<string> => {
  const BOOK_LOCATION = path.resolve(
    import.meta.dirname,
    '../../../../../datasets/total-typescript-book.md',
  );

  const content = await readFile(BOOK_LOCATION, 'utf8');
  return content;
};

export const createChunks = async (): Promise<Chunk[]> => {
  const bookText = await loadBookText();

  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 2000,
    chunkOverlap: 200,
    separators: [
      // First, try to split along Markdown headings (starting with level 2)
      '\n--- CHAPTER ---\n',
      '\n## ',
      '\n### ',
      '\n#### ',
      '\n##### ',
      '\n###### ',
      // Note the alternative syntax for headings (below) is not handled here
      // Heading level 2
      // ---------------
      // End of code block
      '```\n\n',
      // Horizontal lines
      '\n\n***\n\n',
      '\n\n---\n\n',
      '\n\n___\n\n',
      // Note that this splitter doesn't handle horizontal lines defined
      // by *three or more* of ***, ---, or ___, but this is not handled
      '\n\n',
      '\n',
      ' ',
      '',
    ],
  });

  const chunkTexts = await splitter.splitText(bookText);

  return chunkTexts.map((content) => ({
    id: hashChunk(content),
    content,
  }));
};

export const hashChunk = (content: string): string => {
  return createHash('sha256').update(content).digest('hex');
};

const RRF_K = 60;

export function reciprocalRankFusion(
  rankings: { chunk: string; score: number }[][],
): { chunk: string; score: number }[] {
  return weightedReciprocalRankFusion(
    rankings.map((ranking) => ({ ranking, weight: 1 })),
  );
}

export function weightedReciprocalRankFusion(
  sources: {
    ranking: { chunk: string; score: number }[];
    weight: number;
  }[],
): { chunk: string; score: number }[] {
  const rrfScores = new Map<string, number>();
  const chunkMap = new Map<
    string,
    { chunk: string; score: number }
  >();

  sources.forEach(({ ranking, weight }) => {
    ranking.forEach((doc, rank) => {
      const currentScore = rrfScores.get(doc.chunk) || 0;
      const contribution = weight / (RRF_K + rank);
      rrfScores.set(doc.chunk, currentScore + contribution);
      chunkMap.set(doc.chunk, doc);
    });
  });

  return Array.from(rrfScores.entries())
    .sort(([, a], [, b]) => b - a)
    .map(([chunkContent]) => ({
      chunk: chunkMap.get(chunkContent)!.chunk,
      score: rrfScores.get(chunkContent)!,
    }));
}

export const fusionWeightsForMode = (
  mode: 'lexical' | 'semantic' | 'balanced' | 'hyde',
): { bm25: number; embedding: number } => {
  switch (mode) {
    case 'lexical':
      return { bm25: 0.7, embedding: 0.3 };
    case 'semantic':
      return { bm25: 0.3, embedding: 0.7 };
    case 'balanced':
      return { bm25: 0.5, embedding: 0.5 };
    case 'hyde':
      return { bm25: 0.2, embedding: 0.8 };
  }
};
