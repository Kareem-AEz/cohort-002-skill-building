import { createUIMessageFixture } from '#shared/create-ui-message-fixture.ts';
import { google } from '@ai-sdk/google';
import { gateway, stepCountIs } from 'ai';
import { evalite } from 'evalite';
import { runAgent } from './agent.ts';
import { wrapAISDKModel } from 'evalite/ai-sdk';

evalite.each([
  {
    name: 'DeepSeek V4 Flash',
    input: gateway('deepseek/deepseek-v4-flash'),
  },
  {
    name: 'DeepSeek V4 Pro',
    input: gateway('deepseek/deepseek-v4-pro'),
  },
])('Ask For Clarification Evaluation', {
  data: [
    // Flight booking with missing critical details
    {
      input: createUIMessageFixture('Book a flight to Paris'),
    },
    // Email with missing recipient details
    {
      input: createUIMessageFixture('Send John an email'),
    },
    // Invoice creation with no details
    {
      input: createUIMessageFixture(
        'Create an invoice for the client',
      ),
    },
    // Translation with missing target language
    {
      input: createUIMessageFixture('Translate this text'),
    },
    // Weather check without location
    {
      input: createUIMessageFixture('Check the weather'),
    },
    // Social media post with no content or time
    {
      input: createUIMessageFixture(
        'Schedule a social media post',
      ),
    },
    // Task creation with no details
    {
      input: createUIMessageFixture('Create a task for me'),
    },
    // Calendar search without specifics
    {
      input: createUIMessageFixture('Search my calendar'),
    },
    // File compression without source/destination paths
    {
      input: createUIMessageFixture('Compress a file'),
    },
  ],
  task: async (input) => {
    const result = await runAgent(
      wrapAISDKModel(gateway('deepseek/deepseek-v4-flash')),
      input,
      stepCountIs(1),
    );

    await result.consumeStream();

    const toolCalls = (await result.toolCalls).map(
      (toolCall) => ({
        toolName: toolCall.toolName,
        input: toolCall.input,
      }),
    );

    return {
      toolCalls,
      text: await result.text,
    };
  },
  scorers: [
    {
      name: 'Called askForClarification',
      description:
        'The agent called the askForClarification tool',
      scorer: ({ output }) => {
        return {
          score: output.toolCalls.some(
            (tc) => tc.toolName === 'askForClarification',
          )
            ? 1
            : 0,
          metadata: {
            questions: output.toolCalls
              .filter(
                (tc) => tc.toolName === 'askForClarification',
              )
              .map((tc) => tc.input),
          },
        };
      },
    },
  ],
});
