import { google } from '@ai-sdk/google';
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  gateway,
  streamText,
  wrapLanguageModel,
  type UIMessage,
} from 'ai';
import { searchEmails } from './create-embeddings.ts';
import { ServerResponse } from 'http';
import { devToolsMiddleware } from '@ai-sdk/devtools';

const formatMessageHistory = (messages: UIMessage[]) => {
  return messages
    .map((message) => {
      return `${message.role}: ${message.parts
        .map((part) => {
          if (part.type === 'text') {
            return part.text;
          }

          return '';
        })
        .join('')}`;
    })
    .join('\n');
};

export const POST = async (req: Request): Promise<Response> => {
  const body: { messages: UIMessage[] } = await req.json();
  const { messages } = body;

  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      // TODO: call the searchEmails function with the
      // conversation history to get the search results
      console.log(
        'formatted messages',
        formatMessageHistory(messages),
      );
      const searchResults = await searchEmails(
        formatMessageHistory(messages),
      );

      // TODO: take the top X search results
      const topSearchResults = searchResults.slice(0, 5);

      console.log('Top Search Results', topSearchResults);

      const emailSnippets = [
        '## Emails',
        ...topSearchResults.map((result, i) => {
          const from = result.email?.from || 'unknown';
          const to = result.email?.to || 'unknown';
          const subject =
            result.email?.subject || `email-${i + 1}`;
          const body = result.email?.body || '';
          const score = result.score.toFixed(3);

          return [
            `### 📧 Email ${i + 1}: [${subject}](#${subject.replace(/[^a-zA-Z0-9]/g, '-')})`,
            `**From:** ${from}`,
            `**To:** ${to}`,
            `**Relevance Score:** ${score}`,
            body,
            '---',
          ].join('\n\n');
        }),
        '## Instructions',
        "Based on the emails above, please answer the user's question. Always cite your sources using the email subject in markdown format.",
      ].join('\n\n');

      const modelMessages =
        await convertToModelMessages(messages);

      const model = wrapLanguageModel({
        model: gateway('deepseek/deepseek-v4-pro'),
        middleware: [devToolsMiddleware()],
      });

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

      writer.merge(answer.toUIMessageStream());
    },
  });

  return createUIMessageStreamResponse({
    stream,
  });
};
