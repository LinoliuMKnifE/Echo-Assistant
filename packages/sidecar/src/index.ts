import { dirname, basename } from 'node:path';
import { LumaApplicationService } from '@luma/core';
import { createSidecarServer } from './server.js';
import { LEGACY_DATABASE_NAME, migrateLegacyStoreIfNeeded } from './migration.js';

const PORT = 43117;
const HOST = '127.0.0.1';

type StartupMessage = {
  token: string;
  databasePath: string;
  dataDirectory: string;
  openaiApiKey?: string;
  pairingToken?: string;
};

function parseStartupMessage(line: string): StartupMessage {
  const raw = JSON.parse(line) as Partial<StartupMessage>;
  if (typeof raw.token !== 'string' || !raw.token) throw new Error('token is required');
  if (typeof raw.databasePath !== 'string' || !raw.databasePath)
    throw new Error('databasePath is required');
  if (typeof raw.dataDirectory !== 'string' || !raw.dataDirectory)
    throw new Error('dataDirectory is required');
  return {
    token: raw.token,
    databasePath: raw.databasePath,
    dataDirectory: raw.dataDirectory,
    ...(typeof raw.openaiApiKey === 'string' ? { openaiApiKey: raw.openaiApiKey } : {}),
    ...(typeof raw.pairingToken === 'string' ? { pairingToken: raw.pairingToken } : {}),
  };
}

async function readFirstLine(stream: NodeJS.ReadableStream): Promise<string> {
  return new Promise((resolve, reject) => {
    let buffer = '';
    const onData = (chunk: Buffer) => {
      buffer += chunk.toString('utf8');
      const newline = buffer.indexOf('\n');
      if (newline >= 0) {
        cleanup();
        resolve(buffer.slice(0, newline));
      }
    };
    const onEnd = () => {
      cleanup();
      if (buffer.trim()) resolve(buffer);
      else reject(new Error('stdin closed before a startup message was received'));
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const cleanup = () => {
      stream.off('data', onData);
      stream.off('end', onEnd);
      stream.off('error', onError);
    };
    stream.on('data', onData);
    stream.on('end', onEnd);
    stream.on('error', onError);
  });
}

async function main(): Promise<void> {
  const line = await readFirstLine(process.stdin);
  const startup = parseStartupMessage(line);
  if (basename(startup.databasePath) === LEGACY_DATABASE_NAME) {
    throw new Error('databasePath must not be the legacy luma.sqlite3');
  }
  const service = new LumaApplicationService({
    databasePath: startup.databasePath,
    dataDirectory: startup.dataDirectory,
  });
  // The legacy Rust store file sits next to the new database file, not necessarily
  // inside dataDirectory (which is a separate directory for @luma/core's own files).
  const migrationSummary = migrateLegacyStoreIfNeeded(service, dirname(startup.databasePath));
  if (migrationSummary) process.stderr.write(`${migrationSummary}\n`);

  const server = createSidecarServer({
    service,
    token: startup.token,
    pairingToken: startup.pairingToken,
    openaiApiKey: startup.openaiApiKey,
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(PORT, HOST, () => resolve());
  });

  process.stdout.write(`${JSON.stringify({ ready: true, port: PORT })}\n`);

  const shutdown = () => {
    server.close(() => {
      service.close();
      process.exit(0);
    });
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown startup failure';
  process.stdout.write(`${JSON.stringify({ ready: false, error: message })}\n`);
  process.exit(1);
});
