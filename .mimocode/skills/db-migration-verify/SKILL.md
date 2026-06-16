---
name: db-migration-verify
description: "End-to-end DB migration workflow: write SQL, update types, write route, write test, verify TypeScript, run Jest, apply migration on Docker, seed data, rebuild server, test endpoint with curl. Use this whenever adding or modifying database schema."
---

# DB Migration Verify Pipeline

End-to-end workflow for database schema changes in Las Flores 2077. This skill encodes the exact sequence that was repeated across migrations 001, 003, and 004.

## When to use

- Adding new tables or columns
- Modifying existing table schema
- Adding new Zod schemas to `@las-flores/shared`
- Any change that touches `server/src/database/migrations/`

## Prerequisites

- Docker Compose running (`docker ps` shows las-flores-postgres-oltp healthy)
- Node.js dependencies installed in all workspaces

## Steps

### Phase 1: Write & Type

1. **Write the SQL migration file** at `server/src/database/migrations/NNN_description.sql`
   - Use `BEGIN` / `COMMIT` wrapping
   - Use `IF NOT EXISTS` for all `ALTER TABLE ADD COLUMN` and `CREATE TABLE`
   - Use `ON CONFLICT` for seed data inserts
   - Reference existing tables by UUID for FK seeds
   - Pattern:
     ```sql
     BEGIN;
     ALTER TABLE foo ADD COLUMN IF NOT EXISTS bar TYPE DEFAULT val;
     CREATE TABLE IF NOT EXISTS baz (...);
     CREATE INDEX IF NOT EXISTS idx_name ON table(col);
     CREATE TRIGGER ... BEFORE UPDATE ON table FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
     COMMIT;
     ```

2. **Update shared types** in `shared/src/index.ts`
   - Add Zod schema + inferred type for new response shapes
   - Update existing schemas if columns changed
   - Place `ScenePayload`-style response schemas BEFORE `ApiResponseSchema` definition (TS hoisting issue)
   - Place response wrappers (e.g., `ScenePayloadResponseSchema`) AFTER `ApiResponseSchema`

3. **Update content migration** in `server/src/content/migrate.ts`
   - If new columns were added to `scenes`, `characters`, or other content tables, update the `upsert*` function to include them in INSERT/ON CONFLICT

4. **Update YAML content files** in `content/`
   - Add new fields to YAML files
   - Do NOT use relative paths for `image_url` — Zod `z.string().url()` rejects them. Omit the field or use full CDN URLs

### Phase 2: TypeScript Verify

Run in order — each depends on the previous:

```bash
# 1. Shared types (must pass first)
npx tsc --noEmit  # in shared/

# 2. Server (depends on shared)
npx tsc --noEmit  # in server/

# 3. Client (depends on shared)
npx tsc --noEmit  # in client/
```

If shared fails, fix it before touching server or client.

### Phase 3: Route & Test

5. **Write/update the route handler** in `server/src/routes/`
   - Follow the `assemblePlayerState` pattern from `player.ts:14-50`
   - Use `queryOLTP()` for DB queries
   - Use `getCache`/`setCache`/`deleteCache` from `redis.ts`
   - Auth: `req.userId!` assertion (TS type is `string | undefined` but middleware guarantees set)

6. **Update integration tests** in `server/tests/integration/`
   - Update `api-contract.test.ts` to match new response shape
   - Update `client/tests/e2e/api-contract.spec.ts` for client-side contract

7. **Run Jest tests**
   ```bash
   cd server && npm test
   ```
   Tests may use mocked DB — they validate contract shape, not real DB state.

### Phase 4: Docker Migration

This is the critical phase that catches real-world issues tests miss.

8. **Check current DB state** before running migration:
   ```bash
   docker exec las-flores-postgres-oltp psql -U las_flores -d las_flores -c "\dt"
   docker exec las-flores-postgres-oltp psql -U las_flores -d las_flores -c "\d tablename"
   ```
   - Verify which tables/columns already exist
   - Check for partial previous applications

9. **Apply migration** — run SQL statements individually if the file uses `BEGIN/COMMIT` blocks that may fail partway:
   ```bash
   # Option A: Run the full file
   docker exec -i las-flores-postgres-oltp psql -U las_flores -d las_flores < server/src/database/migrations/NNN_description.sql

   # Option B: Run statements individually (safer for partial states)
   docker exec -i las-flores-postgres-oltp psql -U las_flores -d las_flores <<'SQL'
   ALTER TABLE foo ADD COLUMN IF NOT EXISTS bar TYPE DEFAULT val;
   SQL
   ```
   **FK dependency order matters:**
   - `scenes` must exist before `scene_characters`
   - `users` must exist before `user_relationships`
   - `characters` must exist before `scene_characters`

10. **Run content migration** if YAML data references new columns:
    ```bash
    docker exec las-flores-server npx tsx src/content/migrate.ts /app/content
    ```
    If it fails with "column X does not exist", the schema migration (step 9) wasn't applied or missed a column.

11. **Seed test data** (relationships, test user, etc.):
    ```bash
    docker exec -i las-flores-postgres-oltp psql -U las_flores -d las_flores <<'SQL'
    INSERT INTO table (...) VALUES (...) ON CONFLICT (...) DO NOTHING;
    SQL
    ```
    **FK check:** Test user must exist before seeding `user_relationships`.

12. **Verify seeded data**:
    ```bash
    docker exec las-flores-postgres-oltp psql -U las_flores -d las_flores -c "SELECT * FROM new_table"
    ```

### Phase 5: Rebuild & Live Test

13. **Rebuild server container** (picks up new routes/types):
    ```bash
    docker compose build server --no-cache
    docker compose up -d server
    ```
    Wait for "Server running on port 3000" in logs.

14. **Get auth token**:
    ```bash
    TOKEN=$(curl -s http://localhost:3000/auth/dev-login \
      -H 'Content-Type: application/json' \
      -d '{"userId":"00000000-0000-0000-0000-000000000001"}' \
      | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['token'])")
    ```

15. **Test endpoint with curl**:
    ```bash
    curl -s "http://localhost:3000/endpoint" \
      -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
    ```

16. **Verify Redis caching**:
    ```bash
    docker exec las-flores-redis redis-cli KEYS "*pattern*"
    ```

17. **Test cache invalidation** (if applicable):
    ```bash
    curl -s -X POST "http://localhost:3000/endpoint/invalidate" \
      -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
    docker exec las-flores-redis redis-cli KEYS "*pattern*"  # should be empty
    ```

## Gotchas

- **Partial migrations are common.** Always `\dt` and `\d tablename` before running. Migrations 001/003 may have been partially applied.
- **`BEGIN`/`COMMIT` blocks abort on first error.** If one statement fails, all subsequent statements in the block are skipped. Run statements individually for debugging.
- **Content migration depends on schema.** `npx tsx src/content/migrate.ts` will fail if the DB is missing columns that YAML data references.
- **YAML `image_url` with relative paths fails Zod validation.** Omit the field or use full CDN URLs.
- **Server needs rebuild after code changes.** `docker compose build server --no-cache` is required — the container runs compiled JS, not TypeScript.
- **`docker exec -i`** (with `-i`) is needed for stdin redirect to psql. Without it, heredocs and file redirects don't work.
- **Test user UUID:** `00000000-0000-0000-0000-000000000001` — must exist before seeding relationship data.

## Quick Reference Commands

```bash
# Check DB state
docker exec las-flores-postgres-oltp psql -U las_flores -d las_flores -c "\dt"

# Apply single migration
docker exec -i las-flores-postgres-oltp psql -U las_flores -d las_flores < path/to/migration.sql

# Run content migration
docker exec las-flores-server npx tsx src/content/migrate.ts /app/content

# Rebuild & restart server
docker compose build server --no-cache && docker compose up -d server

# Test endpoint
TOKEN=$(curl -s http://localhost:3000/auth/dev-login -H 'Content-Type: application/json' -d '{"userId":"00000000-0000-0000-0000-000000000001"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['token'])")
curl -s http://localhost:3000/endpoint -H "Authorization: Bearer $TOKEN" | python3 -m json.tool

# Check Redis
docker exec las-flores-redis redis-cli KEYS "*"
```
