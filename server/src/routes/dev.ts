import { Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { queryOLTP } from '../database/connection.js';

export const devRouter = Router();

const isDev = () => process.env.NODE_ENV !== 'production';

const VAULT_ITEM_IDS = [
  'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  'b2c3d4e5-f6a7-8901-bcde-f12345678901',
  'c3d4e5f6-a7b8-9012-cdef-123456789012',
];

const ARIA_CHARACTER_ID = '123e4567-e89b-12d3-a456-426614174000';

const SMS_CHAT_HISTORY = [
  {
    id: '00000000-0000-0000-0000-000000000001',
    author: 'npc',
    text: 'Welcome to Las Flores, new arrival. Your orientation packet is ready.',
    createdAt: '2077-01-15T08:00:00.000Z',
    nodeId: 'msg_1',
  },
  {
    id: '00000000-0000-0000-0000-000000000002',
    author: 'npc',
    text: 'Please report to the Welcome Center at your earliest convenience.',
    createdAt: '2077-01-15T08:00:01.000Z',
    nodeId: 'msg_1',
  },
];

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
