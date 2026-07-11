import type { Memory } from './types.js';
export type ContextSection =
  | 'protected'
  | 'user'
  | 'profile'
  | 'conversation'
  | 'project'
  | 'memories'
  | 'summaries'
  | 'skills'
  | 'tools'
  | 'untrusted'
  | 'task';
export type ContextInput = Partial<Record<ContextSection, string[]>>;
export function buildContext(
  input: ContextInput,
  budgets: Record<ContextSection, number>,
): { text: string; usage: Record<ContextSection, number> } {
  const usage = {} as Record<ContextSection, number>;
  const parts: string[] = [];
  for (const section of Object.keys(budgets) as ContextSection[]) {
    const source = input[section] ?? [];
    const selected: string[] = [];
    let used = 0;
    for (const item of source) {
      const estimated = Math.ceil(item.length / 4);
      if (used + estimated > budgets[section]) continue;
      selected.push(item);
      used += estimated;
    }
    usage[section] = used;
    if (selected.length) parts.push(`## ${section}\n${selected.join('\n')}`);
  }
  return { text: parts.join('\n\n'), usage };
}
export function memoryContext(memories: Array<Memory & { score?: number }>): string[] {
  return memories.map((m) => `[memory:${m.id}] ${m.title}: ${m.content}`);
}
