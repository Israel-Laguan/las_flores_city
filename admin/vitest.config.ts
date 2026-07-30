import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // Point at the TS source entry explicitly (mirrors the server jest
      // moduleNameMapper). Resolving the directory would let a stale
      // shared/src/index.js shadow shared/src/index.ts under vite's
      // resolve.extensions (.js before .ts), hiding newer exports such as
      // YAMLLocationSchema.
      '@las-flores/shared': path.resolve(__dirname, '../shared/src/index.ts'),
    },
  },
});
