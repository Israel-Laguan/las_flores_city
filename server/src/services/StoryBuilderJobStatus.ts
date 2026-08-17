// ============================================================
// StoryBuilderJobStatus - shared durable job-status cache helpers.
//
// Owns JOB_CACHE_PREFIX and setJobStatus, the cache read/write used
// by both the solidify pipeline (StoryBuilderSolidify.ts) and its
// fail-path helpers (StoryBuilderSolidifyFail.ts), breaking their
// previous circular import. Split out of StoryBuilderSolidify.ts.
// ============================================================
import { getCache, casSetCache } from '@las-flores/infra';
import type { SolidifyJobStatus } from './StoryBuilderOrchestrator.js';

export const JOB_CACHE_PREFIX = 'story-builder:job:';
export const JOB_STATUS_TTL_SECONDS = 1800;

/**
 * Merge a partial status update onto the existing cached status.
 *
 * `isFreshRun` is true only for an initializer whose `runToken` is not already
 * the cached owner: a fresh run resets `startedAt` to now, while a re-entry of
 * the SAME run (same token) preserves the original start time. A `pending`
 * status always clears the per-run fields from any prior run so a retry starts
 * clean rather than inheriting a previous attempt's progress.
 */
function mergeStatus(
  existing: SolidifyJobStatus | null,
  status: Partial<SolidifyJobStatus>,
  planId: string,
  now: string,
  runToken: string | undefined,
  isFreshRun: boolean,
): SolidifyJobStatus {
  const merged: SolidifyJobStatus = {
    ...existing,
    ...Object.fromEntries(
      Object.entries(status).filter(([, v]) => v !== undefined),
    ),
    status: status.status ?? existing?.status ?? 'pending',
    startedAt: isFreshRun ? now : (existing?.startedAt ?? now),
    planId,
    updatedAt: now,
    runToken: runToken ?? existing?.runToken,
  };

  if (merged.status === 'pending') {
    merged.stage = undefined;
    merged.publish = undefined;
    merged.migration = undefined;
    merged.verificationReport = undefined;
    merged.error = undefined;
  }

  return merged;
}

/**
 * Write job status to cache (hot read path for polling).
 *
 * `runToken` (optional) implements compare-and-set: pass the token issued by the
 * run's initial `pending` write to every subsequent write for that run. A
 * non-pending write whose token does not match the currently cached token is a
 * *stale* write from a prior run still in flight (e.g. a failed run's error
 * handler firing after a retry already started a new run) and is dropped so it
 * cannot overwrite the newer run's status.
 *
 * A `pending` write is a NEW run initializer (only `approveAndSolidifyPlan`
 * emits it): it ATOMICALLY REPLACES the cached runToken with its own fresh token
 * and discards the prior run's per-run fields, so a retry can always take
 * ownership of the cache entry — even when the previous run left a stale entry
 * behind within the cache TTL.
 *
 * The CAS primitive (`casSetCache`) is a single atomic Lua EVAL: it checks the
 * token and performs the SET with expiration in one uninterrupted step, so
 * concurrent calls on the shared Redis client cannot clobber each other.
 */
export async function setJobStatus(
  planId: string,
  status: Partial<SolidifyJobStatus>,
  runToken?: string,
): Promise<void> {
  const now = new Date().toISOString();
  const cacheKey = `${JOB_CACHE_PREFIX}${planId}`;

  // Read the current value once. The CAS primitive re-checks the token at write
  // time, so a stale snapshot here is harmless — a stale run's write is still
  // dropped by the token guard inside the script.
  const existing = await getCache<SolidifyJobStatus>(cacheKey);

  const isInitializer = status.status === 'pending' && !!runToken;
  // A fresh run is the first time this specific runToken owns the entry.
  const isFreshRun = isInitializer && (!existing || existing.runToken !== runToken);

  const merged = mergeStatus(existing, status, planId, now, runToken, isFreshRun);

  // Initializers always take ownership (unconditional). Non-initializers with a
  // token are CAS-guarded (dropped if a newer run's token is cached). Legacy
  // writes (no token) are best-effort overwrite.
  const mode: 'init' | 'token' | 'legacy' = isInitializer
    ? 'init'
    : (runToken ? 'token' : 'legacy');

  const ok = await casSetCache(cacheKey, merged, JOB_STATUS_TTL_SECONDS, runToken ?? '', mode);
  if (!ok && mode === 'token') {
    console.warn(
      `[StoryBuilderJobStatus] Dropping stale status write for plan ${planId} ` +
      `(token ${runToken} no longer owns the cache entry)`,
    );
  }
}
