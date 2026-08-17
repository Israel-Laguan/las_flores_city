// ============================================================
// StoryBuilderJobStatus - shared durable job-status cache helpers.
//
// Owns JOB_CACHE_PREFIX and setJobStatus, the cache read/write used
// by both the solidify pipeline (StoryBuilderSolidify.ts) and its
// fail-path helpers (StoryBuilderSolidifyFail.ts), breaking their
// previous circular import. Split out of StoryBuilderSolidify.ts.
// ============================================================
import { randomUUID } from 'node:crypto';
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
    // Fresh version on every write so a concurrent same-run write that lands
    // between read and write is detectable by the CAS (snapshot guard).
    version: randomUUID(),
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
  const cacheKey = `${JOB_CACHE_PREFIX}${planId}`;
  const isInitializer = status.status === 'pending' && !!runToken;

  const MAX_CAS_RETRIES = 4;

  // Optimistic-concurrency loop. A *snapshot* conflict (same run, a newer
  // concurrent write landed between our read and our write) is reported by the
  // CAS as code 2; we re-read and retry so the later merge is applied on top of
  // the newer entry rather than erasing it. A genuine owner-mismatch (different
  // runToken) is code 0 and is dropped, not retried.
  let attempt = 0;
  while (true) {
    const now = new Date().toISOString();

    // Read the current value. The CAS primitive re-checks both the token and the
    // snapshot version at write time, so a stale read here is safely retried.
    const existing = await getCache<SolidifyJobStatus>(cacheKey);

    const isFreshRun = isInitializer && (!existing || existing.runToken !== runToken);

    const merged = mergeStatus(existing, status, planId, now, runToken, isFreshRun);

    // Initializers always take ownership (unconditional). Non-initializers with a
    // token are CAS-guarded (dropped if a newer run's token is cached). Legacy
    // writes (no token) are best-effort overwrite.
    const mode: 'init' | 'token' | 'legacy' = isInitializer
      ? 'init'
      : (runToken ? 'token' : 'legacy');

    const expectedVersion = existing?.version ?? '';
    const code = await casSetCache(cacheKey, merged, JOB_STATUS_TTL_SECONDS, runToken ?? '', mode, expectedVersion);

    if (code === 1) return;                 // written
    if (code === 0) {                       // owner mismatch (stale run) → drop
      if (mode === 'token') {
        console.warn(
          `[StoryBuilderJobStatus] Dropping stale status write for plan ${planId} ` +
          `(token ${runToken} no longer owns the cache entry)`,
        );
      }
      return;
    }
    // code === 2: snapshot conflict → retry after a brief backoff.
    attempt += 1;
    if (attempt >= MAX_CAS_RETRIES) {
      console.warn(
        `[StoryBuilderJobStatus] Giving up on status write for plan ${planId} ` +
        `(token ${runToken}) after ${MAX_CAS_RETRIES} snapshot-conflict retries`,
      );
      return;
    }
    await new Promise((r) => setTimeout(r, 5 * attempt));
  }
}
