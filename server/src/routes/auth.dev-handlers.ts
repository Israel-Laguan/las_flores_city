import express from 'express';
import { queryOLTP } from '../database/connection.js';
import { generateToken } from '../middleware/auth.js';
import { setSessionCookie } from '../utils/cookies.js';

// POST /auth/dev-login - Quick dev login (no password required)
export async function handleDevLogin(req: express.Request, res: express.Response): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    res.status(403).json({
      success: false,
      error: 'Dev login is not available in production',
      timestamp: new Date().toISOString(),
    });
    return;
  }
  try {
    const { userId } = req.body;

    // Use provided userId or default test user
    const targetUserId = userId || '00000000-0000-0000-0000-000000000001';

    const result = await queryOLTP(
      `INSERT INTO users (id, email, username, display_name)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO UPDATE SET
         email = EXCLUDED.email,
         username = EXCLUDED.username,
         display_name = EXCLUDED.display_name,
         updated_at = NOW()
       RETURNING id, email, username, display_name`,
      [targetUserId, `dev-player-${targetUserId}@example.com`, `dev_${targetUserId.slice(0, 8)}`, 'Dev Player']
    );

    // Ensure player_states row exists (idempotent via ON CONFLICT)
    const DEV_START_LOCATION = 'c3d4e5f6-a7b8-9012-cdef-123456789012';
    await queryOLTP(
      `INSERT INTO player_states (user_id, current_location_id, current_node_id, flags, time_blocks, credits, gold_credits, current_day, story_beat, alignment)
       VALUES ($1, $2, NULL, '{}'::jsonb, 48, 100, 0, 1, 'prologue', 'neutral')
       ON CONFLICT (user_id) DO UPDATE SET
         current_location_id = EXCLUDED.current_location_id,
         current_node_id = EXCLUDED.current_node_id,
         flags = EXCLUDED.flags,
         updated_at = NOW()`,
      [targetUserId, DEV_START_LOCATION]
    );

    if (result.rows.length === 0) {
      res.status(404).json({
        success: false,
        error: 'User not found',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const user = result.rows[0];

    // Update last_login
    await queryOLTP(
      'UPDATE users SET last_login = NOW() WHERE id = $1',
      [user.id]
    );

    const token = generateToken(user.id);

    // Set HttpOnly cookie — token no longer exposed in the response body
    setSessionCookie(res, token);

    res.json({
      success: true,
      data: {
        user,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Dev login error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to login',
      timestamp: new Date().toISOString(),
    });
  }
}

// POST /auth/dev-admin-login - Quick dev admin login (no password required)
export async function handleDevAdminLogin(req: express.Request, res: express.Response): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    res.status(403).json({
      success: false,
      error: 'Dev admin login is not available in production',
      timestamp: new Date().toISOString(),
    });
    return;
  }
  try {
    const { userId } = req.body;

    // Use provided userId or default test admin user
    const targetUserId = userId || '00000000-0000-0000-0000-000000000001';

    const result = await queryOLTP(
      `INSERT INTO users (id, email, username, display_name, role)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE SET
         email = EXCLUDED.email,
         username = EXCLUDED.username,
         display_name = EXCLUDED.display_name,
         role = EXCLUDED.role,
         updated_at = NOW()
       RETURNING id, email, username, display_name, role`,
      [targetUserId, `dev-admin-${targetUserId}@example.com`, `dev_admin_${targetUserId.slice(0, 8)}`, 'Dev Admin', 'admin']
    );

    // Ensure player_states row exists (idempotent via ON CONFLICT)
    const DEV_START_LOCATION = 'c3d4e5f6-a7b8-9012-cdef-123456789012';
    await queryOLTP(
      `INSERT INTO player_states (user_id, current_location_id, current_node_id, flags, time_blocks, credits, gold_credits, current_day, story_beat, alignment)
       VALUES ($1, $2, NULL, '{}'::jsonb, 48, 100, 0, 1, 'prologue', 'neutral')
       ON CONFLICT (user_id) DO UPDATE SET
         current_location_id = EXCLUDED.current_location_id,
         current_node_id = EXCLUDED.current_node_id,
         flags = EXCLUDED.flags,
         updated_at = NOW()`,
      [targetUserId, DEV_START_LOCATION]
    );

    if (result.rows.length === 0) {
      res.status(404).json({
        success: false,
        error: 'User not found',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const user = result.rows[0];

    // Update last_login
    await queryOLTP(
      'UPDATE users SET last_login = NOW() WHERE id = $1',
      [user.id]
    );

    const token = generateToken(user.id);

    // Set HttpOnly cookie — token no longer exposed in the response body
    setSessionCookie(res, token);

    res.json({
      success: true,
      data: {
        user,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Dev admin login error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to login',
      timestamp: new Date().toISOString(),
    });
  }
}
