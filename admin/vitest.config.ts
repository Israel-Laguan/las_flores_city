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
      // Resolve the built shared entry so test module resolution matches the
      // admin tsconfig path (`@las-flores/shared` → `../shared/dist`) and CI's
      // build order. Pointing at the directory lets Vite follow the package.json
      // `main` field to `dist/index.js`.
      '@las-flores/shared': path.resolve(__dirname, '../shared/dist'),
    },
  },
});
