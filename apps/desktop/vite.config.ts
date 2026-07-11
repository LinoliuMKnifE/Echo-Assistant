import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export default defineConfig({
  plugins: [react()],
  cacheDir: join(tmpdir(), 'echo-vite-cache'),
  clearScreen: false,
  build: { assetsDir: '.', emptyOutDir: false },
  server: { port: 1420, strictPort: true },
  envPrefix: ['VITE_', 'TAURI_ENV_'],
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    css: true,
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
