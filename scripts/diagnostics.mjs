import { mkdir, writeFile } from 'node:fs/promises';
import { platform, arch, release, version } from 'node:process';

const report = {
  generatedAt: new Date().toISOString(),
  platform,
  arch,
  osRelease: release,
  node: version,
  cwd: process.cwd(),
  environment: Object.keys(process.env).filter(
    (key) =>
      (key.startsWith('ECHO_') || key.startsWith('LUMA_')) &&
      !/KEY|TOKEN|SECRET|PASSWORD/i.test(key),
  ),
};
await mkdir('artifacts', { recursive: true });
await writeFile('artifacts/diagnostics.json', `${JSON.stringify(report, null, 2)}\n`);
console.log('Wrote artifacts/diagnostics.json (secrets excluded).');
