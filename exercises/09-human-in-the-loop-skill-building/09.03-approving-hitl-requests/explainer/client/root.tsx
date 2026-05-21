import { useChat } from '@ai-sdk/react';
import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ChatInput, Message, Wrapper } from './components.tsx';
import './tailwind.css';
import type {
  ToolRequiringApproval,
  MyMessage,
} from '../api/chat.ts';

const App = () => {
  const { messages, sendMessage } = useChat<MyMessage>({});

  const [input, setInput] = useState(
    `Send an email to team@aihero.dev saying what a fantastic AI workshop I'm currently attending. Thank them for the workshop.`,
  );
  /**
   * This is a useMemo hook that collects all `toolId` values from `data-approval-decision` message parts in the message history:
   * - It first flattens all message parts into a single array
   * - It then filters for parts with the `data-approval-decision` type
   * - It then maps the parts to their `toolId` values
   * - It then returns a new Set of the tool IDs
   * - This Set is used to track which tool IDs have had decisions made
   * - This is used to conditionally render the approve/reject buttons in the Message component
   * @returns A Set of tool IDs that have had decisions made
   * @example
   * const toolIdsWithDecisionsMade = useMemo(() => {
   *   return new Set(['123', '456', '789']);
   * }, [messages]);
   *
   * console.log(toolIdsWithDecisionsMade);
   * // Set { '123', '456', '789' }
   */
  const toolIdsWithDecisionsMade = useMemo(() => {
    const allMessageParts = messages.flatMap(
      (message) => message.parts,
    );

    const decisionsByToolId = new Set(
      allMessageParts
        .filter((part) => part.type === 'data-approval-decision')
        .map((part) => part.data.toolId),
    );

    return decisionsByToolId;
  }, [messages]);

  const [toolGivingFeedbackOn, setToolGivingFeedbackOn] =
    useState<ToolRequiringApproval | null>(null);

  return (
    <Wrapper
      messages={messages.map((message) => (
        <Message
          key={message.id}
          role={message.role}
          parts={message.parts}
          toolIdsWithDecisionsMade={toolIdsWithDecisionsMade}
          onToolDecision={(tool, decision) => {
            if (decision === 'approve') {
              sendMessage({
                parts: [
                  {
                    type: 'data-approval-decision',
                    data: {
                      toolId: tool.id,
                      decision: {
                        type: 'approve',
                      },
                    },
                  },
                ],
              });
            } else {
              setInput('');
              setToolGivingFeedbackOn(tool);
            }
          }}
        />
      ))}
      input={
        <ChatInput
          isGivingFeedback={!!toolGivingFeedbackOn}
          input={input}
          onChange={(e) => setInput(e.target.value)}
          onSubmit={(e) => {
            e.preventDefault();
            if (toolGivingFeedbackOn) {
              sendMessage({
                parts: [
                  {
                    type: 'data-approval-decision',
                    data: {
                      toolId: toolGivingFeedbackOn.id,
                      decision: {
                        type: 'reject',
                        reason: input,
                      },
                    },
                  },
                ],
              });

              setToolGivingFeedbackOn(null);
              setInput('');
              return;
            }
            sendMessage({
              text: input,
            });
            setInput('');
          }}
        />
      }
    />
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
