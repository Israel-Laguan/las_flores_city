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
- **Pool constraint — read this before designing anything:** this repo's `AGENTS.md` hard
  constraint is that all player reads AND writes go through `oltpPool` /
  `withOLTPTransaction`, and the only sanctioned extra pool is the read-only
  `contentPool`. **Do not add `planningPool`/`runtimePool` to
  `infra/src/connection.ts`**, and do not route `runtime/` code through a new pool —
  the runtime role owns player state/effects, so a `runtimePool` would violate the
  single-writer-pool rule. Instead:
  - All production `runtime/` code uses the existing `oltpPool` / `withOLTPTransaction`.
  - The role/schema split in this ticket is **DB-level enforcement**: the `runtime` and
    `planning` roles exist so grants can be proven separate (SC-106), not so the app gets
    new pools.
  - The `runtime` role's own login credential (`RUNTIME_DATABASE_URL`) is provisioned for
    **the SC-106 negative-permission test only** (a raw `pg` client inside the test —
    not a production pool export).
  - Whether `planning/` compile/intake code ever justifies a second sanctioned pool is an
    explicit open question for the `AGENTS.md` owners — record the drift, don't assume it.

## Dependencies

- **Blocked by:** SC-101 (module tree should exist so `planning/`/`runtime/` code has
  somewhere to live).
- **Blocks:** SC-104 (migration file), SC-106 (negative permission test), and downstream
  SC-501 (player state schema, per `backlog.md`).

## Acceptance criteria

- Both schemas (`planning`, `runtime`) exist via a migration in the standard runner
  (see SC-104 — same migration file may cover both tickets).
- `runtime` role: full rights on `runtime` schema, **no read and no write on `planning`**.
- `planning` role: full rights on `planning` schema; no rights on `runtime`.
- Roles are created **with `LOGIN` and a password** (`CREATE ROLE runtime LOGIN PASSWORD
  ...`). PostgreSQL roles are `NOLOGIN` by default, and SC-106 must actually connect as
  the `runtime` role — a `NOLOGIN` role leaves that test unable to connect. CI injects
  `RUNTIME_DATABASE_URL` (and `PLANNING_DATABASE_URL` if needed) into the
  `with-migrations` job as test-only secrets/env.
- Explicitly scoped: *"role creation targets the CI/dev `postgres-oltp` service only this
  sprint; production provisioning path is recorded as an open question, not assumed
  solved."*
- **No new pools**: `infra/src/connection.ts` is NOT modified in this ticket. Production
  `runtime/` code stays on `oltpPool`/`withOLTPTransaction`; `RUNTIME_DATABASE_URL` is
  consumed only by SC-106's test. Adding `planningPool`/`runtimePool` would violate the
  repo's sanctioned-pool constraint (see "Data checked" above).
- Existing `server/` tables and its role are untouched — verified by running the current
  test suite green.

## Prompt to execute

```
Add `planning` and `runtime` Postgres schemas and two DB roles to this repo's existing
las_flores OLTP database (the same one server/src/database/migrate.ts already targets).
Do NOT add any new connection pools — this repo's AGENTS.md constraint is that all player
reads/writes go through oltpPool/withOLTPTransaction and the only sanctioned extra pool
is the read-only contentPool. The role split here is DB-level enforcement proven by
SC-106's negative-permission test, not new app-side pools.

Steps:
1. Write the schema+role migration as a new file under
   server/src/database/migrations/ (check the existing numbering scheme and follow it),
   registered in server/src/database/migration-targets.json's "oltp" array:
   - CREATE SCHEMA planning; CREATE SCHEMA runtime;
   - CREATE ROLE planning_role LOGIN PASSWORD ... with full rights on planning schema
     only. Roles are NOLOGIN by default — without LOGIN+PASSWORD, SC-106 cannot connect
     as this role at all.
   - CREATE ROLE runtime_role LOGIN PASSWORD ... with full rights on runtime schema
     only, and explicitly NO grants (not even USAGE) on the planning schema.
   - Grants must NOT touch any existing server/ tables or the existing app role.
   - Read the current role passwords from env (e.g. RUNTIME_DB_PASSWORD) rather than
     hardcoding them in the migration.
2. Add PLANNING_DATABASE_URL and RUNTIME_DATABASE_URL to .env.example and to CI's
   with-migrations job env, documenting both as TEST-ONLY credentials consumed by
   SC-106's negative-permission test (a raw pg client in that test file) — not by any
   production pool.
3. Do NOT modify infra/src/connection.ts — no planningPool/runtimePool exports.
4. Scope note to record explicitly in a comment or this ticket's follow-up: role
   creation via migration assumes CREATEROLE rights, which the CI postgres-oltp service
   grants by default but a production Postgres instance may not — do not silently assume
   this migration is production-ready.
5. Run the full existing test suite (`npm run test:server` or equivalent) to confirm
   nothing in server/'s existing tables/roles regressed.

Do not build any planning/ or runtime/ business logic in this pass — only the schema
and roles. Do not touch client/ or content/, and do not add new pools or cache layers.
```
