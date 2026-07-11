import { z } from 'zod';

export type ModelRole = 'reasoning' | 'standard' | 'fast' | 'embedding';
export type ProviderRequest = {
  model: string;
  input: string;
  system?: string;
  maxOutputTokens?: number;
  reasoningEffort?: 'low' | 'medium' | 'high';
  tools?: Array<{ name: string; description: string; parameters: Record<string, unknown> }>;
  previousResponseId?: string;
  signal?: AbortSignal;
};
export type ProviderResponse = {
  id: string;
  text: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  toolCalls: Array<{ name: string; arguments: unknown }>;
};
export interface Provider {
  respond(request: ProviderRequest): Promise<ProviderResponse>;
  stream(request: ProviderRequest): AsyncIterable<string>;
  embed(input: string[]): Promise<number[][]>;
}
export type ModelSettings = {
  reasoning: string;
  standard: string;
  fast: string;
  embedding: string;
  prices: Record<string, { inputPerMillion: number; outputPerMillion: number }>;
};
export const routeModel = (
  intent: { complexity: number; highImpact: boolean; background: boolean },
  settings: ModelSettings,
): string =>
  intent.background
    ? settings.fast
    : intent.highImpact || intent.complexity >= 0.7
      ? settings.reasoning
      : settings.standard;

const responseSchema = z.object({
  id: z.string(),
  model: z.string(),
  output_text: z.string().optional(),
  usage: z.object({ input_tokens: z.number(), output_tokens: z.number() }).optional(),
  output: z.array(z.unknown()).optional(),
});
export class OpenAIResponsesProvider implements Provider {
  constructor(
    private readonly apiKey: () => Promise<string>,
    private readonly settings: ModelSettings,
    private readonly fetcher: typeof fetch = fetch,
  ) {}
  async respond(request: ProviderRequest): Promise<ProviderResponse> {
    const key = await this.apiKey();
    if (!key) throw new Error('OpenAI API key is missing');
    let last: unknown;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const body: Record<string, unknown> = {
          model: request.model,
          input: request.input,
          max_output_tokens: request.maxOutputTokens,
          previous_response_id: request.previousResponseId,
          tools: request.tools,
        };
        if (request.system) body.instructions = request.system;
        if (request.reasoningEffort) body.reasoning = { effort: request.reasoningEffort };
        const init: RequestInit = {
          method: 'POST',
          headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
          body: JSON.stringify(body),
        };
        if (request.signal) init.signal = request.signal;
        const res = await this.fetcher('https://api.openai.com/v1/responses', init);
        if (res.status === 401) throw new Error('The OpenAI API key was rejected');
        if (res.status === 429 || res.status >= 500)
          throw new RetryableError(`OpenAI temporarily unavailable (${res.status})`);
        if (!res.ok) throw new Error(`OpenAI request failed (${res.status})`);
        const parsed = responseSchema.parse(await res.json());
        const usage = parsed.usage ?? { input_tokens: 0, output_tokens: 0 };
        const price = this.settings.prices[parsed.model] ?? {
          inputPerMillion: 0,
          outputPerMillion: 0,
        };
        return {
          id: parsed.id,
          text: parsed.output_text ?? '',
          model: parsed.model,
          inputTokens: usage.input_tokens,
          outputTokens: usage.output_tokens,
          estimatedCostUsd:
            (usage.input_tokens * price.inputPerMillion +
              usage.output_tokens * price.outputPerMillion) /
            1_000_000,
          toolCalls: [],
        };
      } catch (error) {
        last = error;
        if (!(error instanceof RetryableError) || request.signal?.aborted) throw error;
        if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 150 * 2 ** attempt));
      }
    }
    throw last;
  }
  async *stream(request: ProviderRequest): AsyncIterable<string> {
    yield (await this.respond(request)).text;
  }
  async embed(input: string[]): Promise<number[][]> {
    const key = await this.apiKey();
    const res = await this.fetcher('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: this.settings.embedding, input }),
    });
    if (!res.ok) throw new Error(`Embedding request failed (${res.status})`);
    const parsed = z
      .object({ data: z.array(z.object({ embedding: z.array(z.number()) })) })
      .parse(await res.json());
    return parsed.data.map((d) => d.embedding);
  }
}
class RetryableError extends Error {}
export class MockProvider implements Provider {
  readonly requests: ProviderRequest[] = [];
  constructor(private readonly reply = 'Mock response') {}
  async respond(request: ProviderRequest): Promise<ProviderResponse> {
    this.requests.push(request);
    return {
      id: 'mock',
      text: this.reply,
      model: request.model,
      inputTokens: 1,
      outputTokens: 1,
      estimatedCostUsd: 0,
      toolCalls: [],
    };
  }
  async *stream(request: ProviderRequest): AsyncIterable<string> {
    yield (await this.respond(request)).text;
  }
  async embed(input: string[]): Promise<number[][]> {
    return input.map((text) => [text.length, 1]);
  }
}
