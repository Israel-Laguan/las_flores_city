import type { Response, NextFunction } from 'express';
import type { AuthRequest } from '../middleware/auth.js';
import { getRedis } from '../database/redis.js';

// ============================================================
// Rate Limiter Middleware Factory
//
// Fixed-window counter backed by the existing ioredis client.
// Zero new dependencies — uses INCR + EXPIRE directly.
//
// Fail-open design: if Redis is unreachable, the middleware logs
// the error and calls next(). Gameplay must not break because the
// rate limiter is down.
//
// This factory is NOT wired to any route in this slice. Routes
// configure their own limits at mount time, e.g. the future UGC
// submit endpoint will use 3 requests / 86400s.
// ============================================================

export interface RateLimiterConfig {
  /** Fixed-window duration in seconds. */
  windowSeconds: number;
  /** Max requests allowed per window per identity. */
  maxRequests: number;
  /** Redis key namespace. Defaults to 'rl'. Each route provides its own. */
  keyPrefix?: string;
}

export function createRateLimiter(config: RateLimiterConfig) {
  const { windowSeconds, maxRequests } = config;
  const prefix = config.keyPrefix ?? 'rl';

  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    // Identity: prefer authenticated userId, fall back to IP for anon routes.
    const identity = req.userId || req.ip || 'unknown';
    const key = `${prefix}:${req.path}:${identity}`;

    try {
      const current = await getRedis().incr(key);

      // Only set the TTL on the first request in a window. Subsequent
      // requests inherit the existing TTL — avoids resetting the window
      // on every hit.
      if (current === 1) {
        await getRedis().expire(key, windowSeconds);
      }

      if (current > maxRequests) {
        // Compute Retry-After from the key's remaining TTL. If TTL is
        // missing/expired (-1 or -2), fall back to the full window.
        let ttl = await getRedis().ttl(key);
        if (ttl < 0) {
          ttl = windowSeconds;
        }
        res.status(429);
        res.set('Retry-After', String(ttl));
        res.json({ error: 'TOO_MANY_REQUESTS' });
        return;
      }

      next();
    } catch (err) {
      // Fail open: log and continue. Never block gameplay on Redis.
      console.error('Rate limiter error (failing open):', err);
      next();
    }
  };
}
