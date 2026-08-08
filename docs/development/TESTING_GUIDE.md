# Testing Guide

## Running Tests Locally

### Server Tests

```bash
cd server

# Install dependencies
npm install

# Run all tests
npm test

# Run specific test file
npm test -- tests/integration/assets.test.ts

# Run with coverage
npm run test:coverage
```

### Running in Podman

Use the helper script for containerized testing:

```bash
# Run specific test
./scripts/run-tests-podman.sh server/tests/integration/assets.test.ts

# Run test directory
./scripts/run-tests-podman.sh server/tests/integration/

# See all options
./scripts/run-tests-podman.sh --help
```

### Podman Testing Requirements

1. Start the stack: `./start-stack.sh`
2. Ensure services are healthy: `curl http://localhost:3000/health`
3. Run tests with appropriate env vars

## Test Configuration

See `server/jest.config.*` files for test configuration.

## Writing Tests

### Integration Tests

Location: `server/tests/integration/`

- Test API endpoints with full request/response cycle
- Mock external services (MinIO, StorageService)
- Use `jest.unstable_mockModule()` for dependency mocking

### Unit Tests

Location: `server/tests/unit/`

- Test individual functions/classes
- Mock all external dependencies
- Focus on business logic

## Troubleshooting

### Flaky Integration Tests

Integration tests share the same Postgres and Redis instances and **run in parallel by default** (no `--runInBand`). To stay stable, schema-mutating operations serialize on a shared advisory lock and the global worker suites self-isolate. See `AGENTS.md` → "Test isolation rules" for the full contract.

#### Known flaky tests (fixed)

| Test file | Symptom | Root cause | Fix |
|-----------|---------|------------|-----|
| `aftermath.worker.test.ts` | `scRows` = 1 (scene_characters not deleted) | `processExpiredMysteries()` reused one DB client across all mysteries; a failure on a foreign mystery poisoned the test's own mystery | Per-mystery clients in `LeaderboardWorker.ts` |
| `migration.drift.test.ts` | `result.success === false` | Shared `MYSTERY_ID` with `leaderboard.simulation.test.ts` + advisory lock fail-fast | Decoupled IDs + **blocking** advisory lock |
| Parallel DDL deadlocks (`migration.drift`, `story-beat-pipeline`, `breakthrough.concurrency`, etc.) | Postgres `deadlock detected` / `Test suite failed` | Concurrent `create`/`alter table` across workers take `ACCESS EXCLUSIVE` locks | `withSchemaLock(...)` in `server/tests/helpers/schemaLock.ts` serializes DDL + whole-table reconciles |
| `leaderboard.simulation.test.ts` / `aftermath.worker.test.ts` mid-seed interference | Nondeterministic rank/count assertions | Global `processExpiredMysteries()` finalized a sibling's mystery mid-seed | Non-expired seed + scoped `processExpiredMysteries([OWN_ID])` |

#### Reproducing a suspected integration flake (diagnostic)

```bash
# 1. Clear stale ts-jest cache first (required!)
cd server && npx --no-install jest --clearCache

# 2. Run integration tests in PARALLEL (default; no --runInBand) repeatedly
npx --no-install jest tests/integration --forceExit --detectOpenHandles

# 3. Run the worker suites together in parallel
npx --no-install jest tests/integration/aftermath.worker.test.ts tests/integration/migration.drift.test.ts tests/integration/leaderboard.simulation.test.ts --forceExit --detectOpenHandles

# 4. Verify: integration now passes in parallel
npm run test:integration
```

#### Writing flake-proof integration tests

1. **Use a dedicated synthetic UUID** for every test fixture. Never reuse a real content ID (e.g., `a0000000-...`) for a synthetic simulation.
2. **Clean up rows in `afterAll`** — delete test data but do NOT call `closeConnections()` / `closeRedis()` unless you must. `globalTeardown` handles pool teardown.
3. **If you call `processExpiredMysteries()`**, scope it to your own mystery (`processExpiredMysteries([SELF_ID])`) and seed non-expired, so a sibling worker can never touch it.
4. **If you run schema DDL (`applyMigration`) or a whole-table reconcile (`DELETE FROM x` with no WHERE)**, wrap it in `withSchemaLock(...)` from `tests/helpers/schemaLock.ts`. Leave ordinary row-level data mutations unlocked so they run in parallel.

### Asset Tests Fail in CI but Pass Another Way

Lessons learned from fixing the asset test suites under podman/CI:

1. **PROMPT_ROOT is cwd-dependent.**  
   In CI and podman, `process.cwd()` is `server/`, so:
   - ✅ `path.resolve(process.cwd(), '../content')`
   - ❌ `path.resolve(process.cwd(), 'content')`

2. **`jest.unstable_mockModule()` is unreliable under ts-jest / CJS transform.**  
   Prefer `jest.doMock()` + `await import()` in `beforeAll`:
   ```typescript
   jest.doMock('../../src/services/StorageService.js', () => ({ ... }));
   const { signMinioUrl } = await import('../../src/services/StorageService.js');
   ```

3. **`Buffer.arrayBuffer()` can return shared/slab memory.**  
   `mockBuffer.buffer` may include extra bytes. Use an exact slice:
   ```typescript
   function exactArrayBuffer(value: Buffer | string): ArrayBuffer {
     const buffer = Buffer.isBuffer(value) ? value : Buffer.from(value);
     return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
   }
   ```

4. **Mock `fetch` must preserve `RequestInit`.**  
   When falling back to `originalFetch(url, init)`, pass `init` through or Express receives the wrong HTTP method and returns HTML error pages.

5. **Test-inserted rows must satisfy Zod response schemas.**  
   An `INSERT` that omits non-nullable response fields (e.g. `asset_type`, `prompt_text`, `negative_prompt`) causes `GET /assets/list` to 500 on `AssetListResponseSchema.parse`.

### Tests Fail in CI but Pass Locally

Common causes:
1. Missing environment variables in CI
2. Different Node.js versions
3. Timing issues with async code
4. Mock module paths incorrect (see below)

### Jest Mock Module Path Issue

If mocks aren't being applied under ts-jest, avoid the `.ts` / `.js` mismatch: the safer pattern is `jest.doMock()` + `await import()` in `beforeAll`.

```typescript
jest.doMock('../../src/services/StorageService.js', () => ({
  signMinioUrl: jest.fn().mockResolvedValue('signed-url'),
}));
const { signMinioUrl } = await import('../../src/services/StorageService.js');
```

Old `jest.unstable_mockModule(... .ts)` behavior is unreliable once ts-jest compiles specs to CommonJS.
```

## Testing in Production Mode

Test your production Docker/Podman configuration locally:

```bash
# Start production services (no public ports for databases)
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# Run tests against production build
./scripts/run-tests-podman.sh server/tests/

# When done, clean up
docker-compose -f docker-compose.yml -f docker-compose.prod.yml down
```

### Production Requirements

1. Set Docker secrets via `_FILE` environment variables:
   ```bash
   export POSTGRES_PASSWORD_FILE=secrets/postgres_password.txt
   export JWT_SECRET_FILE=secrets/jwt_secret.txt
   ```

2. Ensure `.env` is properly configured with production values

3. Verify no source code volume mounts are present (production uses built images)

## Related Docs

- [Docker Workflow](./DOCKER_WORKFLOW.md) - Container building and running
- [Development Setup](../DEVELOPMENT_SETUP.md) - Full stack setup
- `.env.example` - Environment variable reference