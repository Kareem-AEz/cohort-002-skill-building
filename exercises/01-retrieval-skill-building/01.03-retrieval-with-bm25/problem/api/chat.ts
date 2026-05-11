import { google } from '@ai-sdk/google';
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  gateway,
  generateText,
  Output,
  streamText,
  wrapLanguageModel,
  type UIMessage,
} from 'ai';
import { z } from 'zod';
import { searchEmails, type Email } from './bm25.ts';
import { devToolsMiddleware } from '@ai-sdk/devtools';

const KEYWORD_GENERATOR_SYSTEM_PROMPT = `
  You are a helpful email assistant, able to search through emails for information.
  Your job is to generate a list of keywords which will be used in bm25 algorithm to search emails.

  output schema:
  {
    keywords: string[]
  }
`;

const model = wrapLanguageModel({
  model: gateway('deepseek/deepseek-v4-flash'),
  middleware: [devToolsMiddleware()],
});

export type MyUIMessage = UIMessage<
  never,
  {
    keywords: string[];
    emails: (Email & { score: number })[];
  }
>;

export const POST = async (req: Request): Promise<Response> => {
  const body: { messages: MyUIMessage[] } = await req.json();
  const { messages } = body;
  const modelMessages = await convertToModelMessages(messages);

  const stream = createUIMessageStream<MyUIMessage>({
    execute: async ({ writer }) => {
      // TODO: Implement a keyword generator that generates a list of keywords
      // based on the conversation history. Use generateObject to do this.
      writer.write({
        type: 'start',
      });
      const keywordsText = await generateText({
        model,
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
      });

      const keywords = keywordsText.output.keywords;

      const keywordsId = crypto.randomUUID();
      writer.write({
        id: keywordsId,
        type: 'data-keywords',
        data: keywords,
      });

      const searchResults = await searchEmails(keywords);

      const topResults = searchResults
        .filter(
          (r): r is { email: Email; score: number } =>
            r.score > 0 && r.email != null,
        )
        .slice(0, 10);

      const emailsId = crypto.randomUUID();
      writer.write({
        id: emailsId,
        type: 'data-emails',
        data: topResults.map((r) => ({
          ...r.email!,
          score: r.score,
        })),
      });

      const emailSnippets = [
        '## Email Snippets',
        ...topResults.map((result, i) => {
          const from = result.email.from;
          const to = result.email.to;
          const subject = result.email.subject || `email-${i + 1}`;
          const body = result.email.body;
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
        model,
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

      writer.merge(
        answer.toUIMessageStream({
          sendStart: false,
        }),
      );
    },
  });

  return createUIMessageStreamResponse({
    stream,
  });
};
