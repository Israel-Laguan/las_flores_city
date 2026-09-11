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
| SC-206 | Threshold-crossing sets a flag as a persisted event, not a derived query | M | Blocked: SC-202, S3 |

## SC-E3 — Scene model & composition · F3, F7 · SC-M2

| ID | Story | Size | State |
|---|---|---|---|
| SC-301 | Scene entity: location, time, weather, participants, items, dialogue refs | M | Blocked: SC-204 |
| SC-302 | Role slots as a scene attribute — slot id, cast, position | M | Blocked: SC-301 |
| SC-303 | Base + overlay composition with priority ordering | M | Blocked: SC-301 |
| SC-304 | Exclusive vs. additive property resolution; equal-priority conflict fails compile | M | Blocked: A3 |
| SC-305 | Weather: `scene.weather` authored override field, resolved against `district.weather` before `buildBackgroundHints` (A6 resolved — `spikes/SC-S5-weather-source.md`) | S | Blocked: SC-301, SC-309 |
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
| SC-701 | `entity_edges` table and projection from entity payloads, incl. `mission_scene` from `SC-700`'s new field | L | Blocked: SC-S1, SC-S2, SC-700 |
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

## SC-E9 — Old-path retirement · post-SC-M6

| ID | Story | Size | State |
|---|---|---|---|
| SC-901 | Compile all shipped content into the new artifact form | L | Blocked: SC-402, A1 |
| SC-902 | Retire the old dialogue serving path once its kill condition is met | M | Blocked: SC-901 |
| SC-903 | Retire entity-shaped `FILL_TARGETS` intake | M | Blocked: SC-605 |
| SC-904 | Retire three-registry portrait resolution once coverage shows zero silent fallbacks | M | Blocked: SC-808 |

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

### Spike follow-ups

| ID | Story | Size | State |
|---|---|---|---|
| SC-S7 | Commit the spike harnesses (SC-S1 projection script, SC-S2 run/duplicate scripts, SC-S3 overlay script, SC-S4 corpus/analysis files, S6 serving baseline) under `server/scripts/`, or replace each write-up with fully self-contained inline repro commands. Until then the recorded spike numbers are not re-runnable from the repo. | S | Ready |

## Defects

| ID | Defect | Priority |
|---|---|---|
| D1 | Chunk lookup not scoped to the player's active tree/revision — requires adding a monotonic `dialogue_trees.revision` + player-pinned `pinned_tree_revision` first (no revision identifier exists in the current model; see D1 ticket) | **now** |
| D2 | Submitted choice not validated as reachable before effects apply | **now** |
