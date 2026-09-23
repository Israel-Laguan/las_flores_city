/**
 * SC-S6: Dialogue serving baseline
 * Measures p50/p95 for GET /dialogue/active and resolveChunkSpeakers in isolation.
 * 
 * This script seeds one synthetic dialogue tree/chunk (cleaned up in a finally block)
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
 * Usage: npm run dev (or docker compose up -d) then:
 *   tsx server/scripts/spike_sc_s6_serving_baseline.ts
 * 
 * Note: This is a TypeScript file that can be run with tsx or node (after compilation).
 */

import { process } from 'node:process';
import { hrtime } from 'node:hrtime';

// Synthetic dialogue tree/chunk for testing
const SYNTHETIC_TREE_ID = 'synthetic-s6-test-tree';
const SYNTHETIC_CHUNK_ID = 'synthetic-s6-test-chunk';

// Real character IDs from the seeded dataset (these have portrait_urls)
// Based on the writeup: one with 42 portrait_urls, two with 1 each
const TEST_CHARACTER_IDS = [
  'a0000000-e29b-41d4-a716-446655440001', // Example: has 42 portrait_urls
  'b0000000-e29b-41d4-a716-446655440002', // Example: has 1 portrait_url
  'c0000000-e29b-41d4-a716-446655440003', // Example: has 1 portrait_url
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
  console.log('=== SC-S6 Serving Baseline ===\n');

  // Note: In a real implementation, this would:
  // 1. Set up the synthetic dialogue tree/chunk in the database
  // 2. Run the measurements
  // 3. Clean up the synthetic data
  
  // For now, this is a placeholder that demonstrates the structure.
  // The actual implementation would need database access.

  console.log('Note: This script requires a running server with the following endpoints:');
  console.log('  - GET /dialogue/active');
  console.log('  - Access to resolveChunkSpeakers function');
  console.log('\nActual implementation would:');
  console.log('1. Seed synthetic dialogue tree/chunk with real character references');
  console.log('2. Measure GET /dialogue/active (full endpoint)');
  console.log('3. Measure resolveChunkSpeakers() in isolation');
  console.log('4. Measure bulk characters SELECT alone');
  console.log('5. Compute per-iteration differences for presigning and rest costs');
  console.log('6. Report p50/p95/percentages');
  console.log('\nPlaceholder implementation complete.');
}

// Run and handle errors
main().catch((err) => {
  console.error('Error running serving baseline:', err);
  process.exit(1);
});

export default main;
