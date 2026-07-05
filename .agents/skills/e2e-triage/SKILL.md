---
name: e2e-triage
description: "Diagnose E2E test failures that cascade from a single root cause. Use this when Playwright tests show many failures but single-worker runs pass. Covers server crash detection, cascade pattern recognition, and systematic isolation."
---

# E2E Test Failure Triage

Diagnostic workflow for Playwright E2E tests where many tests fail but single-worker runs pass. Encodes the cascade-failure pattern observed across multiple sessions.

## When to use

- E2E tests show 10+ failures in CI but pass locally with 1 worker.
- Failures cluster into visually different groups (500 errors, timeouts, missing elements) that share a single root cause.
- Server process crashes mid-run, causing every subsequent test to fail.

## Core insight: cascade failures

One server crash or database error can produce **dozens** of apparent failures. The failures look unrelated because different test files hit different endpoints, but they all fail because the server is dead or in a bad state. Always look for the **first** failure in the run order — it is usually the root cause.

## Steps

### Phase 1: Classify the failure pattern

1. **Count unique vs retry failures.** Playwright retries produce duplicate output. Focus on unique test names only.
2. **Group by error type:**
   - `expect(res.ok()).toBeTruthy()` — registration or auth endpoint returned non-200
   - `Timeout waiting for selector` — page didn't load expected UI element
   - `locator.click timeout` — button/element never appeared
   - `FK constraint violation` — database integrity error
3. **Check if failures are clustered in time.** If tests 1-30 pass and tests 31-70 all fail, the server likely crashed around test 30.

### Phase 2: Check server health

4. **Verify the server is alive:**
   ```bash
   # Host-network mode (direct)
   curl -s http://localhost:3000/health

   # Bridge-network mode (inside container)
   podman exec las-flores-server wget -qO- http://localhost:3000/health
   ```

5. **Check server logs for crashes:**
   ```bash
   # Look for process exit signals
   podman logs las-flores-server 2>&1 | grep -E "SIGTERM|SIGKILL|ENOTFOUND|Node.js v"

   # Look for database errors
   podman logs las-flores-server 2>&1 | grep -E "2350[0-9]|violates foreign key"

   # Look for unhandled rejections
   podman logs las-flores-server 2>&1 | grep -E "UNHANDLED|unhandledRejection"
   ```

6. **Determine if the server died mid-run.** If `Node.js vXX.XX.XX` appears at the end of logs, the process exited. This is the smoking gun — every test after the crash fails.

### Phase 3: Isolate the root cause

7. **Reproduce with 1 worker to confirm tests pass individually:**
   ```bash
   npx playwright test --workers=1 --retries=0
   ```

8. **Reproduce with 2 workers to confirm cascade:**
   ```bash
   npx playwright test --workers=2 --retries=0
   ```

9. **If 1 worker passes but 2 workers fail, the root cause is one of:**
   - **Server crash** from unhandled async error (FK violation, null reference in a route handler)
   - **Race condition** where two concurrent requests corrupt shared state
   - **Connection pool exhaustion** from too many parallel database queries

10. **Find the first failure.** In the 2-worker output, identify the first test that fails. Everything after it is a cascade. Investigate that specific test's server-side endpoint.

### Phase 4: Fix

11. **For server crashes:** Add error handling at the crash point. Common fixes:
    - Add `process.on('unhandledRejection')` handler in `server/src/index.ts`
    - Wrap async route handler calls with `await` inside try/catch
    - Add FK existence checks before `INSERT`/`UPDATE` with FK constraints

12. **For race conditions:** Add database-level locks or serialize conflicting operations.

13. **For connection pool exhaustion:** Increase pool size or reduce parallelism.

### Phase 5: Verify

14. **Restart the server and run the full suite with 2 workers:**
    ```bash
    # Restart server (podman host-network example)
    podman rm -f las-flores-server
    podman run -d --name las-flores-server --network host \
      -v ./server/src:/app/server/src \
      -e DATABASE_URL=postgresql://las_flores:las_flores_dev_password@localhost:5434/las_flores \
      -e REDIS_URL=redis://localhost:6379 \
      -e PORT=3000 localhost/las-flores-server:latest npm run dev --workspace=server

    sleep 10 && curl -s http://localhost:3000/health

    # Run full suite
    npx playwright test --workers=2 --retries=0
    ```

15. **Confirm server survived.** Check health endpoint after the run.

## Common cascade patterns in this project

### Pattern A: Server process crash
- **Symptom:** 20+ tests fail with mixed error types (500, timeout, element not found)
- **Root cause:** Unhandled promise rejection kills Node.js process
- **Detection:** `Node.js vX.X.X` at end of server logs
- **Fix:** Add `process.on('unhandledRejection')` handler + fix the specific route error

### Pattern B: Database schema mismatch
- **Symptom:** All tests that create users fail with 500; tests that don't create users pass
- **Root cause:** Missing column, wrong FK constraint, or migration not applied
- **Detection:** Server logs show `column does not exist` or `violates foreign key constraint`
- **Fix:** Apply missing migration or fix the SQL in the route handler

### Pattern C: Content migration ordering
- **Symptom:** All integration tests fail; E2E tests partially fail
- **Root cause:** Content migration runs before schema migration, or empty registry triggers error
- **Detection:** `validSlugs.size === 0` logged as severity error
- **Fix:** Downgrade empty-registry to warning, or ensure migration ordering

## Gotchas

- **Playwright retries mask the pattern.** Always run with `--retries=0` to see the raw failure count.
- **CI `API_URL` goes through Vite proxy.** Tests use `http://localhost:5173` which proxies to `:3000`. If Vite proxy is broken, all API calls fail silently.
- **Server container must be rebuilt after code changes.** Volume-mounted `server/src` with `tsx watch` auto-reloads, but Dockerfile-built containers need explicit rebuild.
- **`curl` exit 56 is NOT a server failure.** On shared hosts, stale docker-proxy state causes host-side curl to fail even when the container is healthy. Always verify with in-container `wget`.
