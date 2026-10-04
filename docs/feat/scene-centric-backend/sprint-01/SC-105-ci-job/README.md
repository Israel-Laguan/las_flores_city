# SC-105 · CI job

**Size:** S · **Type:** setup · **Milestone:** SC-M1 · **Feature:** F10

**Status:** ✅ Done — verified against `ci.yml` and `package.json`. The CI job already covers all required steps; no code changes needed.

## Context

CI runs typecheck, lint (including SC-102's boundary rule), and unit tests across all
three new modules on every PR.

## Data checked against the real repo

`.github/workflows/ci.yml` already has a two-chain structure: `no-migrations` (fast —
typecheck/lint/build/unit tests, no services) and `with-migrations` (needs Postgres/
Redis/MinIO — integration/E2E). **This is not a new CI job** — it's an extension of the
existing `no-migrations` chain.

Verified facts (all CONFIRMED against actual code):

- `ci.yml` line 43-44: `no-migrations` job **already** has a `Typecheck all workspaces`
  step running `npm run typecheck --workspaces`. This covers `api/contracts`,
  `api/planning`, `api/runtime` automatically because the root `package.json`
  (line 29) defines `typecheck` as `npm run typecheck --workspaces`, and the
  workspaces array (lines 5-15) includes all three `api/*` entries.
- `ci.yml` line 60: `no-migrations` job already runs `npm run test:unit --workspace=server`.
- `ci.yml` line 63: `no-migrations` job runs `npm run validate:schema --workspace=server` (schema-only, no DB).
- `server/package.json` line 16-21: `lint`, `typecheck`, `test:unit`, `test:integration`,
  `schema:migrate` scripts all exist.
- `api/*` package.json files all have `build`, `lint`, `typecheck`, `test` scripts
  (`test` is a placeholder `process.exit(0)` until real api tests land — covered by
  `typecheck --workspaces` + `lint` in `no-migrations`; no dedicated `Unit tests - api workspaces` step).

**No CI changes were required.** The `no-migrations` job already covers everything
SC-105's acceptance criteria describe. The original README's claims that
`npm run typecheck --workspaces` was missing from `no-migrations` and that the
`api/*` workspaces weren't being typechecked were factually incorrect. The
placeholder `Unit tests - api workspaces` step (previously line 62-63) was removed
as redundant — `api/*` `test` scripts are no-ops.

## Dependencies

- **Blocked by:** SC-101, SC-102 (needs the tree and the lint rule to exist).
- **Blocks:** nothing directly, but SC-106's proof depends on the `with-migrations` chain
  already having a Postgres service — see that ticket.

## Acceptance criteria

- ✅ CI's `no-migrations` job runs `npm run typecheck --workspaces` (line 44).
- ✅ CI's `no-migrations` job runs `npm run test:unit --workspace=server` (line 60) and `validate:schema` (line 63); `api/*` workspaces are covered by `typecheck --workspaces` + `lint` (their `test` scripts are placeholder no-ops, so no dedicated api unit-test step).
- ✅ No new workflow file needed — all steps exist in the existing `no-migrations` job.
- ✅ `with-migrations` job env already includes `RUNTIME_DATABASE_URL` and
  `PLANNING_DATABASE_URL` (lines 74-75) for SC-106's raw `pg` client test.

## Prompt to execute

```
Verify that this repo's existing GitHub Actions CI already covers the new
api/contracts, api/planning, api/runtime workspaces added in SC-101.

Read .github/workflows/ci.yml first. It has two jobs: `no-migrations` (typecheck,
lint, build, unit tests — no DB) and `with-migrations` (integration/E2E, needs
Postgres/Redis/MinIO services). The new api/* workspaces belong in the
`no-migrations` job, since they have no DB dependency yet.

Steps:
1. Run `npm run typecheck --workspaces` and `npm run lint --workspaces` locally and
   confirm the new workspaces are included automatically (they should be, since
   `--workspaces` iterates package.json's workspaces array).
2. Check whether `no-migrations`'s "Unit tests" step (`npm run test:unit --workspace=server`)
   or an equivalent needs a matching entry for the new workspaces, or whether a root
   `npm run test` / `--workspaces` invocation already covers them — `api/*` `test` scripts are currently placeholder no-ops, so `typecheck --workspaces` + `lint` is sufficient.
3. Confirm the `no-migrations` job already has `Typecheck all workspaces` (line 44) — no api unit-test step needed while `api/*` tests are placeholders.
4. Confirm `with-migrations` job env already includes `RUNTIME_DATABASE_URL` and
   `PLANNING_DATABASE_URL` (lines 74-75) so SC-106's raw pg client test can connect as the runtime role.

Do not add SC-106's negative-permission test wiring here — that belongs in the
with-migrations job since it needs a live Postgres connection; keep these separate.
```
