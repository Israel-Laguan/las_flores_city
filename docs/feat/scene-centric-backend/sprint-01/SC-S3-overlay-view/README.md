# SC-S3 · Overlay view with ADD + MODIFY

**Time-box:** 1 day · **Type:** spike · **Feeds:** SC-702, open question #3

## Context

Hand-write one plan with an `ADD` and a `MODIFY` delta. Build the overlay view. Run one
SC-S1 traversal with and without the overlay applied. This tests the *hard* part of the
Neo4j-replacement case per `plan-graph-in-postgres.md` §2 — overlay, not traversal.

## Dependencies

- **Hard blocker: SC-S1 must complete first.** This spike explicitly reuses "one SC-S1
  traversal" — there's no overlay to test against without SC-S1's edge table. This is
  the same dependency SC-S2 has; SC-S2 and SC-S3 can run in either order relative to
  each other once SC-S1 is done, but neither can start before it.
- Lowest priority to cut of the three S1-dependent spikes (see `sprint-01.md` §5) —
  schedule this after SC-S2 if capacity is tight, since S2's answer (raw traversal cost)
  is needed for R13 regardless of what this spike finds, while this spike's finding
  (jsonb merge sufficiency) only re-shapes an open question, it doesn't block a "do not
  cut" item.

## Acceptance criteria (from the write-up)

The answer must state:
- Whether the two traversal runs (with/without overlay) differ as expected — i.e. the
  overlay actually changes which nodes/edges are reachable, proving the composition
  works, not just that it runs without error.
- Whether `jsonb` merge for `MODIFY` was sufficient, or needed per-field logic instead.
  **If the latter**, that pushes open question #3 (`plan-graph-in-postgres.md` §11,
  "changed-fields vs. full snapshot") toward full snapshot — state this explicitly if it
  applies, don't leave it implicit.

Write the result to `../../spikes/SC-S3-overlay-view.md` using the `spikes/README.md`
template, including the "what it changes" section.

## Prompt to execute

```
Using the entity_edges table from SC-S1, first load a scratch canon-payload table
(entity_type, entity_slug, payload jsonb) for the nodes you will overlay — §3.3 merges
canon *payloads*, not derived edge rows. Hand-write one plan_deltas-shaped test case
with one ADD and one MODIFY (schema per plan-graph-in-postgres.md §3.1). Build the
overlay with COALESCE(canon.payload, '{}') || delta.payload (plain || drops ADD
nodes). Re-project edges from both canon and overlay payloads, then traverse both.

Do not start before SC-S1's table exists — there's nothing to overlay without it.

Steps:
1. Hand-author one ADD delta (a new entity not in canon) and one MODIFY delta (a
   changed field on an existing entity) as plan_deltas rows.
2. Build the overlay view/CTE per §3.3's jsonb-merge approach.
3. Run one traversal (can reuse SC-S1's or SC-S2's query shape) against canon alone,
   then against canon-with-overlay-applied.
4. Report explicitly whether the two runs produce different, correct results — not just
   "it ran" but "the ADD entity appears and the MODIFY's changed field is reflected in
   the traversal output."
5. Report explicitly whether jsonb merge alone was sufficient for the MODIFY case, or
   whether some field required special per-field merge logic (e.g. array fields that
   shouldn't be naively overwritten). If per-field logic was needed, state this pushes
   open question #3 in plan-graph-in-postgres.md §11 toward "full snapshot" rather than
   "changed fields only" — don't leave that implication unstated.

Write the full result, with a "what it changes" section, into
docs/feat/scene-centric-backend/spikes/SC-S3-overlay-view.md, following the template in
docs/feat/scene-centric-backend/spikes/README.md.
```
