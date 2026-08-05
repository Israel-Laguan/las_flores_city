// ============================================================
// Dialogue write-path error mapping
// ============================================================
// dialogue-start, dialogue-choose, and archive/start-simulation all write
// `player_states.active_dialogue_id` (and seed `player_dialogue_states
// .dialogue_tree_id`) with a dialogue-tree id. When that id no longer exists
// in `dialogue_trees` (e.g. the tree was archived/removed while a player still
// holds a cursor into it, or content re-migrations raced a request), Postgres
// raises a foreign-key violation (SQLSTATE 23503) naming the constraint.
//
// Left uncaught, these bubble up as an opaque 500 + `console.error`. Mapping
// them to a clean, typed 404 gives clients a deterministic, non-flaky response
// instead of an ambiguous server error. All other errors pass through to the
// caller's existing 500 path.

/** FK constraints on dialogue_cursor writes that indicate a missing dialogue tree. */
export const DIALOGUE_TREE_FK_CONSTRAINTS = new Set([
  'player_states_active_dialogue_id_fkey',
  'player_dialogue_states_dialogue_tree_id_fkey',
]);

export interface MappedDialogueError {
  status: number;
  code: string;
}

/**
 * Detect a foreign-key violation caused by writing a dialogue-tree id that is
 * no longer present in `dialogue_trees`. Returns a clean 404 mapping when the
 * violation matches one of the cursor FK constraints, otherwise null.
 */
export function mapDialogueWriteError(error: unknown): MappedDialogueError | null {
  if (!error || typeof error !== 'object') return null;
  const err = error as { code?: string; constraint?: string };
  if (err.code === '23503' && err.constraint && DIALOGUE_TREE_FK_CONSTRAINTS.has(err.constraint)) {
    return { status: 404, code: 'dialogue_not_found' };
  }
  return null;
}
