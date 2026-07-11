import { z } from 'zod';

export const memoryTypes = [
  'profile',
  'semantic',
  'episodic',
  'project',
  'procedural',
  'working',
] as const;
export const memorySchema = z.object({
  id: z.string().min(1),
  memoryType: z.enum(memoryTypes),
  subject: z.string(),
  title: z.string(),
  content: z.string().min(1),
  structuredData: z.record(z.unknown()).default({}),
  confidence: z.number().min(0).max(1),
  importance: z.number().min(0).max(1),
  sensitivity: z.enum(['low', 'medium', 'high']),
  status: z.enum(['proposed', 'active', 'superseded', 'rejected', 'deleted']),
  sourceType: z.enum(['user', 'model', 'conversation', 'project', 'import']),
  sourceId: z.string(),
  sourceExcerpt: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  lastAccessedAt: z.string().nullable(),
  lastConfirmedAt: z.string().nullable(),
  expiresAt: z.string().nullable(),
  supersedesId: z.string().nullable(),
  contradictsId: z.string().nullable(),
  embeddingStatus: z.enum(['pending', 'ready', 'failed']),
  version: z.number().int().positive(),
  projectId: z.string().nullable().default(null),
  retrievalCount: z.number().int().nonnegative().default(0),
});
export type Memory = z.infer<typeof memorySchema>;

export const extractedMemorySchema = z.object({
  worthRemembering: z.boolean(),
  memoryType: z.enum(memoryTypes),
  subject: z.string(),
  title: z.string(),
  content: z.string(),
  confidence: z.number().min(0).max(1),
  importance: z.number().min(0).max(1),
  sensitivity: z.enum(['low', 'medium', 'high']),
  durability: z.enum(['temporary', 'durable']),
  evidence: z.string(),
  inferred: z.boolean(),
  existingMemoryId: z.string().nullable(),
  relation: z.enum(['new', 'duplicate', 'update', 'contradiction']),
  requiresConfirmation: z.boolean(),
  expiresAt: z.string().nullable(),
});
export type ExtractedMemory = z.infer<typeof extractedMemorySchema>;

export type AuditEvent = {
  id: string;
  occurredAt: string;
  category: string;
  action: string;
  summary: string;
  actor: 'user' | 'agent' | 'system';
  evidence?: string;
  model?: string;
  approved?: boolean;
  metadata: Record<string, unknown>;
};
export type Project = {
  id: string;
  name: string;
  description: string;
  goal: string;
  status: 'active' | 'paused' | 'complete' | 'archived';
  state: Record<string, unknown>;
  updatedAt: string;
};
export type Conversation = {
  id: string;
  title: string;
  summary: string;
  projectId: string | null;
  createdAt: string;
  updatedAt: string;
  messages: Array<{
    id: string;
    role: 'user' | 'assistant' | 'tool';
    content: string;
    createdAt: string;
    model?: string;
    costUsd?: number;
  }>;
};
export const id = (): string => crypto.randomUUID();
export const now = (): string => new Date().toISOString();
