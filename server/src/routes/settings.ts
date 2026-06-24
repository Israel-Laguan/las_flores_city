import express from 'express';
import { queryOLTP } from '../database/connection.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';

export const settingsRouter = express.Router();

// POST /settings/ai-key - Store encrypted AI API key (split-key: server holds ciphertext only)
settingsRouter.post('/ai-key', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { ciphertext, iv, enabled } = req.body;

    if (!ciphertext || !iv) {
      return res.status(400).json({
        success: false,
        error: 'ciphertext and iv are required',
        timestamp: new Date().toISOString(),
      });
    }

    await queryOLTP(
      `UPDATE users SET ai_key_ciphertext = $1, ai_key_iv = $2, ai_enabled = $3 WHERE id = $4`,
      [ciphertext, iv, enabled ?? true, userId]
    );

    res.json({
      success: true,
      data: { enabled: enabled ?? true },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Save AI key error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to save AI key',
      timestamp: new Date().toISOString(),
    });
  }
});

// GET /settings/ai-key-share - Retrieve the server-side ciphertext (client decrypts locally)
settingsRouter.get('/ai-key-share', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;

    const result = await queryOLTP(
      `SELECT ai_key_ciphertext as "ciphertext", ai_key_iv as "iv", ai_enabled as "enabled"
       FROM users WHERE id = $1`,
      [userId]
    );

    if (!result.rows[0]?.ciphertext) {
      return res.status(404).json({
        success: false,
        error: 'NO_KEY_FOUND',
        timestamp: new Date().toISOString(),
      });
    }

    res.json({
      success: true,
      data: result.rows[0],
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Get AI key share error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve AI key share',
      timestamp: new Date().toISOString(),
    });
  }
});

// PATCH /settings/profile - Update display name
settingsRouter.patch('/profile', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { display_name } = req.body;

    if (!display_name || typeof display_name !== 'string' || !display_name.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Display name is required',
        timestamp: new Date().toISOString(),
      });
    }

    const trimmed = display_name.trim();
    if (trimmed.length > 50) {
      return res.status(400).json({
        success: false,
        error: 'Display name must be at most 50 characters',
        timestamp: new Date().toISOString(),
      });
    }

    const result = await queryOLTP(
      `UPDATE users SET display_name = $1 WHERE id = $2
       RETURNING id, email, username, display_name`,
      [trimmed, userId]
    );

    res.json({
      success: true,
      data: result.rows[0],
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update profile',
      timestamp: new Date().toISOString(),
    });
  }
});

// PATCH /settings/ai-enabled - Toggle AI rewrite on/off without re-uploading the key
settingsRouter.patch('/ai-enabled', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { enabled } = req.body;

    if (typeof enabled !== 'boolean') {
      return res.status(400).json({
        success: false,
        error: 'enabled must be a boolean',
        timestamp: new Date().toISOString(),
      });
    }

    await queryOLTP(
      `UPDATE users SET ai_enabled = $1 WHERE id = $2`,
      [enabled, userId]
    );

    res.json({
      success: true,
      data: { enabled },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Toggle AI enabled error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to toggle AI setting',
      timestamp: new Date().toISOString(),
    });
  }
});
