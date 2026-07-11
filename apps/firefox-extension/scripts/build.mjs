import { build, context } from 'esbuild';
import { cp, mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const out = process.env.LUMA_EXTENSION_OUTDIR
  ? resolve(process.env.LUMA_EXTENSION_OUTDIR)
  : resolve(root, 'build');
const watch = process.argv.includes('--watch');
const release = process.argv.includes('--release');

await rm(out, { recursive: true, force: true });
await mkdir(resolve(out, 'dist'), { recursive: true });
for (const file of ['manifest.json', 'popup.html', 'sidebar.html', 'styles.css']) {
  await cp(resolve(root, 'src', file), resolve(out, file));
}

const options = {
  entryPoints: {
    background: resolve(root, 'src/background.ts'),
    popup: resolve(root, 'src/popup.ts'),
    sidebar: resolve(root, 'src/sidebar.ts'),
  },
  outdir: resolve(out, 'dist'),
  bundle: true,
  format: 'iife',
  target: 'firefox115',
  sourcemap: !release,
  logLevel: 'info',
};

if (watch) {
  const buildContext = await context(options);
  await buildContext.watch();
  console.log('Watching Firefox extension sources...');
} else {
  await build(options);
}
