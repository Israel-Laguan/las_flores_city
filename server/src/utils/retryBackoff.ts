/**
 * Shared retry/backoff policy for the intake-worker (M22).
 *
 * Extracted from AssetGenerationService so that every resumable job
 * (solidify, plan_fill, asset_generation) uses the SAME exponential backoff
 * the asset generator already used. Keeping the numbers here (and importing
 * them into AssetGenerationService) guarantees consistency by construction.
 */

/** Max attempts for LLM/asset/network failures. */
export const RETRY_MAX_ATTEMPTS = 6;
/** Initial backoff before the first retry. */
export const RETRY_INITIAL_BACKOFF_MS = 60000;
/** Cap on any single backoff delay. */
export const RETRY_MAX_BACKOFF_MS = 300000;

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Exponential backoff delay for a given 1-based attempt number.
 * Mirrors the asset generator's `wait = Math.min(wait * 1.5, 300000)` growth.
 */
export function backoffDelayMs(attempt: number): number {
  const raw = RETRY_INITIAL_BACKOFF_MS * 1.5 ** (attempt - 1);
  const capped = Math.min(raw, RETRY_MAX_BACKOFF_MS);
  // Equal jitter: half fixed, half random, to avoid synchronized retries.
  return Math.round(capped / 2 + Math.random() * (capped / 2));
}