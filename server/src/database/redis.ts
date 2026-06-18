import path from 'node:path';
import Redis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });

// Redis connection
export const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: 3,
  retryStrategy(times) {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
});

// Redis event handlers
redis.on('connect', () => {
  console.log('✅ Redis connected');
});

redis.on('error', (err) => {
  console.error('❌ Redis error:', err);
});

// Cache helpers
export async function getCache<T = any>(key: string): Promise<T | null> {
  try {
    const data = await redis.get(key);
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
    await redis.setex(key, ttlSeconds, serialized);
    return true;
  } catch (error) {
    console.error('Cache set error:', error);
    return false;
  }
}

export async function deleteCache(key: string): Promise<boolean> {
  try {
    await redis.del(key);
    return true;
  } catch (error) {
    console.error('Cache delete error:', error);
    return false;
  }
}

export async function invalidatePattern(pattern: string): Promise<number> {
  try {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
    return keys.length;
  } catch (error) {
    console.error('Cache invalidate error:', error);
    return 0;
  }
}

// Content versioning helpers
export async function getContentVersion(contentType: string, contentId: string): Promise<number> {
  const key = `content:version:${contentType}:${contentId}`;
  const version = await redis.get(key);
  return version ? parseInt(version, 10) : 0;
}

export async function setContentVersion(contentType: string, contentId: string, version: number): Promise<void> {
  const key = `content:version:${contentType}:${contentId}`;
  await redis.set(key, version.toString());
}

export async function incrementContentVersion(contentType: string, contentId: string): Promise<number> {
  const key = `content:version:${contentType}:${contentId}`;
  return redis.incr(key);
}

let redisClosed = false;

// Close Redis connection
export async function closeRedis(): Promise<void> {
  if (redisClosed) {
    return;
  }

  redisClosed = true;
  if (redis.status === 'ready') {
    try {
      await redis.quit();
    } catch {
      redis.disconnect();
    }
  }

  if (redis.status !== 'end' && redis.status !== 'close') {
    redis.disconnect();
  }
}
