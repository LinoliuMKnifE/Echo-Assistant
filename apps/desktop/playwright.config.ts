import { defineConfig } from '@playwright/test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export default defineConfig({
  testDir: './e2e',
  outputDir: join(tmpdir(), 'luma-playwright-results'),
  globalSetup: './e2e/global-setup.ts',
  use: { baseURL: 'http://127.0.0.1:1420' },
});
