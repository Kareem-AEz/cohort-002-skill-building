import { google } from '@ai-sdk/google';
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  gateway,
  generateId,
  generateText,
  Output,
  streamText,
  wrapLanguageModel,
  type UIMessage,
} from 'ai';
import { z } from 'zod';
import {
  loadMemories,
  saveMemories,
  type DB,
} from './memory-persistence.ts';
import { devToolsMiddleware } from '@ai-sdk/devtools';

const model = wrapLanguageModel({
  model: gateway('deepseek/deepseek-v4-flash'),
  middleware: [devToolsMiddleware()],
});

export type MyMessage = UIMessage<unknown, {}>;

const formatMemory = (memory: DB.MemoryItem) => {
  return [
    `Memory: ${memory.memory}`,
    `Created At: ${memory.createdAt}`,
  ].join('\n');
};

export const POST = async (req: Request): Promise<Response> => {
  const body: { messages: MyMessage[] } = await req.json();
  const { messages } = body;

  // TODO: Use the loadMemories function to load the memories from the database
  const memories = loadMemories();

  // TODO: Format the memories to display in the UI using the formatMemory function
  const memoriesText = memories.map(formatMemory).join('\n\n');

  const stream = createUIMessageStream<MyMessage>({
    execute: async ({ writer }) => {
      const result = streamText({
        model,
        system: `You are a helpful assistant that can answer questions and help with tasks.

        The date is ${new Date().toISOString().split('T')[0]}.

        You have access to the following memories:

        <memories>
        ${memoriesText}
        </memories>
        `,
        messages: await convertToModelMessages(messages),
      });

      writer.merge(result.toUIMessageStream());
    },
    onFinish: async (response) => {
      const allMessages = [...messages, ...response.messages];

      // TODO: Generate the memories using the generateObject function
      // Pass it the entire message history and the existing memories
      // Write a system prompt that tells the LLM to only focus on permanent memories
      // and not temporary or situational information
      const memoriesResult = await generateText({
        model,
        system: `You are a memory extraction agent. Your task is to analyze the conversation history and extract permanent memories about the user.

        <existing-memories>
        ${memoriesText}
        </existing-memories>

        Extract any new permanent memories from this conversation. Return an array of memory strings that should be added to the user's permanent memory. Each memory should be a concise, factual statement about the user.

        If no new permanent memories are found, return an empty array.
        `,
        messages: await convertToModelMessages(allMessages),
        output: Output.object({
          name: 'memories',
          description:
            "The new memories to add to the user's permanent memory",
          schema: z.object({
            memories: z.array(z.string()),
          }),
        }),
      });

      const newMemories = memoriesResult.output.memories;

      // TODO: Save the new memories to the database using the saveMemories function
      saveMemories(
        newMemories.map((memory) => ({
          id: generateId(),
          memory,
          createdAt: new Date().toISOString(),
        })),
      );
    },
  });

  return createUIMessageStreamResponse({
    stream,
  });
};
