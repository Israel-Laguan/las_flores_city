# Group B — Spikes (6 tasks)

Time-boxed. **A spike that answers "no" is a success** (`backlog.md` Spikes) — it is written
up in `spikes/` and the affected story is re-planned, never quietly re-attempted. Each spike
ends with a written *Answer* and a named list of stories it changes. Harnesses are committed
under `server/scripts/spikes/` (`spikes/README.md` reproducibility rule).

SC-S12 and SC-S13 are **new**: they come from gaps found while scoping this sprint and gate
Groups D–F. SC-S8/S9/S10 already exist in `spikes/` as unanswered write-ups; they are pulled
forward because scene `items`, `dialogue_refs` and `time` (SC-301) must not paint the
ledgers into a corner.

---

## SC-S12 · Existing `scenes` content vs. the new Scene model · S (0.5–1 day) · P0 · gates D1, D4, F2

**Question.** `content/scenes/*` (21 folders) and the `scenes` DB table are **location
backdrops** (`district`, `background_url`, `mood`, `available_dialogues`, `idle_thoughts` —
e.g. `scene_acuario.yaml`), not situations with role slots, items and activities. Do they
(a) become base scenes of the new model, (b) become `location`s that new scenes *reference*,
or (c) stay as-is while the new entity gets a different name?

**What to run**
- Project all 21 existing scene YAMLs into a draft `Scene` shape on paper + a throwaway script; list which fields map, which are dropped, which are new-required.
- Check every reader of `scenes` (`grep -rn "FROM scenes\|scenes\b" server/src client/src admin/src`) and list who breaks if the table is renamed or extended.
- Decide the new entity's table/slug namespace so `planning.scene_defs` and `public.scenes` cannot be confused in code review.

**Answer must state:** the mapping (a/b/c), the importer's contract for F2, and the name of the new entity in code (`Scene` vs `SceneDef` vs …).
**Changes if "(b)":** SC-301's `location` field is a hard FK to the old table's slug; F2 imports *locations*, not scenes.

- m-16 Script + mapping table in `spikes/SC-S12-*.md`.
- m-17 Reader inventory (who touches `scenes`).
- m-18 Add the row to `spikes/README.md` index and `backlog.md` Spikes table.

---

## SC-S13 · When are flag-gated overlays applied? · S (0.5 day) · P0 · gates E2, E5

**The contradiction.** SC-303 says overlays are "applied at compile time — the compiled
artifact is the resolved result." But an overlay gated by a flag (`condition: ConditionExpr`)
depends on **per-player state**, which does not exist at compile. SC-M2's exit criterion
("a base and a flag-gated overlay compile to artifacts that resolve differently as the flag
flips") needs one of:

1. **Variant enumeration** — compile emits one resolved artifact per reachable flag combination (2^k; only viable if k is small and statically extractable via `extractFlagSlugs`).
2. **Ordered conditional layers** — compile resolves *static* precedence/conflicts and ships base + ordered overlays with their conditions; runtime evaluates conditions with the shared evaluator and applies the already-validated order.
3. **Hybrid** — static overlays folded at compile; flag-gated ones kept as layers.

**What to run:** take the SC-S3 vq_endings fixture, add two flag-gated overlays on one scene; measure k and artifact count under (1); sketch the runtime cost under (2) using the SC-S6 numbers.
**Answer must state:** the chosen model, the `ResolvedScene` shape (single resolved scene vs. base + layers), and the compile-time conflict rule for two overlays whose conditions can both be true.
**Changes:** SC-303's "resolved at compile time" wording, SC-402's artifact shape, SC-304 (conflict must be decided on *co-satisfiable* conditions, not on all pairs).

- m-19 Fixture + k-count script under `server/scripts/spikes/`.
- m-20 Answer + SC-303/SC-402 wording diff in the write-up.
- m-21 Update `proposal.md` §2.2 if the answer changes "resolved at compile".

---

## SC-S8 · Knowledge-ledger shape · S (0.5 day) · P1

Existing write-up: [`spikes/SC-S8-knowledge-ledger.md`](../spikes/SC-S8-knowledge-ledger.md).
Fill in *What was run → Raw results → Answer*. Required output: the `fact_id` granularity
(registered secret vs. per-utterance), exposure recorded explicitly or inferred, and **one**
recommendation (not "both"). Draft the type under a scratch branch of `api/contracts/knowledge`;
do not merge it.

- m-22 Inventory candidate secrets in `content/` (flags, vault clues) → fixture list.
- m-23 Write the Answer and the stories it changes (SC-1001, SC-1002, SC-1003).

---

## SC-S9 · Inventory-ledger shape · S (0.5 day) · P1

Existing write-up: [`spikes/SC-S9-inventory-ledger.md`](../spikes/SC-S9-inventory-ledger.md).
Settle per-character vs per-location possession and `acquired`/`consumed`/`lost` semantics.
Specifically answer: does the scene `items` field (SC-301) hold *visible props* only, or
*obtainable items*? That one answer decides whether SC-301 needs an `item_ref` shape now.

- m-24 Project `gives_item` / `requires_item` usage from content into a table of cases.
- m-25 Write the Answer, including the `items` field decision for SC-301.

---

## SC-S10 · Time-vs-prose cheap-model check · S (0.5 day) · P2

Existing write-up: [`spikes/SC-S10-time-vs-prose.md`](../spikes/SC-S10-time-vs-prose.md).
Hand-label a fixture (≥ 15 dialogue excerpts with their time-block sum), run the `LLM_MODEL`
cheap path, report precision/recall. Also answer the deterministic half: what is the unit
of scene `time` — a time-of-day tag only (`day`/`sunset`/`night`) or a time-block *cost*?
SC-1006 needs the cost; SC-301 only needs the tag. Record where the cost lives.

**Cut candidate:** first spike dropped if capacity is short (nothing in Groups C–F depends on it).

- m-26 Hand-labelled fixture file committed.
- m-27 Eval script + results table; Answer states "blocking" vs "hint-only".

---

## SC-S11 · Commit S8/S9/S10 harnesses · S · P1 · after S8–S10

Same reproducibility rule as SC-S7. Commit fixtures and the eval script under
`server/scripts/spikes/`, or inline the repro in the write-up. Update each write-up's
"What was run" with the committed path and verify it by running it once from a clean checkout.

- m-28 Move fixtures/scripts and fix paths.
- m-29 Run each once; paste the output header into the write-up.
