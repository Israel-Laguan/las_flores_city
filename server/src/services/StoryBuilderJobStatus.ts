// ============================================================
// StoryBuilderJobStatus - shared durable job-status cache helpers.
//
// Owns JOB_CACHE_PREFIX and setJobStatus, the cache read/write used
// by both the solidify pipeline (StoryBuilderSolidify.ts) and its
// fail-path helpers (StoryBuilderSolidifyFail.ts), breaking their
// previous circular import. Split out of StoryBuilderSolidify.ts.
// ============================================================
import { getRedis, getCache, setCache } from '@las-flores/infra';
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
 *
 * Uses Redis WATCH/MULTI/EXEC for atomic CAS to prevent race conditions where
 * an older run's token check passes but then gets overwritten by a newer run's write.
 */
export async function setJobStatus(
  planId: string,
  status: Partial<SolidifyJobStatus>,
  runToken?: string,
): Promise<void> {
  const now = new Date().toISOString();
  const cacheKey = `${JOB_CACHE_PREFIX}${planId}`;
  
  // For initializers (pending with token), use atomic WATCH/SET to ensure
  // the write is atomic even when another process is reading
  const isInitializer = status.status === 'pending' && !!runToken;
  
  if (isInitializer) {
    // Initializers always win - use WATCH to detect concurrent modifications
    const redis = getRedis();
    try {
      await redis.watch(cacheKey);
      // Re-read under watch
      const currentRaw = await redis.get(cacheKey);
      const existing = currentRaw ? JSON.parse(currentRaw) : null;
      
      const isFreshRun = !existing || existing.runToken !== runToken;
      
      const merged: SolidifyJobStatus = {
        ...existing,
        ...Object.fromEntries(Object.entries(status).filter(([, v]) => v !== undefined)),
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
        if (isFreshRun) merged.startedAt = now;
      }
      
      // Use MULTI/EXEC for atomic write
      const multi = redis.multi();
      multi.set(cacheKey, JSON.stringify(merged), 'EX', 1800);
      const results = await multi.exec();
      
      // exec() returns null if the watch was violated (key changed during transaction)
      // In that case, retry once
      if (results === null) {
        await redis.unwatch();
        await setCache(cacheKey, merged, 1800);
      }
    } catch (err) {
      await redis.unwatch();
      console.error(`[StoryBuilderJobStatus] Initializer CAS failed for ${planId}:`, (err as Error).message);
      // Fall back to non-atomic
      const merged: SolidifyJobStatus = {
        status: 'pending',
        planId,
        startedAt: now,
        updatedAt: now,
        runToken,
      };
      await setCache(cacheKey, merged, 1800);
    }
    return;
  }

  // For non-initializers, use atomic CAS
  if (runToken) {
    const redis = getRedis();
    let retries = 3;
    
    while (retries > 0) {
      try {
        await redis.watch(cacheKey);
        
        // Re-read current value under watch
        const currentRaw = await redis.get(cacheKey);
        const existing = currentRaw ? JSON.parse(currentRaw) : null;
        
        // Check token - reject if doesn't match
        if (existing?.runToken && existing.runToken !== runToken) {
          await redis.unwatch();
          console.warn(
            `[StoryBuilderJobStatus] Dropping stale status write for plan ${planId} ` +
            `(token ${runToken} != cached ${existing.runToken})`,
          );
          return;
        }
        
        // Token matches (or no existing token), build merged status
        const isFreshRun = false; // Only initializers are fresh
        const merged: SolidifyJobStatus = {
          ...existing,
          ...Object.fromEntries(Object.entries(status).filter(([, v]) => v !== undefined)),
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
        
        // Use MULTI/EXEC for atomic write
        const multi = redis.multi();
        multi.set(cacheKey, JSON.stringify(merged), 'EX', 1800);
        const results = await multi.exec();
        
        if (results !== null) {
          // Success - CAS was atomic
          return;
        }
        // Watch was violated, retry
        retries--;
      } catch (err) {
        try {
          await redis.unwatch();
        } catch {
          // ignore
        }
        retries--;
      }
    }
    
    // Fall back to non-atomic after retries exhausted
    console.warn(`[StoryBuilderJobStatus] CAS retries exhausted for ${planId}, falling back to non-atomic`);
    const existing = await getCache<SolidifyJobStatus>(cacheKey);
    const merged: SolidifyJobStatus = {
      ...existing,
      ...Object.fromEntries(Object.entries(status).filter(([, v]) => v !== undefined)),
      status: status.status ?? existing?.status ?? 'pending',
      startedAt: existing?.startedAt ?? now,
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
    await setCache(cacheKey, merged, 1800);
    return;
  }

  // No token provided (legacy best-effort path)
  const existing = await getCache<SolidifyJobStatus>(cacheKey);
  const merged: SolidifyJobStatus = {
    ...existing,
    ...Object.fromEntries(Object.entries(status).filter(([, v]) => v !== undefined)),
    status: status.status ?? existing?.status ?? 'pending',
    startedAt: existing?.startedAt ?? now,
    planId,
    updatedAt: now,
    runToken: existing?.runToken,
  };
  if (merged.status === 'pending') {
    merged.stage = undefined;
    merged.publish = undefined;
    merged.migration = undefined;
    merged.verificationReport = undefined;
    merged.error = undefined;
  }
  await setCache(cacheKey, merged, 1800);
}
