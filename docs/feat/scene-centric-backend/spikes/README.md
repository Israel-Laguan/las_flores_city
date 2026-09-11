# Spike Write-Ups

One file per spike: `SC-S<n>-<slug>.md`. Spikes are listed in `../backlog.md` §Spikes and
scheduled in the sprint files.

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
