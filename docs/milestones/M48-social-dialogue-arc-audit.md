# M48 - Social Dialogue and Relationship Arc Audit

> **Status:** In Progress — Phases 1–5 complete (2026-08-24); Phase 6 arc batches pending
> **Owner:** narrative systems effort
> **Source:** `docs/relationship_template.md`, `docs/ARCHITECTURE_SEPARATION_ANALYSIS.md`,
> the canonical `user_relationships` pilot, and the Valentina Quan relationship content

## Implementation Status (2026-08-24)

Phases 1–5 are implemented, tested, and deployed to the dev stack. Phase 6 (generalization
to the remaining arc groups) has not started.

**Delivered:**

- Gate contract: `RelationshipGateSchema` / `PostureSchema` / `RelationshipAxis` in
  `shared/src/schemas/dialogue.ts`; four gate keys on `DialogueChoiceSchema`.
- Evaluators: pure `relationshipPassesFilters` (`shared/src/relationshipGates.ts`,
  fail-closed missing-row semantics + opt-in `neutral_default`) and `derivePosture` with
  centralized `POSTURE_THRESHOLDS` (`shared/src/relationshipPostures.ts`).
- Runtime wiring: `RelationshipRepository.getRelationshipForFilter` (read-only pool query);
  `filterChoices` / comms `applyChoiceFilters` batch-load per-target state (no N+1) and run
  gates alongside legacy `required_stats`; all call sites thread the speaker as target;
  `metadataConditionsPass` supports tree-level relationship gates.
- Valentina conversion: all 5 YAML files migrated off `vq_trust`; romance tracking added;
  posture/trust gates on intimate paths; endings matrix (Grounded trust≥40+romance≥25,
  Departed trust≥15+romance≥15, Shut-out hidden at trust≥20, Friends always available,
  new pacing fallback). Audit record:
  `content/dialogues/valentina_quan_relationship/AUDIT.md`.
- Authoring/validation: M48 contract section in `docs/relationship_template.md`;
  relationship-gate conflict checks in story-processing skill; posture/expression coverage
  note in character-prompt-review skill; `validateRelationshipGates` warnings in content
  validation.
- Migration: `078_relationship_backfill_valentina.sql` applied to OLTP (idempotent).

**Verification evidence:**

- Unit/smoke: 1116/1116 pass (27 new evaluator tests in
  `server/tests/unit/relationshipGates.unit.test.ts`).
- Integration: 410/410 pass across 62 suites, including 13 new tests covering the seven
  required scenarios plus entry-node empty-list guards (`server/tests/integration/vqRelationshipGates.test.ts`).
- Server lint/build clean; intake-worker restarted (migration recorded in `schema_migrations`);
  game-server healthy via in-container `wget`.

**Remaining for closure:**

- Phase 6 batches 2–6 (Camila Santander → Layla/Wen → Lin sisters → Ana Villanueva →
  remaining `relationship_change` content), each with audit report + converted content +
  validation + ≥1 incompatible-state integration scenario.
- Posture threshold tuning after a manual 7-scenario playtest (`POSTURE_THRESHOLDS`
  first-draft constants).
- Exit-decision review (posture vocabulary sufficiency, fallback authoring cost).

## Goal

Review relationship-focused dialogue and story arcs so that authored conversations remain
consistent with the player's canonical social state. Add relationship gates, compatibility
branches, and reliable default/fallback responses without creating a separate dialogue tree
for every possible combination of relationship axes.

This milestone is the content-quality gate after the six-axis relationship pilot. It begins
with Valentina Quan, measures the authoring and runtime gaps, and defines the repeatable
migration process for the remaining relationship arcs.

## Why This Is Needed

The canonical relationship model now tracks:

- trust;
- familiarity;
- alignment;
- tension;
- debt;
- visibility;
- bond level;
- daily vibe;
- relationship status;
- relationship memory and flags.

The dialogue system remains the authoritative source for what characters say and how they
are visually staged. Relationship state must therefore select compatible authored dialogue,
not silently contradict it.

Examples of states that require deliberate writing rather than accidental behavior:

- high romance with low trust: volatile attraction, secrecy, manipulation, or confrontation;
- high trust with low romance: intimate friendship without romantic progression;
- high tension with low familiarity: guarded or suspicious first contact;
- high familiarity with low alignment: history without shared goals;
- high debt with low trust: obligation, resentment, or boundary-setting.

The six axes must not produce a combinatorial explosion of dialogue trees. Content should
use broad relationship postures, explicit gates, and fallback branches.

## Current Baseline

- `user_relationships` is the canonical per-player/per-character relationship store.
- `relationship_effect` is available for new dialogue content.
- Legacy `relationship_change` remains supported during migration.
- Valentina's `dialogue_vq_intro.yaml` contains the first authored `relationship_effect`
  examples.
- Existing `required_stats` and `hidden_if_stats` gates read `player_states` and are not,
  by themselves, canonical six-axis relationship gates.
- The new relationship gate contract must be implemented before broad content conversion.
- Character image prompts and portrait expressions remain presentation content. They should
  represent authored emotional states such as guarded, warm, suspicious, vulnerable, tense,
  flirtatious, and reconciliatory, rather than every numeric axis combination.

## Scope

### In scope

- relationship dialogue trees and SMS/social interactions;
- relationship effects, gates, milestone requirements, and fallbacks;
- relationship-aware dialogue and content generators;
- content validation and authoring guidance;
- portrait expression coverage for authored relationship postures;
- Valentina Quan as the first complete audited arc;
- migration checklist for subsequent relationship arcs.

### Out of scope

- rewriting unrelated mission, tutorial, or ambient dialogue;
- creating a dialogue tree for every numeric relationship combination;
- implementing the complete multi-phase date framework;
- replacing the dialogue node visual system with procedural text generation;
- making image prompts the source of relationship truth.

## Milestone Phases

### Phase 1: Define the Relationship Gate Contract

Add a typed content contract for relationship gates, separate from player story-state gates.
The contract should support:

- `required_relationship` for hard requirements;
- `hidden_if_relationship` for choices that should not appear;
- axis comparisons using the existing `gte`, `lte`, `gt`, `lt`, `eq`, and `ne` grammar;
- required relationship statuses;
- bond and daily-vibe thresholds;
- relationship flags and memory checks where appropriate;
- a clear target character, normally the dialogue speaker.

The resolver and choice filtering path must read these gates from `user_relationships`.
Missing relationship rows must fail closed for required gates and use neutral defaults only
when explicitly requested by the content contract.

Do not overload `required_stats` with relationship data. Existing `required_stats` remains
for global/player-state story variables during the migration period.

### Phase 2: Define Relationship Postures

Create a small, documented posture vocabulary that content authors can target:

- `WARM`;
- `CURIOUS`;
- `GUARDED`;
- `VOLATILE_ROMANCE`;
- `DISTANT`;
- `CONFRONTATIONAL`;
- `RECONCILIATORY`;
- `BROKEN`.

Postures should be derived from bounded axis thresholds and status, but thresholds must be
centralized in code/shared types rather than duplicated in every YAML file.

A posture is a content-selection aid, not a replacement for the underlying axes. Content
may still use explicit axis gates when a particular threshold matters.

### Phase 3: Audit Valentina Quan

Review the complete Valentina relationship arc:

- `content/dialogues/valentina_quan_relationship/dialogue_vq_intro.yaml`;
- `content/dialogues/valentina_quan_relationship/dialogue_vq_push.yaml`;
- `content/dialogues/valentina_quan_relationship/dialogue_vq_father.yaml`;
- `content/dialogues/valentina_quan_relationship/dialogue_vq_layover.yaml`;
- `content/dialogues/valentina_quan_relationship/dialogue_vq_endings.yaml`.

For every social interaction, record:

- the current relationship posture assumed by the dialogue;
- relationship effects applied by choices and nodes;
- required trust, familiarity, alignment, tension, debt, visibility, bond, or status;
- whether the line is compatible with low-trust/high-romance states;
- the neutral/default option;
- the guarded, conflicted, or negative fallback;
- the expected visual expression and mood;
- whether the scene advances, pauses, or reverses the relationship.

The audit must test at least these paths:

1. high trust / high familiarity / low tension;
2. low trust / high romance;
3. high tension / low familiarity;
4. high familiarity / low alignment;
5. neglect followed by re-engagement;
6. a failed or non-romantic ending;
7. a successful romantic ending.

### Phase 4: Add Fallback and Compatibility Content

Every important relationship entry point must have a safe response if the preferred choices
are gated out. Use one or more of these patterns:

- a neutral conversation option that remains valid across postures;
- a posture-specific choice such as guarded attraction or confrontation;
- a fallback node selected by posture when all primary choices are unavailable;
- a pacing response when the relationship is valid but the interaction is unavailable today.

Fallback content must be authored, not silently generated as an empty choice list.

A romance line must not be shown as a healthy progression when trust and familiarity are
below its authored requirements. If the design intentionally supports romance with distrust,
it must use a distinct volatile/conflicted branch and expression set.

### Phase 5: Update Authoring and Generation Workflows

Update the following authoring surfaces:

- `docs/relationship_template.md` with the gate, posture, fallback, and audit checklist;
- `.agents/skills/story-processing/SKILL.md` with relationship-state planning and conflict
  checks;
- relationship/dialogue generation prompts and schemas to emit `relationship_effect`,
  `required_relationship`, `hidden_if_relationship`, posture variants, and fallback nodes;
- content validation to warn when relationship effects have no interaction timestamp or when
  romance/social choices lack a compatible gate or fallback;
- character prompt review guidance to check posture/expression coverage without duplicating
  every numeric state.

Generated content must remain proposal content until human review and migration. Generators
must not write player-state or relationship rows directly.

### Phase 6: Generalize by Arc Group

After Valentina passes the audit, migrate relationship-heavy content in batches:

1. Valentina Quan;
2. Camila Santander;
3. Layla/Wen relationship content;
4. Lin sisters romance and family encounters;
5. Ana Villanueva relationship content;
6. remaining characters with `relationship_change`, romance tags, or relationship-scoped
   stats.

Each batch should include an audit report, converted content, validation results, and at
least one integration scenario for incompatible relationship states.

## Audit Deliverable

Produce one machine-readable or tabular audit record per arc containing:

| Field | Required content |
|---|---|
| Arc | Character/group and dialogue files |
| Entry points | Scene, character, SMS, or repeatable interaction |
| Target character | Canonical relationship row target |
| Posture assumptions | Warm, guarded, volatile, etc. |
| Relationship effects | Axes, bond, vibe, memory, flags, status |
| Gates | Required relationship conditions |
| Fallback | Neutral/guarded/pacing fallback node |
| Visual coverage | Expressions, mood, background variants |
| Conflict cases | Tested incompatible axis combinations |
| Result | Pass, revise, or blocked |

## Acceptance Criteria

- Canonical relationship gates are distinct from player-state story gates.
- Missing or incompatible relationship states cannot expose contradictory romance choices.
- Every audited relationship entry point has a neutral or posture-specific fallback.
- Valentina's full arc passes the seven required state scenarios.
- Dialogue choices, node effects, SMS replies, and repeatable social interactions use the same
  relationship evaluation rules.
- Content validation reports missing gates, missing fallbacks, malformed axis comparisons,
  and relationship effects without appropriate interaction updates.
- The generation workflow produces reviewable relationship-aware content rather than silently
  adding untested branches.
- Portrait expressions cover relationship postures without requiring one asset per numeric
  axis value.
- At least one complete follow-up arc is converted using the same checklist after Valentina.

## Verification

- Run `npm run validate:content` after every content batch.
- Run shared schema/type checks before server checks.
- Run server lint and build.
- Run the cache-bypassed unit/smoke Jest command from `AGENTS.md`.
- Add integration tests for relationship gates, fallback selection, status/posture changes,
  dialogue/SMS effects, and pacing.
- Apply migrations to the OLTP database and verify `user_relationships` rows directly.
- Rebuild/restart the server container and verify health with in-container `wget`.
- Record the Valentina audit result before starting the next arc group.

## Exit Decision

At the end of M48, decide whether:

- the posture vocabulary is sufficient;
- explicit axis gates are understandable to content authors;
- fallback authoring is too expensive or produces better player experience;
- additional database fields or derived relationship values are needed;
- the full date framework should proceed;
- the next arc group can be migrated safely.
