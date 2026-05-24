import { google } from '@ai-sdk/google';
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  hasToolCall,
  stepCountIs,
  streamText,
  type ModelMessage,
  type UIMessage,
} from 'ai';
import z from 'zod';
import { sendEmail } from './email-service.ts';
import { findDecisionsToProcess } from './hitl-processor.ts';

export type ToolRequiringApproval = {
  id: string;
  type: 'send-email';
  content: string;
  to: string;
  subject: string;
};

export type ToolRequiringApprovalOutput = {
  type: 'send-email';
  message: string;
};

export type ToolApprovalDecision =
  | {
      type: 'approve';
    }
  | {
      type: 'reject';
      reason: string;
    };

export type MyMessage = UIMessage<
  unknown,
  {
    'approval-request': {
      tool: ToolRequiringApproval;
    };
    'approval-decision': {
      // The original tool ID that this decision is for.
      toolId: string;
      decision: ToolApprovalDecision;
    };
    // NOTE: I've added an approval-result part to the MyMessage
    // type, so that we can store the output of the tool.
    'approval-result': {
      output: ToolRequiringApprovalOutput;
      // The original tool ID that this output is for.
      toolId: string;
    };
  }
>;

const annotateMessageHistory = async (
  messages: MyMessage[],
): Promise<ModelMessage[]> => {
  const modelMessages = await convertToModelMessages<MyMessage>(
    messages,
    {
      convertDataPart(part) {
        if (part.type === 'data-approval-request') {
          return {
            type: 'text',
            text: `The assistant requested to send an email: To: ${part.data.tool.to}, Subject: ${part.data.tool.subject}, Content: ${part.data.tool.content}`,
          };
        }
        if (part.type === 'data-approval-decision') {
          if (part.data.decision.type === 'approve') {
            return {
              type: 'text',
              text: 'The user approved the tool.',
            };
          }
          return {
            type: 'text',
            text: `The user rejected the tool: ${part.data.decision.reason}`,
          };
        }

        if (part.type === 'data-approval-result') {
          return {
            type: 'text',
            text: `The tool was performed: ${part.data.output.message}`,
          };
        }
        return part;
      },
    },
  );

  return modelMessages;
};

export const POST = async (req: Request): Promise<Response> => {
  const body: { messages: MyMessage[] } = await req.json();
  const { messages } = body;

  const mostRecentUserMessage = messages[messages.length - 1];

  if (!mostRecentUserMessage) {
    return new Response('Messages array cannot be empty', {
      status: 400,
    });
  }

  if (mostRecentUserMessage.role !== 'user') {
    return new Response('Last message must be a user message', {
      status: 400,
    });
  }

  const mostRecentAssistantMessage = messages.findLast(
    (message) => message.role === 'assistant',
  );

  const hitlResult = findDecisionsToProcess({
    mostRecentUserMessage,
    mostRecentAssistantMessage,
  });

  if ('status' in hitlResult) {
    return new Response(hitlResult.message, {
      status: hitlResult.status,
    });
  }

  const stream = createUIMessageStream<MyMessage>({
    execute: async ({ writer }) => {
      // NOTE: when we process the decisions, we'll
      // be modifying the messages to include the
      // data-approval-result parts.
      // This means that we'll need to make a copy of
      // the messages array, and update it.
      const messagesAfterHitl = [...messages];

      for (const { tool, decision } of hitlResult) {
        if (decision.type === 'approve') {
          // TODO: the user has approved the tool, so
          // we should send the email!
          //
          await sendEmail({
            to: tool.to,
            subject: tool.subject,
            content: tool.content,
          });
          // TODO: we should also add a data-approval-result
          // part to the messages array, and write it to
          // the frontend.
          const messagePart = {
            type: 'data-approval-result' as const,
            data: {
              toolId: tool.id,
              output: {
                type: tool.type,
                message: 'Email sent!',
              },
            },
          };
          writer.write(messagePart);
          messagesAfterHitl[
            messagesAfterHitl.length - 1
          ]?.parts.push(messagePart);
        }
      }

      // NOTE: We now need to annotate the messages _after_ we've
      // processed the decisions, since we're changing the messages
      // array. If we don't do this, the LLM won't see the outputs
      // of the tools that we've performed.
      const annotatedMessages = await annotateMessageHistory(
        messagesAfterHitl,
      );

      const streamTextResponse = streamText({
        model: google('gemini-2.5-flash'),
        system: `
          You are a helpful assistant that can send emails.
          You will be given a diary of the conversation so far.
          The user's name is "John Doe".
        `,
        prompt: annotatedMessages,
        tools: {
          sendEmail: {
            description: 'Send an email',
            inputSchema: z.object({
              to: z.string(),
              subject: z.string(),
              content: z.string(),
            }),
            execute: ({ to, subject, content }) => {
              writer.write({
                type: 'data-approval-request',
                data: {
                  tool: {
                    id: crypto.randomUUID(),
                    type: 'send-email',
                    to,
                    subject,
                    content,
                  },
                },
              });

              return 'Requested to send an email';
            },
          },
        },
        stopWhen: [stepCountIs(10), hasToolCall('sendEmail')],
      });

      writer.merge(streamTextResponse.toUIMessageStream());
    },
  });

  return createUIMessageStreamResponse({
    stream,
  });
};
