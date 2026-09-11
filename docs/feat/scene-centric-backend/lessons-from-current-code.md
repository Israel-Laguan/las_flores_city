# Lessons From the Current Code — Keep, Avoid, and the Rules That Fall Out

**Status:** Brainstorm. Companion to `proposal.md`. The existing `server/`, `scripts/`,
and `content/` represent real, working solutions to problems the new backend will hit
again. This catalogues what earned its place, what caused the pathologies the redesign
exists to fix, and the invariants derived from both.

All claims below were verified against the tree rather than recalled.

---

## Part 1 — What works and should be carried forward

### 1.1 Stage before migrate

YAML is written and validated before any DB mutation. This is the single best safety
property in the current design: a bad plan fails at the filesystem, not halfway through a
transaction against canon. **Carry forward verbatim** — the new compile step should emit
and validate artifacts before publishing them, for the same reason.

### 1.2 Atomic writes and snapshot rollback

The admin file-write endpoint writes a `.tmp` file and renames it; `StoryBuilderFileWriter`
rolls back via `fileSnapshots` when staging fails. Rename-based atomicity is correct and
cheap. **Keep the pattern**, including for compiled artifacts.

### 1.3 Migration log for idempotency

Every migrated file is recorded, so re-runs do not duplicate and drift is detectable.
**Keep and strengthen** with per-entity content hashing (`proposal.md` §5) so an unchanged
entity is a skip rather than a rewrite.

### 1.4 Optional-by-default infrastructure

`NEO4J_ENABLED` defaults to `false` (`.env.example:18`, `docker-compose.yml:157`) and the
server is explicitly required to keep working when Neo4j is absent. This is genuinely
excellent discipline and it is why removing the graph is a decision rather than a crisis.

> **Rule:** any new infrastructure ships behind a flag that defaults off, and the system
> must have a correct behaviour when it is absent.

That rule should govern `pgvector`, any cache layer, and any future graph reintroduction.

### 1.5 Non-fatal LLM steps

Lore generation is wrapped in `try/catch` — a failed LLM call does not block plan
creation. This is the right posture for every LLM call: **enrichment, never a gate.**
The new backend's LLM steps (fill, pool generation, critique) should all degrade to
"unfilled" rather than "failed."

### 1.6 Bounded LLM context — already solved, needs generalizing

The two-pass big-story ingestion is the most under-appreciated thing in the current code.
When input exceeds `PLAN_OUTLINE_MAX_INPUT_CHARS`, it chunks by heading/paragraph,
extracts entity candidates per chunk in parallel, merges and dedupes by normalized name,
then runs a **bounded** outline call — roster capped at `LLM_OUTLINE_INITIAL_MAX_ITEMS`
(default 15), synopsis capped at 2,000 characters, entity descriptions truncated to 80,
output capped by `LLM_OUTLINE_MAX_TOKENS` with `finish_reason=length` handling.

Every call stays small regardless of story size. **That is exactly the Scene Card
discipline** (`proposal.md` §1) arrived at independently, for the intake path. Generalize
it rather than reinventing it.

### 1.7 Explicit, self-documenting state machines

`content_plans.status` is a `CHECK` constraint, and migration `086` deliberately excludes
`rejected` from the materialize/approve machine **with a comment explaining why**. That is
how state machines should be written. Keep both the constraint and the habit of
commenting deliberate exclusions.

### 1.8 Monotonic revision counters, learned the hard way

Migration `089` records that the previous guard compared `plan_json` — which is *not*
monotonic — and that `xmin` bumps on any column touch. `graph_revision` bumps only on
amendment commits. Someone already paid for this lesson. **Any revision or cache key in
the new backend must be monotonic and must bump on exactly the events it claims to
track** — directly relevant to revision-scoped cache keys (`proposal.md` §5).

### 1.9 Content externalization

Migration `076_drop_dialogue_jsonb.sql` dropped `nodes`/`leaves` from `dialogue_chunks`
and `dialogue_trees`; chunks are served from object storage through the resolver. **The
compile-to-artifact pattern already works.** The new backend extends it to scenes and
manifests — it does not need to invent or redo it.

### 1.10 Overlays with priority

`content/overlays/` already implements base + priority-ordered overlay composition, gated
by `mission_id`, targeting a base tree. This is the composition model `proposal.md` §2.2
proposes for scenes. **Generalize the existing pattern**, do not invent a parallel one.

---

## Part 2 — What to avoid, with root causes

### 2.1 The intake asks 21 fields about a character and 2 about a scene

`StoryBuilderPlanOps.ts` `FILL_TARGETS`:

```
character: 21 fields  (description, title, physical_description, psychological_description,
                       + 17 metadata.* including faction, age, gender, ethnicity, occupation,
                       background, education, residence, organization, allies, mannerisms,
                       motivations, quote, methods, status, location, personality)
scene:      2 fields  (description, mood)
dialogue:   1 field   (description)
mission:    1 field   (description)
```

This is the entity-shaped bias made literal, and it is the mechanical cause of **194
characters / 7 speakers / 1 mission**. The pipeline invests twenty-one times more
elicitation effort in the thing that is not playable than in the thing that is.

> **Rule:** elicitation effort per entity type should be proportional to how much that
> entity contributes to playable content, not to how many fields its schema happens to have.

### 2.2 Fields with no reader

`grep -rn "personality" client/src shared/src` returns **nothing**. Same for the character
`faction` concept. 182 distinct personality values were authored, and no runtime code
reads any of them — their only consumer is an LLM reading prose.

> **Rule:** do not add a field without naming its reader. If the only reader is an LLM
> reading prose, keep it as prose and stop trying to structure it.

This rule cuts *against* part of the original `CHARACTER_DATA_MODEL.md` proposal, which is
the point: structuring `personality` into 16 archetypes buys queryability that nothing
currently queries.

### 2.3 NULL masquerading as a value

`faction: independent` on 55 of 194 characters is not a faction — it is "no affiliation"
forced into a non-nullable string. Similarly `age` mixing `45` and `"Early 20s"`, and
`status` as prose `"Deceased (February 2053)"` carrying a date inside a sentence.

> **Rule:** if a field has a closed set of meanings, close it. If a value means "none",
> use `NULL`. Never encode structure inside prose that something will later need to parse.

### 2.4 Multiple writers for one fact

Three registries describe which expressions a character has — the `.prompt.md` promises
(~800), the generated assets on disk (~190), and `portrait_urls[].expression` at runtime
(10 characters). Nothing reconciles them, so they drift silently.

The mechanism is visible in `AssetPublishService.ts`: on publish it looks for the entry
with `label === 'dev'`, overwrites that single URL, and otherwise pushes a new
`{ url, label: 'dev' }`. **No expression key is ever written.** Combined with
`AssetNeedsService.ts` emitting one portrait need per character, the runtime registry
cannot become populated no matter what the prompt files promise.

> **Rule:** one writer per fact; everything else is derived. And when a registry is empty,
> check the writer before redesigning the schema — a new table fed by the same broken
> writer becomes a fourth empty registry.

### 2.5 Silent runtime fallback hides missing content

`resolvePortraitUrl` falls back to `default` for 185 of 195 characters. The expression
system is effectively dark in production and nothing reports it. A fallback that succeeds
is indistinguishable from content that exists.

> **Rule:** fail at compile time, never fall back silently at runtime. A named character
> missing a baseline asset should break the build. Where a runtime fallback is genuinely
> desirable, it must be an explicit ordered chain that emits a signal.

### 2.6 Validation positioned after the point of no return

Content is validated at stage time — after the writer has finished and committed to the
plan. That makes validation a gate rather than an assistant, and it is structurally
incompatible with the hint experience (`proposal.md` §4.2).

> **Rule:** checks run where the writer can still act on them. Anything that only runs
> after approval is a safety net, not a hint.

### 2.7 Lookups that can serve player content without revision scoping

`WHERE chunk_key = $1 LIMIT 1` with no tree/revision constraint means a client can
potentially load a chunk from a different tree or an older revision, and submitted choices
are not verified as reachable from the player's current node before effects fire.

> **Rule:** every lookup that can serve player content is scoped to the player's active
> content revision, and every state transition validates that the submitted transition was
> reachable *before* applying effects.

This is the one item in this document that is a live player-facing bug rather than a
design concern.

### 2.8 A test harness becoming production infrastructure

`server/scripts/latency_probe.ts` is described in `DATA_INTAKE.md` as "the canonical
harness" for file-driven ingestion — a probe script that became the real entry point for
a real workflow. M54 is now retiring it.

> **Rule:** when a script becomes load-bearing, promote it deliberately — give it a home,
> a contract, and tests — or explicitly keep it disposable. Drift into production is the
> failure mode.

### 2.9 Performance goals without instrumentation

"Serve fast" is a stated objective and, until SC-S6, no dialogue benchmark existed
anywhere in the repo. The suspected hot spot — `resolveChunkSpeakers` doing an uncached
bulk `SELECT` plus per-portrait object-storage presigning on every response — was found
by reading, not by measuring, and the reading was wrong on both counts. SC-S6
(`docs/feat/scene-centric-backend/spikes/SC-S6-serving-baseline.md`) measured
`GET /dialogue/active`: p50 ≈ 25ms / p95 ≈ 35-39ms end-to-end, of which
`resolveChunkSpeakers` is only ~29-45%, not the majority. Its `SELECT` is sub-millisecond
(not a bottleneck at any current or 10-20x table volume); the real but minority cost is
per-portrait presigning. The larger, still-unnamed cost (~70% of the endpoint) is
everything else in the request path — cursor/tree/chunk lookups and
`DialogueResolver.resolveChunkForUser`'s parallel state loads.

> **Rule:** no performance goal without a baseline measurement first. The measurement is
> cheaper than the optimization and frequently redirects it — here, it redirected the
> obvious optimization target (the `SELECT`) to the wrong place entirely.

### 2.10 Two writers to one fact across systems

The original `CHARACTER_DATA_MODEL.md` proposed vocabulary tables "editable in M52's admin
UI", while `CONTENT_DB_CORRELATION_AUDIT.md` §2 states that direct DB edits outside the
migration path are drift. Those cannot both hold.

> **Rule:** state, per table, who the writer is — migration, admin UI, or compile step —
> and enforce it. Ambiguous ownership is how the three-registry problem happened, and it
> is the specific risk during the coexistence window (`proposal.md` §7).

---

## Part 3 — The rules, consolidated

Extracted from Parts 1 and 2, these are the invariants the new backend should be built to
satisfy. They are testable, which is the point.

| # | Rule | Source |
|---|---|---|
| R1 | New infrastructure ships behind a flag defaulting off, with correct absent-behaviour | §1.4 |
| R2 | LLM calls are enrichment, never gates — degrade, don't fail | §1.5 |
| R3 | LLM context is bounded by construction, independent of world size | §1.6 |
| R4 | Revision counters are monotonic and bump on exactly their claimed events | §1.8 |
| R5 | Validate and stage before mutating canon; roll back atomically | §1.1, §1.2 |
| R6 | Elicitation effort follows playability, not schema field count | §2.1 |
| R7 | No field without a named reader | §2.2 |
| R8 | Closed sets are closed; "none" is `NULL`; no structure inside prose | §2.3 |
| R9 | One writer per fact; everything else derived | §2.4, §2.10 |
| R10 | Fail at compile time; never fall back silently at runtime | §2.5 |
| R11 | Checks run where the writer can still act on them | §2.6 |
| R12 | Player-content lookups are revision-scoped; transitions validated before effects | §2.7 |
| R13 | No performance goal without a baseline measurement | §2.9 |
| R14 | Every table declares its writer | §2.10 |

R7 and R9 are the two that most constrain the new design, and they pull in opposite
directions from the instinct that produced `CHARACTER_DATA_MODEL.md` — which is a useful
tension to keep visible rather than resolve prematurely.

---

## Part 4 — Judgment calls worth revisiting, not mistakes

Three decisions that were reasonable and may or may not survive:

**File-canonical content with Postgres as a mirror.** YAML under `content/` is the source
of truth and the DB is a validated mirror. This buys git-diffable review, atomic writes,
and rollback. It costs a translation layer and makes DB-side constraints advisory rather
than authoritative. The new scene-centric model leans much harder on relational structure
(`plan-graph-in-postgres.md`), so this needs an explicit decision — it is open question #8
in `proposal.md` and the one the external reviewer never engaged with because the brief
underplayed it.

**Plan versioning via `parent_plan_id`.** Right instinct, incomplete: there is no merge
rule for regeneration versus hand edits (`proposal.md` §4.6).

**Whole-plan approval.** Simple and correct for entity-shaped plans. Scene-shaped plans
bundle a scene, characters, flags, and items together, which makes partial approval a real
workflow question rather than a nicety.

---

## Part 5 — References

- `server/src/services/StoryBuilderPlanOps.ts` — `FILL_TARGETS` (§2.1)
- `server/src/services/AssetPublishService.ts` — `label === 'dev'` single-slot write (§2.4)
- `server/src/services/AssetNeedsService.ts` — one portrait need per character (§2.4)
- `server/src/database/migrations/076_drop_dialogue_jsonb.sql` — content externalization (§1.9)
- `server/src/database/migrations/086_content_plans_rejected.sql` — deliberate state exclusion (§1.7)
- `server/src/database/migrations/089_content_plans_graph_revision.sql` — monotonicity lesson (§1.8)
- `content/overlays/` — base + priority overlay precedent (§1.10)
- `docs/DATA_INTAKE.md` — two-pass bounded ingestion (§1.6), `latency_probe.ts` (§2.8)
- `docs/CONTENT_DB_CORRELATION_AUDIT.md` — drift definition (§2.10)
- `.env.example`, `docker-compose.yml` — optional-by-default pattern (§1.4)
