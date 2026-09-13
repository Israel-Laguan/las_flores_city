# Product Backlog

**Status:** Living. Re-ordered at every retro (`roadmap.md` §5).

**Conventions**
- Epics `SC-E#`; stories `SC-<epic><nn>` (e.g. `SC-201` belongs to `SC-E2`); spikes `SC-S#`;
  defects `D#`.
- **Ready** means: acceptance criteria written, dependencies landed, no blocking open
  decision. Only Ready stories may be pulled into a sprint.
- **Blocked** names what it waits on — a decision (`A#`), a spike (`SC-S#`), or a story.
- **A story untouched across three retros is deleted, not carried.** Carrying is how a
  backlog becomes a graveyard nobody trusts.
- No estimates until sprint 1 produces calibration data. Relative size only: `S` / `M` / `L`.

---

## SC-E1 — Foundation & boundaries · F10 · SC-M1

| ID | Story | Size | State |
|---|---|---|---|
| SC-101 | Create `api/{contracts,planning,runtime}` tree with per-module tsconfig projects | S | **Ready** |
| SC-102 | Lint rule forbidding planning↔runtime imports, proven by a fixture violation in CI | S | **Ready** |
| SC-103 | Create `planning` / `runtime` schemas and two DB roles with grants per `architecture.md` §3 | M | **Ready** |
| SC-104 | Extend the existing migration runner to the new schemas, reusing migration-log idempotency | M | **Ready** |
| SC-105 | CI job: typecheck, lint incl. boundary rule, unit tests across three modules | S | **Ready** |
| SC-106 | Verify the runtime role cannot read or write `planning` — negative test | S | **Ready** |

## SC-E2 — Flags & conditions · F1, F2 · SC-M1

| ID | Story | Size | State |
|---|---|---|---|
| SC-201 | Flag definition shape in `contracts/flags` — slug, meaning, latching vs. tracking | S | **Ready** |
| SC-202 | Flag registry storage + repository in `planning/canon` | M | **Ready** |
| SC-203 | Condition grammar type in `contracts/condition` — discrete flag tests only, no continuous values | M | **Ready** |
| SC-204 | Condition evaluator, single implementation, consumed by both modules | M | Blocked: SC-203 |
| SC-205 | Track which flags are set and read, per entity, as the input to tier-3 | M | Blocked: SC-202 |
| SC-206 | Threshold-crossing sets a flag as a persisted event (fixture-backed mechanism) — real-stat wiring is follow-up blocked on S3 / SC-811 | M | **Ready** (fixture scope); real-stat integration **Blocked: S3** |

## SC-E3 — Scene model & composition · F3, F7 · SC-M2

| ID | Story | Size | State |
|---|---|---|---|
| SC-301 | Scene entity: location, time, weather, participants, items, dialogue refs | M | Blocked: SC-204 |
| SC-302 | Role slots as a scene attribute — slot id, cast, position | M | Blocked: SC-301 |
| SC-303 | Base + overlay composition with priority ordering | M | Blocked: SC-301 |
| SC-304 | Exclusive vs. additive property resolution; equal-priority conflict fails compile | M | Blocked: A3 |
| SC-305 | Weather: compile resolves `scene.weather` over `district.weather` and persists the resolved value on the artifact; runtime only reads that artifact field before `buildBackgroundHints` (A6 — `spikes/SC-S5-weather-source.md`) | S | Blocked: SC-301, SC-309, F4 |
| SC-306 | Personality dialogue pools, shared many-to-many across characters | M | Blocked: SC-301 |
| SC-307 | Scene dialogue attached to role slots rather than characters | M | Blocked: SC-302 |
| SC-308 | Specificity ladder resolution — scene > relationship > personality | M | Blocked: SC-306, SC-307 |
| SC-309 | `districts.weather` column + seed defaults + admin/content tooling to set it (SC-S5 follow-up gap) | S | Ready |

## SC-E4 — Compile & publish · F4 · SC-M2

| ID | Story | Size | State |
|---|---|---|---|
| SC-401 | Artifact + manifest schemas in `contracts/artifact` | S | Blocked: SC-301 |
| SC-402 | Compile step: emit content-addressed scene artifacts | L | Blocked: SC-401 |
| SC-403 | Content-hash idempotency — unchanged entity is a skip, not a rewrite | M | Blocked: SC-402 |
| SC-404 | Revision pointer: format, read interface, atomic flip, rollback by re-flip | M | Blocked: SC-402 |
| SC-405 | Compile-time failure on missing required content (R10), with a machine-readable report | M | Blocked: SC-402 |
| SC-406 | Batch upsert per plan in one transaction — no N+1 writes | M | Blocked: SC-402 |

## SC-E5 — Runtime resolution & player state · F5, F6 · SC-M3

| ID | Story | Size | State |
|---|---|---|---|
| SC-501 | Player state schema and repositories — flags, resolution, pinned cast, progress | M | Blocked: SC-103 |
| SC-502 | Resolver: revision-scoped artifact lookup | M | Blocked: SC-404 |
| SC-503 | Scene resolution against player state via the condition evaluator | M | Blocked: SC-502 |
| SC-504 | Session pins to a revision; a later pointer flip does not affect it | M | Blocked: SC-502 |
| SC-505 | Choice-reachability validation before any effect applies | M | Blocked: SC-503 |
| SC-506 | Effect application: flag setting, transactional | M | Blocked: SC-505 |
| SC-507 | Scene pinning per the A2 decision | M | Blocked: A2 |
| SC-508 | Serving benchmark: p50/p95 for scene resolution and artifact fetch | S | Blocked: SC-503 |
| SC-509 | Emit runtime events into the **existing** `AdminEventEmitter` telemetry contract | M | Blocked: SC-506 |

## SC-E6 — Scene-shaped intake & validation · F8, F9 · SC-M4

| ID | Story | Size | State |
|---|---|---|---|
| SC-601 | Scene-shaped plan delta: one description yields scene + participants + dialogue + flags | L | Blocked: SC-301 |
| SC-602 | Add new entity types to `plan_deltas.entity_type` | S | Blocked: SC-601 |
| SC-603 | Tier-1 shape checks, per-tier required fields, in the review step | M | Blocked: SC-601 |
| SC-604 | Tier-2 reference checks against canon and within-plan | M | Blocked: SC-603 |
| SC-605 | Move validation from stage time to plan time so errors reach the writer while editable | M | Blocked: SC-604 |
| SC-606 | Approval granularity per the A4 decision | M | Blocked: A4 |
| SC-607 | Regeneration vs. hand-edit merge rule per A5 | M | Blocked: A5 |
| SC-608 | Canon ownership during coexistence: one-way old→new import, never a write-back | L | Blocked: A1 |

## SC-E7 — Validation depth · S1, S2, S10 · SC-M5

| ID | Story | Size | State |
|---|---|---|---|
| SC-700 | Add a structured scene/character/location reference to the mission payload schema — per `spikes/SC-S1-entity-edges-projection.md`, the mission YAML currently has no field `mission_scene` can be projected from | S | Blocked: SC-S1 |
| SC-701 | `entity_edges` table and projection from entity payloads, incl. `mission_scene` from `SC-700`'s new field. **Acceptance criteria must include choice-level awareness:** `requires_flag` edges MUST retain `choice_id` in attrs or split into `node_entry` (ungated) vs `choice_requires_flag` (gated), so that ungated and gated choices on the same node are not conflated — see `spikes/SC-S2-reachability-cost.md` for the discovered correctness issue. | L | Blocked: SC-S1, SC-S2, SC-700 |
| SC-702 | Overlay edge projection from `plan_deltas` (`plan_edges`); requires array-aware merge logic for MODIFY deltas (naive `jsonb \|\|` fails, per SC-S3) | M | Blocked: SC-701 |
| SC-703 | Four tier-3 anti-joins: orphan flag, dead end, unreachable scene, unreferenced item | M | Blocked: SC-701 |
| SC-704 | Recursive-CTE reachability from game start, with recorded `EXPLAIN ANALYZE` (baseline established by SC-S2: 0.82ms→6.85ms at 1x→10x volume) | M | Blocked: SC-701 |
| SC-705 | Tier-3 runs in CI and fails the build on a dead-end flag | S | Blocked: SC-703 |
| SC-706 | `pg_trgm` alias/duplicate detection surfaced as a tier-2 hint | M | Blocked: SC-S4 |
| SC-707 | Hint engine over tier-3 results — "usually also has X" | L | Blocked: SC-703 |
| SC-708 | Materialized views for tier-3 results if the checks get slow | M | Blocked: SC-704 |

## SC-E8 — Content model depth · S3–S6 · SC-M6

| ID | Story | Size | State |
|---|---|---|---|
| SC-801 | `activity_def` catalog with 4 verbs, all `completion.type='none'` | M | Blocked: SC-302 |
| SC-802 | `activity_slug` on role slots; exclusive per character per resolution | M | Blocked: SC-801 |
| SC-803 | Client manifest maps `activity_slug` → clip; unknown tag warns and renders idle | S | Blocked: SC-801 |
| SC-804 | `look` + `AssetVariant` model; identity is `(owner, look, variant)`, hash is version | L | Blocked: SC-402 |
| SC-805 | `mob_pool` owning an asset set; `character_uses_pool` edge; no per-character asset rows | M | Blocked: SC-804 |
| SC-806 | Remove `portrait_urls` from canonical entities — derived read model only | M | Blocked: SC-804 |
| SC-807 | Explicit ordered fallback chain, expression-degraded-first, emitting a signal | M | Blocked: SC-804 |
| SC-808 | `asset_fallback` consumer: compile-time coverage report per A7 | M | Blocked: A7, SC-807 |
| SC-809 | Tier-aware compile thresholds — named/cameo/mob differ on what fails vs. warns | M | Blocked: SC-804 |
| SC-810 | Unify location backgrounds under the same `look` model | M | Blocked: SC-804 |
| SC-811 | Relationship stats with scene-emitted deltas; deltas to mobs/cameos dropped not stored | M | Blocked: SC-206 |
| SC-812 | Validator flags a relationship effect authored on a cameo or mob | S | Blocked: SC-811 |

## SC-E10 — Narrative consistency checkers · S14, S15, S16 · SC-M5/SC-M6

*Writer + cheap-checker pattern: expensive model (Opus-class) writes, cheap models lint. Reuses the existing `LLM_MODEL` / `LLM_DEEP_MODEL` two-model split (`LiteLLMProvider.ts`) and the tier-3 `entity_edges` projection. All three checkers run at plan time (F9 review step), never at runtime.*

| ID | Story | Size | State |
|---|---|---|---|
| SC-1001 | Knowledge ledger schema in `contracts/knowledge` — `fact_id` (stable secret/utterance id), `source_scene`, `acquired_via` (`witnessed`/`told`/`inferred`), `story_beat` visibility, plus `CharacterKnowsFact` edge type | M | Blocked: SC-S8, SC-701 |
| SC-1002 | `knows_fact` edge projection — from explicit `fact_refs` on dialogue nodes/overlays + hand-authored `fact` registry; array-aware merge for MODIFY deltas (same pitfall as SC-702 / SC-S3) | M | Blocked: SC-1001 |
| SC-1003 | Metagame checker — flags any NPC line referencing a `fact_id` not in that NPC's ledger at the requesting `story_beat` (covers "said in their head / wasn't there" cases); emits tier-3 diagnostic with fix hint ("add acquisition scene or gate line behind flag") | M | Blocked: SC-1002, SC-703 |
| SC-1004 | Inventory possession ledger — `has_item` / `item_at_location` edges, `acquired`/`consumed`/`lost` lifecycle; projection from `gives_item` + explicit possession deltas | M | Blocked: SC-S9, S8, SC-701 |
| SC-1005 | Inventory consistency checker — flags `requires_item` / gives/uses without prior `has_item`, or `has_item` after `consumed` without re-acquisition | M | Blocked: SC-1004, SC-703 |
| SC-1006 | Time-block consistency checker (deterministic) — sums `time_block_cost` across a scene path and flags prose-vs-cost mismatch (e.g. "three hours passed" vs TB cost 1); runs as pure lint in the review step, zero LLM | S | Blocked: SC-301, SC-701 |
| SC-1007 | Time-vs-prose LLM assist (cheap model) — extracts claimed elapsed time from dialogue prose and compares to TB sum; cheap-model pass (`LLM_MODEL`), writer model (`LLM_DEEP_MODEL`) stays for generation. Precision/recall gated on SC-S10 | M | Blocked: SC-S10, SC-1006 |
| SC-1008 | Wire all three checkers into `SC-703`/`SC-605` review step + CI — fail on `error` severity, warn on `hint`; add hint-engine hooks (S2) for "characters in this role usually know X" | M | Blocked: SC-1003, SC-1005, SC-1007 |

> **Sequencing note:** SC-1001–SC-1003 (S14) can start once SC-S8 answers and `S1` projection exists; SC-1004–SC-1005 (S15) needs S8 to exist; SC-1006 is the only item that can ship without a spike (pure TB arithmetic). SC-1007 is explicitly gated on SC-S10's precision measurement — do not build it until the spike says the cheap model is viable.

## SC-E9 — Old-path retirement · SC-M6 → SC-M7

*SC-901–SC-904 retire old code paths slice by slice; SC-905–SC-908 (new) retire the
legacy databases themselves: freeze → final extraction run → archive → delete.
The legacy OLTP/OLAP pair stays untouched and independent throughout — new work never
lands there, so nothing pollutes the current DB while the new one grows.*

| ID | Story | Size | State |
|---|---|---|---|
| SC-901 | Compile all shipped content into the new artifact form | L | Blocked: SC-402, A1 |
| SC-902 | Retire the old dialogue serving path once its kill condition is met | M | Blocked: SC-901 |
| SC-903 | Retire entity-shaped `FILL_TARGETS` intake | M | Blocked: SC-605 |
| SC-904 | Retire three-registry portrait resolution once coverage shows zero silent fallbacks | M | Blocked: SC-808 |
| SC-905 | Freeze legacy DBs read-only (`ALTER DATABASE las_flores SET default_transaction_read_only = on`, same for analytics); compose profile keeps old stack bootable but no writer runs against it | S | Blocked: SC-M6 exit |
| SC-906 | Final `server/` extraction run against the frozen snapshot — port reusable functions/ideas into `api/`, recorded in a port log (code/ideas only, never data write-back) | M | Blocked: SC-905 |
| SC-907 | Archive: versioned `pg_dump -Fc` of `las_flores` + `las_flores_analytics` stored against the release tag (object storage + checksum in the port log) | S | Blocked: SC-906 |
| SC-908 | Delete: drop `postgres-oltp` / `postgres-olap` compose services + volumes, remove `server/src/database/migrations/` + `migration-targets.json`, grep-prove zero references | S | Blocked: SC-907 |

## SC-E11 — Rung-3 physical separation · SC-M7 · F10

*Provisions the independent databases the new backend runs on. Blocked until the SC-M3
slice is green on rung 2 — separation without a working slice is infrastructure without
a customer. Compose uses a `--profile new-backend` so the default local boot stays
2 DBs until cutover.*

| ID | Story | Size | State |
|---|---|---|---|
| SC-1101 | Compose + CI: `postgres-planning` + `postgres-runtime` services (same `postgres:16-alpine` image, new volumes `postgres-planning-data` / `postgres-runtime-data`, new host ports, healthchecks mirroring `postgres-oltp`); `.env.example` + CI env promote `PLANNING_DATABASE_URL` / `RUNTIME_DATABASE_URL` from test-only to real | M | Blocked: SC-M3 exit |
| SC-1102 | Migration layout (Option A): `db/planning/migrations/` + `db/runtime/migrations/` with independent per-DB sequences and per-DB `schema_migrations PK(version)`; runner resolves target by folder and `migration-targets.json` is deleted; `server/src/database/migrate.ts` kept as a shim for legacy `oltp`/`olap` during coexistence | M | Blocked: SC-1101 |
| SC-1103 | Schema bootstrap: fresh `CREATE SCHEMA` + role/grant DDL per new DB (no cross-DB `ALTER DEFAULT PRIVILEGES` — each DB gets its own owner + restricted role); `api/planning` → planning DB, `api/runtime` → runtime DB | M | Blocked: SC-1102 |
| SC-1104 | Cutover proof: each module boots with only its own URL set (no `DATABASE_URL` fallback); SC-106 re-pointed at physical hosts passes; Podman scripts + `probe_leaderboard.ts` updated | S | Blocked: SC-1103 |

---

## Spikes

Time-boxed investigations. **A spike that answers "no" is a success** — it gets written up
in `spikes/` and the affected story is re-planned rather than quietly re-attempted.

| ID | Question | Box | Feeds |
|---|---|---|---|
| SC-S1 | Project `entity_edges` from existing content (~194 characters, 59 dialogue files, 1 mission). Row count, index size, is the projection natural? | 1 day | SC-701 |
| SC-S2 | Recursive-CTE reachability over that table with `EXPLAIN ANALYZE`. Is it milliseconds? | 0.5 day | SC-704 |
| SC-S3 | Overlay view for one hand-written plan with an ADD and a MODIFY — do traversals differ with and without it applied? | 1 day | SC-702 |
| SC-S4 | `pg_trgm` alias detection over existing location and character names — does it catch known duplicate phrasings? | 0.5 day | SC-706 |
| SC-S5 | Where does weather come from? `AGENTS.md:36` says it is a hook with no live source and callers pass `undefined`. Propose the source. | 0.5 day | A6, SC-305 |
| SC-S6 | Dialogue serving baseline — p50/p95 for chunk fetch and portrait load on the current path, including `resolveChunkSpeakers` | 1 day | SC-508, R13 |
| SC-S8 | Knowledge-ledger shape — what is a `fact_id` (secret granularity), how to author `fact_refs` on nodes, can cheap model infer exposure vs. requiring explicit ledger writes? | 0.5 day | SC-1001, S14 |
| SC-S9 | Inventory-ledger shape — per-character vs. per-location possession, consumption/loss semantics, projection from `gives_item` | 0.5 day | SC-1004, S15 |
| SC-S10 | Time-vs-prose cheap-model check — given a dialogue prose sample + TB sum, can `LLM_MODEL` extract claimed elapsed time with usable precision/recall? Measure vs. hand-labeled fixture | 0.5 day | SC-1007, S16 |

### Spike follow-ups

| ID | Story | Size | State |
|---|---|---|---|
| SC-S7 | Commit the spike harnesses (SC-S1 projection script, SC-S2 run/duplicate scripts, SC-S3 overlay script, SC-S4 corpus/analysis files, S6 serving baseline) under `server/scripts/`, or replace each write-up with fully self-contained inline repro commands. Until then the recorded spike numbers are not re-runnable from the repo. | S | Ready |
| SC-S11 | Commit SC-S8/S9/S10 harnesses (knowledge/inventory/time fixtures + cheap-model eval script) under `server/scripts/` or inline repro, same reproducibility rule as SC-S7 | S | Blocked: SC-S8, SC-S9, SC-S10 |

## Defects

| ID | Defect | Priority |
|---|---|---|
| D1 | Chunk lookup not scoped to the player's active tree/revision — requires adding a monotonic `dialogue_trees.revision` + player-pinned `pinned_tree_revision` first (no revision identifier exists in the current model; see D1 ticket) | **now** |
| D2 | Submitted choice not validated as reachable before effects apply | **now** |
