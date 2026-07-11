import { DatabaseSync } from 'node:sqlite';
import { copyFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { LumaApplicationService } from '@luma/core';

// ponytail: legacy host store is the Rust AppDatabase (apps/desktop/src-tauri/src/database.rs),
// a SQLite file named luma.sqlite3 under the platform data dir. It uses the SAME table names as
// @luma/core's sqliteSchema (conversations/messages/memories/skills/skill_versions/schedules/
// audit/settings) but a DIFFERENT column schema (see packages/core/src/database.ts) - this is
// exactly why the two must never share one database file. So we read rows with rusqlite's
// column names and re-insert them through LumaApplicationService's public API rather than
// sharing a schema.

export const LEGACY_DATABASE_NAME = 'luma.sqlite3';

type LegacyRow = Record<string, unknown>;

/** Import a legacy Rust-side database into the core application service, then mark it migrated.
 * Only runs when the core database has no conversations yet. Never deletes the legacy file. */
export function migrateLegacyStoreIfNeeded(
  service: LumaApplicationService,
  dataDirectory: string,
): string | null {
  if (service.listConversations().length > 0) return null;
  const legacyPath = join(dataDirectory, LEGACY_DATABASE_NAME);
  const migratedPath = `${legacyPath}.migrated`;
  if (!existsSync(legacyPath) || existsSync(migratedPath)) return null;
  const summary = importLegacyDatabase(service, legacyPath);
  copyFileSync(legacyPath, migratedPath);
  return summary;
}

function importLegacyDatabase(service: LumaApplicationService, legacyPath: string): string {
  const db = new DatabaseSync(legacyPath, { readOnly: true });
  try {
    const conversations = db.prepare('SELECT * FROM conversations').all() as LegacyRow[];
    const conversationIdMap = new Map<string, string>();
    for (const row of conversations) {
      const created = service.createConversation(String(row.title ?? ''), null);
      conversationIdMap.set(String(row.id), created.id);
      if (row.summary) service.updateConversationSummary(created.id, String(row.summary));
      const messages = db
        .prepare('SELECT * FROM messages WHERE conversation_id=? ORDER BY created_at')
        .all(String(row.id)) as LegacyRow[];
      for (const message of messages) {
        const role = String(message.role);
        if (role !== 'user' && role !== 'assistant' && role !== 'tool') continue;
        const content = String(message.content ?? '');
        if (!content.trim()) continue;
        service.appendMessage(created.id, role, content, {
          ...(message.model ? { model: String(message.model) } : {}),
          ...(message.cost_usd === null || message.cost_usd === undefined
            ? {}
            : { costUsd: Number(message.cost_usd) }),
        });
      }
    }

    let memoryCount = 0;
    const memories = db.prepare('SELECT * FROM memories').all() as LegacyRow[];
    for (const row of memories) {
      const sourceConversationId = conversationIdMap.get(String(row.source_id)) ?? String(row.id);
      const saved = service.remember(
        {
          worthRemembering: true,
          memoryType: legacyMemoryType(String(row.memory_type)),
          subject: String(row.subject ?? ''),
          title: String(row.title ?? ''),
          content: String(row.content ?? ''),
          confidence: Number(row.confidence ?? 1),
          importance: Number(row.importance ?? 0.5),
          sensitivity: legacySensitivity(String(row.sensitivity)),
          durability: 'durable',
          evidence: String(row.source_excerpt ?? row.content ?? ''),
          inferred: false,
          existingMemoryId: null,
          relation: 'new',
          requiresConfirmation: false,
          expiresAt: row.expires_at ? String(row.expires_at) : null,
        },
        sourceConversationId,
        null,
      );
      if (saved) memoryCount++;
    }

    let skillCount = 0;
    const skills = db
      .prepare(
        'SELECT * FROM skills WHERE id IN (SELECT id FROM skills s2 WHERE s2.family_id=skills.family_id ORDER BY version DESC LIMIT 1)',
      )
      .all() as LegacyRow[];
    for (const row of skills) {
      service.createSkill({
        name: String(row.name ?? ''),
        description: String(row.description ?? ''),
        scope: row.scope === 'global' ? 'global' : 'project',
        projectId: null,
        instructions: String(row.instructions ?? ''),
        triggers: [],
        inputSchema: {},
        outputSchema: {},
        requiredTools: [],
        requiredPermissions: [],
        confirmationRequirements: [],
        examples: [],
        tests: [],
        status: legacySkillStatus(String(row.status)),
        createdBy: 'import',
      });
      skillCount++;
    }

    let scheduleCount = 0;
    const schedules = db.prepare('SELECT * FROM schedules').all() as LegacyRow[];
    for (const row of schedules) {
      service.addSchedule({
        prompt: String(row.prompt ?? ''),
        projectId: null,
        enabled: Number(row.enabled) === 1,
        timezone: String(row.timezone ?? 'UTC'),
        nextRunAt: String(row.next_run_at ?? new Date().toISOString()),
        recurrenceMs:
          row.recurrence_ms === null || row.recurrence_ms === undefined
            ? null
            : Number(row.recurrence_ms),
        missedRun: row.missed_run === 'skip' ? 'skip' : 'run',
      });
      scheduleCount++;
    }

    return `migrated legacy store: ${conversations.length} conversations, ${memoryCount} memories, ${skillCount} skills, ${scheduleCount} schedules`;
  } finally {
    db.close();
  }
}

function legacyMemoryType(
  value: string,
): 'profile' | 'semantic' | 'episodic' | 'project' | 'procedural' | 'working' {
  return (
    ['profile', 'semantic', 'episodic', 'project', 'procedural', 'working'] as const
  ).includes(value as never)
    ? (value as never)
    : 'semantic';
}
function legacySensitivity(value: string): 'low' | 'medium' | 'high' {
  return value === 'medium' || value === 'high' ? value : 'low';
}
function legacySkillStatus(value: string): 'experimental' | 'trusted' | 'proposed' | 'disabled' {
  return (['experimental', 'trusted', 'proposed', 'disabled'] as const).includes(value as never)
    ? (value as never)
    : 'experimental';
}
