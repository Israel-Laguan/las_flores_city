# SC-103 · Schemas and roles

**Size:** M · **Type:** setup · **Milestone:** SC-M1 · **Feature:** F10

## Context

Create `planning` and `runtime` schemas plus two DB roles, with grants per
`architecture.md` §3 (rung 2 of the separation ladder: same database, separate schemas,
separate roles). This is the R9 ("one writer per fact") enforcement mechanism — it must
not be cut.

## Data checked against the real repo

- The two schemas live inside the **existing** `las_flores` OLTP database — the same one
  `DATABASE_URL` already points at in CI (`postgres-oltp` service in
  `.github/workflows/ci.yml`) and in `server/src/database/migrate.ts`'s hardcoded
  `dbConfigs`. No new database, no new CI service.
- **`CREATE ROLE` is an open question, not a given.** In CI, `POSTGRES_USER=las_flores`
  owns the whole cluster (official `postgres` image default), so role creation works
  there. In a real deployment target (managed Postgres, RDS, etc.), the app's migration
  user frequently lacks `CREATEROLE`. **This ticket's scope for sprint 1 is dev/CI only**
  — production role provisioning is an explicit open question to record, not solve here.
- Pooling precedent already exists: `infra/src/connection.ts` has `contentPool`, a
  separate connection using `CONTENT_DATABASE_URL` (falling back to `DATABASE_URL`) so
  content reads use a different credential than player writes, with a proxy-lazy export
  pattern (`oltpPool`/`olapPool`/`contentPool`). **Reuse this exact pattern** for
  `planningPool`/`runtimePool` — new env vars (e.g. `PLANNING_DATABASE_URL`,
  `RUNTIME_DATABASE_URL`), same proxy shape. Do not invent a different pooling mechanism.

## Dependencies

- **Blocked by:** SC-101 (module tree should exist so `planning/`/`runtime/` code has
  somewhere to put the new pool exports).
- **Blocks:** SC-104 (migration file), SC-106 (negative permission test), and downstream
  SC-501 (player state schema, per `backlog.md`).

## Acceptance criteria

- Both schemas (`planning`, `runtime`) exist via a migration in the standard runner
  (see SC-104 — same migration file may cover both tickets).
- `runtime` role: full rights on `runtime` schema, **no read and no write on `planning`**.
- `planning` role: full rights on `planning` schema; no rights on `runtime`.
- Explicitly scoped: *"role creation targets the CI/dev `postgres-oltp` service only this
  sprint; production provisioning path is recorded as an open question, not assumed
  solved."*
- `planningPool`/`runtimePool` added to `infra/src/connection.ts` following the
  `contentPool` precedent exactly (own env var, own proxy export, comment noting which
  code path is allowed to use it).
- Existing `server/` tables and its role are untouched — verified by running the current
  test suite green.

## Prompt to execute

```
Add `planning` and `runtime` Postgres schemas and two DB roles to this repo's existing
las_flores OLTP database (the same one server/src/database/migrate.ts already targets),
plus the connection-pooling wiring to use them from code.

Before writing anything, read infra/src/connection.ts in full — it already has a
`contentPool` that uses a separate connection string (CONTENT_DATABASE_URL, falling back
to DATABASE_URL) via a lazy proxy-based pool export, specifically so content reads use a
different credential than player writes. Copy that exact pattern; do not design a new one.

Steps:
1. Write the schema+role migration as a new file under
   server/src/database/migrations/ (check the existing numbering scheme and follow it),
   registered in server/src/database/migration-targets.json's "oltp" array:
   - CREATE SCHEMA planning; CREATE SCHEMA runtime;
   - CREATE ROLE for planning with full rights on planning schema only.
   - CREATE ROLE for runtime with full rights on runtime schema only, and explicitly
     NO grants (not even USAGE) on the planning schema.
   - Grants must NOT touch any existing server/ tables or the existing app role.
2. Add PLANNING_DATABASE_URL and RUNTIME_DATABASE_URL to .env.example, following
   however CONTENT_DATABASE_URL is documented there.
3. In infra/src/connection.ts, add planningPool and runtimePool exports mirroring
   contentPool's shape (lazy Pool creation behind a Proxy, same fallback-to-DATABASE_URL
   pattern only if that matches this repo's existing convention for such pools — check
   contentPool's comment about why it falls back before copying that specific detail).
4. Scope note to record explicitly in a comment or this ticket's follow-up: role
   creation via migration assumes CREATEROLE rights, which the CI postgres-oltp service
   grants by default but a production Postgres instance may not — do not silently assume
   this migration is production-ready.
5. Run the full existing test suite (`npm run test:server` or equivalent) to confirm
   nothing in server/'s existing tables/roles regressed.

Do not build any planning/ or runtime/ business logic in this pass — only the schema,
roles, and pool wiring. Do not touch client/ or content/.
```
