import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const args = process.argv.slice(2),
  index = args.indexOf('--path');
if (!args.includes('--yes') || index < 0 || !args[index + 1])
  throw new Error('Refusing reset without --yes --path <development database>');
const root = resolve(process.cwd()),
  target = resolve(root, args[index + 1]);
if (!target.startsWith(`${root}\\`) && !target.startsWith(`${root}/`))
  throw new Error('Database must be inside this repository');
for (const suffix of ['', '-shm', '-wal']) await rm(`${target}${suffix}`, { force: true });
console.log(`Reset development database: ${target}`);
