import assert from 'node:assert/strict';
import test from 'node:test';
import { basename } from 'node:path';
import { resolveSidecarTarget } from './package.mjs';

test('maps every supported Tauri target to its required binary name', () => {
  const cases = [
    ['x86_64-pc-windows-msvc', 'node22-win-x64', 'luma-sidecar-x86_64-pc-windows-msvc.exe'],
    ['x86_64-apple-darwin', 'node22-macos-x64', 'luma-sidecar-x86_64-apple-darwin'],
    ['aarch64-apple-darwin', 'node22-macos-arm64', 'luma-sidecar-aarch64-apple-darwin'],
  ];
  for (const [target, pkgTarget, output] of cases) {
    const resolved = resolveSidecarTarget({ target });
    assert.equal(resolved.pkgTarget, pkgTarget);
    assert.equal(basename(resolved.output), output);
  }
});

test('detects supported Windows and macOS CI hosts', () => {
  assert.equal(
    resolveSidecarTarget({ platform: 'win32', arch: 'x64' }).triple,
    'x86_64-pc-windows-msvc',
  );
  assert.equal(
    resolveSidecarTarget({ platform: 'darwin', arch: 'x64' }).triple,
    'x86_64-apple-darwin',
  );
  assert.equal(
    resolveSidecarTarget({ platform: 'darwin', arch: 'arm64' }).triple,
    'aarch64-apple-darwin',
  );
});
