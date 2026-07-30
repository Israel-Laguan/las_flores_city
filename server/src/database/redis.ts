import path from 'node:path';
import Redis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });

// Lazy Redis connection — only created when first accessed.
// Prevents Jest from hanging on open TCPWRAP handles when tests
// import modules that transitively pull in this file without
// actually needing Redis.
let _redis: Redis | null = null;

// Set to true by closeRedis() so retryStrategy can short-circuit.
// This flag lives in the same module instance as _redis, so it is
// effective even when closeRedis() is called from a different
// module instance (e.g. globalTeardown.cjs via tsx/cjs vs test
// files via ts-jest — they get separate module registries under
// --detectOpenHandles/--runInBand).
let redisClosed = false;

export function getRedis(): Redis {
  if (!_redis) {
    // Reset the closed flag for the new client so it can be closed
    // again by a subsequent closeRedis() call.
    redisClosed = false;

    // Under Jest (unit or integration), JEST_WORKER_ID is set even
    // in --runInBand mode.  In unit tests Redis is typically unavailable,
    // and an unbounded retryStrategy would keep scheduling setTimeout
    // handles that prevent the Node.js event loop from exiting — the
    // root cause of the `timeout 180 … test:unit` exit-code-124 hang.
    // Returning null tells ioredis to give up immediately after the
    // first connection failure (it emits 'end' and releases all handles).
    // Integration tests have a real Redis, so the first attempt succeeds
    // and the retry strategy is never consulted.
    const isTestEnv = !!process.env.JEST_WORKER_ID;

    _redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        // Stop retrying once closeRedis() has been called.
        if (redisClosed) {
          return null;
        }
        // In test environments, never retry — prevents event-loop
        // hang when Redis is unavailable (unit tests in CI).
        if (isTestEnv) {
          return null;
        }
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
    });

    _redis.on('connect', () => {
      console.log('✅ Redis connected');
    });

    _redis.on('error', (err) => {
      // Suppress error spam once the connection has been intentionally
      // closed (e.g. during test teardown).  This also prevents the
      // "Cannot log after tests are done" Jest warnings that fire
      // when a lingering socket error arrives after the suite finishes.
      if (!redisClosed) {
        console.error('❌ Redis error:', err);
      }
    });
  }
  return _redis;
}

// Cache helpers
export async function getCache<T = any>(key: string): Promise<T | null> {
  try {
    const data = await getRedis().get(key);
    if (data) {
      return JSON.parse(data);
    }
    return null;
  } catch (error) {
    console.error('Cache get error:', error);
    return null;
  }
}

export async function setCache(key: string, value: any, ttlSeconds: number = 3600): Promise<boolean> {
  try {
    const serialized = JSON.stringify(value);
    if (ttlSeconds === 0) {
      // TTL 0 means "no expiry" — persist until explicitly deleted
      await getRedis().set(key, serialized);
    } else {
      await getRedis().setex(key, ttlSeconds, serialized);
    }
    return true;
  } catch (error) {
    console.error('Cache set error:', error);
    return false;
  }
}

export async function deleteCache(key: string): Promise<boolean> {
  try {
    await getRedis().del(key);
    return true;
  } catch (error) {
    console.error('Cache delete error:', error);
    return false;
  }
}

/**
 * Safely invalidates multiple keys without blocking the Redis event loop.
 * Uses SCAN (incremental iteration) instead of KEYS (O(N) full-block) and
 * UNLINK (async memory reclamation, Redis 4.0+) instead of DEL (synchronous).
 *
 * Prevents the Redis single-threaded event loop from freezing when
 * mass-invalidating patterns like `dialogue:resolved:*` after a Breakthrough
 * Event leaderboard finalisation.
 */
export async function invalidatePattern(pattern: string): Promise<number> {
  let cursor = '0';
  let totalDeleted = 0;

  try {
    do {
      // SCAN returns [nextCursor, keys[]]; COUNT 100 is a hint, not a guarantee
      const [nextCursor, keys] = await getRedis().scan(
        cursor,
        'MATCH', pattern,
        'COUNT', 100
      );
      cursor = nextCursor;

      if (keys.length > 0) {
        // UNLINK reclaims memory in a background thread — non-blocking
        await getRedis().unlink(...keys);
        totalDeleted += keys.length;
      }
    } while (cursor !== '0');
  } catch (error) {
    console.error('Cache invalidate error:', error);
  }

  return totalDeleted;
}

// Content versioning helpers
export async function getContentVersion(contentType: string, contentId: string): Promise<number> {
  const key = `content:version:${contentType}:${contentId}`;
  const version = await getRedis().get(key);
  return version ? parseInt(version, 10) : 0;
}

export async function setContentVersion(contentType: string, contentId: string, version: number): Promise<void> {
  const key = `content:version:${contentType}:${contentId}`;
  await getRedis().set(key, version.toString());
}

export async function incrementContentVersion(contentType: string, contentId: string): Promise<number> {
  const key = `content:version:${contentType}:${contentId}`;
  return getRedis().incr(key);
}

// Close Redis connection
export async function closeRedis(): Promise<void> {
  if (redisClosed || !_redis) {
    return;
  }

  redisClosed = true;
  const r = _redis;

  // Remove our listeners so error events from the in-flight socket
  // don't log after the test suite has finished ("Cannot log after
  // tests are done" Jest warnings).
  r.removeAllListeners('error');
  r.removeAllListeners('connect');

  if (r.status === 'ready') {
    try {
      await r.quit();
    } catch {
      r.disconnect();
    }
  }

  if (r.status !== 'end' && r.status !== 'close') {
    r.disconnect();
  }

  // Drop the reference so the closed client can be garbage-collected.
  // A subsequent getRedis() call will create a fresh client if needed.
  _redis = null;
}
