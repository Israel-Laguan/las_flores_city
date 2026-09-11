# Brief: Activity & Assets — Two Unresolved Subsystems

**How to use this document:** it is a self-contained prompt. Hand it to an independent
reviewer or a fresh agent. It describes two subsystems we have deliberately left
unspecified, the constraints any answer must satisfy, and the form the answer needs to
take so it can feed the datastore design that follows.

**Deliberately not included:** our own proposed table shapes for either subsystem. We want
an independent structure. Disagree with the framing here if it is wrong.

---

## 1. Context you need

**The game.** A server-driven visual novel. The server is the source of truth; the client
(Phaser/PixiJS) renders what the server dictates. The player navigates a map of districts
→ locations, and at each location one or more **scenes** resolve.

**The architectural premise.** The LLM runs at **compile time**, never at runtime. Content
is authored, validated, compiled into immutable content-addressed artifacts, and served
from a CDN. Runtime does selection and effect application — it never generates.

**The unit is the scene.** A scene binds a location, a time, weather, participants,
items, and dialogue. Scenes **compose**: a location may host a base scene plus overlays
(ordered by priority), where some properties are **exclusive** (background, weather —
exactly one wins) and others are **additive** (participants, items, dialogue).

**Character tiers are budget declarations**, telling the validator what to require and the
asset pipeline what to generate:

| Tier | Unique dialogue | Unique assets | Relationships |
|---|---|---|---|
| named | yes | yes | yes |
| cameo | yes | yes | no |
| mob | no — shared pool | no — shared | no |

**Dialogue is keyed three ways** — on self (personality, shared across mobs), on
relationship (named only), on situation (attached to a *role slot* in a scene, not to a
person). Runtime picks by specificity: scene beats relationship beats personality.

**Flags gate; stats colour.** Scenes write relationship stats and read only flags. Stats
may select among presentations that are equivalent for progression; only flags may gate
progression. This keeps static reachability analysis decidable.

**Scale and team.** One developer, full stack. ~194 authored characters, ~7 with any
dialogue, ~280 dialogue nodes, 1 mission. No launch date. Any proposal must be honest
about solo-developer cost.

Fuller detail is in `proposal.md` in this folder — read it if you want the reasoning, but
this brief is meant to stand alone.

---

## 2. Subsystem A — Activity

**What we know.** Activity is the join between a scene and a character. It is the scene's
override of what a character is doing. It changes animation, and it can drive a character
to walk, to sell, or to open a minigame.

**Why we stopped.** That last clause makes it a hook into subsystems, not a field. We do
not know its shape, and guessing would contaminate the rest of the design.

**Our working invariant** (challenge it if wrong): a scene may override a character's
*presentation and behaviour* — place, activity, look, dialogue pool — but never their
*identity or history* — traits, stats, relationships. This is what makes scenes safely
disposable.

### Questions we need answered

1. **Is an activity a first-class entity, or a property of the character-in-scene
   binding?** "Selling" is presumably the same activity across fifty vendors, which argues
   for first-class plus a binding. Does that hold?
2. **What does an activity actually bind?** Animation, dialogue-pool selection, look
   selection, position — one selection or several independent ones? If several, do they
   have to move together?
3. **The server/client boundary.** Animation is client-side. Does the server send an
   activity identifier the client knows how to render, and is that the whole contract?
4. **The minigame case is the one that breaks things.** An activity that launches an
   interactive system needs a *return contract*. What happens when it ends — does it set a
   flag? If activities can emit flags, they are effect-bearing and need the same
   reachability treatment as dialogue, which changes the validation model.
5. **Does activity select dialogue?** A character who is *selling* plausibly has different
   lines than one who is *fleeing*. If so, activity participates in the specificity ladder
   — where?
6. **Duration.** Is an activity instantaneous, durative ("walks from A to B"), or
   scheduled? Does the server track progress, or is duration purely presentational?
7. **Conflict.** Activity is probably **exclusive** per character per scene resolution. Two
   overlays each assigning an activity to the same character is then a conflict needing a
   precedence rule. Is that the right call, and what is the rule?
8. **Default state.** What is a character doing when no scene assigns an activity? Is
   "idle" an activity, or the absence of one?

---

## 3. Subsystem B — Assets

**What is broken today, with the verified mechanism.** Three registries describe which
expressions a character has, and nothing reconciles them:

- `.prompt.md` files **promise** ~800 expression variants
- ~190 image assets **exist** on disk
- **10 of 195** characters expose any expression at runtime

The cause is not the schema. `AssetPublishService.ts` finds the entry with
`label === 'dev'`, overwrites that single URL, and otherwise pushes a new
`{ url, label: 'dev' }` — **it never writes an expression key at all**. Combined with
`AssetNeedsService.ts` emitting one portrait need per character, the runtime registry
cannot populate no matter what the prompt files promise. Meanwhile `resolvePortraitUrl`
falls back to `default` for 185 characters, so the failure is invisible in production.

**Two rules we have already adopted from this** (see `lessons-from-current-code.md`):
one writer per fact, everything else derived; and fail at compile time, never fall back
silently at runtime.

**A direction proposed but not settled.** Separate **look** (context/state: `injured`,
`market_day`, `night`) from **expression** (emotion: `neutral`, `angry`, `scared`).
Generate the base look once; derive expressions via img2img from that base with a fixed
seed; generate additional looks **lazily**, only when a flag or scene actually requires
one. Budget roughly: named ≈ 2–3 looks × 5 expressions; cameo ≈ 1 look × 2; mob shares a
small pool of base portraits with no expressions.

### Questions we need answered

1. **Is look × expression a true product or a sparse set?** Sparse, presumably — but then
   what is the fallback when `(injured, angry)` does not exist? Do you degrade the
   expression first (`injured, neutral`) or the look first (`base, angry`)? That ordering
   has visible consequences and we have no principled reason to prefer either.
2. **What triggers lazy generation?** If a writer authors a scene requiring `injured`, does
   plan approval enqueue a generation job? That makes asset generation part of the plan
   lifecycle rather than a separate pipeline — is that right?
3. **Identity consistency.** Expressions must look like the same person. Is the generation
   seed part of the character's durable identity data? What happens when a model or prompt
   template changes and regeneration no longer matches existing assets?
4. **Shared assets without lying about ownership.** A mob pool serves many characters from
   the same image. How is that expressed so the registry does not claim each character owns
   its own portrait?
5. **Immutability vs. identity.** Artifacts are content-addressed, so regenerating an asset
   yields a new hash and a new URL while old content revisions keep working. That means
   asset *identity* is not its URL. What is it, and what does a "current" asset mean?
6. **What fails the build?** We want compile-time failure instead of silent fallback. What
   is the minimum viable set per tier, and which absences are errors versus warnings?
7. **Do locations use the same model?** Backgrounds need day/night/rain variants. Our
   hypothesis: *an entity has looks; looks are selected by condition; characters
   additionally layer expressions on top.* If characters and locations unify under one
   mechanism, that is a significant simplification — does it hold, or are they genuinely
   different?
8. **Where does weather selection happen?** Weather defaults from the district and a scene
   may deliberately override it. Is the background variant selected by the resolved weather
   value, and does that make weather an asset-selection key as well as a scene property?

---

## 4. Constraints any answer must satisfy

1. **Compile-time LLM only.** No generation at runtime. Selection at runtime must be
   deterministic given world state.
2. **Static analysability.** Anything that gates progression must be discrete and
   inspectable, so "is this reachable?" and "is this a dead end?" stay answerable without
   simulating the game. If your design introduces something that gates on a continuous
   value, say so explicitly — it is a real cost.
3. **One writer per fact.** Every stored fact has exactly one writer; everything else is
   derived and rebuildable.
4. **Compile-time failure over runtime fallback.** Where a runtime fallback is genuinely
   desirable, it must be an explicit ordered chain that emits a signal.
5. **No field without a named reader.** If the only consumer of a value is an LLM reading
   prose, keep it as prose rather than structuring it.
6. **Solo-developer cost is the dominant term.** Prefer designs where the cheap version is
   a strict subset of the full version, so it can be built incrementally without rework.
7. **Content volume is small and will stay small for a while.** Do not optimise for a
   roster ten times larger than the current one.

---

## 5. The form the answer needs to take

Whatever you propose will feed a datastore design that has already taken shape (see
`plan-graph-in-postgres.md`). Two things about that design constrain the *form*, not the
content, of your answer:

**A. Everything is expressible as entities plus typed edges.** Authoring-time analysis
runs over a derived edge table — `(from_type, from_slug, edge_kind, to_type, to_slug,
attrs)` — projected from entity payloads. So for each concept you introduce, please state:

- Is it an **entity** (has identity, referenced by others) or an **attribute** of one?
- What **edges** does it produce? (e.g. does an activity produce a `sets_flag` edge?)
- What **conditions** does it participate in, if any?

**B. Everything authored moves through a plan as a delta.** Changes are
`ADD` / `MODIFY` / `DELETE` deltas against canon, reviewed before commit. So please state:

- What a writer authors **directly** vs. what is **derived** at compile time.
- What is **generated asynchronously** (images) and how a plan represents something that
  does not exist yet.

### Deliverable

For each of the two subsystems:

1. Your proposed structure — entities, attributes, edges, and where conditions attach.
2. The lifecycle: what the writer authors, what compile derives, what runtime selects.
3. The failure modes you would make impossible by construction, and the ones you would
   catch at compile time.
4. What you would build **first** given the solo-developer constraint, and what you would
   defer.
5. Anything in this brief you think is wrong, including the working invariant in §2 and the
   look/expression hypothesis in §3.

Concrete beats comprehensive. If a question in §2 or §3 is malformed, say so instead of
answering it.

---

## 6. Independent Review — Proposed Structure (2026-09-06)

**Context for the reader:** §§1–5 above were the prompt handed to an independent reviewer. What follows is that reviewer's answer, kept verbatim so the datastore design in `plan-graph-in-postgres.md` can be traced back to the questions. Two companion documents were read as context: `proposal.md` (scene as unit, base+overlay composition, flag/stat contract) and `plan-graph-in-postgres.md` (entity-agnostic `plan_deltas` + derived `entity_edges` + overlay view). Verified current behaviour was checked in `client/src/utils/resolvePortraitUrl.ts:15-169`, `docs/ASSET_EXPRESSION_VOCABULARY.md:1-226`, `server/src/services/AssetPublishService.ts:163-170`, and `server/src/services/AssetNeedsService.ts:55-82`.

Constraints from §4 are treated as hard (§4.1 compile-time LLM only, §4.2 discrete gating, §4.3 one writer per fact, §4.4 fail at compile, §4.5 named reader, §4.6 solo-dev cost dominates, §4.7 small volume). The answer is expressed in the form required by §5: entities vs attributes, typed edges `(from_type, from_slug, edge_kind, to_type, to_slug, attrs)` projected from payloads, and plan deltas `ADD/MODIFY/DELETE` with authored vs derived vs async.

---

### 6.1 Subsystem A — Activity

#### Structure — entities, attributes, edges, conditions

**Thesis:** Activity is a **first-class catalog entity** plus a **per-scene role-slot binding**. A binding-only property fails because `selling` is the same behaviour across 50 vendors and needs one place to define its animation contract, dialogue bias, and completion semantics (`brief §2 Q1`). A standalone entity without a binding cannot express "Rafaela is *selling* here but *fleeing* there."

```
entity: activity_def              # slug = stable verb, e.g. selling, patrolling, fleeing
  display_name: string
  kind: 'ambient'|'locomotion'|'commerce'|'interactive'  # reader: client manifest (R7)
  animation_tag: string           # reader: client sprite manifest
  completion:                     # reader: resolver + edge projector
    type: 'none'|'auto'|'interactive'
    returns_flag_slug?: string    # only if interactive — see below
  dialogue_bias?: string          # optional tag merged into situation pool key
  look_hint?: string              # optional suggestion, NOT authoritative (see §6.2)
  requires_flag_slug?: string     # optional discrete gate (R2)

entity: scene (existing, extended)
  attribute: participants: RoleSlot[]
  # RoleSlot is an attribute of scene, not an entity — no identity outside its scene
  RoleSlot:
    slot_id: string               # "bystander", "vendor_1"
    cast: character_slug|mob_pool_slug|null  # null = still casting
    activity_slug?: string        # FK -> activity_def.slug, nullable
    position_tag?: string         # "stall_3", "door" — client-only, no edges (R7)
```

`activity_def` is an entity (referenced by many slots, versioned, owns its completion contract). `RoleSlot.activity_slug` is a binding attribute. There is no separate `character_activity` join table — the scene payload is the writer (one writer per fact `lessons-from-current-code.md: R9`).

**Derived edges** (projected at compile from payloads, never hand-authored — `plan-graph-in-postgres.md:87-95`):

| edge_kind | from | to | when emitted | attrs | analysability |
|---|---|---|---|---|---|
| `scene_requires_activity` | `scene` | `activity_def` | slot has `activity_slug` | `{slot_id, priority}` | tier-2 reference check |
| `activity_sets_flag` | `activity_def` | `flag` | `completion.returns_flag_slug` present | `{completion_type}` | **gating — tier-3 reachability** |
| `activity_requires_flag` | `activity_def` | `flag` | `requires_flag_slug` present | `{condition}` | gating |
| `scene_casts_character` | `scene` | `character` | slot.cast present | `{slot_id, activity_slug}` | trivial anti-join |
| `activity_selects_dialogue_pool` | `activity_def` | `dialogue_pool` | `dialogue_bias` present | — | colour only (no gate) |

Conditions attach only as discrete flag tests on `activity_def.requires_flag_slug` and transitively via `scene.requires_flag`. No continuous stat appears. `activity_sets_flag` is the only effect-bearing edge and reuses the single condition grammar `proposal.md: §4.3`.

**Direct answers to §2 questions:**

1. **First-class + binding — yes, holds.** Catalog of ~12 verbs covers 90% of scenes at this volume.
2. **One atomic selection.** `animation_tag + dialogue_bias + look_hint + position_tag` move together as the activity's presentation bundle. Four independent selectors quadruple authoring cost and yield incoherent combos (`fleeing` + `market_day` look). Keep one knob.
3. **Server/client boundary:** server sends `activity_slug` (authoritative identity) + pre-resolved `animation_tag` (server-side metadata derived from `activity_def.animation_tag` at compile time, included in the scene artifact for observability and deterministic debugging) + flag deltas. Client resolves the clip **solely** via `activity_slug -> clip` manifest lookup (`client/src/utils/resolvePortraitUrl.ts:15` precedent). `animation_tag` is not used for clip selection. **Invariant:** the artifact's `animation_tag` MUST equal `activity_def.animation_tag` for that `activity_slug`, and the manifest entry for that `activity_slug` MUST point to the clip that renders that `animation_tag`; compile validates this, and a mismatch fails the build. Server never streams frames.
4. **Minigame return — interactive completion contract (S12):** `completion.type='interactive'` declares a named `returns_flag_slug` (e.g. `haggled_with_rafaela`). Client POSTs completion with **only** `{ session_id, slot_id }` (or equivalent pinned-session handle) — it MUST NOT supply `activity_slug`, `returns_flag_slug`, `revision_id`, or any identity field; the server derives all three from authoritative state: the session's `pinned_revision_id` (`architecture.md` §4 / `plan-graph-in-postgres.md` §9.3) and that session's active `RoleSlot.activity_slug` at the pinned revision. The server looks up `activity_def` for that slug at the pinned revision to obtain `returns_flag_slug`, then sets that flag transactionally and re-resolves the scene. Requests are **idempotent**: repeated POSTs for the same `(session_id, slot_id, pinned_revision_id, activity_slug)` MUST NOT apply the flag or effects more than once (guard with a `completed_interactive_activities` dedup table or equivalent, checked inside the same transaction). Any client-supplied identity field is rejected (400) or ignored. This **is** effect-bearing, so `activity_sets_flag` participates in tier-3 reachability (`lessons R5`). `type='none'/'auto'` sets no flag.
5. **Dialogue selection:** activity does not add a new specificity rung. Scene dialogue attaches to a **role slot** `proposal.md: §2.6`; the slot already carries `activity_slug`, so `selling`-lines are scene-situational lines filtered by `slot.activity == selling`. Specificity stays `scene > relationship > personality` (`proposal.md: §2.6` ladder).
6. **Duration:** durative presentation state pinned for the scene visit (`proposal.md: §2.2` pinning precedent). Server does not tick progress; duration is presentational. An `auto` activity (e.g. walks A→B) completes client-side with no flag. Defer scheduled/timed activities — no field without a reader yet (R7).
7. **Conflict:** exclusive per `(scene_resolution, character)`. Two overlays assigning different activities to the same slot → **higher `priority` overlay wins** (generalizes `content/overlays/` precedent `proposal.md: §1.10` / `lessons: §1.10`). Compile warns on conflict; runtime is deterministic.
8. **Default:** `NULL` = idle. `idle` is not an entity; resolver maps null to default idle animation. Avoids a fake row every character references.

#### Lifecycle — authored vs derived vs async

| Phase | Authored directly (plan delta) | Derived at compile | Generated async |
|---|---|---|---|
| **Plan** | Writer authors `scene` with `RoleSlot.activity_slug` referencing existing or new `activity_def` via slug. New verbs require an `ADD activity_def` delta in the same plan (one writer per fact). | Validate tier-1 (unknown slug → error), tier-2 (cast exists), tier-3 (flag set but never read / required but never set). Project `entity_edges` rows. Emit content-addressed scene artifact + manifest. Fail if `interactive` lacks `returns_flag`. | None for activity itself (no images). |
| **Runtime** | — | — | Resolver loads active scene artifact for location, merges overlays by priority, picks winning `activity_slug` per slot, looks up `animation_tag` from catalog, selects dialogue pool by `(scene, slot, activity)`. Deterministic, no LLM. |

A plan that introduces `selling` for the first time carries `ADD activity_def` with full payload — no placeholder job. Tier-3 can already reason about its `sets_flag` edge from the delta's `plan_edges` overlay (`plan-graph-in-postgres.md:102-116`).

#### Failure modes

**Impossible by construction:** two activities on same character simultaneously (exclusive binding + priority rule); interactive activity that gates progression without a declared flag (schema requires `returns_flag_slug` when `type=interactive`); activity referencing a continuous stat (column is `flag_slug` FK).

**Caught at compile (fail build, R10):** unknown `activity_slug`, cast to nonexistent character, `interactive` without flag, flag set but never read / required but never set (existing tier-3 anti-joins `plan-graph-in-postgres.md:147`), overlay conflict with equal priority.

**Runtime fallback (explicit, signalled, R10):** unknown `animation_tag` on client → `warn` + render `idle` clip + emit telemetry event. Never silently succeed.

#### Build first / defer (solo-dev cost dominates, §4.6)

**Build first — strict subset, no rework:** seed catalog with 4 verbs: `standing`, `selling` (`commerce`), `fleeing`, plus implicit `idle` (null). All `completion.type='none'`. Add `activity_slug` to `RoleSlot` payload, wire single edge `scene_requires_activity`, add overlay priority resolution. Client manifest maps those 4 tags to existing clips. Dialogue bias = string match only.

**Defer:** `interactive` completion + `activity_sets_flag` edge (needs flag plumbing); `look_hint` wiring to asset selection; locomotion pathfinding / `position_tag` interpolation; additional verbs (added as `ADD activity_def` deltas, no schema change).

#### What the brief gets wrong (§2)

- The working invariant in §2 (*presentation/behaviour vs identity/history*) is **correct and load-bearing** (`proposal.md: §2.5`). Keep it. Refinement: activity's `commerce`/`interactive` kind is behaviour, but its `returns_flag` is **history** — that flag is the clean seam where behaviour writes history without the scene touching `traits/stats`.
- Q5 as posed is malformed — activity does not need its own dialogue rung. Treating it as independent duplicates the role-slot mechanism already designed for situation-keyed lines.
- Q6 (duration/scheduling) is premature without a subsystem that reads progress. Answer "durative pinned presentation" and refuse to add `duration_seconds` until a reader exists (R7).

---

### 6.2 Subsystem B — Assets

#### Structure — entities, attributes, edges, conditions

**Unify characters and locations under one mechanism:** *an entity has looks; looks are selected by condition; characters additionally layer expressions on top.* This holds and is the key simplification (`brief §3 Q7`).

```
entity: character | location | scene   # existing, extended
  seed: int | null                    # durable identity; reader: img2img pipeline (character only)
  # no portrait_urls on canonical row — derived artifact only (one writer per fact, R9)

entity: asset_set                      # owns a group of related looks
  owner_type, owner_slug              # FK -> character | location | scene | mob_pool
  # mob_pool asset_sets are owned by the pool, NOT by each character (see below)

entity: look                          # a context/state variant
  asset_set_slug
  look_slug: string                   # 'base','injured','market_day','night','rain'
  condition_flag_slug?: string        # optional gating flag (e.g. requires 'is_injured')
  attribute: variant_pool: AssetVariant[]

attribute: AssetVariant (inside look)
  variant_slug: string                # 'default' | expression name | environment name
  kind: 'default'|'expression'|'environment'
  content_hash: string                # identity = (look_slug, variant_slug)+hash; URL is value
  url: string                         # content-addressed CDN URL, in compiled artifact only
  generation_seed: int                # frozen at generation time
  prompt_template_hash?: string       # model+template version (see identity consistency)

entity: mob_pool                      # shared portrait pool for tier=mob
  pool_slug: string
  asset_set_slug                      # owns one asset_set with looks
```

**Identity vs URL (brief §3 Q5):** asset identity is `(owner_type, owner_slug, look_slug, variant_slug)` — or equivalently the `asset_set_slug` (which is itself scoped by `(owner_type, owner_slug)`) plus `(look_slug, variant_slug)` — versioned by `content_hash` (`proposal.md: §5` idempotency by hash). `owner_type` is required because `owner_slug` alone is ambiguous across types (a `character` and a `mob_pool` can share a slug). Regenerating yields new `url`+`hash` under same identity; old scene revisions keep old URL, new revisions point at new hash — immutability without identity loss. "Current" means the edge from the active revision pointer (`plan-graph-in-postgres.md: §9.3`) to that hash.

**Derived edges:**

| edge_kind | from | to | attrs |
|---|---|---|---|
| `has_look` | `character/location/scene` | `look` | `{look_slug}` |
| `look_requires_flag` | `look` | `flag` | discrete gating condition |
| `variant_of` | `look` | `AssetVariant` | `{variant_slug, kind}` |
| `character_uses_pool` | `character` (tier=mob) | `mob_pool` | — |
| `scene_selects_look` | `scene` | `look` | `{priority}` |

**Direct answers to §3 questions:**

1. **Sparse, not product.** Full `look × expression` product is un-authorable at solo scale. Fallback chain is explicit and ordered — degrade **expression first, then look**:
   ```
   (injured, angry) → (injured, neutral/default) → (base, angry) → (base, default)
   ```
   Rationale: `look` encodes narrative state (injury, night) legible at distance; `expression` encodes emotion legible up close. Losing state is more jarring than losing emotion. Each degradation step emits an `asset_fallback` signal (R10). Mirrors `resolvePortraitUrl.ts:36-51` (expression exact match → untagged default) and `resolveBackgroundUrl.ts:81-116` (hint chain → untagged default).

2. **Lazy trigger — pending publication state:** a scene that `requires_flag='is_injured'` and references `look='injured'` via `scene_selects_look` enqueues a derived `asset_need` row. Compilation distinguishes required vs optional pending: a **required** look that is still `pending_asset` (its `base/default` or any variant reachable without a fallback, per tier thresholds in Failure modes) **fails compilation** — no artifact is published and the revision pointer is not flipped; the plan stays unapproved until the asset is generated. An **optional** variant (e.g. an extra expression where `neutral` already exists) may ship as `pending_asset` — compile emits the marker in the artifact manifest, the artifact publishes with its deterministic fallback (`resolvePortraitUrl` degradation chain) and an `asset_fallback` signal, and a background generation job (LLM img2img with frozen `seed`) fills it later without blocking the revision flip. See tier thresholds under Failure modes for which absences are required vs optional.

3. **Seed is durable identity** stored on `character.seed` and `look.generation_seed` per variant. `prompt_template_hash` (model + template version) is versioned alongside — changing either bumps the hash, pipeline re-renders with same seed then runs a perceptual diff; mismatch → human review, not silent drift. Old hashes remain addressable (immutability).

4. **Shared without lying:** `mob_pool` owns the `asset_set`; `character(tier=mob)` has edge `character_uses_pool` to the pool. No `portrait_urls` on the character row. Registry query `WHERE owner_type='mob_pool'` never claims per-character ownership (fixes `AssetPublishService.ts:163` single-`dev`-label + `AssetNeedsService.ts:57` one-need-per-character drift, `lessons: §2.4`).

5. **Immutability:** answered above — composite key is identity, `content_hash` is version, `active_revision` pointer flips atomically (`plan-graph-in-postgres.md: §9.3`).

6. **What fails build (R10):** `named`: `base` look + `default` variant = **error** if missing; any additional look referenced by a scene/flag = **error** if its default missing; extra expressions = **warning**. `cameo`: `base/default` = error. `mob`: pool's `base/default` = error; per-character assets = error (must use pool). Unreferenced looks = warning (dead asset).

7. **Locations unify — yes.** Location looks use `variant.kind='environment'` (`night`,`rain`,`sunset` per `docs/ASSET_EXPRESSION_VOCABULARY.md:83`), resolved via `buildBackgroundHints:157` + `resolveBackgroundUrl:81`. Character looks add `kind='expression'` on top. Same `look` table, same `has_look` edge, same fallback chain (without expression step).

8. **Weather is both.** Scene exclusive property (`proposal.md: §2.3` inherit-with-override — scene may override district default as authored intent) **and** asset-selection hint. Resolved `weather` feeds `buildBackgroundHints(weather, timeOfDay, mood):161` which produces an ordered hint chain tried against `background_urls[].variant` (`client/src/utils/resolvePortraitUrl.ts:72-109`). Weather is the strongest hint by construction (`AGENTS.md:36`).

#### Lifecycle — authored vs derived vs async

| Phase | Authored directly (plan delta) | Derived at compile | Generated async (images) |
|---|---|---|---|
| **Plan** | `ADD/MODIFY` on `character(seed,tier)`, `look(look_slug, condition_flag)`, `mob_pool`, `scene` with `scene_selects_look`. | Validate vocabulary (`expression` ∈ `ASSET_EXPRESSION_VOCABULARY.md:18`, `variant` ∈ allowed set), reference checks. Project `entity_edges`; emit content-addressed artifacts to CDN (`proposal.md: §5`); emit manifest `{look, variant, content_hash, url, pending}`. | Nothing — plan holds `pending_asset` markers, not images. |
| **Compile** | — | Emit `asset_need` rows for any `look.variant_slug` with no `content_hash` yet. Fail build per tier thresholds above. | Enqueue generation jobs for `pending` variants; jobs write to `asset_set` with new `content_hash`+`url`, never overwriting identity. Old revisions unaffected. |
| **Runtime** | — | — | Resolver: `selectLook(scene, flags)` → `resolveVariant(look, expressionHint)` via explicit fallback chain (`resolvePortraitUrl.ts:36-51` / `resolveBackgroundUrl.ts:81-116`); emits `asset_fallback` signal if degraded. Deterministic selection, no LLM. |

**One writer per fact (R9):** image bytes are written once by the generation job, `content_hash` stored once on `AssetVariant`, CDN URL derived from hash; `character.portrait_urls` in the artifact is a **derived read model** rebuilt from the `look` table, never hand-edited — eliminating the `AssetPublishService.ts:163` single-`dev`-label bug that produced the three-registry drift.

#### Failure modes

**Impossible by construction:** per-character portrait list drift (no `portrait_urls` column on canonical entity); `mob` claiming unique asset ownership (FK forces pool indirection); silent fallback (fallback chain is explicit and signalled; compile already errored on missing `base/default`).

**Caught at compile (fail build):** missing `base/default` for tier that requires it; missing look referenced by scene/flag; unknown expression/environment vocabulary; orphan flag for `look_requires_flag`; missing `seed` for `named` (needed for img2img identity).

**Warning (not error):** missing optional expression variant (`angry` absent but `neutral` present) — artifact ships with `pending` marker, client falls back deterministically.

#### Build first / defer (solo-dev cost dominates)

**Build first — weeks, not months:** (1) add `seed` to `character`, create `look`+`AssetVariant` tables with just `base/default` for the 10 currently expression-capable characters; migrate current `portrait_urls[].default` into `look(base)/variant(default)` — one writer, derived read model. (2) Wire `resolvePortraitUrl.ts:15` fallback chain to read from new artifact shape (already supports `expression` tag; just feed it correctly). (3) Introduce `mob_pool` with one shared `asset_set` serving all `tier=mob` characters via `character_uses_pool` — immediately fixes "190 assets but 10 characters exposed" (`lessons: §2.4`). (4) Unify scene `background_urls` under same `look` table — reuse `resolveBackgroundUrl:81` + `buildBackgroundHints:157` as-is.

**Defer:** lazy generation pipeline and `pending_asset` markers (ship with hand-picked base assets first); `injured`/`market_day` flag-gated looks (add when first scene needs them); expression img2img derivation with frozen seed (generate manually until volume justifies it); perceptual diff on model change.

#### What the brief gets wrong (§3)

- The `look × expression` hypothesis is directionally correct but leaves fallback ordering unjustified. The ordering **must be** expression-first (above) because narrative state outranks emotion visually — this is a principled tie-breaker, not arbitrary.
- Q3 (seed as identity) implies seed alone suffices. It does not — `prompt_template_hash` + model version must be versioned alongside seed, or regeneration diverges silently. Seed is necessary, not sufficient.
- Q6's "fail build on missing baseline" is right but incomplete without tier-specific thresholds; failing a `mob` for missing expressions would be waste — thresholds must be tier-aware.
- Adding `look_hint` on activity without wiring `selectLook` violates R7 (no field without reader) — defer it until the reader exists.

---

### 6.3 Cross-cutting datastore sketch (feeds D1 design)

```sql
-- plan_deltas already covers entity lifecycle (plan-graph-in-postgres.md:64-73)
-- new entity types to add to plan_deltas.entity_type enum:
--   'activity_def' | 'look' | 'mob_pool' | 'asset_set'
-- RoleSlot.activity_slug lives inside scene.payload JSONB, not as a separate delta.

-- derived edge kinds to add (all via projection, indexed):
-- 'scene_requires_activity' | 'activity_sets_flag' | 'activity_requires_flag'
-- 'has_look' | 'look_requires_flag' | 'character_uses_pool' | 'scene_selects_look'
-- 'scene_casts_character' | 'variant_of'
```

Both subsystems satisfy all seven constraints in §4: compile-time LLM only (§4.1), discrete-flag gating (§4.2), one writer per fact (§4.3), explicit signalled fallbacks (§4.4), named readers (§4.5), incremental strict subsets with no rework (§4.6), and small-volume ergonomics (§4.7).

### 6.4 References

- `proposal.md` — scene as unit, base+overlay composition, flag/stat contract, character tiers
- `plan-graph-in-postgres.md` — `plan_deltas`, `entity_edges`, overlay view, tier-3 checks
- `lessons-from-current-code.md` — one writer per fact (R9), fail at compile (R10), named reader (R7)
- `client/src/utils/resolvePortraitUrl.ts:15-169` — `resolvePortraitUrl` / `resolveBackgroundUrl` / `buildBackgroundHints`
- `docs/ASSET_EXPRESSION_VOCABULARY.md:1-226` — expression & environment variant conventions
- `server/src/services/AssetPublishService.ts:163-170` — single-`dev`-label overwrite bug
- `server/src/services/AssetNeedsService.ts:55-82` — one-need-per-character bug
- `AGENTS.md:36` — `variant`/`expression` tag + `resolveBackgroundUrl` precedence

