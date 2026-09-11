# SC-S2 · Recursive-CTE reachability cost

**Time-box:** 0.5 day · **Type:** spike · **Feeds:** SC-704, roadmap R13

## Context

Reachability from a synthetic game-start over SC-S1's table. This is described in
`plan-graph-in-postgres.md` §1 as "the only performance claim in the whole document set
that currently has no evidence" — so this spike exists specifically to stop that from
being true.

## Dependencies

- **Hard blocker: SC-S1 must complete first.** This spike traverses SC-S1's projected
  `entity_edges` table — there is nothing to query until that table exists with real
  rows. Do not start this in parallel with SC-S1; run them back-to-back.

## Acceptance criteria (from the write-up)

The answer must state:
- The exact query used.
- `EXPLAIN ANALYZE` output, unedited.
- Wall-clock time at current volume.
- Wall-clock time at 10× volume (duplicate SC-S1's rows to simulate this — note in the
  write-up how duplication was done, since a naive duplicate may not preserve realistic
  edge-density/fan-out).

Write the result to `../../spikes/SC-S2-reachability-cost.md` using the
`spikes/README.md` template, including the "what it changes" section.

## Prompt to execute

```
Using the entity_edges table produced by SC-S1's spike script, write and run one
recursive-CTE reachability query. SC-S1 has no game_start node — seed from the
dialogue_node rows that SET a flag and do not REQUIRE one, and carry (from_type,
from_slug) through flag_edges, reachable, the visited path, and every join so
same-slug entities of different types cannot cross-link. Record that seed in the
query. See plan-graph-in-postgres.md §5.

Do not start this before SC-S1's table exists and has real projected rows — this spike
has nothing to measure without it.

Steps:
1. Write the recursive CTE query (record the exact SQL in the write-up).
2. Run EXPLAIN ANALYZE against it at current row-count volume; record the raw output
   unedited.
3. Record wall-clock time for the query at current volume (repeatable measurement
   method — state how you measured it, e.g. \timing in psql or a timed script run).
4. Duplicate SC-S1's rows to simulate 10x volume (note explicitly how the duplication
   was done — a naive row copy may not preserve realistic edge fan-out/density, which
   would make the 10x number optimistic; flag this risk in the write-up rather than
   silently presenting the number as if it were representative).
5. Repeat EXPLAIN ANALYZE and wall-clock measurement at 10x volume.

Write the full result — query, both EXPLAIN ANALYZE outputs, both wall-clock numbers,
and a "what it changes" section (does this settle R13's "no performance goal without a
baseline" for the tier-3 traversal work in SC-M5?) — into
docs/feat/scene-centric-backend/spikes/SC-S2-reachability-cost.md, following the
template in docs/feat/scene-centric-backend/spikes/README.md.
```
