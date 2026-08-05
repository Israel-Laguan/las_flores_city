// Shared test time helpers — no describe/it declarations.
//
// Imported by both unit and integration tests that need a DST-safe
// "days ago" date anchored to a fixed `now`. Keeping this out of a
// test module (no describe/it) avoids loading a whole test suite as
// a side effect of importing a helper.

/**
 * Helper to create a date in the past — DST-safe because it subtracts
 * exact milliseconds from `from` (default: now) rather than wall-clock
 * day arithmetic. Accepts a `from` anchor so tests can pass the SAME
 * `now` they feed to computeRelationshipDecay, guaranteeing an exact
 * integer-day delta (re-reading Date.now() independently of `now`
 * creates a sub-millisecond skew that Math.floor() can truncate to
 * N-1 days — the original flake).
 */
export function daysAgo(days: number, from: Date = new Date()): Date {
  return new Date(from.getTime() - days * 24 * 60 * 60 * 1000);
}
