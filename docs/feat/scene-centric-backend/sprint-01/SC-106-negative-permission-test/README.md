# SC-106 · Negative permission test

**Size:** S · **Type:** setup · **Milestone:** SC-M1 · **Feature:** F10

## Context

An automated test connects as the `runtime` role and asserts that reading a `planning`
table fails. This is the enforcement proof for SC-103's grant split — a role split that
is never tested is a claim, not a fact.

## Data checked against the real repo

`.github/workflows/ci.yml`'s `with-migrations` job already provisions a `postgres-oltp`
service and runs `npm run test:integration --workspace=server`. **This test belongs
there** — it needs a live DB connection using the `runtime` role's actual credentials
(via a **raw `pg` client using `RUNTIME_DATABASE_URL`** — test-only; SC-103 deliberately
adds no `runtimePool` because the repo's sanctioned-pool constraint forbids a new
production pool), not a new CI service or a mocked connection.

## Dependencies

- **Blocked by:** SC-103 (roles must exist), SC-104 (migration must be applied so the
  schemas/roles are live in the test DB).
- **Blocks:** nothing — this is a leaf verification ticket, but it's on the "do not cut"
  list per `sprint-01.md` §5 since it's the actual proof of the R9 enforcement mechanism.

## Acceptance criteria

- A test connects using a raw `pg` client with the test-only `RUNTIME_DATABASE_URL`
  (SC-103 provisions this; **no new pool export** — the repo forbids adding
  `runtimePool`) and asserts a `SELECT` against any `planning`-schema table fails with a
  permission error (not a table-not-found error — the schema must exist and be
  visible/rejected, not absent).
- The same test (or a sibling) asserts a `runtime`-role write attempt against `planning`
  also fails.
- The test lives in the existing integration test suite (`server/tests/integration/`)
  and runs inside CI's `with-migrations` job — not a manual/one-off check, not a new CI
  service.
- Test failure output clearly names which permission was expected to fail and didn't, if
  it regresses — this is a security-relevant test, so a vague assertion isn't acceptable.

## Prompt to execute

```
Add an automated integration test proving the `runtime` DB role (created in SC-103)
cannot read or write the `planning` schema.

Read server/tests/integration/ for the existing test structure and conventions
(likely uses the same postgres-oltp service already configured in
.github/workflows/ci.yml's with-migrations job — do not add a new CI service).

Steps:
1. Add a test file under server/tests/integration/ (naming convention matching
   neighboring files, e.g. migration.test.ts's style) that:
   - Connects using the runtime role's credentials via a raw pg client with
     RUNTIME_DATABASE_URL (provided by SC-103 as a test-only env var). Do NOT add a
     runtimePool or any pool export — this repo's AGENTS.md constraint is
     oltpPool/withOLTPTransaction for player data plus the read-only contentPool, and
     nothing else.
   - Attempts a SELECT against a planning-schema table and asserts it fails with a
     permission-denied error (not a missing-table error — assert the schema and table
     exist, just aren't readable by this role).
   - Attempts an INSERT/UPDATE against a planning-schema table and asserts that also
     fails.
2. Confirm this test runs as part of `npm run test:integration --workspace=server`
   inside the existing with-migrations CI job — no new job, no new service.
3. Confirm the test fails loudly (not silently skipped) if run against a DB where the
   roles/grants from SC-103 haven't been applied yet, so a missing migration is caught
   here rather than producing a false pass.

Do not build the planning or runtime schema/role migration here — that's SC-103/SC-104,
prerequisites for this ticket. This ticket only adds the proof test.
```
