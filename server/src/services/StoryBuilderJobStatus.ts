// ============================================================
// StoryBuilderJobStatus - shared durable job-status cache helpers.
//
// Owns JOB_CACHE_PREFIX and setJobStatus, the cache read/write used
// by both the solidify pipeline (StoryBuilderSolidify.ts) and its
// fail-path helpers (StoryBuilderSolidifyFail.ts), breaking their
// previous circular import. Split out of StoryBuilderSolidify.ts.
// ============================================================
import { getCache, setCache } from '@las-flores/infra';
import type { SolidifyJobStatus } from './StoryBuilderOrchestrator.js';

export const JOB_CACHE_PREFIX = 'story-builder:job:';

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
 */
export async function setJobStatus(
  planId: string,
  status: Partial<SolidifyJobStatus>,
  runToken?: string,
): Promise<void> {
  const now = new Date().toISOString();
  const existing = await getCache<SolidifyJobStatus>(`${JOB_CACHE_PREFIX}${planId}`);

  // A `pending` initializer always wins: it establishes the new run and replaces
  // the cached token, so the stale-check below is bypassed for it.
  const isInitializer = status.status === 'pending' && !!runToken;

  // Compare-and-set: reject stale non-pending writes when a different run owns
  // the cache entry.
  if (!isInitializer && runToken && existing?.runToken && existing.runToken !== runToken) {
    console.warn(
      `[StoryBuilderJobStatus] Dropping stale status write for plan ${planId} ` +
      `(token ${runToken} != cached ${existing.runToken})`,
    );
    return;
  }

  const isFreshRun = isInitializer && (!existing || existing.runToken !== runToken);

  // Preserve previously cached fields (stage / publish / migration /
  // verificationReport / error) then overlay only the *defined* values from
  // `status`. Callers such as runMigrationStage and runVerifyAndTerminal pass
  // `stage`/`publish`/`migration` unconditionally even when they have no value
  // to report — stripping those undefined keys here keeps the last known value
  // for polling instead of erasing it. status/startedAt/planId/updatedAt are
  // pinned last so a stale `existing` spread can never win.
  const merged: SolidifyJobStatus = {
    ...existing,
    ...Object.fromEntries(Object.entries(status).filter(([, v]) => v !== undefined)),
    status: status.status ?? existing?.status ?? 'pending',
    startedAt: isFreshRun ? now : (existing?.startedAt ?? now),
    planId,
    updatedAt: now,
    runToken: runToken ?? existing?.runToken,
  };
  // When a NEW run is initialized (`pending` is only ever written at the start
  // of a solidify run in approveAndSolidifyPlan), discard per-run fields from a
  // prior run (error / verificationReport / stage / publish / migration) so a
  // retry within the cache TTL never surfaces a stale failure on a fresh,
  // pending or later success. Reset startedAt too so polling reports a correct
  // elapsed duration for the new run.
  if (merged.status === 'pending') {
    merged.stage = undefined;
    merged.publish = undefined;
    merged.migration = undefined;
    merged.verificationReport = undefined;
    merged.error = undefined;
    if (isFreshRun) merged.startedAt = now;
  }
  // Cache TTL: 30 minutes — long enough for slow plans, short enough to not leak
  await setCache(`${JOB_CACHE_PREFIX}${planId}`, merged, 1800);
}
