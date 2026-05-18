import { cosineSimilarity, embed } from 'ai';
import type { VoyageEmbeddingModelOptions } from '@ai-sdk/voyage';
import type { DB } from './memory-persistence.ts';

export const searchMemoriesViaEmbeddings = async (
  memories: DB.MemoryItem[],
  query: string,
) => {
  const queryEmbedding = await embed({
    model: 'voyage/voyage-4-lite',
    value: query,
    providerOptions: {
      voyage: {
        inputType: 'query',
        outputDimension: 512,
      } satisfies VoyageEmbeddingModelOptions,
    },
  }).then((result) => result.embedding);

  const scores = memories.map((memory) => {
    return {
      score: cosineSimilarity(queryEmbedding, memory.embedding),
      memory,
    };
  });

  return scores.sort((a, b) => b.score - a.score);
};

export const EMBED_CACHE_KEY = 'memories-voyage-large';

export const embedMemory = async (memory: string) => {
  return embed({
    model: 'voyage/voyage-4-large',
    value: memory,
    providerOptions: {
      voyage: {
        inputType: 'query',
        outputDimension: 512,
      } satisfies VoyageEmbeddingModelOptions,
    },
  }).then((result) => result.embedding);
};
