import { Router, Response, NextFunction } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { SocialFeedService } from '../services/SocialFeedService.js';
import { queryOLAP } from '../database/connection.js';
import { SocialPost } from '../../../shared/src/types/feed.js';

export const feedRouter = Router();

const IN_GAME_ADS: SocialPost[] = [
  {
    id: 'ad_li_wei_01',
    authorName: 'Li Wei Port Logistics',
    authorHandle: 'li_wei_cargo',
    authorAvatarUrl: 'https://cdn.lasflores2077.com/avatars/ad_li_wei.png',
    content: 'Connecting Las Flores to the Pacific. Efficiency through unified automation. Apply for port-handling contracts today.',
    postType: 'ad',
    createdAt: new Date().toISOString(),
  },
];

feedRouter.get('/', authMiddleware, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const feed = await SocialFeedService.getFeed();
    const compiled = [...feed];
    compiled.splice(compiled.length >= 2 ? 2 : compiled.length, 0, IN_GAME_ADS[0]);
    res.json(compiled);
  } catch (error) {
    next(error);
  }
});

feedRouter.post('/like', authMiddleware, async (req: AuthRequest, res: Response, next: NextFunction) => {
  const { postId } = req.body;
  const userId = req.userId!;
  try {
    queryOLAP(
      `INSERT INTO player_events (id, user_id, event_type, event_data, time_blocks_cost)
       VALUES (gen_random_uuid(), $1, 'post_liked', $2, 0)`,
      [userId, JSON.stringify({ postId })]
    ).catch(err => console.error('Feed like telemetry error:', err));

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});
