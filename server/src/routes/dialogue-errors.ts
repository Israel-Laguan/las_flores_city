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
 *
 * Robustness: the named-constraint set covers the current migrations, but if a
 * future migration recreates these FKs with explicit/renamed constraints we
 * still map any 23503 whose detail references the `dialogue_trees` table (the
 * only FK these write paths can trip on). The mapped branch also logs the
 * original error so operators keep visibility instead of a silent 404.
 */
export function mapDialogueWriteError(error: unknown): MappedDialogueError | null {
  if (!error || typeof error !== 'object') return null;
  const err = error as { code?: string; constraint?: string; detail?: string };
  if (err.code !== '23503') return null;

  const namedTreeFk = err.constraint ? DIALOGUE_TREE_FK_CONSTRAINTS.has(err.constraint) : false;
  const detailRefsDialogueTrees =
    typeof err.detail === 'string' && err.detail.includes('dialogue_trees');

  if (namedTreeFk || detailRefsDialogueTrees) {
    console.warn(
      `[dialogue-errors] mapped FK violation to dialogue_not_found (constraint=${err.constraint ?? '(unnamed)'})`,
      error
    );
    return { status: 404, code: 'dialogue_not_found' };
  }
  return null;
}
