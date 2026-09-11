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
schemas requires no runner code changes at all** — it is a new `.sql` migration file
(shared with or adjacent to SC-103's role-creation file) plus one entry in
`migration-targets.json`'s `"oltp"` array. Reclassified to **S**. If real runner changes
turn out to be needed once this is attempted, that itself is a one-line finding for the
retro — the estimate was wrong, not the ticket.

## Dependencies

- **Blocked by:** SC-103 (the schema/role DDL this ticket registers into the runner).
- **Blocks:** SC-106 (permission test needs the schemas actually applied via the
  standard runner, not a manual `psql` step).

## Acceptance criteria

- The schema-creation migration (from SC-103) is registered in `migration-targets.json`'s
  `"oltp"` array — no new target database, no new runner code path.
- A no-op re-run of `npm run migrate` after the schemas exist skips the file (confirmed
  via `schema_migrations` row / log output showing "already applied"), proving idempotency
  is inherited rather than reimplemented.
- `npm run migrate` handles old and new schemas in one invocation — this is already true
  by construction if the migration is registered correctly; the acceptance test is that
  no special-casing was added to `migrate.ts` to make it true.
- Rollback path: recorded as **forward-only**, with the reason (per `roadmap.md` §5's
  spike-honesty norm, this is an acceptable interim answer, not a gap to apologize for) —
  or a rollback migration is written if genuinely cheap.

## Prompt to execute

```
Register the planning/runtime schema-creation migration (written in SC-103) into the
existing migration runner — do NOT modify server/src/database/migrate.ts's logic unless
you find a concrete reason it cannot apply a plain CREATE SCHEMA / CREATE ROLE file as-is
(read the file first; it already generically applies any .sql file registered in
migration-targets.json and tracks it in schema_migrations for idempotency).

Steps:
1. Add the SC-103 migration filename to server/src/database/migration-targets.json's
   "oltp" array, following the existing entries' format.
2. Run `npm run migrate` once — confirm the schemas/roles are created.
3. Run `npm run migrate` a second time — confirm the migration is skipped (idempotent),
   via the schema_migrations table or the runner's log output.
4. Decide and record rollback stance: forward-only (with the one-sentence reason) unless
   a rollback migration is trivial to write — do not silently omit this decision.
5. If you find migrate.ts genuinely needs a code change to support this (it should not),
   stop and flag it rather than making an ad-hoc special case — that's a real finding,
   not an expected step.

Do not write any planning/runtime application code in this pass — this ticket is the
migration-registration step only.
```
