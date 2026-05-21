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

export type ToolRequiringApproval = {
  id: string;
  type: 'send-email';
  content: string;
  to: string;
  subject: string;
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
  }
>;

const annotateMessageHistory = async (
  messages: MyMessage[],
): Promise<ModelMessage[]> => {
  // TODO: Use convertDataPart in the second parameter of convertToModelMessages
  // to allow the model to read the custom data parts.
  // Without this, the model will only see the text parts/tool calls.
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
        return part;
      },
    },
  );

  return modelMessages;
};

export const POST = async (req: Request): Promise<Response> => {
  const body: { messages: MyMessage[] } = await req.json();
  const { messages } = body;

  // console.dir(messages[messages.length - 1], { depth: null });

  const annotatedMessageHistory =
    await annotateMessageHistory(messages);

  const stream = createUIMessageStream<MyMessage>({
    execute: async ({ writer }) => {
      const streamTextResponse = streamText({
        model: 'deepseek/deepseek-v4-flash',
        system: `
          You are a helpful assistant that can send emails.
          You will be given a diary of the conversation so far.
          The user's name is "John Doe".
        `,
        messages: annotatedMessageHistory,
        tools: {
          sendEmail: {
            description: 'Send an email',
            inputSchema: z.object({
              to: z.string(),
              subject: z.string(),
              content: z.string(),
            }),
            execute: async ({ to, subject, content }) => {
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
