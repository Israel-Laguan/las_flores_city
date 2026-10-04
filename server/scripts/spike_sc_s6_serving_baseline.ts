/**
 * SC-S6: Dialogue serving baseline (HARNESS NOT YET IMPLEMENTED)
 * Measures p50/p95 for GET /dialogue/active and resolveChunkSpeakers in isolation.
 *
 * Intended harness (NOT implemented — see the ⚠️ block at the end of this header).
 * It would seed one synthetic dialogue tree/chunk (cleaned up in a finally block)
 * whose 3 nodes reference 3 real characters from the existing seeded dataset:
 * - one with 42 portrait_urls entries (all real s3:// keys)
 * - two with 1 entry each
 *
 * Runs 3 warmup + 30 timed iterations for each measurement:
 * 1. Full endpoint, blackbox HTTP — GET /dialogue/active against the live server
 * 2. resolveChunkSpeakers() in isolation — same process, called directly
 * 3. The bulk characters SELECT, alone — the exact query resolveChunkSpeakers issues
 *
 * Presigning-only cost and "rest of /dialogue/active" cost are derived per iteration
 * from paired timings.
 *
 * Usage: tsx server/scripts/spike_sc_s6_serving_baseline.ts
 *   — this EXITS NON-ZERO BY DESIGN. It prints what a real harness must do and
 *   throws; it is not a runnable benchmark and no server needs to be running.
 *
 * Note: This is a TypeScript file that can be run with tsx or node (after compilation).
 *
 * ⚠️ NOT REPRODUCIBLE YET. `main()` below performs no seeding, no measurement and no
 * paired differencing — it exits non-zero with instructions instead. The results recorded
 * in `docs/feat/scene-centric-backend/spikes/SC-S6-serving-baseline.md` came from an
 * earlier uncommitted harness and cannot be re-derived until this file implements:
 *   1. seeding a synthetic tree/chunk (via ContentPublishService — post-M32 the
 *      node/leaf maps live behind `content_url`, not in DB columns),
 *   2. a player cursor pointing at it plus a valid bearer token for the HTTP leg,
 *   3. the three timed measurements above, recorded by iteration index,
 *   4. per-iteration paired differencing (presigning_i, rest_i),
 *   5. reporting and cleanup.
 * Nothing in this file should be read as a reproduction of those numbers.
 */

import process, { hrtime } from 'node:process';

// Synthetic dialogue tree/chunk for testing
const SYNTHETIC_TREE_ID = 'synthetic-s6-test-tree';
const SYNTHETIC_CHUNK_ID = 'synthetic-s6-test-chunk';

// UNVERIFIED PLACEHOLDERS — do not trust, and do not seed from them.
// These are NOT character IDs from the seeded dataset:
//   a0000000-…0001 = the real `great_lithium_leak` MISSION id
//   b0000000-…0002 = a vault CLUE id (content/vault/great_lithium_leak_clues.yaml)
//   c0000000-…0003 = appears nowhere in content/
// The "one with 42 portrait_urls, two with 1" distribution quoted in the writeup
// therefore cannot be reproduced from these values. Replace with real character
// ids before any harness is implemented.
const TEST_CHARACTER_IDS = [
  'a0000000-e29b-41d4-a716-446655440001',
  'b0000000-e29b-41d4-a716-446655440002',
  'c0000000-e29b-41d4-a716-446655440003',
];

// Configuration
const WARMUP_ITERATIONS = 3;
const TIMED_ITERATIONS = 30;
const TOTAL_ITERATIONS = WARMUP_ITERATIONS + TIMED_ITERATIONS;

/**
 * Sleep for a specified number of milliseconds
 */
async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Compute percentiles from a sorted array of numbers
 */
function computePercentiles(sortedValues: number[], percentiles: number[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const p of percentiles) {
    const index = Math.floor((p / 100) * sortedValues.length);
    const key = p === 50 ? 'p50' : p === 95 ? 'p95' : `p${p}`;
    result[key] = sortedValues[index];
  }
  return result;
}

/**
 * Format timing results
 */
function formatResults(
  label: string,
  timings: number[],
  sampleInfo: string = '',
): { label: string; min: number; p50: number; p95: number; max: number; n: number; sampleInfo: string } {
  const sorted = [...timings].sort((a, b) => a - b);
  const percentiles = computePercentiles(sorted, [50, 95]);

  return {
    label,
    min: sorted[0],
    p50: percentiles.p50,
    p95: percentiles.p95,
    max: sorted[sorted.length - 1],
    n: sorted.length,
    sampleInfo,
  };
}

/**
 * Run timed iterations and return results
 */
async function runTimedIterations<T>(
  operation: (iteration: number) => Promise<T>,
  label: string,
  sampleInfo: string = '',
): Promise<{ results: T[]; timings: number[]; formatted: ReturnType<typeof formatResults> }> {
  const results: T[] = [];
  const timings: number[] = [];

  for (let i = 0; i < TOTAL_ITERATIONS; i++) {
    const start = hrtime.bigint();
    const result = await operation(i);
    const end = hrtime.bigint();
    const ms = Number(end - start) / 1_000_000;

    results.push(result);
    if (i >= WARMUP_ITERATIONS) {
      timings.push(ms);
    }
  }

  return {
    results,
    timings,
    formatted: formatResults(label, timings, sampleInfo),
  };
}

/**
 * Main test function
 */
async function main(): Promise<void> {
  console.error(
    'SC-S6 harness is NOT implemented. This script currently performs no\n' +
      'seeding, measurement or differencing, so it cannot reproduce the baseline\n' +
      'recorded in docs/feat/scene-centric-backend/spikes/SC-S6-serving-baseline.md.\n\n' +
      'To implement it, this script must:\n' +
      '  1. Seed a synthetic dialogue tree/chunk (ContentPublishService.publishDialogueTree —\n' +
      '     post-M32 the node/leaf maps live behind content_url, not in DB columns) whose 3\n' +
      `     nodes reference the characters ${TEST_CHARACTER_IDS.join(', ')}.\n` +
      '  2. Point a player cursor at it and mint a bearer token for the HTTP leg.\n' +
      `  3. Measure ${WARMUP_ITERATIONS} warmup + ${TIMED_ITERATIONS} timed iterations of:\n` +
      '       - GET /dialogue/active (full endpoint, blackbox HTTP)\n' +
      '       - resolveChunkSpeakers() called directly\n' +
      '       - the bulk characters SELECT alone\n' +
      '  4. Compute the paired per-iteration differences:\n' +
      '       presigning_i = resolveChunkSpeakers_i - bulkSelect_i\n' +
      '       rest_i        = endpoint_i - resolveChunkSpeakers_i\n' +
      '     then report p50/p95 from those difference distributions.\n' +
      '  5. Clean up the synthetic data in a finally block.\n',
  );
  throw new Error(
    'SC-S6 harness not implemented — see the instructions above and the file header.',
  );
}

// Run and handle errors
main().catch((err) => {
  console.error('Error running serving baseline:', err);
  process.exit(1);
});

export default main;
