import { existsSync, mkdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { build } from 'esbuild';

const sidecarRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const binariesDirectory = resolve(sidecarRoot, '../../apps/desktop/src-tauri/binaries');
const packagedEntry = join(sidecarRoot, 'dist', 'pkg', 'index.cjs');

const TARGETS = {
  'x86_64-pc-windows-msvc': { pkgTarget: 'node22-win-x64', extension: '.exe' },
  'x86_64-apple-darwin': { pkgTarget: 'node22-macos-x64', extension: '' },
  'aarch64-apple-darwin': { pkgTarget: 'node22-macos-arm64', extension: '' },
};

function hostTriple(platform = process.platform, arch = process.arch) {
  if (platform === 'win32' && arch === 'x64') return 'x86_64-pc-windows-msvc';
  if (platform === 'darwin' && arch === 'x64') return 'x86_64-apple-darwin';
  if (platform === 'darwin' && arch === 'arm64') return 'aarch64-apple-darwin';
  throw new Error(`Unsupported sidecar host: ${platform}-${arch}`);
}

export function resolveSidecarTarget({
  target = process.env.LUMA_SIDECAR_TARGET ?? process.env.TAURI_ENV_TARGET_TRIPLE,
  platform = process.platform,
  arch = process.arch,
} = {}) {
  const triple = target ?? hostTriple(platform, arch);
  const configuration = TARGETS[triple];
  if (!configuration) {
    throw new Error(
      `Unsupported Luma sidecar target '${triple}'. Set LUMA_SIDECAR_TARGET to one of: ${Object.keys(TARGETS).join(', ')}`,
    );
  }
  return {
    triple,
    pkgTarget: configuration.pkgTarget,
    output: join(binariesDirectory, `luma-sidecar-${triple}${configuration.extension}`),
  };
}

function cliTarget() {
  const flag = process.argv.indexOf('--target');
  if (flag === -1) return undefined;
  const target = process.argv[flag + 1];
  if (!target || target.startsWith('--')) throw new Error('--target requires a target triple');
  return target;
}

export function validateSidecarBinary(target = cliTarget()) {
  const sidecar = resolveSidecarTarget({ target });
  if (!existsSync(sidecar.output) || statSync(sidecar.output).size === 0) {
    throw new Error(`Missing packaged sidecar: ${sidecar.output}`);
  }
  return sidecar;
}

async function bundleSidecar() {
  rmSync(dirname(packagedEntry), { recursive: true, force: true });
  await build({
    entryPoints: [join(sidecarRoot, 'dist', 'index.js')],
    bundle: true,
    format: 'cjs',
    outfile: packagedEntry,
    platform: 'node',
    target: 'node22',
  });
  if (!existsSync(packagedEntry) || statSync(packagedEntry).size === 0) {
    throw new Error(`Missing bundled sidecar entry: ${packagedEntry}`);
  }
}

async function packageSidecar(target = cliTarget()) {
  const sidecar = resolveSidecarTarget({ target });
  mkdirSync(binariesDirectory, { recursive: true });
  await bundleSidecar();
  const pkg = join(sidecarRoot, 'node_modules', '@yao-pkg', 'pkg', 'lib-es5', 'bin.js');
  const result = spawnSync(
    process.execPath,
    [
      pkg,
      packagedEntry,
      '--targets',
      sidecar.pkgTarget,
      '--output',
      sidecar.output,
      '--public',
      '--no-bytecode',
    ],
    {
      cwd: sidecarRoot,
      stdio: 'inherit',
      env: {
        ...process.env,
        PKG_CACHE_PATH: process.env.PKG_CACHE_PATH ?? join(sidecarRoot, '.pkg-cache'),
      },
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`pkg exited with status ${result.status ?? 'unknown'}`);
  return validateSidecarBinary(sidecar.triple);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = process.argv.includes('--validate')
    ? validateSidecarBinary()
    : await packageSidecar();
  process.stdout.write(`Prepared ${result.output}\n`);
}
