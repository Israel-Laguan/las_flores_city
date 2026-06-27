import { Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { queryOLTP } from '../database/connection.js';
import { VAULT_ITEM_IDS, ARIA_CHARACTER_ID, SMS_CHAT_HISTORY } from '../database/seedFixtures.js';

export const devRouter = Router();

const isDev = () => process.env.NODE_ENV !== 'production';

// POST /dev/seed — seed vault + SMS data for the authenticated user
devRouter.post('/seed', authMiddleware, async (req: AuthRequest, res: Response) => {
  if (!isDev()) {
    return res.status(403).json({
      success: false,
      error: 'Dev endpoints not available in production',
      timestamp: new Date().toISOString(),
    });
  }

  const userId = req.userId!;

  try {
    // Vault items — idempotent via PK conflict
    for (const itemId of VAULT_ITEM_IDS) {
      await queryOLTP(
        `INSERT INTO player_vault (user_id, item_id)
         VALUES ($1, $2)
         ON CONFLICT (user_id, item_id) DO NOTHING`,
        [userId, itemId]
      );
    }

    // SMS thread — idempotent via UNIQUE(user_id, character_id)
    await queryOLTP(
      `INSERT INTO player_sms_threads
         (user_id, character_id, current_node_id, chat_history, unread, last_npc_message_at)
       VALUES ($1, $2, $3, $4::jsonb, TRUE, NOW())
       ON CONFLICT (user_id, character_id) DO UPDATE SET
         current_node_id = EXCLUDED.current_node_id,
         chat_history = EXCLUDED.chat_history,
         unread = TRUE,
         last_npc_message_at = NOW()`,
      [userId, ARIA_CHARACTER_ID, 'msg_1', JSON.stringify(SMS_CHAT_HISTORY)]
    );

    res.json({
      success: true,
      data: { vault: VAULT_ITEM_IDS.length, sms: 1 },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Dev seed error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to seed E2E test data',
      timestamp: new Date().toISOString(),
    });
  }
});

// POST /dev/cleanup — remove vault + SMS data for the authenticated user
devRouter.post('/cleanup', authMiddleware, async (req: AuthRequest, res: Response) => {
  if (!isDev()) {
    return res.status(403).json({
      success: false,
      error: 'Dev endpoints not available in production',
      timestamp: new Date().toISOString(),
    });
  }

  const userId = req.userId!;

  try {
    await queryOLTP(`DELETE FROM player_vault WHERE user_id = $1`, [userId]);
    await queryOLTP(`DELETE FROM player_sms_threads WHERE user_id = $1`, [userId]);

    res.json({
      success: true,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Dev cleanup error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to cleanup E2E test data',
      timestamp: new Date().toISOString(),
    });
  }
});
