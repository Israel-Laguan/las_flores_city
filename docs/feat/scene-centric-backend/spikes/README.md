# Spike Write-Ups

One file per spike: `SC-S<n>-<slug>.md`. Spikes are listed in `../backlog.md` §Spikes and
scheduled in the sprint files.

**Harness reproducibility rule:** every spike write-up's "What was run" section must
contain either (a) the actual harness script/SQL **committed in the repo** (spike scripts
that touch the DB belong in `server/scripts/`, going forward — this establishes the
convention that `scripts/` remains file-to-file tools only, avoiding DB state dependency
across spike runs), or (b) fully self-contained inline commands and inputs that reproduce the
measurement. A spike whose harness exists only on one machine is not finished — its
numbers cannot be re-validated against changed content later. Known gap: the SC-S1
through SC-S4 harnesses and `server/scripts/spike_sc_s6_serving_baseline.ts` were not
committed with their write-ups; committing (or inlining) them is a recorded follow-up
before any downstream ticket treats those measurements as re-runnable.

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
| SC-S8 | Knowledge-ledger shape — `fact_id` granularity + explicit vs. inferred exposure | not started — blocks SC-1001/S14 |
| SC-S9 | Inventory-ledger shape — per-character vs. per-location + consumption semantics | not started — blocks SC-1004/S15 |
| SC-S10 | Time-vs-prose cheap-model extraction — precision/recall for claimed elapsed time | not started — blocks SC-1007/S16 |
