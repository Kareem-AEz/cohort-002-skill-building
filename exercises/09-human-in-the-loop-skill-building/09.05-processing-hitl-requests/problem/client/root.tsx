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
  const { messages, sendMessage, setMessages } =
    useChat<MyMessage>({
      onError: ({ message, name }) => {
        console.error(message, name);
        setMessages((prev) => prev.slice(0, -1));
      },
    });

  const [input, setInput] = useState(
    `Send an email to team@aihero.dev saying what a fantastic AI workshop I'm currently attending. Thank them for the workshop.`,
  );

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
