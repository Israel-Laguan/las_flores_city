import express from 'express';
import bcrypt from 'bcryptjs';
import { queryOLTP } from '../database/connection.js';
import { generateToken } from '../middleware/auth.js';

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

    // Create user with all Sprint 1 columns
    const result = await queryOLTP(
      `INSERT INTO users (email, username, display_name, password_hash, credits, gold_credits, time_blocks, current_location_id, last_login)
       VALUES ($1, $2, $3, $4, 100, 0, 48, '550e8400-e29b-41d4-a716-446655440002', NOW())
       RETURNING id, email, username, display_name, credits, gold_credits, time_blocks`,
      [email, username, display_name || username, passwordHash]
    );

    const user = result.rows[0];

    // Create player_state
    await queryOLTP(
      'INSERT INTO player_states (user_id, current_location_id) VALUES ($1, $2)',
      [user.id, '550e8400-e29b-41d4-a716-446655440002']
    );

    // Create user_entitlements
    await queryOLTP(
      'INSERT INTO user_entitlements (user_id) VALUES ($1)',
      [user.id]
    );

    // Generate token
    const token = generateToken(user.id);

    res.status(201).json({
      success: true,
      data: {
        user,
        token,
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

    // Remove password_hash from response
    const { password_hash, ...userWithoutPassword } = user;

    res.json({
      success: true,
      data: {
        user: userWithoutPassword,
        token,
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
authRouter.post('/dev-login', async (req, res) => {
  try {
    const { userId } = req.body;

    // Use provided userId or default test user
    const targetUserId = userId || '00000000-0000-0000-0000-000000000001';

    const result = await queryOLTP(
      `INSERT INTO users (id, email, username, display_name, credits, time_blocks, current_location_id, current_day)
       VALUES ($1, $2, $3, $4, 100, 48, 'c3d4e5f6-a7b8-9012-cdef-123456789012', 1)
       ON CONFLICT (id) DO UPDATE SET
         email = EXCLUDED.email,
         username = EXCLUDED.username,
         display_name = EXCLUDED.display_name,
         credits = EXCLUDED.credits,
         time_blocks = EXCLUDED.time_blocks,
         current_location_id = EXCLUDED.current_location_id,
         current_day = EXCLUDED.current_day,
         updated_at = NOW()
       RETURNING id, email, username, display_name`,
      [targetUserId, `dev-player-${targetUserId}@example.com`, `dev_${targetUserId.slice(0, 8)}`, 'Dev Player']
    );

    await queryOLTP(
      `INSERT INTO player_states (user_id, current_location_id, current_node_id, flags)
       VALUES ($1, 'c3d4e5f6-a7b8-9012-cdef-123456789012', NULL, '{}'::jsonb)
       ON CONFLICT (user_id) DO UPDATE SET
         current_location_id = EXCLUDED.current_location_id,
         current_node_id = EXCLUDED.current_node_id,
         flags = EXCLUDED.flags,
         updated_at = NOW()`,
      [targetUserId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
        timestamp: new Date().toISOString(),
      });
    }

    const user = result.rows[0];

    // Update last_login
    await queryOLTP(
      'UPDATE users SET last_login = NOW() WHERE id = $1',
      [user.id]
    );

    const token = generateToken(user.id);

    res.json({
      success: true,
      data: {
        user,
        token,
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
});
