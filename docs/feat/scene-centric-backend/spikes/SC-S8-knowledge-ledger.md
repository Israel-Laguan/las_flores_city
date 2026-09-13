# SC-S8 — Knowledge-ledger shape — how to track what each NPC knows

**Box:** 0.5 day · **Actual:** _to be filled_ · **Date:** _to be filled_
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

**Reproducibility:** commit the probe fixtures under `server/scripts/spike_sc_s8_knowledge_ledger.ts` or inline the prompts + hand-labels here, per `spikes/README.md` harness rule. Without committed fixtures the "cheap model viable?" claim is not re-runnable.

## Raw results

_To be filled after running._

## Answer

_To be filled: explicit-only / inferred-only / hybrid — and why. Must also answer: is `fact_id` a registry of secrets (dozens) or per-node (hundreds+), and what the authors pay per new scene._

## What it changes

- If explicit-only: `SC-1001` becomes a small registry + `fact_refs[]` on nodes/overlays; no LLM in the projection path. Metagame checker is deterministic.
- If hybrid: `SC-1001` splits into deterministic `fact_refs` (blocking) + advisory inferred edges (hint severity). `SC-1003` gains a cheap-model sub-check that never blocks, only suggests — same degraded-gracefully pattern as `IntakeSemanticValidator.ts`.
- If inferred-only is viable: `SC-1001` can be thinner (facts need not be pre-registered), but `SC-1002` projection now depends on LLM and needs the same "empty is legitimate vs malformed" guard `LiteLLMProvider.ts:91-122` uses.
- Any answer that makes `fact_id` per-node forces a re-estimate of `SC-1002` (today `M`) — per-node facts are `O(nodes)`, not `O(secrets)`.
