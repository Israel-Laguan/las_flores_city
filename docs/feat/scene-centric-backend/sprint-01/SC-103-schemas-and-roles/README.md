# SC-103 · Schemas and roles

**Size:** M · **Type:** setup · **Milestone:** SC-M1 · **Feature:** F10

## Context

Create `planning` and `runtime` schemas plus two DB roles, with grants per
`architecture.md` §3 (rung 2 of the separation ladder: same database, separate schemas,
separate roles). This is the R9 ("one writer per fact") enforcement mechanism — it must
not be cut.

## Data checked against the real repo (verified clean)

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
    new pools. **SC-M1 enforcement is CI/dev grant-proof only** — production `runtime/`
    still runs as the privileged `las_flores` app role on `oltpPool`; the `R9` boundary
    is structurally present in Postgres grants but not yet assumed by production code.
    A future transaction-scoped `SET LOCAL ROLE runtime` helper inside
    `withOLTPTransaction` (or a sanctioned second pool exception approved by `AGENTS.md`
    owners) is the explicit follow-up to make production actually run as the restricted
    role — record the drift, don't ship a pool or `SET ROLE` in this ticket.
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
- **Object-level privileges (Postgres `GRANT ALL ON SCHEMA` is not enough):** for each
  schema, grant the owning role `USAGE` on the schema plus `ALL` on all existing
  **tables and sequences** in that schema (`GRANT ALL ON ALL TABLES IN SCHEMA` /
  `ALL SEQUENCES`), and install `ALTER DEFAULT PRIVILEGES IN SCHEMA ... GRANT ALL ON
  TABLES/SEQUENCES TO <role>` so future objects are automatically accessible to the
  role that owns that schema. Alternative satisfying the same invariant: make the
  corresponding role the **owner** of every object it is meant to access (so grants are
  implicit) — document which path is chosen. In either case, `runtime` receives **no
  grants of any kind** on `planning` (not even `USAGE`), and vice versa, and no grant
  touches existing `server/` tables or the app role.
- Roles are created **with `LOGIN` and a fixed dev password** (`CREATE ROLE runtime LOGIN PASSWORD 'dev_runtime'` / `CREATE ROLE planning LOGIN PASSWORD 'dev_planning'` — canonical names are `runtime` and `planning`, matching `RUNTIME_DATABASE_URL`/`PLANNING_DATABASE_URL` and SC-106's `SET ROLE` fallback). PostgreSQL roles are `NOLOGIN` by default, and SC-106 must actually connect as the `runtime` role — a `NOLOGIN` role leaves that test unable to connect. The migration uses `IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '...')` guards for idempotency so re-runs skip existing roles. **Passwords are fixed dev secrets in the migration** — SC-104 does not expand `${VAR}` placeholders in `migrate.ts`; the runner stays generic. Real secrets for production provisioning are a post-SC-M1 concern handled outside the migration runner (e.g. an out-of-runner bootstrap script using the migration-owner credential and `SET ROLE`). **Migration registration:** The role-creation migration must be registered as `nontransactional` in `migration-targets.json` — PostgreSQL 16 (the repo's pinned `postgres:16-alpine` version) disallows `CREATE ROLE` inside a transaction block, so these migrations cannot run inside the standard `BEGIN/COMMIT` wrapper that applies `oltp`-array migrations. Only the `nontransactional` path (e.g. how migration 075 is treated) can successfully execute role creation. CI/dev auth path for SC-106 (`.env.example` + CI `with-migrations` env lines 77-78 — test-only credentials for the raw `pg` client in SC-106's negative-permission test): `RUNTIME_DATABASE_URL=postgresql://runtime:dev_runtime@postgres-oltp:5432/las_flores` (and `PLANNING_DATABASE_URL=postgresql://planning:dev_planning@postgres-oltp:5432/las_flores` if needed). If the environment cannot issue `LOGIN` roles (e.g. managed Postgres without `CREATEROLE`), document the fallback bootstrap connection that authenticates as the migration owner and immediately `SET ROLE runtime` — SC-106 MUST still exercise the grant check, not bypass it. No production pool consumes these URLs.
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
    registered in server/src/database/migrations/migration-targets.json's "nontransactional" map:
     - CREATE SCHEMA IF NOT EXISTS planning;
     - CREATE SCHEMA IF NOT EXISTS runtime;
     - CREATE ROLE planning LOGIN PASSWORD 'dev_planning' with full rights on planning schema
       only. Roles are NOLOGIN by default — without LOGIN+PASSWORD, SC-106 cannot connect
       as this role at all. Canonical role names are `planning` and `runtime` (must match
       `RUNTIME_DATABASE_URL`/`PLANNING_DATABASE_URL` and SC-106). Use `IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '...')` guards around each `CREATE ROLE` so re-runs are idempotent.
     - CREATE ROLE runtime LOGIN PASSWORD 'dev_runtime' with full rights on runtime schema only,
       and explicitly NO grants (not even USAGE) on the planning schema.
     - Grants must NOT touch any existing server/ tables or the existing app role.
      - Use fixed dev passwords (`dev_runtime` / `dev_planning`) for CI/dev; do NOT add `${VAR}` placeholder expansion to `migrate.ts` — the runner stays generic. Real secrets for production are handled out-of-runner (post-SC-M1 bootstrap).
     - Register under `"nontransactional"` (CREATE ROLE is illegal inside a tx) rather than the `"oltp"` array.
2. Add PLANNING_DATABASE_URL and RUNTIME_DATABASE_URL to .env.example, documenting both as TEST-ONLY credentials consumed by SC-106's negative-permission test (a raw pg client in that test file) — not by any production pool. These are also present in CI's `with-migrations` job env (lines 77-78) so the test can run in CI.
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
