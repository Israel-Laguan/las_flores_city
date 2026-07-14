import express from 'express';
import bcrypt from 'bcryptjs';
import { queryOLTP } from '../database/connection.js';
import { generateToken, authMiddleware, AuthRequest } from '../middleware/auth.js';
import { adminMiddleware } from '../middleware/adminAuth.js';
import { setSessionCookie, clearSessionCookie } from '../utils/cookies.js';
import { PlayerStateRepository } from '../database/repositories/PlayerStateRepository.js';
import { handleChangePassword } from './auth.handlers.js';
import { handleDevLogin, handleDevAdminLogin } from './auth.dev-handlers.js';

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
    if (!user.password_hash) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials',
        timestamp: new Date().toISOString(),
      });
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials',
        timestamp: new Date().toISOString(),
      });
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
    const userWithoutPassword = {
      id: user.id,
      email: user.email,
      username: user.username,
      display_name: user.display_name,
    };

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

authRouter.post('/dev-login', handleDevLogin);
authRouter.post('/dev-admin-login', handleDevAdminLogin);

// POST /auth/admin-login - Admin login with email and password
authRouter.post('/admin-login', async (req, res) => {
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
      'SELECT id, email, username, display_name, password_hash, role FROM users WHERE email = $1',
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
    if (!user.password_hash) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials',
        timestamp: new Date().toISOString(),
      });
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials',
        timestamp: new Date().toISOString(),
      });
    }

    // Check that user has admin or developer role
    if (user.role !== 'admin' && user.role !== 'developer') {
      return res.status(403).json({
        success: false,
        error: 'Access denied. Admin privileges required.',
        timestamp: new Date().toISOString(),
      });
    }

    // Generate token
    const token = generateToken(user.id);

    // Set HttpOnly cookie — token no longer exposed in the response body
    setSessionCookie(res, token);

    // Remove password_hash from response
    const userWithoutPassword = {
      id: user.id,
      email: user.email,
      username: user.username,
      display_name: user.display_name,
      role: user.role,
    };

    res.json({
      success: true,
      data: {
        user: userWithoutPassword,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Admin login error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to login',
      timestamp: new Date().toISOString(),
    });
  }
});

// GET /auth/admin-me - Get current admin user info
authRouter.get('/admin-me', adminMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;

    // Get user info including role
    const result = await queryOLTP(
      'SELECT id, email, username, display_name, role FROM users WHERE id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
        timestamp: new Date().toISOString(),
      });
    }

    const user = result.rows[0];

    res.json({
      success: true,
      data: {
        user,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Admin-me error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get user info',
      timestamp: new Date().toISOString(),
    });
  }
});

// POST /auth/logout - Clear session cookie
authRouter.post('/logout', (_req, res) => {
  clearSessionCookie(res);
  res.json({
    success: true,
    timestamp: new Date().toISOString(),
  });
});

// POST /auth/change-password - Change password for authenticated user
authRouter.post('/change-password', authMiddleware, handleChangePassword);
