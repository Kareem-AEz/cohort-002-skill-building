import { createOpenAICompatible } from '@ai-sdk/openai-compatible';

// Suppress AI SDK warnings about JSON mode support
process.env.AI_SDK_LOG_WARNINGS = 'false';

export const lmstudio = createOpenAICompatible({
  name: 'lmstudio',
  baseURL: 'http://127.0.0.1:1234/v1',
  supportsStructuredOutputs: true,
});
