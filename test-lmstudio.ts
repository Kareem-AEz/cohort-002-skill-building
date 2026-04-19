import { generateText, Output } from 'ai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { z } from 'zod';

export const lmstudioTest = createOpenAICompatible({
  name: 'lmstudio',
  baseURL: 'http://127.0.0.1:1234/v1',
  supportsStructuredOutputs: true,
  fetch: async (url, options) => {
    const response = await fetch(url, options);
    if (!response.ok) return response;

    // Clone the response to parse the JSON
    const cloned = response.clone();
    try {
      const data = await cloned.json();
      if (data.choices && data.choices[0] && data.choices[0].message) {
        const msg = data.choices[0].message;
        if (!msg.content && msg.reasoning_content) {
          // Move reasoning_content to content for AI SDK to parse
          msg.content = msg.reasoning_content;
          msg.reasoning_content = null;
          
          return new Response(JSON.stringify(data), {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers
          });
        }
      }
    } catch (e) {
      // Ignore parse errors, just return original response
    }
    return response;
  }
});

async function main() {
  process.env.AI_SDK_LOG_WARNINGS = 'false';
  try {
    const res = await generateText({
      model: lmstudioTest('Qwen3.6 35B A3B UD'),
      system: `
        You are a helpful email assistant, able to search through emails for information.
        Your job is to generate a list of keywords which will be used in bm25 algorithm to search emails.
      `,
      prompt:
        'What did David say about the mortgage application?',
      output: Output.array({
        element: z.string(),
        name: 'keywords',
      }),
    });
    console.log('Success:', res.output);
  } catch (e: any) {
    console.error('Full Error:', JSON.stringify(e, null, 2));
    console.error('e.text', e.text);
  }
}
main();
