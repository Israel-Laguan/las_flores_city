# SC-S1 · Project `entity_edges` from existing content

**Time-box:** 1 day · **Type:** spike · **Feeds:** SC-701, SC-S2, SC-S3

## Context

Write a throwaway script projecting typed edges from current content — characters,
dialogue trees, the one mission, locations. This is the single most load-bearing item in
the sprint: `plan-graph-in-postgres.md` §3.2's entire "drop Neo4j" case rests on this
projection being natural, and `SC-S2`/`SC-S3` both consume its output table directly.
**Schedule this first among the spikes** — a bad answer here needs to surface while
there's still sprint time to react, not on the last day.

## Data checked against the real repo

- Content volume, per `plan-graph-in-postgres.md` §10: ~194 characters, 59 dialogue
  files, 1 mission. This is the exact corpus to project against — do not synthesize
  fixture data for this spike; the whole point is testing against what's actually there.
  (Note: the reference docs stated "25 dialogue files"; the actual count is 59.)
- This is explicitly a **throwaway script** (per `sprint-01.md` §2 preamble) — it does
  not need SC-103's `planning`/`runtime` schemas to exist. Write it against a scratch
  table in the existing dev DB (or a local/temp schema), independent of the setup
  tickets' timeline. Don't block this on SC-103 landing first.

## Acceptance criteria (from the write-up, per `spikes/README.md`'s template)

The answer must state:
- Total row count produced.
- Distinct `edge_kind` values actually present (compare against the candidate list in
  `plan-graph-in-postgres.md` §3.2: `scene_participant`, `sets_flag`, `requires_flag`,
  `located_in`, `gives_item`, `mission_scene`, `affiliated_with`, ...).
- Index size at current volume.
- Whether the projection felt natural or required contorting existing payloads.

**If it required contorting, that is the finding** — say so plainly. The edge-table
approach is then weaker than `plan-graph-in-postgres.md` §3.2 claims, and SC-701 needs
re-planning, not a quiet retry with a different shape.

Write the result to `../../spikes/SC-S1-entity-edges-projection.md` using the template in
`../../spikes/README.md`, including the **"what it changes"** section — a spike without
it is not finished.

## Prompt to execute

```
Write a throwaway script that projects an `entity_edges`-shaped table from this repo's
existing content (characters, dialogue trees, the one mission, locations — read
content/ to find the actual source files; do not use synthetic/fixture data).

Target shape (from docs/feat/scene-centric-backend/plan-graph-in-postgres.md §3.2):
  entity_edges(from_type, from_slug, edge_kind, to_type, to_slug, attrs jsonb)

This is a spike, not production code:
- Do not wait for or depend on SC-103's planning/runtime schemas. Use a scratch table
  in the existing dev database (or a temp schema you create and can drop), independent
  of the setup tickets.
- The script itself can be disposable (a one-off .ts/.mjs under a scratch/spikes path),
  but it must be re-runnable — someone else should be able to execute it and get the
  same numbers.

Produce, and report explicitly:
1. Total row count.
2. Distinct edge_kind values actually present in the output, compared against the
   candidate list in plan-graph-in-postgres.md §3.2.
3. Index size on the projected table at current volume.
4. An honest assessment: did projecting edges from the existing character/dialogue/
   mission/location payloads feel natural, or did it require contorting the source data
   to fit the edge shape? Give concrete examples either way — don't summarize this as a
   yes/no without evidence.

Write the full result — including a "what it changes" section stating which downstream
tickets (SC-701, SC-S2, SC-S3, and the SC-M5 design in roadmap.md) are affected by the
answer — into docs/feat/scene-centric-backend/spikes/SC-S1-entity-edges-projection.md,
following the template already in docs/feat/scene-centric-backend/spikes/README.md.

If the projection required contorting the data, say so as the headline finding — do not
soften it, and do not silently pick a different shape without flagging the mismatch
against plan-graph-in-postgres.md's claim.
```
