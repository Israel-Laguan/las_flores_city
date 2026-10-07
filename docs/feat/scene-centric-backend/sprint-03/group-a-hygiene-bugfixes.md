# Group A — Hygiene & bugfixes (5 tasks)

Close the gaps found when the docs were compared with the code on `main`. These are
**P0**: they remove false "Done" claims and put real tests under code that is currently only
type-checked. None of them adds scene functionality, but Groups D–G build on them.

Mechanical sub-tasks are numbered `m-NN` globally across all group files.

---

## BF-301 · Status truth + spike-path reconciliation · S · P0

**Problem.** `README.md` / `backlog.md` say SC-301–303 are "In Progress" (no scene code
exists), SC-202 "Done" (DB adapter throws), and SC-105 "unit tests across three modules"
(planning/runtime test scripts are `process.exit(0)`). Spike write-ups and `CLOSEOUT_TASKS.md`
reference harness paths that differ from the files on disk (`server/scripts/spikes/sc-s*.mjs`
vs `server/scripts/spike_sc_s*`).

**Scope in:** wording/state changes in `docs/feat/scene-centric-backend/` only.
**Scope out:** any code. The honest state is restored first; later tasks flip the rows back to Done when their evidence lands.

**Acceptance**
- SC-202 reads "Contract + migration + in-memory impl; DB adapter → BF-303".
- SC-301/302/303 read "Ready" (not "In Progress") until their first commit lands.
- Every spike write-up's "What was run" path exists on disk (checked by a one-line `ls` per path).
- `CLOSEOUT_TASKS.md` carries a header pointing to this sprint as the live task list.

**Mechanical**
- m-01 Edit `backlog.md` SC-202 → contract-only wording; SC-301/302/303 → Ready.
- m-02 Edit `README.md` status paragraph to match.
- m-03 Fix harness paths in `spikes/SC-S2-*.md`, `SC-S3-*.md`, `SC-S4-*.md` to the real `server/scripts/spikes/` names.

---

## BF-302 · Real test runner for `api/planning` + `api/runtime`, wired into CI · M · P0

**Problem.** `api/planning/package.json` and `api/runtime/package.json` have
`"test": "node --eval \"process.exit(0)\""`; CI chain 1 only runs `test:unit --workspace=server`.
About 900 lines of SC-205/206/runtime code have never run under a test.

**Scope in:** jest config (mirror `api/contracts/jest.config.cjs`), `test` scripts, CI step.
**Scope out:** writing the tests themselves (BF-304).

**Acceptance**
- `npm test --workspace=api/planning` and `--workspace=api/runtime` run jest and **fail** when there are no tests *or* a test fails (`passWithNoTests` is off once BF-304 lands).
- CI chain 1 builds `api/contracts`, then runs `npm test --workspaces --if-present` for the three api workspaces, before the server unit step.
- `restoreMocks`/`clearMocks` match the server jest conventions in `AGENTS.md` §Test isolation rule 6.
- The boundary lint still passes with test files present (tests may import only their own module + contracts).

**Mechanical**
- m-04 Add `jest.config.cjs` + ts-jest devDependency to `api/planning` and `api/runtime`.
- m-05 Replace the two no-op `test` scripts.
- m-06 Add the CI step in `.github/workflows/ci.yml` chain 1 (after "Build api-contracts").

---

## BF-303 · Flag registry persistence: migration 097 + DB adapter · M · P0

**Problem.** `DatabaseFlagRegistry` throws on every method; `planning.flag_definitions` has
no `retired_at`, so "retire, never delete" has nowhere to live (SC-202 acceptance, last bullet).

**Scope in**
- Migration `097_flag_registry_retire.sql` (oltp array in `migration-targets.json`): `ALTER TABLE planning.flag_definitions ADD COLUMN IF NOT EXISTS retired_at timestamptz`, plus a partial index on active rows. Idempotent.
- `server/src/planning/PgFlagRegistry.ts` implementing the `FlagRegistry` interface from `api/planning` using **`oltpPool` only** (AGENTS hard constraint: no new pools; schema-qualified `planning.flag_definitions`).
- Replace the stale doc-comment on `retire` ("uses a retired_at column if it exists, or simply returns success=true") — it is now real.

**Scope out:** per-role connection URLs — the planning/runtime roles are exercised by SC-106-style tests, not by app pools.

**Acceptance**
- create/get/list/listBySemantics/retire behave identically to the in-memory implementation (one shared contract-test suite run against both).
- Retire sets `retired_at`, never deletes; retiring twice returns the same `already retired` result as in-memory.
- `createFlagRegistry()` no longer returns a registry whose methods throw.
- Fixtures follow AGENTS rules: dedicated slug prefix, cleanup in `afterAll`, collision-avoidance comment.

**Mechanical**
- m-07 Write migration 097 and register it in `migration-targets.json` (oltp).
- m-08 Extract the in-memory registry assertions into a shared `flagRegistryContract(factory)` test helper.
- m-09 Re-run `npm run schema:migrate --workspace=server` twice; confirm idempotent skip.

---

## BF-304 · Test backfill for SC-205 / SC-206 / runtime flags + SC-204 property test · M · P0

**Scope in**
- `api/planning`: tests for `flag-tracking.ts` (sets vs reads extraction, nested conditions, `requires_flag` retaining `choice_id` per SC-S1) and `threshold-events.ts` (latching persists after the stat falls back; tracking clears).
- `api/runtime`: tests for `flags.ts` (read a definition, evaluate a condition).
- `api/contracts`: confirm `evaluate.test.ts` covers each operator and nesting to three levels; add a **fast-check** property test (totality: any generated expression + flag set returns a boolean and never throws; `fromJSON(toJSON(x))` round-trips). Check `package.json` for the dep first; add it as a devDependency of `api/contracts` if absent.

**Acceptance**
- Each spec acceptance bullet of SC-204/205/206 maps to at least one named test.
- Property test runs ≥ 200 cases and is seeded deterministically in CI.

**Mechanical**
- m-10 Add `flag-tracking.test.ts` cases (set, read, nested, choice_id retained).
- m-11 Add `threshold-events.test.ts` (latching vs tracking, both directions of crossing).
- m-12 Add `api/runtime/src/flags.test.ts` and the fast-check property file.

---

## BF-305 · SC-S6 serving-baseline harness: make it real · M · P1

**Problem.** `server/scripts/spikes/serving-baseline.ts` exits non-zero by design.
SC-508 and invariant R13 need a re-runnable p50/p95.

**Scope in:** implement what the file header already lists — seed one synthetic tree/chunk through `ContentPublishService` (post-M32 the node maps live behind `content_url`), 3 warmup + 30 timed iterations for (1) `GET /dialogue/active` over HTTP, (2) `resolveChunkSpeakers()` in-process, (3) the bulk characters `SELECT` alone; paired differencing for presign vs. rest; cleanup in `finally`.
**Scope out:** optimizing anything the baseline reveals — that is a retro item.

**Acceptance**
- Exits 0 and prints p50/p95 for all three measurements; the numbers are written into `spikes/SC-S6-serving-baseline.md` with the commit sha and date.
- Synthetic rows use a dedicated UUID and are removed even when the run throws.
- If the new numbers differ from the recorded historical ones by >2×, the write-up says so instead of silently replacing them.

**Mechanical**
- m-13 Replace the `main()` throw with seeding + cleanup scaffolding.
- m-14 Implement timing loop + paired differencing helper.
- m-15 Update the write-up "What was run" and drop the "stub" warnings from the header and from `sprint-02.md` / `sprint-03.md`.
