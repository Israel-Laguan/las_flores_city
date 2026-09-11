# D1 · Revision-scoped chunk lookup

**Size:** M · **Type:** defect (live, player-facing) · **Rule:** R12

## Context

Replace the unscoped `WHERE chunk_key = $1 LIMIT 1` with a tree/revision-constrained
resolution. Scope `current_chunk_id`, `choice_id`, `target_chunk`, CDN URLs, and cache
keys to the player's active tree revision.

This fixes the **current** `server/`, not the new backend — but the fix shape directly
informs SC-505 in the new resolver (per `sprint-01.md`'s note), so get the scoping model
right here rather than treating it as a throwaway patch.

## Dependencies

- **None** — isolated to `server/`'s existing dialogue-serving code, independent of every
  setup task and spike in this sprint. Safe to schedule last, or interleaved, without
  blocking anything else.

## Acceptance criteria

- A regression test fails against the old (unscoped) behaviour and passes after the fix.
- A client cannot load a chunk belonging to a different tree or an older revision — the
  test should attempt exactly this and assert rejection.
- Existing dialogue tests stay green (no unrelated regressions from the scoping change).
- The revision/tree identifier used for scoping is monotonic and bumps only on its
  claimed events — per `lessons-from-current-code.md` R4/§1.8's lesson from migration
  `089`'s `graph_revision` mistake. Don't introduce a second ad-hoc revision counter;
  reuse whatever the existing tree/revision identifier already is.

## Prompt to execute

```
Fix the unscoped chunk lookup in this repo's existing dialogue-serving path
(server/) where `WHERE chunk_key = $1 LIMIT 1` has no tree/revision constraint,
meaning a client can currently load a chunk belonging to a different tree or an older
revision than the one their session is pinned to.

Read lessons-from-current-code.md §2.7 (rule R12) and §1.8 (rule R4, the monotonic-
revision-counter lesson from migration 089) before starting — do not invent a new
revision/version field if one already exists and is being ignored by this lookup.

Steps:
1. Find every lookup that currently resolves chunk_key, choice_id, target_chunk, CDN
   URLs, or cache keys without a tree/revision constraint (search beyond the one query
   named in this ticket — the defect description lists several related fields that need
   the same scoping).
2. Add tree/revision scoping to each, using whatever revision identifier this repo
   already tracks for dialogue trees (do not add a second, parallel revision concept).
3. Write a regression test that: (a) fails against the current/old behavior — i.e.
   demonstrates a client CAN currently load a chunk from a different tree/revision, and
   (b) passes once the fix is applied.
4. Add a test that a client attempting to load a chunk outside their pinned
   tree/revision is rejected.
5. Run the full existing dialogue test suite and confirm nothing regresses.

Do not touch the new api/ tree or anything spike-related — this is an isolated
server/ bugfix.
```
