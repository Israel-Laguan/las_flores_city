// api/planning/src/scene/test-support.ts
// Test-only helpers for the scene composition suites (pure, no I/O).

/** Recursively freezes `value` so any mutation in the code under test throws. */
export function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}
