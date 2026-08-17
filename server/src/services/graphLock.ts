// ============================================================
// graphLock — in-process mutual exclusion for graph write paths
//
// The canonical `:Content` graph is a derived/authoring IR. A full resync
// (gatherBaseGraphData + upsert + prune) and a plan `commitGraph` both rewrite
// the same canonical nodes, so they must not interleave. This module provides a
// single mutex so only one graph write operation runs at a time within a
// process. (Cross-process exclusion is out of scope — the server runs a single
// graph-authoritative process.)
// ============================================================

let _chain: Promise<unknown> = Promise.resolve();

/**
 * Run `fn` with exclusive access to the canonical graph. Calls serialize: the
 * next caller waits until the current operation fully completes.
 */
export async function withGraphWriteLock<T>(fn: () => Promise<T>): Promise<T> {
  const prev = _chain;
  let release!: () => void;
  const next = new Promise<void>((resolve) => { release = resolve; });
  _chain = prev.then(() => next);
  await prev;
  try {
    return await fn();
  } finally {
    release();
  }
}
