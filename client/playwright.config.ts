import { defineConfig } from '@playwright/test';

const isCI = !!process.env.CI;

export default defineConfig({
  testDir: './tests/e2e',
  // Files still parallelize across workers, but tests *within* a file run in
  // declared order. The Phaser-canvas E2E tests are isolation-sensitive
  // (canvas init races + shared server state under load), so intra-file
  // parallelism makes them flaky. Running each file's tests sequentially on
  // one worker removes that contention while keeping cross-file throughput.
  fullyParallel: false,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: isCI ? 2 : undefined,
  reporter: isCI ? 'line' : 'html',
  timeout: 60_000,
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'npm run dev',
    port: 5173,
    reuseExistingServer: true,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      VITE_ABOUT_US_URL: 'https://example.com/about-us',
      VITE_API_PROXY_TARGET: 'http://localhost:3000',
    },
  },
});
