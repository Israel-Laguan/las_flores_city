import { oltpPool } from '../database/connection.js';
import { getCache, setCache, deleteCache } from '../database/redis.js';
import { SocialPost } from '../../../shared/src/types/feed.js';

const CACHE_KEY = 'global:feed';
const CACHE_TTL = 300;

// Task 5.4: In-memory fallback cache for graceful degradation when Redis is down.
// If Redis crashes, getCache fails and we'd fall through to PostgreSQL on every
// request — 10,000 concurrent feed reads would destroy the OLTP database.
// This module-level cache acts as a circuit breaker: at most one Postgres query
// per Node.js instance every MEMORY_CACHE_TTL_MS milliseconds.
const MEMORY_CACHE_TTL_MS = 10_000; // 10 seconds
let memoryCache: { data: SocialPost[]; expiresAt: number } | null = null;

export class SocialFeedService {

  static async createPost(
    authorName: string,
    authorHandle: string,
    authorAvatarUrl: string,
    content: string,
    postType: 'lore' | 'system' | 'leaderboard'
  ): Promise<SocialPost> {
    const { rows } = await oltpPool.query(
      `INSERT INTO social_posts (author_name, author_handle, author_avatar_url, content, post_type)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, author_name as "authorName", author_handle as "authorHandle",
                 author_avatar_url as "authorAvatarUrl", content, post_type as "postType",
                 created_at as "createdAt"`,
      [authorName, authorHandle, authorAvatarUrl, content, postType]
    );
    await deleteCache(CACHE_KEY);
    memoryCache = null;
    return rows[0];
  }

  static invalidateMemoryCache(): void {
    memoryCache = null;
  }

  static async getFeed(limit = 30): Promise<SocialPost[]> {
    // Primary path: Redis cache
    const cached = await getCache<SocialPost[]>(CACHE_KEY);
    if (cached) return cached;

    // Task 5.4: Secondary path — in-memory fallback if Redis is unavailable.
    // Serves stale data for up to 10s to prevent a Postgres stampede.
    if (memoryCache && Date.now() < memoryCache.expiresAt) {
      return memoryCache.data;
    }

    const { rows } = await oltpPool.query(
      `SELECT id, author_name as "authorName", author_handle as "authorHandle",
              author_avatar_url as "authorAvatarUrl", content, post_type as "postType",
              created_at as "createdAt"
       FROM social_posts
       ORDER BY created_at DESC
       LIMIT $1`,
      [limit]
    );

    await setCache(CACHE_KEY, rows, CACHE_TTL);

    // Task 5.4: Refresh in-memory fallback so the next Redis failure is also cushioned
    memoryCache = { data: rows, expiresAt: Date.now() + MEMORY_CACHE_TTL_MS };

    return rows;
  }
}
