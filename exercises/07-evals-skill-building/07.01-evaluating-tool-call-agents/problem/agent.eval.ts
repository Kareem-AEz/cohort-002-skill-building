import {
  gateway,
  stepCountIs,
  wrapLanguageModel,
  type UIMessage,
} from 'ai';
import { evalite } from 'evalite';
import { runAgent } from './agent.ts';
import { createUIMessageFixture } from '#shared/create-ui-message-fixture.ts';
import { wrapAISDKModel } from 'evalite/ai-sdk';
import { devToolsMiddleware } from '@ai-sdk/devtools';

const model = wrapLanguageModel({
  model: gateway('deepseek/deepseek-v4-flash'),
  middleware: [devToolsMiddleware()],
});

evalite('Agent Tool Call Evaluation', {
  data: [
    {
      input: createUIMessageFixture(
        'What is the weather in San Francisco right now?',
      ),
    },
    {
      input: createUIMessageFixture(
        'Create a spreadsheet called "Q4 Sales" with columns for Date, Product, and Revenue',
      ),
    },
    {
      input: createUIMessageFixture(
        'Send an email to john@example.com with subject "Meeting Tomorrow".',
        'What should the email say?',
        "Don't forget our 2pm meeting",
      ),
    },
  ],
  task: async (messages) => {
    const result = await runAgent(
      model,
      messages,
      stepCountIs(1),
    );

    // TODO: Consume the stream so the agent completes execution
    await result.consumeStream();

    // TODO: Extract the toolCalls from the result
    // The result object has a toolCalls property that you need to await
    // Map the toolCalls to include only toolName and input for easier inspection
    const toolCalls = (await result.toolCalls).map(
      (toolCall) => ({
        toolName: toolCall.toolName,
        input: toolCall.input,
      }),
    );

    // TODO: Get the text response from the result
    const text = await result.text;

    // TODO: Return an object with toolCalls and text properties
    return {
      toolCalls,
      text,
    };
  },
});
