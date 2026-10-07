# SC-S8 — Knowledge-ledger shape — how to track what each NPC knows

**Box:** 0.5 day · **Actual:** not tracked (single agent session) · **Date:** 2026-10-06
**Feeds:** SC-1001, SC-1002, S14

## Question

S14 needs a `knows_fact` edge so the metagame checker can flag an NPC referencing a fact they were never exposed to ("someone said something in their head, they weren't there for the conversation"). No such ledger exists today; the closest is the prose `lore_path` + semantic critique (`AICritiqueService` / `LLMPrompts.ts`) which is advisory, not deterministic.

This spike settles the ledger shape before `SC-1001` locks a contracts type. Two open variables:

1. **What is a `fact_id`?** Granularity: a registered secret (e.g. `sofia_is_informant`) vs. per-utterance/per-node fact (e.g. `node_12_line_3_claim`). The former is small and authorable; the latter is precise but explodes and needs LLM extraction.
2. **How is exposure recorded?** Explicit `fact_refs: [fact_id]` on dialogue nodes/overlays (author writes it) vs. inferred exposure (cheap model `LLM_MODEL` infers which facts a witness would have learned from a scene). Explicit is deterministic; inferred is the user's "cheap checker model" pattern, reusing the existing `LLM_MODEL` / `LLM_DEEP_MODEL` split (`LiteLLMProvider.ts:144`).

The answer may be a hybrid: explicit secrets for tier-3 blocking checks, plus cheap-model hints for unregistered facts. The spike must say which, not "both."

## What was run

- Inventory existing secrets: grep `content/` for flags that already encode secrets (e.g. `trust_level`, vault clues) and list candidates for a `fact` registry.
- Draft the minimal ledger type in a scratch branch under `api/contracts/knowledge` (no DB migration yet) — `fact_id`, `character_id` (the NPC subject of the knows_fact edge), `source_scene`, `acquired_via` (`witnessed`/`told`/`inferred`), `story_beat` visibility — and try projecting 2–3 hand-authored examples (one fact learned by witnessing a scene, one by being told in dialogue, one "internal thought" that should NOT create exposure). CharacterKnowsFact (or equivalent) stores the subject NPC explicitly via character_id.
- Cheap-model probe: hand-label 10–15 dialogue excerpts with the facts an NPC would know, then prompt `LLM_MODEL` cheap path to infer exposure; measure whether a single cheap pass is precise enough for a blocking check or only a hint.

**Committed harness (run from repo root; verified once, output below):**

- `server/scripts/spikes/knowledge-ledger.mjs [--llm]` — inventory + fixture scoring + optional cheap-model pass
- `server/scripts/spikes/knowledge-ledger-fixture.json` — 15 hand-labelled excerpts (12 verbatim from `content/` with file+node cited, 3 synthetic), 11 registered facts, 18 gold `(character, fact_id, acquired_via)` pairs
- `server/scripts/spikes/knowledge-ledger.types.ts` — scratch draft of the ledger types (`FactDef`, `CharacterKnowsFact`, `FactExposure`, `knows_fact` edge row). **Deviation:** not placed on a scratch branch of `api/contracts/knowledge` — no commits/branches were allowed in this session — so it lives beside the harness, imported by nothing. Not merged.
- `server/scripts/spikes/llm-probe.mjs` — shared LiteLLM caller (never throws, never fabricates; reports why it could not run).

Caveats on the fixture: n=15 is small; the keyword-baseline aliases were written while reading the same excerpts, so its numbers are optimistic.

## Raw results

```
$ node server/scripts/spikes/knowledge-ledger.mjs --llm
== SC-S8 inventory ==
nodes (all dialogue/overlay yaml): 591
distinct flags set/read: 185; flags read by ZERO gates: 158
  other            75 flags (62 never read)
  progress         40 flags (31 never read)
  fact-like        36 flags (34 never read)
  choice-outcome   34 flags (31 never read)
  fact-like flags: adeyemi_daniels_story_revealed, adeyemi_vulnerability_shared, adeyemi_shared_anger, adeyemi_shared_senator_chen_theory, aria_methodology_revealed, aria_budget_pressure_acknowledged, aria_long_term_vision_shared, aisha_work_mentioned, aisha_minera_estrella_discussed, aisha_challenges_revealed, aisha_favoritism_acknowledged, aisha_has_documentation, aisha_documentation_revealed, aisha_goals_discussed, aisha_personal_life_discussed, valentina_motivation_shared, valentina_origin_revealed, valentina_family_context_known, valentina_challenges_revealed, valentina_determination_acknowledged, valentina_goals_discussed, districts_known, marco_districts_explained, marco_personal_story_known, marco_nnm_knowledge_shared, marco_experiment_details_shared, tb_explained, rules_explained, city_districts_briefed, superhero_elena_idealism_shared, superhero_costs_acknowledged, superhero_javier_cynicism_shared, superhero_bleak_realism_shared, superhero_final_perspective_shared, superhero_candles_metaphor_shared, vq_father_revealed
distinct state keys: 37 (18 are last_*_encounter_at timestamps)
vault clues (great_lithium_leak): 10; unlocked by a dialogue choice in content: 1 (overlay_great_lithium_leak.yaml) -> the other 9 have no content-side unlock path
NOTE: flags live in the PLAYER state bag (player_dialogue_states/flags); none carries a character subject, so none can mean "NPC X knows F".

== fixture: 15 excerpts (12 real, 3 synthetic), 18 gold (character,fact) pairs, 11 registered facts ==
explicit registry: 13 authored fact_refs annotations cover all 18 pairs (exposing excerpts: 13/15); thought-only/negative excerpts need 0 annotations
  player-absent exposures handled by default audience=scene cast: e09, e14
keyword baseline (text+thought, aliases hand-tuned on this fixture -> optimistic): predicted=28 gold=18 TP=18 FP=10 FN=0 precision=64% recall=100%
keyword baseline (spoken text only): predicted=26 gold=18 TP=18 FP=8 FN=0 precision=69% recall=100%
negative excerpts (gold = no exposure) hit by keyword baseline: e10:zhang_liang_blocked_upgrade e15:daniel_death_not_accident+li_wei_ordered_coverup

cheap model poolside/laguna-m.1: predicted=16 gold=18 TP=11 FP=5 FN=7 precision=69% recall=61%
malformed responses: 0/15; total tokens: 5583
```

Reading it:

- **Existing flags cannot seed a knowledge ledger.** All 185 flags live in the *player's* state bag; none has a character subject, 158 are read by no gate, and the 36 "fact-like" ones are conversation-coverage markers (`aisha_goals_discussed`, `tb_explained`) far more than secrets. They are a candidate list for the registry, not the registry.
- **Real secrets are few.** From flags: roughly 8-10 (`adeyemi_daniels_story_revealed`, `adeyemi_shared_senator_chen_theory`, `marco_nnm_knowledge_shared`, `aisha_documentation_revealed`, `aria_methodology_revealed`, `vq_father_revealed`, `camila_sold_out`, ...). From vault: 10 great_lithium_leak clues, one fact each. Order of magnitude for today's content: dozens, not hundreds (591 dialogue nodes).
- **Explicit registry:** 13 `fact_refs` annotations expressed all 18 gold pairs, including the two player-absent exposures (e09 boardroom, e14 NPC gossip) via default audience = scene cast, and 0 annotations for the thought-only and mention-only negatives. (Pair-level accuracy is 100% by construction; the real risk is author omission, which the checker can lint: a node whose speaker asserts a registered fact with no `knows_fact` edge is an error.)
- **Naive inference (keyword baseline, deterministic):** recall 100% but precision 64% (text+thought) / 69% (spoken only). It fires on `thought` secrets (e10) and on mentions that reveal nothing (e15) and cannot tell player-absent scenes apart without the cast list. That is a lower bound on what a model must beat, not a measurement of a model.
- **Cheap model (`poolside/laguna-m.1` via LiteLLM proxy): precision 69%, recall 61% — inference not viable for blocking.** The model predicted 16 exposures (TP=11, FP=5, FN=7). It misses 7 of 18 gold pairs and hallucinates 5 false exposures. This is comparable to the keyword baseline (64-69% precision) but with worse recall (61% vs 100%). The model cannot distinguish player-absent scenes, thought-only secrets, and mention-only negatives reliably. Explicit-only is confirmed: there is no inference path to fall back on.

## Answer

**Explicit-only, over a registry of facts.** One recommendation; no inferred edges in SC-1001/SC-1002.

- **`fact_id` granularity: registered secret** (a short authored slug such as `daniel_death_not_accident`), dozens for current content (11 cover the fixture; ~20-40 for the whole of today's content). Not per-utterance: per-node would be O(591+) and needs extraction, which is exactly what the checker is supposed to remove.
- **Exposure: recorded explicitly.** Authors put `fact_refs: [fact_id]` on the dialogue node / overlay / scene / vault item that exposes it. Default audience is the scene cast plus the player; `thought` text never exposes anything; an `excluded[]` list handles eavesdropping. `acquired_via` is `witnessed | told` for projected edges; `inferred` stays in the type but is never written by the deterministic projection.
- **Subject is explicit:** `CharacterKnowsFact(character_id, fact_id, source_scene, acquired_via)`; the player is a character_id sentinel. Seed knowledge (who originally owns a secret) is declared on the registry entry, so the ledger records acquisition events only.
- **Author cost per new scene:** 0 annotations for scenes that expose nothing; otherwise one `fact_refs` line per exposing node plus, once per new secret, a one-line registry entry. In the fixture, 13 annotations for 15 excerpts.
- **Why not hybrid/inferred:** the cheap-model eval (run 2026-10-06 with `poolside/laguna-m.1` via the real LiteLLM proxy) returned 69% precision / 61% recall — comparable to the keyword baseline but with worse recall, and not viable for blocking. There is no basis to put a model in a blocking path or to promise it as a hint. A cheap-model hint can be proposed later as a separate story with a different model or prompt; it is not part of this answer.

## What it changes

- If explicit-only: `SC-1001` becomes a small registry + `fact_refs[]` on nodes/overlays; no LLM in the projection path. Metagame checker is deterministic.
- If hybrid: `SC-1001` splits into deterministic `fact_refs` (blocking) + advisory inferred edges (hint severity). `SC-1003` gains a cheap-model sub-check that never blocks, only suggests — same degraded-gracefully pattern as `IntakeSemanticValidator.ts`.
- If inferred-only is viable: `SC-1001` can be thinner (facts need not be pre-registered), but `SC-1002` projection now depends on LLM and needs the same "empty is legitimate vs malformed" guard `LiteLLMProvider.ts:91-122` uses.
- Any answer that makes `fact_id` per-node forces a re-estimate of `SC-1002` (today `M`) — per-node facts are `O(nodes)`, not `O(secrets)`.

## Stories changed by this answer (decided 2026-10-06)

- **SC-1001:** becomes the registry (`FactDef`) + `fact_refs[]`/`audience`/`excluded` on nodes, overlays, scenes and vault items + the `knows_fact` row shape (types draft in `knowledge-ledger.types.ts`). No LLM in the projection path.
- **SC-1002:** stays `M`; cost is O(secrets) + O(exposing nodes), not O(nodes). Projects as a new `edge_kind = 'knows_fact'` in the existing `entity_edges` table (same `(from_type, from_slug, edge_kind, to_type, to_slug, attrs)` shape as SC-S1), so SC-701 is extended, not duplicated.
- **SC-1003:** deterministic only: an asserting character without a `knows_fact` edge (and not the registry owner) is a blocking tier-3 error. The "cheap-model sub-check" described above is dropped from scope until the `--llm` eval is actually run.
- **Content follow-up:** existing flags are not a migration source; the registry must be authored (start from the ~10 flag secrets and 10 lithium-leak clues listed above).
- **Answered (2026-10-06):** the cheap-model eval ran with `poolside/laguna-m.1` (69% precision / 61% recall) and is not viable even as a blocking input; a hint-only model check would need a different model or prompt and is out of scope here.
