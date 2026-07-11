import { z } from 'zod';
import { redactSecrets } from './redaction.js';
import type { AuditEvent } from './types.js';
import { id, now } from './types.js';

export type Permission = 'ask' | 'session' | 'always' | 'deny';
export type ToolDefinition<I, O> = {
  name: string;
  description: string;
  input: z.ZodType<I>;
  output: z.ZodType<O>;
  risk: 'low' | 'medium' | 'high';
  permission: string;
  confirmation: boolean;
  changesExternalState: boolean;
  timeoutMs: number;
  maxPayloadBytes: number;
  run(input: I, signal: AbortSignal): Promise<O>;
};
export class ToolRuntime {
  readonly audit: AuditEvent[] = [];
  private readonly tools = new Map<string, ToolDefinition<unknown, unknown>>();
  private readonly permissions = new Map<string, Permission>();
  register<I, O>(tool: ToolDefinition<I, O>): void {
    this.tools.set(tool.name, tool as ToolDefinition<unknown, unknown>);
  }
  setPermission(permission: string, value: Permission): void {
    this.permissions.set(permission, value);
  }
  async execute(name: string, raw: unknown, confirmed = false): Promise<unknown> {
    const tool = this.tools.get(name);
    if (!tool) throw new Error('Unknown tool');
    const permission = this.permissions.get(tool.permission) ?? 'ask';
    if (permission === 'deny') throw new Error('Tool permission denied');
    if ((permission === 'ask' || tool.confirmation) && !confirmed)
      throw new Error('User confirmation required');
    const bytes = new TextEncoder().encode(JSON.stringify(raw)).byteLength;
    if (bytes > tool.maxPayloadBytes) throw new Error('Tool input is too large');
    const input = tool.input.parse(raw);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), tool.timeoutMs);
    try {
      const value = tool.output.parse(await tool.run(input, controller.signal));
      this.audit.push({
        id: id(),
        occurredAt: now(),
        category: 'tool',
        action: 'execute',
        summary: `Ran ${name}`,
        actor: 'agent',
        approved: confirmed,
        metadata: { name },
      });
      return sanitize(value);
    } finally {
      clearTimeout(timer);
    }
  }
}
const sanitize = (value: unknown): unknown =>
  typeof value === 'string' ? redactSecrets(value) : value;
export const calculatorTool: ToolDefinition<{ expression: string }, { result: number }> = {
  name: 'calculator',
  description: 'Evaluate basic arithmetic',
  input: z.object({
    expression: z
      .string()
      .regex(/^[\d\s+*/().%-]+$/)
      .max(200),
  }),
  output: z.object({ result: z.number().finite() }),
  risk: 'low',
  permission: 'calculator',
  confirmation: false,
  changesExternalState: false,
  timeoutMs: 1000,
  maxPayloadBytes: 512,
  async run(input) {
    const tokens = input.expression.match(/\d+(?:\.\d+)?|[()+*/%-]/g);
    if (!tokens || tokens.join('') !== input.expression.replace(/\s/g, ''))
      throw new Error('Invalid expression');
    return { result: evaluate(tokens) };
  },
};
function evaluate(tokens: string[]): number {
  let index = 0;
  const expr = (): number => {
    let value = term();
    while (tokens[index] === '+' || tokens[index] === '-') {
      const op = tokens[index++];
      const right = term();
      value = op === '+' ? value + right : value - right;
    }
    return value;
  };
  const term = (): number => {
    let value = factor();
    while (tokens[index] === '*' || tokens[index] === '/' || tokens[index] === '%') {
      const op = tokens[index++];
      const right = factor();
      value = op === '*' ? value * right : op === '/' ? value / right : value % right;
    }
    return value;
  };
  const factor = (): number => {
    const token = tokens[index++];
    if (token === '(') {
      const value = expr();
      if (tokens[index++] !== ')') throw new Error('Unclosed parenthesis');
      return value;
    }
    if (token === '-') return -factor();
    const value = Number(token);
    if (!Number.isFinite(value)) throw new Error('Invalid number');
    return value;
  };
  const result = expr();
  if (index !== tokens.length || !Number.isFinite(result)) throw new Error('Invalid calculation');
  return result;
}
