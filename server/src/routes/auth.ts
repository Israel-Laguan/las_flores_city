import express from 'express';
import bcrypt from 'bcryptjs';
import { queryOLTP } from '../database/connection.js';
import { generateToken } from '../middleware/auth.js';
import { setSessionCookie, clearSessionCookie } from '../utils/cookies.js';
import { PlayerStateRepository } from '../database/repositories/PlayerStateRepository.js';

const START_LOCATION_ID = '550e8400-e29b-41d4-a716-446655440002';

export const authRouter = express.Router();

// POST /auth/register - Create new player
authRouter.post('/register', async (req, res) => {
  try {
    const { email, username, display_name, password } = req.body;

    if (!email || !username || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email, username, and password are required',
        timestamp: new Date().toISOString(),
      });
    }

    // Check if user exists
    const existingUser = await queryOLTP(
      'SELECT id FROM users WHERE email = $1 OR username = $2',
      [email, username]
    );

    if (existingUser.rows.length > 0) {
      return res.status(409).json({
        success: false,
        error: 'User with this email or username already exists',
        timestamp: new Date().toISOString(),
      });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create user (no volatile gameplay columns — those live in player_states)
    const result = await queryOLTP(
      `INSERT INTO users (email, username, display_name, password_hash, last_login)
       VALUES ($1, $2, $3, $4, NOW())
       RETURNING id, email, username, display_name`,
      [email, username, display_name || username, passwordHash]
    );

    const user = result.rows[0];

    // Create player_state with starting values
    await PlayerStateRepository.createForNewUser(user.id, START_LOCATION_ID);

    // Create user_entitlements
    await queryOLTP(
      'INSERT INTO user_entitlements (user_id) VALUES ($1)',
      [user.id]
    );

    // Generate token
    const token = generateToken(user.id);

    // Set HttpOnly cookie — token no longer exposed in the response body
    setSessionCookie(res, token);

    res.status(201).json({
      success: true,
      data: {
        user,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to register user',
      timestamp: new Date().toISOString(),
    });
  }
});

// POST /auth/login - Login existing player
authRouter.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email and password are required',
        timestamp: new Date().toISOString(),
      });
    }

    // Find user
    const result = await queryOLTP(
      'SELECT id, email, username, display_name, password_hash FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials',
        timestamp: new Date().toISOString(),
      });
    }

    const user = result.rows[0];

    // Check password
    if (user.password_hash) {
      const validPassword = await bcrypt.compare(password, user.password_hash);
      if (!validPassword) {
        return res.status(401).json({
          success: false,
          error: 'Invalid credentials',
          timestamp: new Date().toISOString(),
        });
      }
    }

    // Update last_login
    await queryOLTP(
      'UPDATE users SET last_login = NOW() WHERE id = $1',
      [user.id]
    );

    // Generate token
    const token = generateToken(user.id);

    // Set HttpOnly cookie — token no longer exposed in the response body
    setSessionCookie(res, token);

    // Remove password_hash from response
    const { password_hash, ...userWithoutPassword } = user;

    res.json({
      success: true,
      data: {
        user: userWithoutPassword,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to login',
      timestamp: new Date().toISOString(),
    });
  }
});

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

authRouter.post('/dev-login', handleDevLogin);

// POST /auth/logout - Clear session cookie
authRouter.post('/logout', (_req, res) => {
  clearSessionCookie(res);
  res.json({
    success: true,
    timestamp: new Date().toISOString(),
  });
});
