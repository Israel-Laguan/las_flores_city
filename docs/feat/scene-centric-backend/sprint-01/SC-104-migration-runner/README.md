# SC-104 · Migration runner covers new schemas

**Size:** S (reclassified — see below) · **Type:** setup · **Milestone:** SC-M1 · **Feature:** F10

## Context

Extend the existing runner rather than adding a parallel mechanism — it already has
migration-log idempotency worth inheriting (`lessons-from-current-code.md` §1.3).

## Data checked against the real repo — size correction

The original doc sized this **M**, implying runner code changes. Having read
`server/src/database/migrate.ts`: the runner already targets exactly two hardcoded
databases (`las_flores`, `las_flores_analytics`) via `migration-targets.json`, with a
generic `applySQLMigrations()` that applies any `.sql` file registered there, tracks it in
`schema_migrations`, and skips it idempotently on re-run. **Adding `planning`/`runtime`
schemas is mostly a new `.sql` migration file** (shared with or adjacent to SC-103's
role-creation file) plus one entry in `migration-targets.json`'s `"nontransactional"` map.
**One narrow runner change IS NOT required:** SC-103 now uses fixed dev passwords
(`dev_runtime` / `dev_planning`) wrapped in `IF NOT EXISTS` guards (e.g.
`IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'planning')`) for
idempotency, so `migrate.ts`'s verbatim `client.query(sql)` does not need
`${VAR}` expansion. The runner stays generic. The file is registered under
"nontransactional" (CREATE ROLE is illegal inside a tx) rather than the "oltp" array.

## Dependencies

- **Blocked by:** SC-103 (the schema/role DDL this ticket registers into the runner).
- **Blocks:** SC-106 (permission test needs the schemas actually applied via the
  standard runner, not a manual `psql` step).

## Acceptance criteria

- The schema-creation migration (from SC-103) is registered in `migration-targets.json`'s
  `"nontransactional"` map (targeting "las_flores") — CREATE ROLE cannot run inside a
  transaction; no new target database, no runner code changes.
- `server/src/database/migrate.ts` requires no new migration-execution logic for SC-103 — the migration
   uses `IF NOT EXISTS` guards for idempotency and fixed dev passwords,
   so no `${VAR}` expansion is needed. The runner was annotated (validDbNames fail-fast,
   095 CREATEROLE comment) but no new execution path was added.
- A no-op re-run of `npm run schema:migrate --workspace=server` after the schemas exist skips the file (confirmed
  via `schema_migrations` row), proving idempotency
  is inherited rather than reimplemented.
- `npm run schema:migrate --workspace=server` handles old and new schemas in one invocation — this is already true
  by construction if the migration is registered correctly; the acceptance test is that
  no special-casing was added to `migrate.ts`.
- Rollback path: recorded as **forward-only**, with the reason (per `roadmap.md` §5's
  spike-honesty norm, this is an acceptable interim answer, not a gap to apologize for) —
  or a rollback migration is written if genuinely cheap.

## Prompt to execute

```
  Register the planning/runtime schema-creation migration (written in SC-103) into the
  existing migration runner. The runner already generically applies any .sql file
  registered in migration-targets.json and tracks it in schema_migrations for
   idempotency. SC-103 uses fixed dev passwords and `IF NOT EXISTS` guards
  so no runner changes are needed.

  Steps:
  1. Add the SC-103 migration filename to server/src/database/migrations/migration-targets.json's
     "nontransactional" (as "095_....sql": "las_flores"), following the existing entries' format.
  2. Run `npm run schema:migrate --workspace=server` once — confirm the schemas/roles are created.
  3. Run `npm run schema:migrate --workspace=server` a second time — confirm the migration is skipped (idempotent),
     via the schema_migrations table or the runner's log output.
  4. Decide and record rollback stance: forward-only (with the one-sentence reason) unless
     a rollback migration is trivial to write — do not silently omit this decision.

Do not write any planning/runtime application code in this pass — this ticket is the
migration-registration step only.
```
