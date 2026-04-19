import { google } from '@ai-sdk/google';
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateText,
  Output,
  streamText,
  wrapLanguageModel,
  type UIMessage,
} from 'ai';
import { lmstudio } from '../../../../../utils.ts';
import z from 'zod';
import { searchEmails } from './bm25.ts';
import { devToolsMiddleware } from '@ai-sdk/devtools';
import type { OpenAICompatibleProviderOptions } from '@ai-sdk/openai-compatible';
import { xai } from '@ai-sdk/xai';

const KEYWORD_GENERATOR_SYSTEM_PROMPT = `
  You are a helpful email assistant, able to search through emails for information.
  Your job is to generate a list of keywords which will be used in bm25 algorithm to search emails.

  output schema:
  {
    keywords: string[]
  }
`;

const modelLMStudio = wrapLanguageModel({
  model: lmstudio(''),
  middleware: [devToolsMiddleware()],
});

const modelXAi = wrapLanguageModel({
  model: xai('grok-4-1-fast-reasoning'),
  middleware: [devToolsMiddleware()],
});

export const POST = async (req: Request): Promise<Response> => {
  const body: { messages: UIMessage[] } = await req.json();
  const { messages } = body;
  const modelMessages = await convertToModelMessages(messages);

  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      // TODO: Implement a keyword generator that generates a list of keywords
      // based on the conversation history. Use generateObject to do this.
      const keywords = await generateText({
        model: modelXAi,
        system: KEYWORD_GENERATOR_SYSTEM_PROMPT,
        messages: modelMessages,
        output: Output.object({
          schema: z.object({
            keywords: z.array(z.string()),
          }),
          description:
            'A list of keywords which will be used in bm25 algorithm to search emails.',
          name: 'keywords',
        }),
        providerOptions: {
          lmstudio: {
            strictJsonSchema: true,
          } satisfies OpenAICompatibleProviderOptions,
        },
      });

      // TODO: Use the searchEmails function to get the top X number of
      // search results based on the keywords
      const topSearchResults = await searchEmails(
        keywords.output.keywords,
      );

      const emailSnippets = [
        '## Email Snippets',
        ...topSearchResults.map((result, i) => {
          const from = result.email?.from || 'unknown';
          const to = result.email?.to || 'unknown';
          const subject =
            result.email?.subject || `email-${i + 1}`;
          const body = result.email?.body || '';
          const score = result.score;

          return [
            `### 📧 Email ${i + 1}: [${subject}](#${subject.replace(/[^a-zA-Z0-9]/g, '-')})`,
            `**From:** ${from}`,
            `**To:** ${to}`,
            `**Relevance Score:** ${score.toFixed(3)}`,
            body,
            '---',
          ].join('\n\n');
        }),
        '## Instructions',
        "Based on the emails above, please answer the user's question. Always cite your sources using the email subject in markdown format.",
      ].join('\n\n');

      const answer = streamText({
        model: modelLMStudio,
        system: `You are a helpful email assistant that answers questions based on email content.
          You should use the provided emails to answer questions accurately.
          ALWAYS cite sources using markdown formatting with the email subject as the source.
          Be concise but thorough in your explanations.
        `,
        messages: [
          ...modelMessages,
          {
            role: 'user',
            content: emailSnippets,
          },
        ],
      });

      writer.merge(answer.toUIMessageStream());
    },
  });

  return createUIMessageStreamResponse({
    stream,
  });
};
