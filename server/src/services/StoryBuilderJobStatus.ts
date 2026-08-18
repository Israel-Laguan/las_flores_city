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
 * Bounded snapshot-conflict retry budget for `setJobStatus`. Exported so tests
 * assert against the implementation's budget instead of hardcoding a literal
 * that silently diverges when this changes.
 */
export const MAX_CAS_RETRIES = 4;

/**
 * Pipeline ordinal for a job status. Used so a snapshot-conflict retry cannot
 * regress the cached status by reapplying an older intermediate `status` over a
 * newer snapshot: the merge always keeps the further-along status while still
 * applying the patch's non-status fields (stage/publish/migration/etc.).
 */
// Progress ordinal for the merge guard. `failed` is deliberately NOT a progress
// state — it is a terminal status and must never out-rank the resumable progress
// statuses. Keeping it out lets a resumed run's `staging`/`migrating`/`verifying`/
// `verified` writes replace a prior `failed` status, while a genuine `failed`
// write still always wins explicitly in mergeStatus.
const STATUS_ORDER: SolidifyJobStatus['status'][] = [
  'pending',
  'staging',
  'migrating',
  'verifying',
  'verified',
];
function statusOrdinal(s: SolidifyJobStatus['status']): number {
  const i = STATUS_ORDER.indexOf(s);
  // `failed` (and any unknown status) is not a progress state: return the lowest
  // ordinal so a progress write always advances past it. `pending`/`failed` are
  // handled explicitly in mergeStatus.
  return i === -1 ? -1 : i;
}

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
  // On a snapshot-conflict retry, `status.status` is the patch's own (possibly
  // older) intermediate status, while `existing` is the newer snapshot the retry
  // re-read. Keep the further-along status so the retry merges the patch's
  // non-status fields on top of the newer status instead of regressing it.
  const patchStatus = status.status ?? existing?.status ?? 'pending';
  const baseStatus = existing?.status ?? 'pending';
  // A `pending` initializer is an explicit reset for a NEW run: it must always
  // take over, even when the cache holds a terminal status (`verified`/`failed`)
  // from a prior run. The monotonic merge below would otherwise keep the old
  // terminal status and skip the per-run-field cleanup, so a retry would report
  // the previous run's stale status throughout its execution.
  const mergedStatus = patchStatus === 'pending'
    ? 'pending'
    // A genuine failure is always surfaced (terminal), regardless of the current
    // base status.
    : patchStatus === 'failed'
      ? 'failed'
      : statusOrdinal(patchStatus) >= statusOrdinal(baseStatus)
        ? patchStatus
        : baseStatus;

  const merged: SolidifyJobStatus = {
    ...existing,
    ...Object.fromEntries(
      Object.entries(status).filter(([, v]) => v !== undefined),
    ),
    status: mergedStatus,
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

    // Distinguish a true cache miss from a present-but-unversioned (legacy)
    // entry. A miss uses '' so the snapshot guard stays OFF and the first write
    // succeeds unconditionally. A legacy entry (no `version` field, still within
    // the 30-minute TTL) uses the '\0' sentinel: the redis CAS recognizes it as a
    // legacy entry and adopts it atomically, instead of disabling the snapshot
    // guard for every subsequent same-token writer (which would let two such
    // writers clobber each other's stage/publish/migration data). A versioned
    // entry passes its real version so concurrent same-run writes conflict and
    // retry.
    const expectedVersion = existing
      ? (existing.version ?? '\0')
      : '';
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
    // code === 2 (snapshot conflict) and code === -1 (infrastructure error — a
    // connection/EVAL failure surfaced by the CAS helper, distinct from the 0
    // stale-run drop) are both retryable: re-read a fresher snapshot / re-attempt
    // the write after a brief backoff, and surface the failure if retries run out.
    attempt += 1;
    if (attempt >= MAX_CAS_RETRIES) {
      console.error(
        `[StoryBuilderJobStatus] Giving up on status write for plan ${planId} ` +
        `(token ${runToken}) after ${MAX_CAS_RETRIES} attempts (last CAS code ${code})`,
      );
      return;
    }
    await new Promise((r) => setTimeout(r, 5 * attempt));
  }
}
