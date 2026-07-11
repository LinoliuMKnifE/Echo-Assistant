import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { LumaApplicationService } from '@luma/core';
import { LEGACY_DATABASE_NAME, migrateLegacyStoreIfNeeded } from './migration.js';

const roots: string[] = [];
const workspace = (): string => {
  const path = mkdtempSync(join(tmpdir(), 'luma-sidecar-migration-'));
  roots.push(path);
  return path;
};
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

/** Builds a fixture matching the exact schema in apps/desktop/src-tauri/src/database.rs. */
function createLegacyFixture(path: string): void {
  const db = new DatabaseSync(path);
  db.exec(`
    CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
    CREATE TABLE conversations(id TEXT PRIMARY KEY,title TEXT NOT NULL,summary TEXT NOT NULL DEFAULT '',project_id TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,archived INTEGER NOT NULL DEFAULT 0,cost_usd REAL NOT NULL DEFAULT 0);
    CREATE TABLE messages(id TEXT PRIMARY KEY,conversation_id TEXT NOT NULL,role TEXT NOT NULL,content TEXT NOT NULL,created_at TEXT NOT NULL,model TEXT,cost_usd REAL);
    CREATE TABLE projects(id TEXT PRIMARY KEY,name TEXT NOT NULL,description TEXT NOT NULL DEFAULT '',goal TEXT NOT NULL,status TEXT NOT NULL,state_json TEXT NOT NULL DEFAULT '{}',updated_at TEXT NOT NULL);
    CREATE TABLE memories(id TEXT PRIMARY KEY,memory_type TEXT NOT NULL,subject TEXT NOT NULL,title TEXT NOT NULL,content TEXT NOT NULL,confidence REAL NOT NULL,importance REAL NOT NULL DEFAULT 0.5,sensitivity TEXT NOT NULL,status TEXT NOT NULL,source_type TEXT NOT NULL,source_id TEXT NOT NULL,source_excerpt TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,last_confirmed_at TEXT,expires_at TEXT,supersedes_id TEXT,contradicts_id TEXT,project_id TEXT,version INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE skills(id TEXT PRIMARY KEY,family_id TEXT NOT NULL,name TEXT NOT NULL,description TEXT NOT NULL,scope TEXT NOT NULL,project_id TEXT,instructions TEXT NOT NULL,status TEXT NOT NULL,version INTEGER NOT NULL,success_count INTEGER NOT NULL DEFAULT 0,failure_count INTEGER NOT NULL DEFAULT 0,parent_version_id TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
    CREATE TABLE skill_versions(id TEXT PRIMARY KEY,family_id TEXT NOT NULL,version INTEGER NOT NULL,description TEXT NOT NULL,instructions TEXT NOT NULL,success_rate INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL);
    CREATE TABLE schedules(id TEXT PRIMARY KEY,title TEXT NOT NULL,prompt TEXT NOT NULL,project_id TEXT,schedule_text TEXT NOT NULL,enabled INTEGER NOT NULL,timezone TEXT NOT NULL,next_run_at TEXT NOT NULL,recurrence_ms INTEGER,missed_run TEXT NOT NULL DEFAULT 'run');
    CREATE TABLE audit(id TEXT PRIMARY KEY,occurred_at TEXT NOT NULL,category TEXT NOT NULL,action TEXT NOT NULL,summary TEXT NOT NULL,actor TEXT NOT NULL,evidence TEXT,model TEXT,approved INTEGER,metadata_json TEXT NOT NULL DEFAULT '{}');
    CREATE TABLE settings(key TEXT PRIMARY KEY,value_json TEXT NOT NULL,updated_at TEXT NOT NULL);
  `);
  db.prepare(
    "INSERT INTO conversations(id,title,summary,project_id,created_at,updated_at) VALUES('conv-1','Shop planning','Discussed inventory',NULL,'1000','1000')",
  ).run();
  db.prepare(
    "INSERT INTO messages(id,conversation_id,role,content,created_at,model,cost_usd) VALUES('msg-1','conv-1','user','What is in stock?','1000',NULL,NULL),('msg-2','conv-1','assistant','Twelve items remain.','1001','gpt-5',0.01)",
  ).run();
  db.prepare(
    "INSERT INTO memories(id,memory_type,subject,title,content,confidence,sensitivity,status,source_type,source_id,source_excerpt,created_at,updated_at) VALUES('mem-1','profile','user','Prefers short replies','Prefers short, direct replies',1,'low','active','user','conv-1','Please keep replies short','1000','1000')",
  ).run();
  db.prepare(
    "INSERT INTO skills(id,family_id,name,description,scope,instructions,status,version,created_at,updated_at) VALUES('skill-1','family-1','Inventory check','Checks shop inventory','global','List items below threshold','experimental',1,'1000','1000')",
  ).run();
  db.prepare(
    "INSERT INTO schedules(id,title,prompt,schedule_text,enabled,timezone,next_run_at,missed_run) VALUES('sched-1','Saturday check','Review inventory','Every Saturday',1,'UTC','2026-07-18T09:00:00.000Z','run')",
  ).run();
  db.close();
}

describe('legacy Rust store migration', () => {
  it('imports once and retains the live legacy database', () => {
    const root = workspace();
    const legacyPath = join(root, LEGACY_DATABASE_NAME);
    createLegacyFixture(legacyPath);

    const service = new LumaApplicationService({
      databasePath: join(root, 'core.db'),
      dataDirectory: join(root, 'core-files'),
    });
    const summary = migrateLegacyStoreIfNeeded(service, root);

    expect(summary).toContain('1 conversations');
    expect(summary).toContain('1 memories');
    expect(summary).toContain('1 skills');
    expect(summary).toContain('1 schedules');

    const conversations = service.listConversations();
    expect(conversations).toHaveLength(1);
    expect(conversations[0]?.title).toBe('Shop planning');
    const detail = service.getConversation(conversations[0]!.id);
    expect(detail?.messages).toHaveLength(2);
    expect(detail?.messages[1]?.model).toBe('gpt-5');

    expect(service.listMemories()[0]?.content).toBe('Prefers short, direct replies');
    expect(service.listSkills()[0]?.name).toBe('Inventory check');
    expect(service.listSchedules()[0]?.prompt).toBe('Review inventory');

    expect(existsSync(legacyPath)).toBe(true);
    expect(existsSync(`${legacyPath}.migrated`)).toBe(true);
    expect(migrateLegacyStoreIfNeeded(service, root)).toBeNull();
    expect(service.listConversations()).toHaveLength(1);

    service.close();
  });

  it('is a no-op when the core database already has conversations', () => {
    const root = workspace();
    createLegacyFixture(join(root, LEGACY_DATABASE_NAME));

    const service = new LumaApplicationService({
      databasePath: join(root, 'core.db'),
      dataDirectory: join(root, 'core-files'),
    });
    service.createConversation('Existing conversation');
    const summary = migrateLegacyStoreIfNeeded(service, root);

    expect(summary).toBeNull();
    expect(existsSync(join(root, LEGACY_DATABASE_NAME))).toBe(true);
    service.close();
  }, 10_000);

  it('is a no-op when no legacy file exists', () => {
    const root = workspace();
    const service = new LumaApplicationService({
      databasePath: join(root, 'core.db'),
      dataDirectory: join(root, 'core-files'),
    });
    expect(migrateLegacyStoreIfNeeded(service, root)).toBeNull();
    service.close();
  });
});
