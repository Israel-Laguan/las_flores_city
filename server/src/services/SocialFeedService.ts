import { oltpPool } from '../database/connection.js';
import { getCache, setCache, deleteCache } from '../database/redis.js';
import { SocialPost } from '../../../shared/src/types/feed.js';

const CACHE_KEY = 'global:feed';
const CACHE_TTL = 300;

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
    return rows[0];
  }

  static async getFeed(limit = 30): Promise<SocialPost[]> {
    const cached = await getCache<SocialPost[]>(CACHE_KEY);
    if (cached) return cached;

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
    return rows;
  }
}
