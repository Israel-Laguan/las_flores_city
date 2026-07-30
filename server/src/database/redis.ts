import path from 'node:path';
import Redis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });

// Lazy Redis connection — only created when first accessed.
// Prevents Jest from hanging on open TCPWRAP handles when tests
// import modules that transitively pull in this file without
// actually needing Redis.
//
// Shared via `globalThis` so that Jest test sandboxes, globalSetup /
// globalTeardown (which run under separate module registries under
// tsx/cjs vs ts-jest), and the running server all operate on the same
// client. Without this, teardown may close a different module instance's
// `_redis` and leave the real handle dangling.
let _redisHandle: { client: Redis; closed: boolean } | null =
  (globalThis as Record<string, unknown>).__lasFloresRedisHandle as
    { client: Redis; closed: boolean } | null;

function ensureHandle(): { client: Redis; closed: boolean } {
  if (!_redisHandle) {
    _redisHandle = {
      client: new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
        maxRetriesPerRequest: 3,
        retryStrategy(times) {
          // Stop retrying once closeRedis() has been called.
          if (_redisHandle?.closed) {
            return null;
          }
          // Bounded retry: tolerate brief unavailability (a few blips, up to
          // ~1s) without unbounded setTimeout loops that hang unit tests when
          // Redis is unavailable. This also lets integration tests recover
          // from a transient startup hiccup during CI.
          if (times > 5) {
            return null;
          }
          return 200;
        },
      }),
      closed: false,
    };
    (globalThis as Record<string, unknown>).__lasFloresRedisHandle = _redisHandle;

    _redisHandle.client.on('connect', () => {
      console.log('✅ Redis connected');
    });

    _redisHandle.client.on('error', (err) => {
      // Suppress error spam once the connection has been intentionally
      // closed (e.g. during test teardown). This also prevents the
      // "Cannot log after tests are done" Jest warnings.
      if (!_redisHandle?.closed) {
        console.error('❌ Redis error:', err);
      }
    });
  }
  return _redisHandle;
}

export function getRedis(): Redis {
  return ensureHandle().client;
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
  if (_redisHandle?.closed) {
    return;
  }

  const handle = ensureHandle();
  handle.closed = true;

  const r = handle.client;

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

  _redisHandle = null;
  (globalThis as Record<string, unknown>).__lasFloresRedisHandle = null;
}
