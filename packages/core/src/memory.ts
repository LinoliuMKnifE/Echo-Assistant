import type { Conversation, ExtractedMemory, Memory, Project } from './types.js';
import { id, memorySchema, now } from './types.js';

const terms = (text: string): Set<string> =>
  new Set(text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []);
const overlap = (a: string, b: string): number => {
  const x = terms(a),
    y = terms(b);
  if (!x.size || !y.size) return 0;
  return [...x].filter((v) => y.has(v)).length / Math.sqrt(x.size * y.size);
};

export class MemoryStore {
  readonly records = new Map<string, Memory>();
  save(input: ExtractedMemory, sourceId: string, projectId: string | null = null): Memory | null {
    if (
      !input.worthRemembering ||
      input.relation === 'duplicate' ||
      [...this.records.values()].some(
        (memory) =>
          memory.status === 'active' &&
          memory.memoryType === input.memoryType &&
          memory.projectId === projectId &&
          memory.content.trim().toLocaleLowerCase() === input.content.trim().toLocaleLowerCase(),
      )
    )
      return null;
    const stamp = now();
    const existing = input.existingMemoryId ? this.records.get(input.existingMemoryId) : undefined;
    const status = input.requiresConfirmation ? 'proposed' : 'active';
    const record = memorySchema.parse({
      id: id(),
      memoryType: input.memoryType,
      subject: input.subject,
      title: input.title,
      content: input.content,
      structuredData: { inferred: input.inferred },
      confidence: input.confidence,
      importance: input.importance,
      sensitivity: input.sensitivity,
      status,
      sourceType: 'conversation',
      sourceId,
      sourceExcerpt: input.evidence,
      createdAt: stamp,
      updatedAt: stamp,
      lastAccessedAt: null,
      lastConfirmedAt: input.inferred ? null : stamp,
      expiresAt: input.expiresAt,
      supersedesId: input.relation === 'update' ? (existing?.id ?? null) : null,
      contradictsId: input.relation === 'contradiction' ? (existing?.id ?? null) : null,
      embeddingStatus: 'pending',
      version: 1,
      projectId,
      retrievalCount: 0,
    });
    if (existing && input.relation === 'update' && !input.requiresConfirmation)
      this.records.set(existing.id, { ...existing, status: 'superseded', updatedAt: stamp });
    this.records.set(record.id, record);
    return record;
  }
  forget(query: string): Memory[] {
    const changed: Memory[] = [];
    for (const value of this.records.values())
      if (value.status !== 'deleted' && overlap(query, `${value.title} ${value.content}`) >= 0.2) {
        const next = {
          ...value,
          status: 'deleted' as const,
          content: '[deleted]',
          structuredData: {},
          updatedAt: now(),
        };
        this.records.set(value.id, next);
        changed.push(next);
      }
    return changed;
  }
  expire(at = new Date()): Memory[] {
    const expired: Memory[] = [];
    for (const value of this.records.values())
      if (value.status === 'active' && value.expiresAt && new Date(value.expiresAt) <= at) {
        const next = { ...value, status: 'superseded' as const, updatedAt: at.toISOString() };
        this.records.set(value.id, next);
        expired.push(next);
      }
    return expired;
  }
  retrieve(
    query: string,
    options: {
      projectId?: string | null;
      limit?: number;
      threshold?: number;
      semanticScores?: ReadonlyMap<string, number>;
    } = {},
  ): Array<Memory & { score: number }> {
    const scored = [...this.records.values()]
      .filter(
        (m) =>
          (m.status === 'active' && !m.expiresAt) ||
          (m.status === 'active' && new Date(m.expiresAt!) > new Date()),
      )
      .filter((m) => !m.projectId || m.projectId === options.projectId)
      .map((m) => {
        const lexical = overlap(query, `${m.subject} ${m.title} ${m.content}`);
        const semantic = Math.max(0, Math.min(options.semanticScores?.get(m.id) ?? 0, 1));
        const recency = Math.exp(-(Date.now() - Date.parse(m.updatedAt)) / 86_400_000 / 180);
        return {
          ...m,
          score:
            semantic * 0.35 +
            lexical * 0.3 +
            m.importance * 0.12 +
            m.confidence * 0.12 +
            recency * 0.06 +
            Math.min(m.retrievalCount / 20, 1) * 0.05,
        };
      })
      .filter((m) => m.score >= (options.threshold ?? 0.18))
      .sort((a, b) => b.score - a.score);
    const diverse: typeof scored = [];
    const seen = new Set<string>();
    for (const item of scored) {
      const key = `${item.memoryType}:${item.subject}`;
      if (!seen.has(key)) {
        diverse.push(item);
        seen.add(key);
      }
      if (diverse.length >= (options.limit ?? 8)) break;
    }
    return diverse;
  }
  profile(): Array<{
    statement: string;
    confidence: number;
    provenance: string;
    inferred: boolean;
    firstLearned: string;
    lastConfirmed: string | null;
    sensitivity: Memory['sensitivity'];
  }> {
    return [...this.records.values()]
      .filter((m) => m.memoryType === 'profile' && m.status === 'active')
      .map((m) => ({
        statement: m.content,
        confidence: m.confidence,
        provenance: m.sourceId,
        inferred: m.structuredData.inferred === true,
        firstLearned: m.createdAt,
        lastConfirmed: m.lastConfirmedAt,
        sensitivity: m.sensitivity,
      }));
  }
  exportUserMarkdown(): string {
    return [
      '# User Profile',
      '',
      ...this.profile().map(
        (p) =>
          `- ${p.statement} (confidence ${Math.round(p.confidence * 100)}%, source ${p.provenance})`,
      ),
    ].join('\n');
  }
}

export function searchConversations(
  conversations: Conversation[],
  query: string,
  projectId?: string,
): Conversation[] {
  return conversations
    .filter((c) => !projectId || c.projectId === projectId)
    .map((c) => ({
      conversation: c,
      score: overlap(
        query,
        `${c.title} ${c.summary} ${c.messages.map((m) => m.content).join(' ')}`,
      ),
    }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.conversation);
}
export function isolateProjects(memories: Memory[], project: Project): Memory[] {
  return memories.filter((m) => m.projectId === null || m.projectId === project.id);
}
