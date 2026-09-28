/**
 * Choice-reachability validation (R12 / D2).
 *
 * Validates that a submitted `choice_id` belongs to the player's current node
 * in the effective (overlay-merged) dialogue node map BEFORE any effect
 * processing runs. This is the validate-before-apply ordering required by
 * lessons-from-current-code.md §2.7 Rule R12, and the direct precedent for
 * SC-M3's new-backend equivalent (roadmap.md SC-M3). Keep this as a clean,
 * separable function so SC-M3 can reuse the same shape in `api/runtime`.
 */

/**
 * Find the choice reachable from `currentNode` matching `choiceId`.
 *
 * Matches on `c.id === choiceId || c.next_node_id === choiceId` — mirrors the
 * dual-key lookup used throughout dialogue-choose so both the choice id and
 * its target node id are accepted as the client-supplied value.
 *
 * Returns the matched choice object or `null` if no reachable choice matches.
 */
export function findReachableChoice(currentNode: any, choiceId: string): any | null {
  if (!currentNode || !Array.isArray(currentNode.choices)) return null;
  if (!choiceId || typeof choiceId !== 'string') return null;
  const found = currentNode.choices.find(
    (c: any) => c.id === choiceId || c.next_node_id === choiceId,
  );
  return found ?? null;
}

/**
 * Boolean wrapper — is `choiceId` reachable from `currentNode`?
 */
export function isChoiceReachable(currentNode: any, choiceId: string): boolean {
  return findReachableChoice(currentNode, choiceId) !== null;
}
