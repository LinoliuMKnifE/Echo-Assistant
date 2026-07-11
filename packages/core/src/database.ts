export const sqliteSchema = String.raw`
PRAGMA foreign_keys=ON;
PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS projects(id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', goal TEXT NOT NULL DEFAULT '', status TEXT NOT NULL CHECK(status IN ('active','paused','complete','archived')), structured_state TEXT NOT NULL DEFAULT '{}', updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS conversations(id TEXT PRIMARY KEY, title TEXT NOT NULL, summary TEXT NOT NULL DEFAULT '', project_id TEXT REFERENCES projects(id), created_at TEXT NOT NULL, updated_at TEXT NOT NULL, archived_at TEXT);
CREATE TABLE IF NOT EXISTS messages(id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE, role TEXT NOT NULL CHECK(role IN ('user','assistant','tool')), content TEXT NOT NULL, model TEXT, cost_usd REAL, created_at TEXT NOT NULL);
CREATE VIRTUAL TABLE IF NOT EXISTS message_search USING fts5(message_id UNINDEXED, content, tokenize='unicode61');
CREATE TABLE IF NOT EXISTS memories(id TEXT PRIMARY KEY, memory_type TEXT NOT NULL, subject TEXT NOT NULL, title TEXT NOT NULL, content TEXT NOT NULL, structured_data TEXT NOT NULL, confidence REAL NOT NULL, importance REAL NOT NULL, sensitivity TEXT NOT NULL, status TEXT NOT NULL, source_type TEXT NOT NULL, source_id TEXT NOT NULL, source_excerpt TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, last_accessed_at TEXT, last_confirmed_at TEXT, expires_at TEXT, supersedes_id TEXT REFERENCES memories(id), contradicts_id TEXT REFERENCES memories(id), embedding_status TEXT NOT NULL, embedding BLOB, version INTEGER NOT NULL, project_id TEXT REFERENCES projects(id), retrieval_count INTEGER NOT NULL DEFAULT 0);
CREATE VIRTUAL TABLE IF NOT EXISTS memory_search USING fts5(memory_id UNINDEXED, subject, title, content, tokenize='unicode61');
CREATE TABLE IF NOT EXISTS skills(id TEXT PRIMARY KEY, family_id TEXT NOT NULL, name TEXT NOT NULL, description TEXT NOT NULL, scope TEXT NOT NULL, project_id TEXT REFERENCES projects(id), data TEXT NOT NULL, version INTEGER NOT NULL, status TEXT NOT NULL, parent_version_id TEXT REFERENCES skills(id), created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(family_id,version));
CREATE TABLE IF NOT EXISTS reflections(id TEXT PRIMARY KEY, task_id TEXT NOT NULL, project_id TEXT, skill_family_id TEXT NOT NULL, data TEXT NOT NULL, accepted INTEGER NOT NULL, occurred_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS skill_proposals(id TEXT PRIMARY KEY, skill_family_id TEXT NOT NULL, proposed_skill_id TEXT NOT NULL REFERENCES skills(id), project_id TEXT, data TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, decided_at TEXT);
CREATE TABLE IF NOT EXISTS scheduled_tasks(id TEXT PRIMARY KEY, prompt TEXT NOT NULL, project_id TEXT REFERENCES projects(id), enabled INTEGER NOT NULL, timezone TEXT NOT NULL, next_run_at TEXT NOT NULL, recurrence_ms INTEGER, retry_count INTEGER NOT NULL, missed_run TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS permissions(permission TEXT NOT NULL, project_id TEXT, decision TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY(permission,project_id));
CREATE TABLE IF NOT EXISTS audit_events(id TEXT PRIMARY KEY, occurred_at TEXT NOT NULL, category TEXT NOT NULL, action TEXT NOT NULL, summary TEXT NOT NULL, actor TEXT NOT NULL, evidence TEXT, model TEXT, approved INTEGER, metadata TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS pairing_clients(id TEXT PRIMARY KEY, name TEXT NOT NULL, token_hash BLOB NOT NULL, created_at TEXT NOT NULL, revoked_at TEXT);
CREATE INDEX IF NOT EXISTS memories_project_status ON memories(project_id,status,memory_type);
CREATE INDEX IF NOT EXISTS audit_time ON audit_events(occurred_at DESC);
CREATE INDEX IF NOT EXISTS reflections_pattern ON reflections(skill_family_id,project_id,occurred_at DESC);
`;
export type SqliteExecutor = {
  exec(sql: string): void;
  prepare(sql: string): { run(...args: unknown[]): unknown; all(...args: unknown[]): unknown[] };
};
export function migrate(db: SqliteExecutor): void {
  db.exec(sqliteSchema);
  db.prepare('INSERT OR IGNORE INTO migrations(version,applied_at) VALUES(?,?)').run(
    1,
    new Date().toISOString(),
  );
}
