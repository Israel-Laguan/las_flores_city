# Spike Write-Ups

One file per spike: `SC-S<n>-<slug>.md`. Spikes are listed in `../backlog.md` §Spikes and
scheduled in the sprint files.

**Harness reproducibility rule:** every spike write-up's "What was run" section must
contain either (a) the actual harness script/SQL **committed in the repo** (spike scripts
that touch the DB belong in `server/scripts/`, going forward — this establishes the
convention that `scripts/` remains file-to-file tools only, avoiding DB state dependency
across spike runs), or (b) fully self-contained inline commands and inputs that reproduce the
measurement. A spike whose harness exists only on one machine is not finished — its
numbers cannot be re-validated against changed content later. The SC-S1
through SC-S4 and SC-S6 harnesses are committed under `server/scripts/`
(SC-S6: `npm run spike:serving-baseline --workspace=server`, see `SC-S6-serving-baseline.md`).

**A spike that answers "no" is a success.** It gets written up here and the affected story
is re-planned at retro — not quietly re-attempted next sprint.

## Template

```markdown
# SC-S<n> — <question in one line>

**Box:** <time-box> · **Actual:** <time spent> · **Date:** YYYY-MM-DD
**Feeds:** <story / decision IDs>

## Question
What we did not know, and why it blocked something.

## What was run
Commands, queries, scripts. Enough that someone else can repeat it.

## Raw results
Numbers, output, `EXPLAIN ANALYZE`. Unedited.

## Answer
Yes / no / it depends — and the reasoning.

## What it changes
The section that makes this document worth writing. Which stories change shape, which
decisions are now settled, which assumptions in the reference docs are now wrong.
A spike without this section is not finished.
```

## Index

| Spike | Question | Status |
|---|---|---|
| SC-S1 | Project `entity_edges` from existing content — is it natural? | done — mixed: 96% of edges project cleanly, `mission_scene` is unsupported (see write-up) |
| SC-S2 | Recursive-CTE reachability cost at current and 10× volume | done — cheap (0.82ms→6.85ms Postgres exec time, 1x→10x), but scoped to today's shallow chain depth; see write-up's "what it changes" |
| SC-S3 | Overlay view with ADD + MODIFY — do traversals differ correctly? | done — yes for ADD; MODIFY needs array-aware merge, plain `jsonb \|\|` alone is insufficient (see write-up) |
| SC-S4 | `pg_trgm` alias detection — does it beat plain `ILIKE`? | done — depends: beats ILIKE on recall (83% vs 42% @ threshold 0.30) but at low precision (35%); misses pure translation/synonym/acronym aliases entirely; see write-up |
| SC-S5 | Where does a live weather value come from? | done — district-level default (new `districts.weather` column) + scene-level author override, resolved before `buildBackgroundHints`; see write-up |
| SC-S6 | Dialogue serving baseline — p50/p95 | done — full endpoint p50≈25ms/p95≈35-39ms; `resolveChunkSpeakers` is ~29-45% of that, not the majority — the suspected "uncached bulk SELECT" is sub-ms; presigning is the real (but minority) cost; see write-up |
| SC-S8 | Knowledge-ledger shape — `fact_id` granularity + explicit vs. inferred exposure | done — **explicit-only registry** (secrets, not per-utterance); `fact_refs[]` authored on nodes (default audience = scene cast + player; `thought` never exposes); flags can't seed it (player-subject, 158/185 read by zero gates). Cheap-model eval run 2026-10-06: 69% precision / 61% recall (comparable to keyword baseline 64–69% but worse recall) — **not viable for inference**. No hybrid/inferred path. Changes SC-1001/1002/1003; see write-up. |
| SC-S9 | Inventory-ledger shape — per-character vs. per-location + consumption semantics | done — per-character possession only, reuse `entity_edges` with `has_item` edge; `acquired`/`retired` live, `consumed`/`lost` reserved (0 content cases); **scene `items` field is props-only — no `item_ref` in SC-301** (if pickup wanted later, add separate `offers` field). `gives_item`/`requires_item` don't exist in code (real surfaces: `grant_item` 0 uses, `vault_unlock` 3 uses); see write-up. |
| SC-S10 | Time-vs-prose cheap-model extraction — precision/recall for claimed elapsed time | done (both halves) — **deterministic:** scene `time` is a time-of-day tag (`day`/`sunset`/`night`); time-block cost lives on `DialogueChoice.time_block_cost` (245 choices) and gigs (2), not on scenes. **LLM (SC-1007):** eval run 2026-10-06 with `poolside/laguna-m.1` — 75% precision / 50% recall on detection, 50% precision / 20% recall on TB-mismatch (needs ≥85%/≥80% to block). **SC-1007 stays hint-only** — never blocks CI. Regex baseline 100% prec / 83% recall shows the problem is tractable for numeric claims but hard for vague prose ("a few days", "hours passed"). Sofia corruption beat is a real test case (6 TB vs "next few days"). Changes SC-301, SC-1006, SC-1007. |
| SC-S11 | Commit S8/S9/S10 harnesses | done — fixtures and scripts committed under `server/scripts/spikes/` (knowledge-ledger.mjs, inventory-ledger.mjs, time-vs-prose.mjs + fixture JSON files); reproducibility rule satisfied for all three. |
| SC-S12 | Existing `content/scenes` + `scenes` table vs. the new Scene model — map, reference, or rename? | done — mapping (b): old rows are *locations* (95 rows = 20 scene + 75 location YAMLs, both `migrate.ts` mapped to `scenes` table); new entity is `SceneDef` / `planning.scene_defs` (table rename in SC-311, repo rename in SC-314). Importer imports locations to `planning.locations` + seeds 7 `SceneDef` rows named `<folder>__ambient`; `location` field in SC-301 is hard FK by `id` (table has no slug); see write-up and approved renames in backlog/sprint-03 files. |
| SC-S13 | When are flag-gated overlays applied — compile-time variants vs ordered conditional layers? | done — hybrid: static overlays folded at compile, flag-gated overlays kept as ordered conditional layers evaluated at runtime (`selectActiveOverlays` filter). Variant enumeration not recommended (k=12 gives 4,096 artifacts, k=16 gives 65,536). Conflicts decided on co-satisfiable flag pairs only (truth table up to k≤16); equal-priority conflicts emit `SCENE_EXCLUSIVE_CONFLICT` / `SCENE_SLOT_CAST_CONFLICT` and fail the compile. Layer evaluation cost ~0.1–2.3 µs vs 21 ms endpoint p50. `ResolvedScene` = `{base, layers[], flags[], provenance, issues}`; SC-303/SC-402/SC-304 wording updated in proposal.md; see write-up. |
