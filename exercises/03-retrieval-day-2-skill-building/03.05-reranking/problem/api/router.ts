import { devToolsMiddleware } from '@ai-sdk/devtools';
import { gateway, Output, streamText, wrapLanguageModel } from 'ai';
import { z } from 'zod';

const routerModel = wrapLanguageModel({
  model: gateway('deepseek/deepseek-v4-flash'),
  middleware: devToolsMiddleware(),
});

export const retrievalModeSchema = z.enum([
  'lexical',
  'semantic',
  'balanced',
  'hyde',
]);

export type RetrievalMode = z.infer<typeof retrievalModeSchema>;

export const routerSchema = z.object({
  reasoning: z
    .string()
    .describe(
      'A short (1-2 sentence) explanation of why you picked this mode. Cite the specific signal in the query that drove the decision (e.g., "Contains the literal token `tsconfig.json` so leaned lexical"). This is for debugging and will not be shown to the user as an answer.',
    ),
  mode: retrievalModeSchema.describe(
    [
      'Pick the retrieval strategy:',
      '- "lexical": query contains specific code identifiers, API names, or exact terms (e.g., "strictNullChecks", "tsconfig.json", "satisfies operator").',
      '- "semantic": conceptual "what/why/when" questions whose answer is likely phrased similarly in the book (e.g., "why prefer interfaces", "what is narrowing").',
      '- "balanced": query mixes literal terms with conceptual intent.',
      '- "hyde": procedural "how do I/can I/should I X" queries, OR queries whose phrasing is unlikely to match book phrasing verbatim (abstract framings, indirect questions, topic not heavily covered in the corpus).',
    ].join('\n'),
  ),
  keywords: z
    .array(z.string())
    .min(2)
    .max(8)
    .describe(
      'Keywords for BM25 lexical retrieval. Include code identifiers (verbatim), domain synonyms, and TypeScript-specific terms. No stopwords. Avoid adding broad keywords that drag in unrelated chunks.',
    ),
  semanticQuery: z
    .string()
    .describe(
      'A refined, well-formed query for semantic embedding search. Should be answer-seeking and concrete.',
    ),
  hydePassage: z
    .string()
    .nullable()
    .describe(
      'A 2-3 sentence hypothetical answer passage written in the voice of a TypeScript reference book. Only populate when mode is "hyde"; otherwise return null.',
    ),
  queryVariants: z
    .array(z.string())
    .min(2)
    .max(4)
    .describe(
      'Alternative phrasings of the user query (2-4 variants) for multi-query expansion. Each should rephrase the intent differently — synonyms, different question forms, related sub-questions.',
    ),
});

export type RouterOutput = z.infer<typeof routerSchema>;

const SYSTEM_PROMPT = `You are a retrieval router for a TypeScript book search system.

Given a user's question, you decide how it should be retrieved and produce the inputs for downstream lexical (BM25), semantic (embeddings), and reranker stages.

The corpus is "Total TypeScript" — a reference book covering:
- The type system (types, interfaces, unions, intersections, narrowing, generics, constraints)
- Configuration (tsconfig.json, compilerOptions, strict mode)
- Language features (modules, declarations, satisfies, as const)
- Patterns (derived types, error handling)

The corpus is LIGHT on framework-specific content (React/Vue/etc.), runtime/Node.js APIs, build tools (Vite, Webpack), and testing libraries. Queries about these topics should almost always pick "hyde".

Mode selection — apply in order, stop at the first matching rule:

A. If the query starts with "How do I", "How can I", "How should I", "How would I" → pick "hyde". These are procedural queries where the book's answer phrasing differs strongly from the question phrasing. HyDE bridges that gap.

B. If the query asks about content the corpus is light on (React, Vue, Node, testing, build tools) → pick "hyde".

C. If the query contains explicit code identifiers in backticks, camelCase/snake_case names, file extensions, or config keys (e.g., "tsconfig.json", "strictNullChecks", ".d.ts") AND those identifiers carry the meaning of the query → pick "lexical".

D. If the query is a "what is X", "why X", "when should I prefer X over Y" — definitional or comparative — and X is core to the type system → pick "semantic".

E. Otherwise → pick "balanced".

Output rules:
1. Keywords (2-8): a lexical fallback signal. Hard rules:
   - ONLY name what the user is asking about. Do NOT add keywords for *adjacent* or *related* concepts, even if they feel connected. Example: a query about "null and undefined" should NOT include "union types" just because nullable values are often unions — that drags in a whole chapter on unions and pollutes results.
   - Prefer specific code identifiers verbatim ('strictNullChecks', 'tsconfig.json', '?.', 'satisfies') over generic terms.
   - Do NOT include single broad words like "types", "TypeScript", "values" — they match too many chunks.
   - If a query is highly conceptual and BM25 will not help much, return only 2-3 very tight keywords; don't pad.
2. queryVariants (2-4): genuinely rephrase the intent — different verbs, sub-questions, synonyms. Don't just shuffle word order.
3. hydePassage: ONLY when mode is "hyde". Write it as if lifted from the book — declarative, technical, code-aware. Use the corpus's own terminology and code identifiers. Example: instead of "you can do X", write "TypeScript provides X to handle...".
4. reasoning: cite the specific rule (A/B/C/D/E) and the signal that triggered it.
`;

// Cache: keyed by raw query string. Deterministic outputs for repeat queries.
const routerCache = new Map<string, RouterOutput>();

export const routeQuery = async (
  userQuery: string,
): Promise<RouterOutput> => {
  const cacheKey = userQuery.trim();
  const cached = routerCache.get(cacheKey);
  if (cached) return cached;

  const result = streamText({
    model: routerModel,
    output: Output.object({ schema: routerSchema }),
    system: SYSTEM_PROMPT,
    prompt: `User query: ${userQuery}`,
    temperature: 0,
  });

  let final: RouterOutput | undefined;
  for await (const partial of result.partialOutputStream) {
    final = partial as RouterOutput;
  }

  if (!final) {
    throw new Error('Router produced no output');
  }

  const validated = routerSchema.parse(final);
  routerCache.set(cacheKey, validated);
  return validated;
};
