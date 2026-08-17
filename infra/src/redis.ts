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
// client and leave the real handle dangling.
const REDIS_HANDLE_KEY = '__lasFloresRedisHandle';

type RedisHandle = { client: Redis; closed: boolean };

// Module-local cache; always re-synchronised from `globalThis` inside
// `ensureHandle`/`closeRedis` so separate Jest module registries share one
// handle instead of diverging after a teardown nulls the global slot.
let _redisHandle: RedisHandle | null = null;

function ensureHandle(): RedisHandle {
  // Re-read the global slot on every call. A different module instance (e.g.
  // globalTeardown vs a ts-jest sandbox) may have created or torn down the
  // handle since this module was last loaded, so a load-time snapshot would
  // be stale and could hand back a closed/disconnected client.
  const existing = (globalThis as Record<string, unknown>)[REDIS_HANDLE_KEY] as RedisHandle | null;
  if (existing && !existing.closed && existing.client.status !== 'end') {
    _redisHandle = existing;
    return existing;
  }

  const handle: RedisHandle = { client: undefined as unknown as Redis, closed: false };
  // Lock `closed` as non-configurable so that jest-environment-node's
  // worker-teardown cleanup (jest-util `deleteProperty`) cannot "soft-delete"
  // it by wrapping the data property with a deprecation accessor.  That
  // wrapper's fallback setter (`Reflect.set(obj, 'closed', value)`) would
  // re-trigger the same setter and infinite-recurse (stack overflow) the
  // next time the ioredis 'end' handler or closeRedis() assigns
  // `handle.closed = true`.  A configurable property (the literal default)
  // can be redefined non-configurable in one defineProperty step; `closed`
  // stays writable so runtime assignments are unaffected.
  Object.defineProperty(handle, 'closed', {
    value: false,
    writable: true,
    configurable: false,
    enumerable: true,
  });
  handle.client = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
    maxRetriesPerRequest: 3,
    retryStrategy(times) {
      // Stop retrying once closeRedis() has been called. Capture `handle`
      // (not the module `_redisHandle` variable) so this stays correct after
      // closeRedis nulls the module cache.
      if (handle.closed) {
        return null;
      }
      // Bounded retry: tolerate brief unavailability (a few blips, up to
      // ~1s) without unbounded setTimeout loops that hang unit tests when
      // Redis is unavailable. This also lets integration tests recover
      // from a transient startup hiccup during CI.
      if (times > 5) {
        // ioredis enters the terminal 'end' state here and will not
        // reconnect without manual intervention. Mark the handle closed
        // so subsequent ensureHandle() calls create a fresh client instead
        // of recycling this dead one, and clear the global slot so the
        // replacement is visible across module registries.
        handle.closed = true;
        if ((globalThis as Record<string, unknown>)[REDIS_HANDLE_KEY] === handle) {
          (globalThis as Record<string, unknown>)[REDIS_HANDLE_KEY] = null;
        }
        _redisHandle = null;
        return null;
      }
      return 200;
    },
  });
  (globalThis as Record<string, unknown>)[REDIS_HANDLE_KEY] = handle;
  _redisHandle = handle;

  handle.client.on('connect', () => {
    console.log('✅ Redis connected');
  });

  // Capture `handle` in the closure (not the module `_redisHandle` variable)
  // so that post-close errors — when `_redisHandle` has been nulled — are still
  // suppressed via `handle.closed`. This prevents the "Cannot log after tests
  // are done" Jest warnings.
  handle.client.on('error', (err) => {
    if (!handle.closed) {
      console.error('❌ Redis error:', err);
    }
  });

  // If ioredis ever enters the terminal 'end' state outside the explicit
  // shutdown path (e.g. after retryStrategy gives up below), clear the
  // dead handle so ensureHandle() stops recycling it.
  handle.client.on('end', () => {
    if (!handle.closed) {
      handle.closed = true;
      if ((globalThis as Record<string, unknown>)[REDIS_HANDLE_KEY] === handle) {
        (globalThis as Record<string, unknown>)[REDIS_HANDLE_KEY] = null;
      }
      _redisHandle = null;
    }
  });

  return handle;
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

// Atomic compare-and-set cache write. The whole check-and-set runs inside a
// single Lua EVAL (Redis executes a script to completion, uninterrupted), so it
// does NOT rely on WATCH/MULTI/EXEC on the shared singleton client — which would
// race across concurrent callers that share that connection (one caller's
// UNWATCH clears another caller's WATCH state, letting its EXEC overwrite a
// newer run's value).
//
//   mode = 'init'   -> unconditional overwrite (initializers take ownership)
//   mode = 'token'  -> only write when the existing value's `.runToken` equals
//                      `runToken` (or no value exists); returns false WITHOUT
//                      writing when the cached token differs, so a stale write
//                      from a prior run is dropped
//   mode = 'legacy' -> unconditional overwrite (no token guard)
const CAS_SET_CACHE_LUA = `
local key = KEYS[1]
local mode = ARGV[1]
local token = ARGV[2]
local value = ARGV[3]
local ttl = ARGV[4]

if mode == 'legacy' or mode == 'init' then
  redis.call('SET', key, value, 'EX', ttl)
  return 1
end

local current = redis.call('GET', key)
if current then
  local ok, data = pcall(cjson.decode, current)
  if ok and data.runToken and data.runToken ~= token then
    return 0
  end
end
redis.call('SET', key, value, 'EX', ttl)
return 1
`;

export async function casSetCache(
  key: string,
  value: unknown,
  ttlSeconds: number,
  runToken: string,
  mode: 'init' | 'token' | 'legacy',
): Promise<boolean> {
  try {
    const serialized = JSON.stringify(value);
    const result = (await getRedis().eval(
      CAS_SET_CACHE_LUA,
      1,
      key,
      mode,
      runToken,
      serialized,
      String(ttlSeconds),
    )) as number;
    return result === 1;
  } catch (error) {
    console.error('CAS cache set error:', error);
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

// Close Redis connection. Does NOT create a client if one was never opened,
// preserving the lazy-connection behaviour and avoiding needless connection
// attempts (and teardown errors) during test teardown.
export async function closeRedis(): Promise<void> {
  // Re-read the global slot so teardown closes the exact client the tests
  // created, even across separate Jest module registries.
  const handle = (globalThis as Record<string, unknown>)[REDIS_HANDLE_KEY] as RedisHandle | null;
  if (!handle || handle.closed) {
    _redisHandle = null;
    return;
  }

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

  // Only clear the global slot if it still references the handle being
  // closed. Another set of code may have published a replacement while
  // `quit()`/`disconnect()` was in flight; clearing the slot in that case
  // would orphan the live replacement and leak connections.
  if ((globalThis as Record<string, unknown>)[REDIS_HANDLE_KEY] === handle) {
    (globalThis as Record<string, unknown>)[REDIS_HANDLE_KEY] = null;
  }
  _redisHandle = null;
}
