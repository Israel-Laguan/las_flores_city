# Relationship Branch Blueprint — Analysis & Build Plan

> Source blueprint: `~/.gemini/antigravity-cli/brain/.../relationship_blueprint.md`
> Generated artifacts: `content/characters/adeyemi_ogunbiyi/`, `content/dialogues/adeyemi_relationship/`, `content/characters/petra_solis/`
> Scope: assess how the generated files correspond to the blueprint idea, how to improve them, and applicability to other characters.

---

## Part 1 — Analysis

### TL;DR

The blueprint proposes a **paradigm shift**: replace "relationship as a number" with an **encounter stack** whose *computed* state drives earned endings. The generated files implement the blueprint's **narrative structure faithfully** (5 acts, 6 dimensions, ambiguous first contact, world event, bilateral disclosure, action-based pressure point, earned resolution, anti-pattern-aware writing) — the writing is genuinely good. But they implement **almost none of its architectural thesis**: state is still stored as additive `stat_set` numbers (the exact pattern the blueprint critiques), the encounter stack doesn't exist as data, the six dimensions are tracked but barely drive outcomes, and the dimension/ending metadata is **inert** (zero engine consumers). On top of that, there are **systemic mechanical bugs** that make 6 of 9 dialogue files unreachable and the Act 5 climax fully ungated. Net: a strong *writing* vertical slice bolted onto a *non-functional* mechanical layer.

### 1.1 What the blueprint proposes

- **Encounter stack** (ordered moments) → relationship state **computed, not stored**; "you can't undo history."
- **6 dimensions** (Trust, Familiarity, Alignment, Tension, Debt, Visibility), -3..+3, not good/bad axes.
- **5 Acts** (First Contact → World Event → Voluntary Disclosure → Pressure Point → Resolution).
- **6 archetypal endings**, earned not chosen, "determined entirely by encounter stack."
- **3 rules**: NPC has business beyond the player; missed encounters are data (decay); cost of intimacy (cross-character friction).
- A YAML architecture with `encounter_stack`, `dimension_deltas`, `derived_state.archetype`.


### 1.2 What was generated (file inventory)

| File | Act | Purpose |
|---|---|---|
| `content/characters/adeyemi_ogunbiyi/char_adeyemi_ogunbiyi.yaml` | — | Adds `metadata.relationship_dimensions` (6, -100..100) + `metadata.relationship_endings` (8) |
| `content/characters/petra_solis/char_petra_solis.yaml` | — | New NPC (Solis) referenced by Act 4; flat, no relationship system |
| `dialogues/adeyemi_relationship/dialogue_adeyemi_act1_apartment_visit.yaml` | 1 | First contact |
| `…act2_diego_arrest.yaml` | 2 | World event |
| `…act3_phone_call.yaml` | 3 | Disclosure (32 KB — the big one) |
| `…act3_5_receipt.yaml` | 3.5 | Micro-beat, sets `ANSWERED` |
| `…act4_pressure_point.yaml` | 4 | "The Crane," sets `COVERED/WITNESSED/DEFLECTED` |
| `…act4_5_f.yaml` | 4.5 | Friend path, sets `DEEPENED/FRIEND_PATH_ACTIVE` |
| `…act4_5_l.yaml` | 4.5 | Lover path, sets `LOVER_PATH_ACTIVE/ROMANTIC_TENSION_CONFIRMED` |
| `…act5_resolution.yaml` | 5 | Branches to 8 endings |
| `…adeyemi_nm08.yaml` | NM | "Normal moment" (vending machine) |

`npm run validate:content` → **exit 0** (all files pass schema validation).

### 1.3 Where it matches the blueprint (narrative fidelity: HIGH)

- ✅ 5-act structure implemented; Act 1 is genuinely underdetermined (approach/observe/refuse → records *style*, not "correct" choice).
- ✅ Act 2 is a world event the player can't control (Diego arrest); player only chooses response — matches "highest-weight moment."
- ✅ Act 3 is bilateral disclosure (Daniel), gated on Familiarity+Trust, reciprocation is risky/irreversible.

### 1.4 Where it diverges (architectural fidelity: LOW)

- ❌ **Core thesis not implemented.** State is stored via `stat_set` (additive `mergeStats`), not computed from an encounter stack. Every file does `effects.stat_set: adeyemi_trust: N` — the precise pattern the blueprint replaces. `encounter_stack`/`derived_state` have **zero** engine consumers (grep of `server/src`+`shared/src` → empty). `adeyemi_encounter_stack_phone_call: true` is just a boolean flag *named* "stack."
- ❌ **Dimensions barely drive outcomes.** Blueprint: Act 5 "determined entirely by encounter stack." Reality: Act 5 branches on 3 binary Act-4 flags + path flags, with exactly **one** stat gate (`adeyemi_trust: "gte:60"` for Mirror, act5:57). The accumulated Act 1–3 dimension history has almost no "long shadow."
- ❌ **6 endings (blueprint) → 8 (generated).** Added `friend` and `lover` warm endings, which brush against two blueprint anti-patterns: "the clean ending" and "relationship inflation."
- ❌ **Scale drift:** -3..+3 (blueprint) vs -100..100 (generated). Internally consistent, but a documented spec drift.

### 1.5 Engine-reality check (what's inert vs. broken)

The engine contract (from `shared/src/schemas/dialogue.ts`, `shared/src/conditions.ts`, `server/src/routes/dialogue-helpers.ts`):

- Three player-state channels: `flags` (boolean, overwrite, presence-check), `state` (categorical string, overwrite, `===`), `stats` (number, **additive** `mergeStats = coalesce(existing,0)+delta`, `op:number` compare like `"gt:50"`).
- Gating: `required_flags`/`hidden_if` (Record), `required_state`/`hidden_if_state` (Record), `required_stats`/`hidden_if_stats` (Record of `"op:number"`).
- `metadataConditionsPass` evaluates tree-level `metadata.required_*` at `resolveDialogueTree` time.
- `choicePassesFilters` evaluates choice-level gates. It reads `choice.required_*` directly — **never** `choice.conditions`.
- `DialogueChoiceSchema` is a plain `z.object` (no `.strict()`), so **unknown keys are stripped**. Only `EffectsSchema` is `.strict()`.

#### Inert — passes validation, does nothing

- **`metadata.relationship_dimensions` / `metadata.relationship_endings` have no engine consumers** (grep empty). Consequences:
  - Initial values (`adeyemi_trust: -20`) are **never applied** — `mergeStats` coalesces to 0, so Adeyemi starts at zero like everyone, not wary.
  - Ending thresholds (`adeyemi_trust: ">= 70"`) are **never evaluated** — documentation only.
- **Ending-threshold syntax is wrong for the engine.** Char YAML uses `">= 70"` / `"<= 50"`; the engine's `NumericComparisonSchema` requires `"gte:70"` / `"lte:50"`. Would fail-closed if ever fed to the evaluator. (Contrast: Act 3/5 dialogues correctly use `"gte:25"`/`"gte:60"`.)
- **`flags_required: ["ANSWERED"]`** (char YAML, list form) — engine wants `required_flags: Record<string,boolean>`. Wrong shape + inert.
- **`stat_set` is additive & unbounded** — nothing clamps to the declared -100..100; a single `-50` (act4:86) plus accumulations can drift out of range.

#### Broken — runtime defects

| # | Bug | Evidence | Effect |
|---|---|---|---|
| **B1** | Tree-level `metadata.required_flags` written as a **YAML list**, but `metadataConditionsPass`→`requiredPasses` expects `Record<string,boolean>`. `Object.entries(["x"])`→`[["0","x"]]`→checks `player.flags["0"]`→always `false`→**fail-closed**. | `act3:734`, `act3_5:76`, `act4:124`, `act4_5_f:98`, `act4_5_l:101`, `act5:178` | **Acts 3, 3.5, 4, 4.5-F, 4.5-L, 5 are unreachable** (6 of 9 files). The blueprint's "write-this-first" Act 3 and the entire climax can never resolve for any player. |
| **B2** | Act 5 ending-branch choices wrap gates in `conditions:`, but `DialogueChoiceSchema` has **no `conditions` field** and (no `.strict()`) **strips unknown keys**. `filterChoices`→`choicePassesFilters` reads `choice.required_flags` directly, never `choice.conditions`. | `act5:16,22,28,42,49,55,112,149` | All 8 ending branches are **ungated** → player sees every ending as a simultaneous menu. "Earned, not chosen" is fully broken at the climax. |
| **B3** | `adeyemi_publicly_denounced` referenced in Act 3 `hidden_if` (also list-form) but **never set anywhere**; Act 2 has no "public statement / publicly sided against" branch the blueprint specifies. | `act3:740`; Act 2 branches set only `adeyemi_helped_reyes` | The "hidden if publicly denounced" gate has no source; the blueprint's highest-weight Act-2 option is missing. |
| **B4** | Dialogues are **orphaned** — dialogue UUIDs appear only in their own files; none is listed in any scene's `available_dialogues` or the character's `available_dialogues`. | grep for the 9 UUIDs → only self-references | Even with B1/B2 fixed, `resolveDialogueTree` never surfaces them. |
| **B5** | Act 1 sets `story_beat: act1_adeyemi_first_contact`; Act 5 sets 8 `act5_adeyemi_*_ending` beats — **none registered** in `content/story_beats.yaml`, and there's **no beat-registry validation**. | `act1:197`; `act5:70,80,90,100,127,137,164,174` | Player's global beat cursor moves to unregistered values; any other content gated on real beats (e.g. `act1_first_contact`) can stop matching. |
| **B6** | **No `time_block_cost`** on any choice in any of the 9 files. | grep `time_block_cost` → empty | Relationship scenes are "free," removing the mechanical teeth from Rule 3 (cost of intimacy): no budget tradeoff vs. other characters. |

#### Expected gaps (blueprint itself lists these as "to build")

- No **decay model** (Rule 2).
- No **cross-character friction** (Rule 3) — Adeyemi's flags/stats aren't wired to any other character's gates.

### 1.6 Applicability to other characters

- **The narrative template is reusable** (the blueprint is explicitly "a reusable design system"): 5 acts, 6 dimensions, 6 endings, and the anti-patterns checklist work as a writing guide for any NPC. Petra Solis (currently a flat antagonist) and Aisha (the blueprint's named retrofit target — "needs Acts 2-5") are natural next candidates.
- **The mechanical system is NOT reusable as-is**:
  - `relationship_dimensions`/`relationship_endings` are inert, so copying the char-YAML pattern to another character just adds more inert metadata.
  - The Adeyemi dialogues are hardcoded to Adeyemi-specific flags (`ANSWERED/COVERED/WITNESSED`). Per-character flag namespaces don't scale and reintroduce "relationship as flags."
  - No generic relationship-state derivation exists in the engine.
- **Recommended path**: (1) fix the P0 bugs so Adeyemi works end-to-end as a vertical slice; (2) wire dimensions into Act 5 via `required_stats` so the thesis is realized **without new engine code**; (3) *then* extract the reusable scaffold and apply to Aisha/Petra as a generality test. Only build the generic engine layer (encounter stack + decay + cross-character friction) once 2–3 characters validate the template.
- ✅ Act 4 is an **action**, not dialogue (step toward Adeyemi/Solis/stay still) — matches the blueprint's explicit design rule.
- ✅ Act 5 offers no direct "pick your ending" — it's meant to be derived.
- ✅ Six dimensions named exactly per the blueprint.


---

## Part 2 — Brainstorm: Completing the Feature

This part is a build plan / brainstorm for taking the current (non-functional) vertical slice to a complete, reusable relationship system. It is organized as: goals, design decisions to resolve (with options), a phased implementation roadmap, a reusable template scaffold, a testing strategy, and open questions.

### 2.1 Goals & non-goals

**Goals**
1. Make the Adeyemi relationship arc **actually runnable** end-to-end (Act 1 → Act 5 → an earned ending).
2. Realize the blueprint's thesis — **the ending emerges from accumulated dimension history, not a binary Act-4 flag** — using existing engine machinery where possible.
3. Give the three design rules **mechanical teeth**: Rule 2 (decay) and Rule 3 (cross-character friction), not just narrative gestures.
4. Extract a **reusable template** so the pattern can port to Aisha, Petra, and others without re-deriving per character.

**Non-goals (for now)**
- Full "encounter stack as a derived data structure" with a dedicated table and a derivation engine. This is the blueprint's ideal end-state, but it's a large build; we first prove the thesis with `required_stats` gates (no schema/engine changes), then escalate to a real stack only if the lighter approach is insufficient.
- Per-NPC scheduling ("the waiting NPC" anti-pattern). Act 2's world-event-on-schedule is a step, but a full NPC-schedule system is out of scope.
- Voice/audio or portrait/emotion assets for the new beats.

### 2.2 Design decisions to resolve

#### Decision A — How is relationship state represented?

- **Option A1 (ship-now, no engine change):** keep the 6 dimensions as **player `stats`** (`adeyemi_trust`, `adeyemi_familiarity`, …), accumulated via `stat_set`. Endings are gated by `required_stats` thresholds on Act-5 choices. Initial baselines emitted from a one-time Act-1 effect. This realizes "state computed from history" *approximately* (history → accumulated stats → ending) without a new table.
- **Option A2 (blueprint-faithful, larger build):** a real **encounter stack** — a new `player_encounters` table (or a JSONB array column on `player_dialogue_states`) appending typed encounter records, with a `deriveRelationshipState()` function that walks the stack to compute dimensions + archetype. This is the blueprint's literal proposal.
- **Recommendation:** Start with **A1** (proves the thesis, zero schema risk). Design A2 as a *future* migration: the `required_stats` thresholds in A1 become the *output contract* that `deriveRelationshipState()` must satisfy, so A2 is a drop-in replacement later. Do **not** build A2 until 2–3 characters validate that A1's gating feels right.

#### Decision B — Scale: -3..+3 vs -100..100

- The blueprint says -3..+3; the generated files use -100..100.
- **Recommendation:** keep **-100..100** (finer granularity for accumulation; the deltas +5/+12/-50 need headroom). Update the blueprint's dimension table to match and **clamp** in the engine: extend `mergeStats` (or a thin wrapper) to clamp relationship-*prefixed* stats to [-100, 100]. Add a `relationship_stat_prefix` convention (e.g. `<slug>_trust`) so the clamp is opt-in and doesn't affect other stats.

#### Decision C — 6 vs 8 endings

- Blueprint: 6 archetypes (Ally of Cost, Opponent, Failed Friend, Failed Lover, Distant Presence, Mirror).
- Generated: 8 (added `friend`, `lover` as warm endings).

### 2.3 Implementation roadmap (phased)

Each phase is independently shippable and ends with a runnable, tested increment. "Verified" = the AGENTS.md verification checklist for the touched layer.

#### Phase 0 — Make the arc runnable (fix the bugs)

Goal: Acts 1–5 resolve and branch for real players. **No engine/schema changes.**

1. **B1 fix:** convert all tree-level `metadata.required_flags` (list) → record form in `act3`, `act3_5`, `act4`, `act4_5_f`, `act4_5_l`, `act5`. Same for `metadata.hidden_if` in `act3`.
   ```yaml
   # before (broken — list)
   metadata:
     required_flags:
       - adeyemi_first_contact_made
   # after (record — works)
   metadata:
     required_flags:
       adeyemi_first_contact_made: true
   ```
2. **B2 fix:** in `act5_resolution`, move each ending-branch choice's `conditions:` block to direct schema-supported gates on the choice:
   ```yaml
   # before (stripped — conditions is not a DialogueChoice field)
   - id: covered_lover
     conditions:
       required_flags:
         LOVER_PATH_ACTIVE: true
   # after (read by choicePassesFilters)
   - id: covered_lover
     required_flags:
       LOVER_PATH_ACTIVE: true
       ROMANTIC_TENSION_CONFIRMED: true
   ```
3. **B3 fix:** add the missing Act-2 "make public statement" branch that sets `adeyemi_publicly_denounced: true` (the blueprint's highest-weight option). This makes Act-3's `hidden_if` live.
4. **B4 fix:** wire dialogues to scenes/`available_dialogues`. Proposed mapping: Act 1 → `the_apartment`; Act 2 → the protest scene (create or reuse); Act 3/3.5 → player-phone system trigger; Act 4/4.5 → `industrial` (crane yard); Act 5 → `vega_estate` (new scene) or a finale scene. Alternatively attach to Adeyemi's `available_dialogues`.
5. **B5 fix:** register `act1_adeyemi_first_contact` + the 8 `act5_adeyemi_*_ending` beats in `content/story_beats.yaml` (with `order` values that don't collide), **or** stop overwriting the global `story_beat` and use character-scoped `state_set` (e.g. `adeyemi_act: "1_done"`) so global progression is preserved. Prefer the `state_set` approach — relationship progress is character-local, not global.
6. **B6 fix:** add `time_block_cost: { amount: 1, description: "…" }` to relationship choices (Act 1–4; keep NM-08 free as a "normal moment"). This gives Rule 3 a budget lever.

**Verify:** `npm run validate:content`; rebuild server (`docker compose build server && docker compose up -d server`); health check (`docker exec las-flores-server wget -qO- http://localhost:3000/health`); an integration test that walks Act 1 → Act 3 (previously unreachable) and observes the gate passing.

#### Phase 1 — Realize the thesis with existing machinery (no engine change)

Goal: the ending is earned from accumulated dimensions, not a binary Act-4 flag.

7. **Apply initial baselines:** add a one-time effect at Act-1 start emitting the wary baseline (`adeyemi_trust: -20`, `adeyemi_alignment: -40`, `adeyemi_tension: 30`). Because Act 1 fires once, the additive baseline lands once.
8. **Drive Act 5 from dimensions:** replace/augment Act-5 flag gates with `required_stats` thresholds lifted from the char-YAML ending definitions (now in correct `op:number` grammar):
   ```yaml
   - id: covered_friend
     required_stats:
       adeyemi_trust: "gte:70"
       adeyemi_familiarity: "gte:75"
       adeyemi_alignment: "gte:65"
     required_flags:
       FRIEND_PATH_ACTIVE: true   # secondary: still requires the path was opened
   ```
   This makes Acts 1–3's dimension deltas carry a "long shadow" into Act 5. Keep path flags as a *necessary* secondary gate, but the dimension thresholds become the *primary* determinant — exactly the blueprint's intent.
9. **Fix char-YAML syntax** so it becomes the source of truth: `">= 70"`→`"gte:70"`, `"<= 50"`→`"lte:50"`, `flags_required: [...]`→`required_flags: { ... }`. Now matches the grammar and can be copy-pasted into dialogue gates.

**Verify:** integration test: two playthroughs (one min-maxes trust via cautious/honest choices; one antagonizes) reach **different** Act-5 endings from the same Act-4 flag. Property test: for each ending, there exists a dimension-vector satisfying its thresholds *and* a vector that doesn't.


#### Phase 3 — Reusable template + port

Goal: the pattern generalizes.

13. **Extract `docs/relationship_template.md`** (the scaffold in §2.4) capturing: the 5-act beat sheet, the 6 dimensions + threshold grammar, the ending→dimension mapping, the friction convention, and the per-character naming convention (`<slug>_<dimension>`).
14. **Port to Aisha** (blueprint's named retrofit): design Acts 2–5 for Aisha (currently a single-encounter tree), using the same `<slug>_*` stat namespace and `required_stats` gating. This is the generality test.
15. **Port to Petra Solis** (new antagonist): 5-act structure where the "disclosure" is her corruption reveal.
16. **Evaluate A2 (real encounter stack):** after 3 characters, decide whether `required_stats` gating is sufficient or whether a `player_encounters` table + `deriveRelationshipState()` is warranted. If A2 is built, the `required_stats` thresholds become its output contract (drop-in replacement).

**Verify:** per-character integration tests; a generality checklist (each character's arc has all 5 acts, 6 dimensions tracked, ≥1 friction pair, decay-resilient gates).

### 2.4 Reusable template scaffold (`docs/relationship_template.md`)

This is the scaffold Phase 3 extracts. It is character-agnostic; `<slug>` and `<Slug>` are placeholders.

**Naming convention:** all relationship state for a character is namespaced `<slug>_<dimension>` (e.g. `adeyemi_trust`, `aisha_familiarity`). This avoids collisions and makes clamping/decay workers trivially character-agnostic.

**The 5-act beat sheet (each character defines all 5; some may be observed, not dialogue):**

| Act | Beat | What the player chooses | What's recorded |
|---|---|---|---|
| 1 | First Contact (ambiguous) | approach style (cautious/direct/warm/deflecting) | `<slug>_first_contact_made` flag + approach-style state + baseline dimensions |
| 2 | World Event (unavoidable) | response to an NPC action the player didn't control | highest-weight dimension deltas + any "public stance" friction flags |
| 3 | Voluntary Disclosure (bilateral) | receive/reciprocate/use information | `<slug>_<topic>_revealed` flag + familiarity/tension deltas; gated on `<slug>_familiarity: "gte:N"` |
| 3.5 | Micro-beat (optional) | small normal moment | path-opening flag (e.g. `ANSWERED`/`DEEPENED`) — keeps the thread alive for decay |
| 4 | Pressure Point (action) | a *world action*, not a dialogue line | the 3-way branch flag (`COVERED`/`WITNESSED`/`DEFLECTED`) + large dimension deltas |
| 4.5 | Path deepening (optional) | intimacy vs. distance | path flag (`<SLUG>_PATH_ACTIVE`) + romantic/friendship tension flag |
| 5 | Resolution (earned) | nothing — the ending emerges | `story_beat: <slug>_<ending>_ending` (character-scoped) |

**The 6 dimensions + ending→threshold map (lift thresholds into Act-5 `required_stats`):**

```yaml
# In the character's char_<slug>.yaml metadata (source of truth; op:number grammar):
relationship_dimensions:        # initial baseline (applied once at Act 1)
  <slug>_trust: <int>            # -100..100
  <slug>_familiarity: <int>
  <slug>_alignment: <int>
  <slug>_tension: <int>          # 0..100
  <slug>_debt: <int>             # -100..100
  <slug>_visibility: <int>       # 0..100
relationship_endings:
  ally_of_cost:                  # = "reluctant_ally"
    required_stats: { <slug>_trust: "gte:50" }
    required_flags: { ANSWERED: true }
  opponent:
    required_stats: { <slug>_alignment: "lte:30", <slug>_tension: "gte:70" }
  failed_friend:
    required_stats: { <slug>_trust: "gte:40", <slug>_familiarity: "gte:60", <slug>_tension: "gte:50" }
  failed_lover:
    required_stats: { <slug>_trust: "gte:60", <slug>_familiarity: "gte:70", <slug>_tension: "gte:65" }
  distant_presence:              # = "always_distant"
    required_stats: { <slug>_trust: "lte:50", <slug>_familiarity: "lte:50" }
  the_mirror:
    required_stats: { <slug>_trust: "gte:60", <slug>_familiarity: "gte:65", <slug>_alignment: "gte:40", <slug>_tension: "gte:50" }
  # aspirational (hard to reach — high thresholds + path flag)
  friend:
    required_stats: { <slug>_trust: "gte:70", <slug>_familiarity: "gte:75", <slug>_alignment: "gte:65" }
    required_flags: { FRIEND_PATH_ACTIVE: true }
  lover:
    required_stats: { <slug>_trust: "gte:75", <slug>_familiarity: "gte:80", <slug>_alignment: "gte:60" }
    required_flags: { LOVER_PATH_ACTIVE: true, ROMANTIC_TENSION_CONFIRMED: true }
```

**Friction convention:** a choice on character B may carry `hidden_if: { <slugA>_<frictionFlag>: true }`. Friction flags are set by high-stakes choices on character A. Document each friction pair in the character's lore file.

**Decay convention:** every encounter's end-node effect updates `last_<slug>_encounter_at` (a `state` timestamp). The decay worker reads this to compute elapsed days.

### 2.5 Testing strategy

Aligned to AGENTS.md test-isolation rules (dedicated UUIDs, `--runInBand` for integration, mock `database/redis.js` in unit tests).

- **Unit (conditions):** extend `server/tests/unit/conditions.unit.test.ts` with cases for list-vs-record `required_flags` (the B1 regression) and `required_stats` `gte/lte` thresholds. Pure, no DB.
- **Unit (decay):** `RelationshipDecayWorker` unit test with a mocked clock — advance N days, assert drift + floor. Mock `database/redis.js` if it transitively touches cache.
- **Property (endings):** for each ending, assert (a) a dimension-vector exists that satisfies its `required_stats` and (b) a vector exists that doesn't — so no ending is unreachable or trivially reachable. Use `fast-check` like the existing `conditions.unit.test.ts`.
- **Integration (arc walk):** `server/tests/integration/adeyemi_arc.test.ts` — a dedicated test user (private UUID, cleaned up in `afterAll`) that walks Act 1 → Act 5 twice (trust-max vs. antagonize) and asserts **different** endings from the same Act-4 flag. Run with `npm run test:integration -- tests/integration/adeyemi_arc.test.ts` (`--runInBand`). Use real Postgres (the `stats`/`flags`/`state` channels) but mock Redis where the route touches cache.
- **Content:** `npm run validate:content` after every YAML edit (catches schema regressions; note it does NOT catch the list-form/runtime bugs — that's why the unit tests above exist).

### 2.6 Risk & rollback

- **Lowest risk:** Phase 0 (pure YAML edits; `validate:content` + rebuild). Fully revertible via git.
- **Medium risk:** Phase 1 step 8 changes Act-5 gating semantics — a playthrough that previously "saw all endings" (B2) will now see only the earned one. This is the intended behavior but changes observable output. Gate behind the existing test user.
- **Higher risk:** Phase 2 worker (new background process) and stat clamping (changes `mergeStats` behavior for relationship-prefixed stats). Clamp must be opt-in (prefix-based) to avoid perturbing non-relationship stats. Ship behind a feature flag if uncertain.
- **Rollback:** each phase is a separate commit; revert the commit to roll back. The `required_stats` thresholds in Phase 1 are the contract that Phase 3's A2 must satisfy, so reverting Phase 2/3 never strand Phase 1.

### 2.7 Open questions

1. **Should Act-2 world events fire on schedule (Rule 1) or on player visit?** The blueprint says "fire on schedule, not in response to player actions." This needs a world-event scheduler — is that in scope, or do we accept "player-visited" triggers for now? (Recommendation: player-visited for Phase 0–1; scheduled for Phase 2 alongside the decay worker — both are background timers.)
2. **Where do relationship dialogues attach — scene `available_dialogues` or character `available_dialogues`?** Scene-attachment ties a beat to a place (good for Act 1/4/5); character-attachment makes the phone-call beats (Act 3/3.5) reachable anywhere. Likely a **mix**: place-bound acts on scenes, phone acts on the character. Confirm `resolveDialogueTree` honors character-level `available_dialogues` (it has a fallback path by speaker — verify).
3. **Does `story_beat` need beat-registry validation?** B5 shows unregistered beats are silently accepted. Should we add validation (reject unknown `story_beat` writes against `content/story_beats.yaml`)? This would prevent the B5 class of bug generally, not just for Adeyemi. (Recommendation: yes, as a separate hardening task — it protects the whole story-progression system.)
4. **Is the -100..100 clamp worth the `mergeStats` change?** Alternative: clamp at write time in the dialogue route (after `mergeStats`) for relationship-prefixed keys only, leaving `mergeStats` untouched. Lower blast radius.
5. **Should the aspirational `friend`/`lover` endings require the decay worker to *not* have triggered?** I.e., you can't reach `friend` if you neglected Adeyemi for 2 weeks (trust decayed below threshold). This would make Rule 2 load-bearing for endings — a strong design choice but adds worker dependency to gating.

---

## Appendix — Evidence index

- Blueprint: `~/.gemini/antigravity-cli/brain/fd0a6a54-fee9-4b9c-a318-6bf0f0c41a59/relationship_blueprint.md`
- Generated char YAML: `content/characters/adeyemi_ogunbiyi/char_adeyemi_ogunbiyi.yaml` (lines 12–96: `relationship_dimensions`/`relationship_endings` under `metadata`)
- Generated dialogues: `content/dialogues/adeyemi_relationship/*.yaml` (9 files)
- Engine contract: `shared/src/schemas/dialogue.ts` (DialogueChoiceSchema L43–70, EffectsSchema `.strict()` L76–102, DialogueNodeSchema `conditions` L115), `shared/src/schemas/yaml-content.ts` (metadata `z.record(string,any)`), `shared/src/conditions.ts` (`requiredPasses` L70–91 list→fail-closed, `metadataConditionsPass` L142–151), `server/src/routes/dialogue-helpers.ts` (`filterChoices`→`choicePassesFilters` L138–156, `metadataConditionsPass` L111/131)
- `relationship_dimensions`/`relationship_endings`/`encounter_stack`/`derived_state` consumers in `server/src`+`shared/src`: **none** (grep empty)

---

## Part 3 — Next Steps: Confirming the New System is Better

> Status as of the `3ec5ee8e feat: Implement Adeyemi relationship blueprint (Phases 1-5)` commit + staged changes. This part defines what "better" means and the concrete steps to confirm or reject the new system vs. the old single-stat model.

### 3.1 Implementation status (what landed)

The other chat executed the phases. Verified against the working tree:

**✅ Done**
- **Phase 0 bugs fixed:** B1 (tree-level `required_flags`/`hidden_if` now record form — `act3:748,753`); B2 (Act-5 choices use direct `required_flags`/`required_stats`, no `conditions:` wrapper — `act5:16,21,26,39,53,65,76...`); B4 (scenes wired — `the_apartment`, `industrial`, `central_plaza` modified); char-YAML grammar fixed (`"gte:70"` not `">= 70"`, `act5` uses 8 `required_stats` gates).
- **Phase 1 thesis:** Act 5 is now **stat-gated** — `required_stats` thresholds (e.g. `adeyemi_trust: "gte:70"`) drive the endings, not just Act-4 flags. `last_adeyemi_encounter_at: NOW` is emitted from Act 1, Act 3.5, Act 4.5-L, and every Act-5 ending — so the decay worker has an input source. `NOW` is resolved to an ISO timestamp in `dialogue-helpers.ts:258-264` before `mergeState`.
- **Phase 2 mechanical teeth:** `server/src/workers/RelationshipDecayWorker.ts` created and cron-scheduled in `server/src/index.ts:242`. `mergeStatsClamped` (prefix-based [-100,100] clamp) wired into the effect path (`dialogue-helpers.ts:269` → `PlayerStateRepository.write.ts:376-399`).
- **Phase 3:** `docs/relationship_template.md` created.

**❌ Not done / broken (must fix before any validation)**
- **Build is BROKEN.** `npm run build --workspace=server` fails: `dialogue-helpers.ts:267` TS2345 — the `NOW`-marker transform (`Object.fromEntries(...).map(...)`) widens the type to `{ [k:string]: unknown }`, which isn't assignable to `mergeState`'s `Record<string,string>`. **The server does not compile.** Nothing ships until this is fixed (type the map callback to return `string`, or cast).
- **Zero tests added.** No unit (decay/conditions), no property (endings), no integration (arc walk). The phases' "Verify" steps were skipped, so there is **no evidence the system works** — only that the YAML passes schema validation (which doesn't catch runtime defects, per §1.5).
- **Decay worker has a compounding-decay bug.** `RelationshipDecayWorker.processUserDecay` computes `daysElapsed` from the fixed `last_<slug>_encounter_at` (set only on encounter) and re-decays from the *current* (already-decayed) value each tick without updating the timestamp. So repeated cron ticks over-decay: day-1 (5 days since encounter) → -10; day-2 (6 days since encounter) → -22 from the already-decayed value. This is compounding, not linear. The blueprint's "floor = post-last-encounter value" (can't collapse below where the last encounter left it) is **not implemented** — stats decay toward -100/0 indefinitely. Fix: either update `last_<slug>_encounter_at` to "now" after each decay tick, or track a separate `last_<slug>_decay_at` and decay only the delta since the last tick.
- **Cross-character friction (Rule 3) not wired.** `adeyemi_publicly_defended`-style flags aren't set; no Evelyn (or other) choice carries the matching `hidden_if`. Rule 3 is still narrative-only.

### 3.2 What "better" means (success criteria)

The old system (e.g. `dialogue_aisha_al_sayed.yaml`): one encounter → `stat_set: aisha_relationship ±5` → a single number the player optimizes. The new system must beat it on **specific, falsifiable** axes:

| # | Criterion | Old system | New system target | How to measure |
|---|---|---|---|---|
| C1 | **Endings diverge from history, not one binary choice** | ending = last flag | ending = accumulated dimensions (Act 1–3 choices change Act 5) | Two playthroughs with the **same Act-4 choice** but different Act 1–3 behavior reach **different** endings |
| C2 | **No "relationship as a meter"** | player maxes one stat | 6 independent dimensions; high one axis ≠ high another | A playthrough can reach "failed friend" (high familiarity, low trust) — impossible with one stat |
| C3 | **Neglect has consequences (Rule 2)** | no effect | phone-call gate `adeyemi_familiarity: "gte:25"` fails after 7+ days of neglect | Advance the clock 7 days without contacting Adeyemi → Act 3 becomes unreachable until re-engaged |
| C4 | **Intimacy has a cost (Rule 3)** | none | going deep with Adeyemi closes an Evelyn path | Defend Adeyemi publicly → an Evelyn trust choice is `hidden_if`-hidden |
| C5 | **Player can't see/optimze the system** | a visible +5 | no meter shown; player observes Adeyemi acting differently | (qualitative — playtest) player can't name the "trust number" |
| C6 | **Choices aren't symmetric** | both options ~equal | one option clearly harder, often closes the interesting path | (qualitative — design review against the anti-patterns checklist) |

C1–C4 are **mechanically testable**; C5–C6 are **qualitative** (playtest + design review). "Better" = the new system passes C1–C4 in automated tests **and** C5–C6 in at least one human playtest.
- `npm run validate:content`: exit 0 (schema passes; runtime bugs are not caught by validation)

### 3.3 Validation steps (in order)

**Step 0 — Unblock the build (P0, ~15 min).**
Fix `dialogue-helpers.ts:267` TS2345: type the `NOW`-transform map callback to return `string`, e.g.
```ts
const stateWithTimestamps: Record<string, string> = Object.fromEntries(
  Object.entries(effects.state_set).map(([key, value]) =>
    [key, value === 'NOW' ? new Date().toISOString() : value]
  )
);
```
Verify: `npm run build --workspace=server` succeeds; `npm run lint --workspace=server` clean; rebuild container + health check (`docker exec las-flores-server wget -qO- http://localhost:3000/health`).

**Step 1 — Fix the decay compounding bug (P0).**
In `RelationshipDecayWorker.processUserDecay`, decay only the **delta since the last decay tick**, not the total elapsed-since-encounter. Two acceptable fixes:
- (a) After applying decay, set `last_<slug>_encounter_at` (or a new `last_<slug>_decay_at`) to now, so the next tick only covers new days; **or**
- (b) store `last_<slug>_decay_at` and compute `daysElapsed = now − last_decay_at` (1 per tick), decaying linearly.
Also implement the **floor**: capture the post-encounter value and don't decay below it (the blueprint's "can't collapse below the point set by the encounter stack"). Simplest: floor = the value as of `last_encounter_at`; snapshot it into a `<slug>_trust_floor` stat on encounter.
> **SUPERSEDED (resolved in the floor-semantics decision):** Auto-initializing the floor to the post-encounter value is self-contradictory — it sets `floor = currentTrust`, then `Math.max(newTrust, floor)` clamps decay straight back to the starting value, making trust/familiarity un-decayable. Implemented instead: floors are **content-authored only**, defaulting to the hard minimums (`bounds.minTrust` / `bounds.minFamiliarity`). A content author may still set an explicit `<slug>_trust_floor`/`<slug>_familiarity_floor` stat to protect a higher baseline.

**Step 2 — Add the tests (the actual evidence).** Without these, "is it better?" is unanswerable.
- **Unit (conditions, C1/C2):** extend `server/tests/unit/conditions.unit.test.ts` — assert `required_stats: { adeyemi_trust: "gte:70" }` passes with `{adeyemi_trust:70}` and fails with `{adeyemi_trust:69}`; assert a list-form `required_flags` (the B1 regression) fails closed.
- **Unit (decay, C3):** new `server/tests/unit/relationship_decay.unit.test.ts` with a mocked clock — set `adeyemi_trust: 40`, `last_adeyemi_encounter_at` 7 days ago; run `processDecay`; assert trust dropped by `7 × TRUST_DECAY_PER_DAY` **exactly once** (no compounding), floored above the baseline, clamped to [-100,100].
- **Property (endings, C2):** for each of the 8 endings, assert (a) a dimension-vector satisfying its `required_stats` exists and (b) a vector that doesn't — so no ending is unreachable or trivially reachable. Use `fast-check`.
- **Integration (arc walk, C1/C3):** new `server/tests/integration/adeyemi_arc.test.ts` — dedicated test user (private UUID, `afterAll` cleanup), real Postgres. Walk Act 1→5 twice (trust-max vs. antagonize) with the **same Act-4 choice**; assert **different** endings (C1). Then a second test: neglect 7 days → Act-3 gate fails (C3). Run `npm run test:integration -- tests/integration/adeyemi_arc.test.ts`.

**Step 3 — Wire Rule 3 (C4).** Add the `adeyemi_publicly_defended` flag to an Act-4 choice and a matching `hidden_if` on another character's trust choice; add a friction integration test (defend Adeyemi → other choice hidden).

**Step 4 — Comparative playtest (C5/C6, qualitative).**
- Build a side-by-side: the **old** Aisha single-stat tree vs. the **new** Adeyemi arc. Have 1–2 testers (or the author) play both.
- Capture: could the tester name the "trust number"? (C5: pass if they can't.) Were the choices recognizably asymmetric? (C6.) Did early choices feel like they mattered at the end? (C1, qualitative.)
- The new system "wins" only if it passes C1–C4 in tests **and** the playtest confirms C5–C6. If it passes C1–C4 but the playtest feels like a metered grind, the system isn't actually better — see §3.5.

### 3.4 Decision: keep, iterate, or revert

- **KEEP** (new system is better): C1–C4 pass in automated tests; playtest confirms C5–C6; the decay bug is fixed and decay is linear + floored; the build is green. → Proceed to Phase 3 (port to Aisha/Petra).
- **ITERATE** (promising but not there): C1–C2 pass but C3 (decay) or C4 (friction) fail or feel wrong. → Fix decay semantics / wire friction, re-run Step 4. Do **not** port to other characters yet.

### 3.5 Key risk: "better on paper, not in feel"

The most likely failure mode is **C5 regression**: even with 6 dimensions, if the player can *see* the system (numbers in a UI, or choices that telegraph "+trust"), it becomes a metered grind again — 6 meters instead of 1. **Guardrail:** the client must **not** render relationship stats as numbers/bars. The player should only see Adeyemi's changed behavior (different dialogue, gated choices appearing/disappearing). If a playtester says "I picked the trust option to raise his trust," the system failed C5 regardless of how elegant the data model is. This is a UX constraint, not a data constraint — verify the client doesn't expose the stats before declaring victory.

### 3.6 Open questions for confirmation

1. **Are the dimension deltas large enough to cross thresholds?** C1 depends on Act 1–3 choices cumulatively moving `adeyemi_trust` past/below the `gte:70`/`lte:50` gates. If the max achievable trust from Acts 1–3 is, say, +40, the `friend` ending (gte:70) is **unreachable** — which would make the system *worse* (dead endings). Add a property test: the union of all Act 1–3 deltas can reach every ending's threshold **and** can fall below every floor.
2. **Does decay interact correctly with the baseline?** If the wary baseline (`adeyemi_trust: -20`) is emitted at Act 1 and decay floors at "post-last-encounter," a player who does Act 1 then neglects could end below -20 — is that intended? Confirm the floor semantics. — **RESOLVED:** floors are content-authored only and default to the hard minimums (`-100` trust / `0` familiarity). Decay can therefore take a player who did Act 1 (baseline -20) and then neglected below -20, down to -100. This is **intended** — neglect has consequences. Content authors who want to protect a higher baseline per arc should set an explicit `<slug>_trust_floor` / `<slug>_familiarity_floor` stat.
3. **Is the `NOW` token the only "magic string"?** If other `state_set` values use special tokens, they need the same resolution + typing. Grep for other uppercase literals in `state_set` across content.
4. **Should `RelationshipDecayWorker` run in tests?** A real cron in the test process can mutate stats mid-test (flakiness). Ensure it's disabled/stubbed in the test environment (or the integration test seeds `last_encounter_at` explicitly and asserts deterministically).

---

*End of analysis. Re-run `npm run validate:content` and `npm run build --workspace=server` after any change to this feature; both must be green before the Step 4 playtest.*
- **REVERT** (not better): C1 fails (endings don't actually diverge from history — e.g. the stat deltas are too small to cross thresholds, so Act-4 flags still dominate). → The `required_stats` approach (Decision A1) is insufficient; this is the trigger to build the **real encounter stack** (Decision A2: `player_encounters` table + `deriveRelationshipState()`). The `required_stats` thresholds become A2's output contract, so the work isn't wasted.