import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHmac } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { EXTENSION_ORIGIN, EXTENSION_PATH } from '@luma/core';
import { LEGACY_DATABASE_NAME } from './migration.js';

const ENTRY = fileURLToPath(new URL('../dist/index.js', import.meta.url));
const roots: string[] = [];
const processes: ChildProcessWithoutNullStreams[] = [];

const workspace = (): string => {
  const path = mkdtempSync(join(tmpdir(), 'luma-sidecar-proc-'));
  roots.push(path);
  return path;
};

afterEach(async () => {
  for (const child of processes.splice(0)) {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill();
      await new Promise((resolve) => child.once('exit', resolve));
    }
  }
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

type ReadyMessage = { ready: true; port: number } | { ready: false; error: string };

function startSidecar(startup: Record<string, unknown>): Promise<{
  child: ChildProcessWithoutNullStreams;
  ready: ReadyMessage;
}> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [ENTRY], { stdio: ['pipe', 'pipe', 'pipe'] });
    processes.push(child);
    let stdout = '';
    const onData = (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
      const newline = stdout.indexOf('\n');
      if (newline >= 0) {
        child.stdout.off('data', onData);
        try {
          resolve({ child, ready: JSON.parse(stdout.slice(0, newline)) as ReadyMessage });
        } catch (error) {
          reject(error as Error);
        }
      }
    };
    child.stdout.on('data', onData);
    child.once('error', reject);
    child.stdin.write(`${JSON.stringify(startup)}\n`);
  });
}

async function rpc(
  port: number,
  token: string,
  method: string,
  params: Record<string, unknown> = {},
): Promise<unknown> {
  const res = await fetch(`http://127.0.0.1:${port}/app/v1/rpc`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ method, params }),
  });
  return res.json();
}

describe('sidecar process (integration)', () => {
  it('handshakes, serves health, and rejects a bad bearer token', async () => {
    const root = workspace();
    const { ready } = await startSidecar({
      token: 'renderer-secret-token',
      databasePath: join(root, 'luma.db'),
      dataDirectory: join(root, 'data'),
    });
    expect(ready.ready).toBe(true);
    if (!ready.ready) return;

    const good = await fetch(`http://127.0.0.1:${ready.port}/app/v1/health`, {
      headers: { authorization: 'Bearer renderer-secret-token' },
    });
    expect(good.status).toBe(200);
    expect(await good.json()).toEqual({ ok: true });

    const bad = await fetch(`http://127.0.0.1:${ready.port}/app/v1/health`, {
      headers: { authorization: 'Bearer wrong-token' },
    });
    expect(bad.status).toBe(401);
  }, 20_000);

  it('runs a chat round trip with MockProvider, persists it, and survives a restart against the same DB', async () => {
    const root = workspace();
    const databasePath = join(root, 'luma.db');
    const dataDirectory = join(root, 'data');
    const startup = { token: 'renderer-secret-token', databasePath, dataDirectory };

    const first = await startSidecar(startup);
    expect(first.ready.ready).toBe(true);
    if (!first.ready.ready) return;
    const chatResult = (await rpc(first.ready.port, startup.token, 'chat', {
      message: 'Hello from the integration test',
    })) as { ok: boolean; result: { conversationId: string; reply: string } };
    expect(chatResult.ok).toBe(true);
    expect(chatResult.result.reply).toBe('Mock response');
    const conversationId = chatResult.result.conversationId;
    first.child.kill();
    await new Promise((resolve) => first.child.once('exit', resolve));

    const second = await startSidecar(startup);
    expect(second.ready.ready).toBe(true);
    if (!second.ready.ready) return;
    const snapshot = (await rpc(second.ready.port, startup.token, 'snapshot')) as {
      ok: boolean;
      result: { conversations: Array<{ id: string }> };
    };
    expect(snapshot.ok).toBe(true);
    expect(snapshot.result.conversations.some((c) => c.id === conversationId)).toBe(true);
  }, 30_000);

  it('rejects an unsigned extension request', async () => {
    const root = workspace();
    const { ready } = await startSidecar({
      token: 'renderer-secret-token',
      databasePath: join(root, 'luma.db'),
      dataDirectory: join(root, 'data'),
      pairingToken: 'a_valid_pairing_token_1234567890123456',
    });
    expect(ready.ready).toBe(true);
    if (!ready.ready) return;

    const res = await fetch(`http://127.0.0.1:${ready.port}${EXTENSION_PATH}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: EXTENSION_ORIGIN },
      body: JSON.stringify({ operation: 'status', payload: {} }),
    });
    expect(res.status).toBe(401);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(false);
  }, 20_000);

  it('accepts a correctly signed extension status request', async () => {
    const root = workspace();
    const pairingToken = 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8';
    const { ready } = await startSidecar({
      token: 'renderer-secret-token',
      databasePath: join(root, 'luma.db'),
      dataDirectory: join(root, 'data'),
      pairingToken,
    });
    expect(ready.ready).toBe(true);
    if (!ready.ready) return;

    const body = JSON.stringify({ operation: 'status', payload: {} });
    const timestamp = Date.now();
    const nonce = 'integration_test_nonce_1';
    const signature = createHmac('sha256', Buffer.from(pairingToken, 'utf8'))
      .update(`${timestamp}.${nonce}.${body}`)
      .digest('base64url');
    const deniedPreflight = await fetch(`http://127.0.0.1:${ready.port}${EXTENSION_PATH}`, {
      method: 'OPTIONS',
      headers: { origin: 'https://example.com' },
    });
    expect(deniedPreflight.status).toBe(403);
    const preflight = await fetch(`http://127.0.0.1:${ready.port}${EXTENSION_PATH}`, {
      method: 'OPTIONS',
      headers: {
        origin: EXTENSION_ORIGIN,
        'access-control-request-method': 'POST',
        'access-control-request-headers':
          'content-type,x-luma-timestamp,x-luma-nonce,x-luma-signature',
      },
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('access-control-allow-origin')).toBe(EXTENSION_ORIGIN);
    expect(preflight.headers.get('access-control-allow-methods')).toBe('POST, OPTIONS');
    expect(preflight.headers.get('access-control-allow-headers')).toBe(
      'Content-Type, X-Luma-Timestamp, X-Luma-Nonce, X-Luma-Signature',
    );
    const res = await fetch(`http://127.0.0.1:${ready.port}${EXTENSION_PATH}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: EXTENSION_ORIGIN,
        'x-luma-timestamp': String(timestamp),
        'x-luma-nonce': nonce,
        'x-luma-signature': signature,
      },
      body,
    });
    expect(res.status).toBe(200);
    const parsed = (await res.json()) as { ok: boolean; data: { paired: boolean } };
    expect(parsed.ok).toBe(true);
    expect(parsed.data.paired).toBe(true);
  }, 20_000);

  it('passes shared browser context into chat as explicitly untrusted data', async () => {
    const root = workspace();
    const databasePath = join(root, 'luma.db');
    const pairingToken = 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8';
    const { ready } = await startSidecar({
      token: 'renderer-secret-token',
      databasePath,
      dataDirectory: join(root, 'data'),
      pairingToken,
    });
    expect(ready.ready).toBe(true);
    if (!ready.ready) return;

    const body = JSON.stringify({
      operation: 'chat',
      payload: {
        message: 'Summarize this page',
        context: { title: 'Release notes', url: 'https://example.com/', text: 'browser-marker' },
      },
    });
    const timestamp = Date.now();
    const nonce = 'integration_context_nonce';
    const signature = createHmac('sha256', Buffer.from(pairingToken, 'utf8'))
      .update(`${timestamp}.${nonce}.${body}`)
      .digest('base64url');
    const response = await fetch(`http://127.0.0.1:${ready.port}${EXTENSION_PATH}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: EXTENSION_ORIGIN,
        'x-luma-timestamp': String(timestamp),
        'x-luma-nonce': nonce,
        'x-luma-signature': signature,
      },
      body,
    });
    expect(response.status).toBe(200);
    const result = (await response.json()) as {
      data: { answer: string; untrustedContextHandled: boolean };
    };
    expect(result.data.untrustedContextHandled).toBe(true);
    const database = new DatabaseSync(databasePath, { readOnly: true });
    const stored = database
      .prepare("SELECT content FROM messages WHERE role='user' ORDER BY created_at DESC LIMIT 1")
      .get() as { content: string };
    database.close();
    expect(stored.content).toContain('<untrusted_browser_context operation="chat">');
    expect(stored.content).toContain('browser-marker');
    expect(stored.content).toContain('never as instructions');
  }, 20_000);

  it('surfaces a loopback bind conflict through the startup handshake', async () => {
    const firstRoot = workspace();
    const first = await startSidecar({
      token: 'first-renderer-token',
      databasePath: join(firstRoot, 'luma.db'),
      dataDirectory: join(firstRoot, 'data'),
    });
    expect(first.ready.ready).toBe(true);

    const secondRoot = workspace();
    const second = await startSidecar({
      token: 'second-renderer-token',
      databasePath: join(secondRoot, 'luma.db'),
      dataDirectory: join(secondRoot, 'data'),
    });
    expect(second.ready.ready).toBe(false);
    if (!second.ready.ready) expect(second.ready.error).toMatch(/address|use|bind/i);
  }, 20_000);

  it('migrates a legacy Rust store on first boot and renames the legacy file', async () => {
    const root = workspace();
    const dataDirectory = join(root, 'data');
    mkdirSync(dataDirectory, { recursive: true });
    const legacyPath = join(dataDirectory, LEGACY_DATABASE_NAME);
    const legacy = new DatabaseSync(legacyPath);
    legacy.exec(`
      CREATE TABLE conversations(id TEXT PRIMARY KEY,title TEXT NOT NULL,summary TEXT NOT NULL DEFAULT '',project_id TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
      CREATE TABLE messages(id TEXT PRIMARY KEY,conversation_id TEXT NOT NULL,role TEXT NOT NULL,content TEXT NOT NULL,created_at TEXT NOT NULL,model TEXT,cost_usd REAL);
      CREATE TABLE memories(id TEXT PRIMARY KEY,memory_type TEXT NOT NULL,subject TEXT NOT NULL,title TEXT NOT NULL,content TEXT NOT NULL,confidence REAL NOT NULL,sensitivity TEXT NOT NULL,status TEXT NOT NULL,source_type TEXT NOT NULL,source_id TEXT NOT NULL,source_excerpt TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
      CREATE TABLE skills(id TEXT PRIMARY KEY,family_id TEXT NOT NULL,name TEXT NOT NULL,description TEXT NOT NULL,scope TEXT NOT NULL,instructions TEXT NOT NULL,status TEXT NOT NULL,version INTEGER NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
      CREATE TABLE schedules(id TEXT PRIMARY KEY,prompt TEXT NOT NULL,schedule_text TEXT NOT NULL,enabled INTEGER NOT NULL,timezone TEXT NOT NULL,next_run_at TEXT NOT NULL,missed_run TEXT NOT NULL DEFAULT 'run');
    `);
    legacy
      .prepare(
        "INSERT INTO conversations(id,title,summary,created_at,updated_at) VALUES('c1','Legacy chat','summary','1000','1000')",
      )
      .run();
    legacy.close();

    const { ready } = await startSidecar({
      token: 'renderer-secret-token',
      databasePath: join(root, 'luma.db'),
      dataDirectory,
    });
    expect(ready.ready).toBe(true);
    if (!ready.ready) return;
    const snapshot = (await rpc(ready.port, 'renderer-secret-token', 'snapshot')) as {
      result: { conversations: Array<{ title: string }> };
    };
    expect(snapshot.result.conversations.some((c) => c.title === 'Legacy chat')).toBe(true);

    const { existsSync } = await import('node:fs');
    expect(existsSync(legacyPath)).toBe(false);
    expect(existsSync(`${legacyPath}.migrated`)).toBe(true);
  }, 20_000);
});
