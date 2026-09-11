# SC-105 · CI job

**Size:** S · **Type:** setup · **Milestone:** SC-M1 · **Feature:** F10

## Context

CI runs typecheck, lint (including SC-102's boundary rule), and unit tests across all
three new modules on every PR.

## Data checked against the real repo

`.github/workflows/ci.yml` already has a two-chain structure: `no-migrations` (fast —
typecheck/lint/build/unit tests, no services) and `with-migrations` (needs Postgres/
Redis/MinIO — integration/E2E). **This is not a new CI job** — it's an extension of the
existing `no-migrations` chain, since `npm run typecheck --workspaces` and
`npm run lint --workspaces` already pick up new workspaces automatically once SC-101
registers them. The only real CI change here is confirming that's true and adding the new
workspaces' unit-test scripts to whatever aggregate test command the `no-migrations`
job runs.

## Dependencies

- **Blocked by:** SC-101, SC-102 (needs the tree and the lint rule to exist).
- **Blocks:** nothing directly, but SC-106's proof depends on the `with-migrations` chain
  already having a Postgres service — see that ticket.

## Acceptance criteria

- CI's existing `no-migrations` job runs an explicit `npm run typecheck --workspaces`
  (today it builds shared/infra/server/admin and lints, but does **not** typecheck the
  new `api/*` workspaces), plus lint (incl. SC-102's rule) and unit tests across
  `api/contracts`, `api/planning`, `api/runtime`. Add that typecheck step to the existing
  job — do not create a new workflow file.
- Job is green on the empty tree (placeholder `index.ts` files only, per SC-101).
- If a genuinely new job step is required (e.g. the aggregate `npm run test` command
  doesn't already fan out to new workspaces), that's a one-line, explicit addition to
  `ci.yml` — not a parallel workflow file.

## Prompt to execute

```
Confirm (and if needed, extend) that this repo's existing GitHub Actions CI already
covers the new api/contracts, api/planning, api/runtime workspaces added in SC-101.

Read .github/workflows/ci.yml first. It has two jobs: `no-migrations` (typecheck, lint,
build, unit tests — no DB) and `with-migrations` (integration/E2E, needs Postgres/Redis/
MinIO services). The new api/* workspaces belong in the `no-migrations` job, since they
have no DB dependency yet.

Steps:
1. Run `npm run typecheck --workspaces` and `npm run lint --workspaces` locally and
   confirm the new workspaces are included automatically (they should be, since
   `--workspaces` iterates package.json's workspaces array).
2. Check whether `no-migrations`'s "Unit tests" step (`npm run test:unit --workspace=server`)
   or an equivalent needs a matching entry for the new workspaces, or whether a root
   `npm run test` / `--workspaces` invocation already covers them.
3. The current no-migrations job does NOT run `npm run typecheck --workspaces`. Add that
   as one step on the existing job so api/* type errors cannot merge undetected.
4. If a new workspace's test script isn't invoked anywhere, add the minimal extra line
   to the same job — do not create a new job or workflow file.

Do not add SC-106's negative-permission test wiring here — that belongs in the
with-migrations job since it needs a live Postgres connection; keep these separate.
```
