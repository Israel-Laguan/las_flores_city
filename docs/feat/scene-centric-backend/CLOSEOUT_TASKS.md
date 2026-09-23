# SC-M1 Closeout + SC-M2 Kickoff — Task Instructions

**Purpose:** This file documents every verified gap between the `docs/feat/scene-centric-backend/` plan and the actual code on branch `feat/sc-106-negative`, with concrete steps and prompts to close them. The docs previously said "Status: planning complete, nothing built"; the code has delivered SC-M1 (Sprint 1) but left the api/ modules as stubs, the spike harnesses uncommitted, and all of Sprint 2+ untouched.

**Current branch:** `feat/sc-106-negative` (4 new commits over `main`: SC-106 test, D1 fix, D2 fix, CI README tweak).

**Status:** A3 (doc updates) COMPLETED. Remaining: A1, A2, A4, B1-B6.

### Progress Summary
| Part | Task | Status |
|------|------|--------|
| A | A1. Commit spike harnesses | ⏳ Not started |
| A | A2. Implement api/contracts primitives | ⏳ Not started |
| A | A3. Update stale docs | ✅ DONE (this session) |
| A | A4. Preserve SC-102 boundary proof | ⏳ Not started |
| B | B1-B6. Sprint 2 (flags & conditions) | ⏳ Not started |
| C | Doc updates after B1-B6 | ⏳ Blocked on B |

---

## Part A — Finish SC-M1 (close remaining gaps)

### A1. Commit spike harnesses (SC-S7 follow-up)

**Status:** Not done. Spike write-ups (S1–S6) exist in `spikes/`, but the scripts that reproduce their numbers are on separate `spike/sc-s*` branches, not merged. `spikes/README.md` records this as a known gap.

**Files to create:**

1. `server/scripts/spike_sc_s1_project_entity_edges.mjs` — port from `spike/sc-s1-entity-edges-projection` branch. Projects `entity_edges(from_type, from_slug, edge_kind, to_type, to_slug, attrs jsonb)` from `content/` (194 characters, 59 dialogues, 18 scenes, 1 mission, 13 districts). Drops/recreates scratch schema `spike_sc_s1` each run. Reports row count, edge_kind distribution, index size (3 indexes: 328 kB total at current volume).

2. `server/scripts/spike_sc_s2_run.mjs` + `server/scripts/spike_sc_s2_duplicate.mjs` + the recursive CTE SQL (inline or committed `.sql`) — port from `spike/sc-s2-reachability-cost` branch. Builds on S1's table. Runs reachability query 6x (1 warmup + 5 timed via `process.hrtime.bigint()`). Duplicates rows with `::genN` suffix for 10x test.

3. `server/scripts/spike_sc_s3_overlay.mjs` — port from `spike/sc-s3-overlay-view` branch. Hand-authors ADD + MODIFY deltas against the vq_endings fixture, builds overlay via COALESCE+array-aware merge, runs SC-S2 traversal against canon vs. overlay.

4. `server/scripts/spike_sc_s4_alias_detection.mjs` + `server/scripts/spike_sc_s4_analysis.sql` — port from `spike/sc-s4-pg-trgm-alias-detection` branch. 12 hand-labelled pairs from content, threshold sweep, ILIKE baseline.

5. `server/scripts/spike_sc_s6_serving_baseline.ts` — port from the commit message reference. Measures p50/p95 for `GET /dialogue/active` and `resolveChunkSpeakers` in isolation, 3 warmup + 30 timed iterations, per-iteration paired differencing.

**Prompt:**

```
Port the spike harness scripts from their respective spike/* branches into server/scripts/ on the current branch (feat/sc-106-negative). Each spike writeup in spikes/SC-S*.md references a local script path that is NOT in the repo — the reproducibility rule in spikes/README.md requires either committing the harness under server/scripts/ or inlining fully self-contained commands.

For each spike:
1. Read the spike writeup in spikes/SC-S{1,2,3,4,6}-{slug}.md to find the script path it references.
2. Check out the corresponding spike/* branch (git show origin/spike/sc-s1-entity-edges-projection:scripts/spikes/sc-s1-project-entity-edges.mjs) to get the original script content.
3. Create the script at the path the writeup references, or at server/scripts/spike_sc_s{N}_{slug}.{ts,mjs,sql} if the writeup path doesn't match repo conventions (scripts/ is for file-to-file tools; DB-touching spike scripts should go there per the spikes/README.md rule).
4. Update the writeup's "What was run" section to reference the committed path so anyone can re-run it.
5. Ensure each script drops/recreates its scratch schema/table on every run (idempotent).
6. Do NOT touch scripts/asset-pipeline/ or any production code.
```

### A2. Implement api/contracts primitives (SC-102 residual DoD)

**Status:** Not done. The api/ tree has workspace scaffolding but only stub `index.ts` files. No condition grammar, flag definitions, artifact schemas, or revision interface exist.

**Files to create:**

1. `api/contracts/src/flags/flag-definition.ts` — flag definition type: `slug: string`, `meaning: string`, `semantics: 'latching' | 'tracking'` (required, no default).
2. `api/contracts/src/condition/expression.ts` — condition grammar type: flag test, negation, and, or, literal true/false. No continuous-value comparison. Statically extractable flag slug list.
3. `api/contracts/src/condition/evaluate.ts` — pure condition evaluator: `evaluate(expr: ConditionExpr, flags: Set<string>): boolean`. No I/O, no DB.
4. `api/contracts/src/condition/index.ts` — re-exports.
5. `api/contracts/src/artifact/artifact.ts` — artifact + manifest schemas (content-addressed scene/dialogue artifacts).
6. `api/contracts/src/revision/revision-pointer.ts` — revision pointer format, read interface, atomic flip semantics.
7. `api/contracts/src/index.ts` — update to re-export all submodules.

**Prompt:**

```
Implement the api/contracts primitives that SC-102's acceptance criteria references but doesn't require until SC-201/203 land. The boundary lint and module tree (SC-101/102) are done, but contracts/ only has .gitkeep stubs and a placeholder index.ts.

Create the following in api/contracts/src/:

1. flags/flag-definition.ts: A FlagDefinition type with slug (stable identifier), meaning (human-readable), and semantics ('latching' | 'tracking'). semantics is required — no default. Include a zod or TypeScript schema validating slug shape.

2. condition/expression.ts: A ConditionExpr discriminated union supporting: flag test (slug + expected boolean), negation, and (list), or (list), and literal TRUE/FALSE. NO continuous-value comparison is representable. Include a function `extractFlagSlugs(expr): string[]` that returns all referenced flag slugs. Must serialize to/from JSON stably for content hashing.

3. condition/evaluate.ts: A pure function `evaluate(expr: ConditionExpr, flags: Set<string>): boolean`. No DB, no I/O. Total — every expression the type permits evaluates without throwing. Unit-test each operator plus nesting to 3 levels.

4. condition/index.ts: re-export FlagDefinition, ConditionExpr, evaluate, extractFlagSlugs.

5. artifact/artifact.ts: Artifact and Manifest types for content-addressed scene/dialogue bundles. Include a content_hash field and a manifest version. Minimal — just the shape, no compile logic yet.

6. revision/revision-pointer.ts: RevisionPointer type with revisionId (string/uuid), active flag, createdAt. Include the read interface signature and note atomic-flip semantics (planning writes, runtime reads — runtime cannot write).

7. Update api/contracts/src/index.ts to re-export everything.

Each subfolder that currently has only .gitkeep should get a real index.ts or the implementing file directly. The boundary lint rule must still pass — contracts/ imports nothing from planning/ or runtime/.

Verify with: npm run typecheck --workspace=api/contracts && npm run lint --workspace=api/contracts
```

### A3. Update stale backlog/sprint-01 status

**Status:** DONE. Completed in this session:
- `README.md`: Updated status from "planning complete, nothing built" to "SC-M1 complete; SC-M2+ not started"
- `backlog.md` SC-E1 table: SC-103, SC-104, SC-106 changed from "Ready" to "**Done**"
- `sprint-01/README.md` index table: Added ✅ Done to SC-101, SC-102, SC-103, SC-106
- `sprint-01.md` §4: Updated DoD section to note all items landed, added "Status: COMPLETED"

**Files to edit:**

1. `docs/feat/scene-centric-backend/backlog.md` — SC-E1 table: change SC-103, SC-104, SC-106 from "Ready" to "**Done**".
2. `docs/feat/scene-centric-backend/backlog.md` — SC-E1 "Spikes" section: add "✅ Done" to SC-S7 row (if added) or note spike harnesses committed.
3. `docs/feat/scene-centric-backend/sprint-01.md` — update the sprint narrative to note SC-103/104/106 completed.
4. `docs/feat/scene-centric-backend/sprint-01/README.md` — add ✅ Done markers for SC-103 and SC-106 in the index table.
5. `docs/feat/scene-centric-backend/README.md` — update the top-line "Status: planning complete, nothing built" line to reflect SC-M1 is implemented.

**Prompt:**

```
Update the scene-centric-backend docs to match the code that is actually implemented on branch feat/sc-106-negative. The backlog and sprint-01 docs still say SC-103/104/106 are "Ready" but the migration (095_planning_runtime_schemas.sql), its registration in migration-targets.json, and the runtime-planning-permissions.test.ts test all exist in the code.

Changes needed:
1. backlog.md SC-E1 table: SC-103, SC-104, SC-106 → state "**Done**" (not "Ready").
2. backlog.md spikes section: confirm SC-S1–S6 are "done" (they are) — no change needed there, but verify the SC-S7 follow-up row is accurate or add a note that harnesses are being committed.
3. sprint-01/README.md index table: add ✅ Done to SC-103 and SC-106 rows (SC-104 and SC-105 already marked).
4. sprint-01.md: update the DoD section (§4) to note SC-103/104/106 were completed, not just SC-101/102/105.
5. README.md: change "Status: planning complete, nothing built." to "Status: SC-M1 complete; SC-M2+ not started." since the module tree, schemas, lint, CI, negative-permission test, D1/D2 fixes, and 6 spike write-ups are all in the code.

Verify changes read correctly and do not alter the technical content of any other section.
```

### A4. Preserve SC-102 boundary proof artifact

**Status:** Not done. The SC-102 README claims 8 violation forms were demonstrated but they were "never committed to source." No auditable artifact (saved CI log, test output) exists in the repo.

**Files to create:**

1. `server/tests/integration/api-boundary-proof.test.ts` — An integration test that programmatically proves the boundary rule by importing `@las-flores/api-contract` and `@las-flores/api-runtime` from within a `planning` test context and asserting the import fails / is structurally impossible. Alternatively, create a `server/tests/unit/api-boundary-enforcement.test.ts` that uses `eslint` API to run the boundary config against fixture files containing violations and asserts the rule fires with the correct rule name.

**Prompt:**

```
Create a permanent, re-runnable test that proves the SC-102 architectural boundary rule (planning <-> runtime forbidden both ways, contracts is a leaf) fires correctly. The SC-102 README claims "All 8 required violation forms were demonstrated" but the violations were never committed — there is no auditable artifact in the repo.

Create server/tests/integration/api-boundary-enforcement.test.ts (or unit if no DB needed) that:

1. Uses the eslint API (or execa to run eslint) to lint a set of INLINE fixture code strings against api/planning/eslint.config.cjs and api/runtime/eslint.config.cjs.
2. For each fixture, asserts that the specific boundary rule fires (the rule name must appear in output, not just "lint failed").
3. Test all 8 violation forms:
   - api/planning → api/runtime (relative import)
   - api/runtime → api/planning (relative import)
   - api/contracts → api/planning (relative import)
   - api/contracts → api/runtime (relative import)
   - api/planning → @las-flores/api-runtime (package import)
   - api/runtime → @las-flores/api-planning (package import)
   - api/contracts → @las-flores/api-planning (package import)
   - api/contracts → @las-flores/api-runtime (package import)
4. Also assert the 8 ALLOWLISTED forms (planning/runtime → contracts) pass clean.
5. Use jest's beforeEach to write fixture files to a temp dir, run eslint, capture stdout/stderr/exit code, then clean up.

Verify: this test runs as part of `npm run test:unit --workspace=server` (no DB needed).
```

---

## Part B — Execute Sprint 2 (unblock SC-M2 critical path)

### B1. SC-201 · Flag definition shape (`contracts/flags`)

**Status:** Not done. No code exists for flags anywhere.

**Acceptance criteria (from sprint-02.md):**
- Type + schema define: `slug`, `meaning`, `semantics: 'latching' | 'tracking'`
- `semantics` is required, no default
- Schema rejects non-identifier slugs
- Lives in `contracts/`, importable by both modules, imports nothing from either

**Note:** This depends on A2 above (implementing `api/contracts/src/flags/flag-definition.ts`). If A2 was done, SC-201 is a one-line task to verify/adjust. If A2 was not done, SC-201 is the priority.

### B2. SC-202 · Flag registry storage + repository (`planning/canon`)

**Status:** Not done. No `planning/flag_definitions` table or repository exists.

**Acceptance criteria:**
- Migration creates registry table in `planning` schema (new migration file 096+)
- Repository supports create, read, list, retire (never delete)
- Unique constraint on slug (DB-level, not app-level)
- `runtime` role cannot read this table (asserted by SC-106's negative test, extended)

### B3. SC-203 · Condition grammar type (`contracts/condition`)

**Status:** Not done. No condition grammar exists.

**Note:** Depends on A2. If A2 was done, verify the grammar matches the SC-203 spec exactly:
- Flag test, negation, `and`, `or`, literal always-true/always-false
- No continuous-value comparison (absent from type, not discouraged)
- Stable JSON serialization (for content hashing)
- Statically extractable flag slug list

### B4. SC-204 · Condition evaluator (`contracts/condition`)

**Status:** Not done.

**Acceptance criteria:**
- One implementation consumed by both `planning/` and `runtime/`
- Pure function, no DB/I/O: `evaluate(expr, flagSet) → boolean`
- Total: every expression evaluates without throwing
- Property test: for any expression + flag set, terminates with boolean
- Unit tests cover each operator + nesting to 3 levels

### B5. SC-205 · Flag set/read tracking (`planning`)

**Status:** Not done. Depends on SC-202 and SC-203.

**Acceptance criteria:**
- Given an entity payload with conditions/effects, extract flags set vs. flags read
- Uses SC-203's static flag-slug list (not a second parser)
- Shape consumable by later `entity_edges` projection — **depends on SC-S1's answer** (mixed: 96% clean, but `mission_scene` unsupported and `requires_flag` needs choice_id retention)

### B6. SC-206 · Threshold crossing sets a flag as event (fixture-backed)

**Status:** Not done. Depends on SC-202.

**Acceptance criteria:**
- Crossing recorded as event that sets the flag (not derived at read time)
- `latching` persists after threshold falls back; `tracking` clears
- Fixture-backed mechanism only — no real relationship-stat pipeline
- Real-stat integration tracked as SC-811, blocked on SC-M6

**Prompt for Sprint 2 (B1–B6):**

```
Execute Sprint 2 of the scene-centric backend: implement flags and conditions as shared primitives. The api/ tree and schemas exist (SC-M1 done), but NO flag/condition code exists anywhere — grep for flag_registry, ConditionExpr, condition_eval across api/, server/src/, shared/src/ returns zero results.

Implement these in order (dependencies are strict):

1. SC-201 (flag definition): If A2 above was done, verify api/contracts/src/flags/flag-definition.ts matches spec — slug, meaning, semantics:'latching'|'tracking' required-no-default, slug validation. If A2 was NOT done, create this file first.

2. SC-202 (flag registry): Create a new migration 096_flag_registry.sql in server/src/database/migrations/ registered in migration-targets.json under "oltp" (NOT nontransactional — this is regular DDL, not CREATE ROLE). Table: planning.flag_definitions(slug text PRIMARY KEY, meaning text, semantics text NOT NULL CHECK (semantics IN ('latching','tracking')), created_at timestamptz DEFAULT now()). GRANT ALL to planning role, REVOKE from runtime and public. The runtime role must NOT be able to SELECT from planning.flag_definitions (SC-106 test covers this if extended). Repository: create api/planning/src/canon/flag-registry.ts with create/read/list/retire functions.

3. SC-203 (condition grammar): In api/contracts/src/condition/expression.ts, define ConditionExpr as a discriminated union: {type:'flag', flag, expected} | {type:'not', expr} | {type:'and', exprs} | {type:'or', exprs} | {type:'true'} | {type:'false'}. NO comparators (>=, <=, etc.) — absent from the type. Implement toJSON/fromJSON with stable serialization. Implement extractFlagSlugs(expr): string[].

4. SC-204 (condition evaluator): In api/contracts/src/condition/evaluate.ts, implement evaluate(expr: ConditionExpr, flags: Set<string>): boolean. Pure, no I/O. Every expression type the union permits must evaluate without throwing. Add unit tests in api/contracts/src/condition/evaluate.test.ts covering each operator + nesting to 3 levels. Add a property test using fast-check if available (check package.json deps first).

5. SC-205 (flag tracking): In api/planning/src/edges/flag-tracking.ts, implement extractFlagUsage(payload: jsonb): {sets: string[], reads: string[]} that walks effects.flag_set and condition expressions. Per SC-S1's finding, requires_flag edges MUST retain choice_id in attrs (not just from_slug). Store in a shape the later entity_edges projection can consume.

6. SC-206 (threshold event): Create a fixture-backed threshold→flag mechanism. NOT a real stat pipeline. Implement api/planning/src/canon/threshold-events.ts with applyThresholdCrossing(statName, oldValue, newValue, threshold, flagDef): {flag_set: Record<string,boolean>} that returns flag changes. latching: flag stays set after crossing; tracking: flag clears when stat falls below. Write unit tests proving both behaviors with a fake stat source (a plain number passed in, not a DB read).

Wire all six into api/planning/src/index.ts and api/runtime/src/index.ts (trivial consumers — read a flag definition, evaluate a condition) to satisfy Sprint-02's DoD "consumer in both modules exists."

Verify: npm run typecheck --workspace=api/contracts && npm run lint --workspace=api/contracts && npm run typecheck --workspace=api/planning && npm run typecheck --workspace=api/runtime
Verify: npm run schema:migrate --workspace=server (migration 096 applies cleanly, idempotent)
Verify: npm run test:unit --workspace=server (no regressions)
```

---

## Part C — Sprint-2 retro contract update (after B1–B6 land)

Once Sprint 2 is complete:

1. `docs/feat/scene-centric-backend/backlog.md` — update SC-E2 table: SC-201–206 from "Ready"/"Blocked" to "Done". Update SC-E3 table to mark SC-301/302/303 as "In Progress" (now unblocked by SC-204).
2. `docs/feat/scene-centric-backend/sprint-02.md` — mark Status PROVISIONAL → FIRM, fold in any spike answers.
3. `docs/feat/scene-centric-backend/sprint-03.md` — create for SC-M2 (scene model + compile), promoted from roadmap.md.
4. Confirm the SC-M1 exit criteria are all met:
   - ✅ Flag can be declared (pending B1–B2), condition evaluates in both modules (pending B3–B4)
   - ✅ Boundary lint fails CI (SC-102 done + A4 proof test)
   - ✅ D1/D2 regression tests (done)
   - ✅ All sprint-1 spikes have written answers (done, pending A1 for reproducibility)

---

## Key reference files

| File | Why it matters |
|---|---|
| `AGENTS.md` | Pool constraint (no planningPool/runtimePool), nontransactional migrations, health check gotcha |
| `server/src/database/migrations/095_planning_runtime_schemas.sql` | SC-103 schema/role DDL pattern |
| `server/src/database/migrations/migration-targets.json` | Registration format for new migrations |
| `api/eslint.boundary.cjs` | Boundary enforcement helper |
| `server/src/services/DialogueResolver.ts:638` | D1 revision-scoped lookup pattern (follow this shape) |
| `server/src/routes/dialogue-choice-validation.ts` | D2 validate-before-apply pattern |
| `server/src/content/compiler.ts:259` | Revision bump pattern on recompile |
| `spikes/SC-S1-entity-edges-projection.md` | Choice-level correction (requires_flag needs choice_id) |
| `spikes/SC-S3-overlay-view.md` | Array-aware merge requirement for MODIFY deltas |
| `spikes/SC-S5-weather-source.md` | A6 resolved: district default + scene override, revision-scoped |
| `server/tests/integration/runtime-planning-permissions.test.ts` | SC-106 pattern for permission tests |
| `server/tests/integration/d2-choice-reachability.test.ts` | D2 regression test pattern (synthetic UUIDs, cleanup) |
| `.github/workflows/ci.yml` | no-migrations covers `--workspaces`; with-migrations has RUNTIME/PLANNING URLs |
