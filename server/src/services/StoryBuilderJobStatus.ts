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

/** Write job status to cache (hot read path for polling). */
export async function setJobStatus(planId: string, status: Partial<SolidifyJobStatus>): Promise<void> {
  const now = new Date().toISOString();
  const existing = await getCache<SolidifyJobStatus>(`${JOB_CACHE_PREFIX}${planId}`);
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
    startedAt: existing?.startedAt ?? now,
    planId,
    updatedAt: now,
  };
  // When a NEW run is initialized (`pending` is only ever written at the start
  // of a solidify run in approveAndSolidifyPlan), discard per-run fields from a
  // prior run (error / verificationReport / stage / publish / migration) so a
  // retry within the cache TTL never surfaces a stale failure on a fresh,
  // pending or later success.
  if (merged.status === 'pending') {
    merged.stage = undefined;
    merged.publish = undefined;
    merged.migration = undefined;
    merged.verificationReport = undefined;
    merged.error = undefined;
  }
  // Cache TTL: 30 minutes — long enough for slow plans, short enough to not leak
  await setCache(`${JOB_CACHE_PREFIX}${planId}`, merged, 1800);
}
