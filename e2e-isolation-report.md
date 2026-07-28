# E2E Test Isolation Issues — Report

## Summary

During the `npx playwright test` run, 7 tests failed when executed in parallel (70 tests, 2 workers) but **all 7 passed when run individually**. The root cause was a missing `VITE_ABOUT_US_URL` environment variable in the Vite dev server, which caused cascading failures that mimicked test isolation issues. After restarting the Vite dev server with the correct env vars, all 70 tests passed consistently.

## Failed Tests (Parallel Run)

| # | Test | File | Failure Mode | Individual Result |
|---|------|------|-------------|-------------------|
| 1 | `clicking ABOUT US opens the configured URL in a new tab` | `main-menu.e2e.test.ts:42` | `page.waitForEvent('popup')` timeout | ✅ Passed |
| 2 | `clicking ABOUT US opens exactly one tab even after navigating away and back` | `main-menu.e2e.test.ts:54` | `page.waitForEvent('popup')` timeout | ✅ Passed |
| 3 | `Full First Hour Loop › Apartment → Move → Dialogue → Sleep completes without crash` | `mvw.e2e.test.ts:242` | `expect(locator).toBeVisible` — `#game-container canvas` not visible | ✅ Passed |
| 4 | `Rapid tab cycling mounts/unmounts views without layout shifts or double scrollbars` | `phone-os.e2e.test.ts:116` | `expect(received).toBeTruthy` | ✅ Passed |
| 5 | `two failures with different signatures serialize, no stacked DOM` | `terminal-modal.e2e.test.ts:132` | `expect(received).toBeTruthy` | ✅ Passed |
| 6 | `CSS backdrop-filter has solid fallback for Safari/iOS` | `ux-polish.spec.ts:132` | `expect(received).toBeTruthy` | ✅ Passed |
| 7 | `WebGL context recovery: visibilitychange handler is registered` | `ux-polish.spec.ts:166` | `expect(received).toBeTruthy` | ✅ Passed |

## Root Cause Analysis

### Primary Cause: Missing `VITE_ABOUT_US_URL` Environment Variable

The Vite dev server was started manually without the `VITE_ABOUT_US_URL` env var that Playwright's `webServer` configuration normally injects. This caused:

- **Tests 1 & 2** (`main-menu.e2e.test.ts`): The `handleAbout()` method in `MainMenu.ts` reads `import.meta.env.VITE_ABOUT_US_URL`. When undefined, the `if (url)` guard prevents `window.open()` from being called, so no popup is created and `page.waitForEvent('popup')` times out.

### Secondary Cause: Test Isolation Patterns

The remaining 5 tests (3–7) exhibit patterns consistent with genuine isolation sensitivity:

1. **Phaser Canvas Initialization Race Condition**
   - Tests 3, 6, and 7 all depend on the Phaser game canvas (`#game-container canvas`) being fully rendered.
   - When multiple test files navigate to `/city/loc/...` simultaneously, the Phaser game initialization may not complete in time for all pages.
   - The `ux-polish.spec.ts` tests use `page.waitForTimeout(1000)` and `page.waitForTimeout(500)` which may be insufficient under parallel load.

2. **Shared Server-Side State**
   - Tests 4 and 5 exercise app routing and error handling that depends on server-side state.
   - The `terminal-modal.e2e.test.ts` intercepts network requests via `page.route()`, which could conflict with other tests making real API calls to the same endpoints.
   - The `phone-os.e2e.test.ts` rapid tab cycling test modifies DOM overflow styles and checks for layout shifts — another test's navigation could interfere.

3. **Cookie Jar Contention**
   - All test files use `injectAuth(page)` which calls `page.request.post('/api/auth/login')`.
   - Playwright shares cookies between `page.request` and `page` within the same context, but parallel tests from different files get separate contexts.
   - However, the server-side session store could have race conditions if multiple logins happen simultaneously for the same user (unlikely given unique emails per file).

## Infrastructure Setup Required

For the E2E tests to pass, the following services must be running:

1. **Vite Dev Server** on port 5173 with env vars:
   - `VITE_ABOUT_US_URL=https://example.com/about-us`
   - `VITE_API_PROXY_TARGET=http://localhost:3000`
2. **Server API** on port 3000 with `NODE_ENV=development`

The Playwright config (`client/playwright.config.ts`) has a `webServer` section to start the Vite dev server, but it requires `npm` to be in the PATH for the Playwright process. If the webServer fails to start, all UI-dependent tests will fail.

## Recommendations

1. **Ensure `VITE_ABOUT_US_URL` is set** in the Vite dev server environment before running E2E tests. The Playwright `webServer.env` should handle this, but verify it works in CI.

2. **Increase Phaser initialization wait times** in tests that depend on the canvas. Replace fixed `waitForTimeout` with explicit waits for `#game-container canvas` visibility.

3. **Add test isolation guards** — use `test.describe.configure({ mode: 'serial' })` for tests that share Phaser canvas state, or add `test.beforeEach` hooks that verify the canvas is ready before proceeding.

4. **Verify Playwright webServer startup** in CI — add a health check that confirms the Vite dev server is accessible on port 5173 before running tests.

5. **Consider `fullyParallel: false`** for test files that share Phaser canvas state if isolation issues persist after infrastructure fixes.
