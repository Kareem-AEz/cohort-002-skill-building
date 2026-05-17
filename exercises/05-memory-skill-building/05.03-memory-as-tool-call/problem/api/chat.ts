import { google } from '@ai-sdk/google';
import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  gateway,
  generateId,
  stepCountIs,
  streamText,
  tool,
  wrapLanguageModel,
  type UIMessage,
} from 'ai';
import { z } from 'zod';
import {
  loadMemories,
  saveMemories,
  deleteMemory,
  updateMemory,
  type DB,
} from './memory-persistence.ts';
import { devToolsMiddleware } from '@ai-sdk/devtools';

export type MyMessage = UIMessage<unknown, {}>;

const formatMemory = (memory: DB.MemoryItem) => {
  return [
    `Memory: ${memory.memory}`,
    `ID: ${memory.id}`,
    `Created At: ${memory.createdAt}`,
    `Updated At: ${memory.updatedAt}`,
  ].join('\n');
};

const manageMemoriesTool = (
  memoryIdEnums: z.ZodEnum<Record<string, string>>,
) =>
  tool({
    description:
      'Manage user memories by adding new ones, updating existing ones, or deleting outdated/incorrect ones. Call this when the user shares personal information, contradicts previous statements, or explicitly asks to remember/forget something.',
    inputSchema: z.object({
      additions: z
        .array(z.string())
        .describe('New memories to add'),
      updates: z.array(
        z.object({
          id: memoryIdEnums.describe(
            'The ID of the existing memory to update',
          ),
          memory: z
            .string()
            .describe('The updated memory content'),
        }),
      ),
      deletions: z
        .array(memoryIdEnums)
        .describe('The IDs of the memories to delete'),
    }),
    execute: async ({ additions, updates, deletions }) => {
      console.log('Memory IDs', memoryIdEnums.options);
      console.log('Updates', updates);
      console.log('Deletions', deletions);
      console.log('Additions', additions);

      // Only delete memories that are not being updated
      const filteredDeletions = deletions.filter(
        (deletion: string) =>
          !updates.some((update) => update.id === deletion),
      );

      updates.forEach((update) =>
        updateMemory(update.id, {
          memory: update.memory,
          updatedAt: new Date().toISOString(),
        }),
      );

      filteredDeletions.forEach((deletion) =>
        deleteMemory(deletion),
      );

      saveMemories(
        additions.map((addition) => ({
          id: generateId(),
          memory: addition,
          createdAt: new Date().toISOString(),
        })),
      );

      return {
        success: true,
        message: `Updated ${updates.length} memories, deleted ${filteredDeletions.length} memories, added ${additions.length} new memories.`,
      };
    },
  });

const model = wrapLanguageModel({
  model: gateway('deepseek/deepseek-v4-flash'),
  middleware: [devToolsMiddleware()],
});

export const POST = async (req: Request): Promise<Response> => {
  const body: { messages: MyMessage[] } = await req.json();
  const { messages } = body;

  const memories = await loadMemories();
  const memoryIds = memories.map((memory) => memory.id);
  const memoryIdEnums = z.enum([...memoryIds]);

  const memoriesText = memories.map(formatMemory).join('\n\n');

  const result = streamText({
    model,
    system: `You are a personal AI assistant for the user. You build a long-term understanding of them through conversation, and you have a tool — \`manageMemories\` — that gives you persistent storage between sessions.

    Today's date is ${new Date().toISOString().split('T')[0]}.

    ## What you already know about the user

    Each memory below has an ID, content, and timestamps. The \`createdAt\` timestamp tells you when the fact was first learned, NOT when it became true — a fact learned today may have been true for years, and a fact learned years ago may no longer be current. When in doubt, treat older memories as candidates for confirmation rather than ground truth.

    <memories>
    ${memoriesText}
    </memories>

    ## When to call manageMemories

    Call the tool when the user:
    - Shares a new durable fact about themselves (name, location, work, family, preferences, skills, goals, values).
    - Corrects, contradicts, or refines an existing memory.
    - Explicitly asks you to remember or forget something.

    Do NOT call the tool when:
    - The user is asking a question, chatting casually, or expressing a momentary state ("I'm tired," "thanks").
    - The information is situational and won't matter next week ("I'm at the airport," "my laptop is being slow today").
    - You're tempted to record what the assistant said or did. Memories are about the user.

    ## Choosing between additions, updates, and deletions

    - **Update** an existing memory when the user is refining the same fact. If they previously said "2-3 years" and now say "5 years," update the existing memory; do not add a parallel one. Find the ID in <memories>.
    - **Delete** when the user retracts a fact entirely ("I never actually did that") or when a memory is plainly wrong.
    - **Add** only when the fact has no relationship to anything in <memories>.

    When deciding between add and update: prefer update. Two memories about the same topic are almost always a bug.

    ## Writing memories well

    - Third person, present tense: "User works as a backend engineer."
    - One fact per memory. Do not pack multiple facts into one string.
    - **Preserve the user's hedges.** If they say "I think it might be 5 years," store "User estimates ~5 years studying." Do not promote uncertainty to certainty.
    - **Do not infer beyond what was said.** If they mention "3D work," don't extrapolate to "architectural visualization" unless they used that phrase.
    - Include temporal qualifiers the user volunteered ("when I was young," "recently," "since 2024").

    ## Order of operations

    Call the tool **before** writing the user-facing text that references it. Do not write "I've remembered that" or "Memory updated" unless a tool call has actually completed. After the tool returns successfully, you may confirm naturally.
    `,
    messages: await convertToModelMessages(messages),
    tools: {
      manageMemories: manageMemoriesTool(memoryIdEnums),
    },
    stopWhen: [stepCountIs(10)],
  });

  return createUIMessageStreamResponse({
    stream: result.toUIMessageStream(),
  });
};
