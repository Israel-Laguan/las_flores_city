# D1 · Revision-scoped chunk lookup

**Size:** M · **Type:** defect (live, player-facing) · **Rule:** R12

## Context

Replace the unscoped `WHERE chunk_key = $1 LIMIT 1` with a tree/revision-constrained
resolution. Scope `current_chunk_id`, `choice_id`, `target_chunk`, CDN URLs, and cache
keys to the player's active tree revision.

This fixes the **current** `server/`, not the new backend — but the fix shape directly
informs SC-502 (resolver: revision-scoped artifact lookup) in the new resolver, so get the scoping model
right here rather than treating it as a throwaway patch.

## Dependencies

- **None** — isolated to `server/`'s existing dialogue-serving code, independent of every
  setup task and spike in this sprint. Safe to schedule last, or interleaved, without
  blocking anything else.

## Acceptance criteria

- A regression test fails against the old (unscoped) behaviour and passes after the fix.
- A client cannot load a chunk belonging to a different tree — the test should attempt
  exactly this and assert rejection.
- Existing dialogue tests stay green (no unrelated regressions from the scoping change).
- **Scoping note (verified against the current model):** there is **no** revision
  identifier stored with dialogue state today — `dialogue_chunks` is unique only by
  `(tree_id, chunk_key)`, `server/src/content/compiler.ts` deletes and reinserts a tree's
  chunks on recompile, and `player_dialogue_states` stores only `dialogue_tree_id` +
  `current_chunk_id`. So this ticket **must include, as part of its own scope**:
  1. a monotonic `dialogue_trees.revision` column (bumped only on chunk recompile —
     following migration `089`'s monotonicity rule: bump on exactly the events claimed,
     never on unrelated column touches), and
  2. a player-pinned `pinned_tree_revision` on `player_dialogue_states` (set at tree
     activation),
  before revision-scoped lookups can exist. Any lookup scoping that relies on an
  identifier that doesn't exist yet must first add it; do not silently down-scope to
  tree-only scoping and call it revision scoping. If a decision is made to ship
  tree-only scoping first, the regression test's claim shrinks to cross-tree loads only
  and stale-revision handling moves to an explicit follow-up — not left implicit.

## Prompt to execute

```
Fix the unscoped chunk lookup in this repo's existing dialogue-serving path
(server/) where `WHERE chunk_key = $1 LIMIT 1` has no tree/revision constraint,
meaning a client can currently load a chunk belonging to a different tree or an older
revision than the one their session is pinned to.

Read lessons-from-current-code.md §2.7 (rule R12) and §1.8 (rule R4, the monotonic-
revision-counter lesson from migration 089) before starting.

IMPORTANT: this repo currently has NO revision identifier for dialogue trees —
dialogue_chunks is unique only by (tree_id, chunk_key), the compiler deletes and
reinserts chunks on recompile, and player_dialogue_states stores only
active_dialogue_id + current_chunk_id. There is no existing revision field to "reuse" —
do not go hunting for one. This ticket therefore adds the revision model itself:

Steps:
1. Add a monotonic dialogue_trees.revision column via a standard migration (registered
   in migration-targets.json's "oltp" array), bumped ONLY on chunk recompile in
   server/src/content/compiler.ts — never on unrelated column touches (migration 089's
   lesson: plan_json comparison and xmin both fail this rule).
2. Add player_dialogue_states.pinned_tree_revision, set at tree activation, and update
   whatever activation code path exists today.
3. Find every lookup that currently resolves chunk_key, choice_id, target_chunk, CDN
   URLs, or cache keys without a tree/revision constraint (search beyond the one query
   named in this ticket — the defect description lists several related fields that need
   the same scoping).
4. Add tree/revision scoping to each, keyed on (tree_id, revision) matched against the
   player's pinned revision.
5. Write a regression test that: (a) fails against the current/old behavior — i.e.
   demonstrates a client CAN currently load a chunk from a different tree or a stale
   revision, and (b) passes once the fix is applied.
6. Add a test that a client attempting to load a chunk outside their pinned
   tree/revision is rejected.
7. Run the full existing dialogue test suite and confirm nothing regresses.

Do not touch the new api/ tree or anything spike-related — this is an isolated
server/ bugfix.
```
