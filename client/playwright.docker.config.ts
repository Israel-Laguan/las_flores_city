import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    extraHTTPHeaders: {
      'x-e2e-runner': 'docker',
    },
  },
  webServer: {
    command: 'VITE_API_PROXY_TARGET=http://server:3000 npm run dev',
    port: 5173,
    reuseExistingServer: !process.env.CI,
    env: {
      VITE_API_PROXY_TARGET: 'http://server:3000',
    },
  },
});