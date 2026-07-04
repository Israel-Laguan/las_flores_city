import { Request, Response } from 'express';
import { queryOLTP } from '../database/connection.js';
import { generateToken, authMiddleware, AuthRequest } from '../middleware/auth.js';
import bcrypt from 'bcryptjs';

export async function handleChangePassword(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const { current_password, new_password } = req.body;

    if (!current_password || !new_password) {
      res.status(400).json({
        success: false,
        error: 'Current password and new password are required',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    if (new_password.length < 6) {
      res.status(400).json({
        success: false,
        error: 'PASSWORD_TOO_SHORT',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const result = await queryOLTP(
      'SELECT password_hash FROM users WHERE id = $1',
      [userId]
    );

    if (!result.rows[0]?.password_hash) {
      res.status(400).json({
        success: false,
        error: 'NO_PASSWORD_SET',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const validPassword = await bcrypt.compare(current_password, result.rows[0].password_hash);
    if (!validPassword) {
      res.status(401).json({
        success: false,
        error: 'INVALID_PASSWORD',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const passwordHash = await bcrypt.hash(new_password, 10);

    await queryOLTP(
      'UPDATE users SET password_hash = $1 WHERE id = $2',
      [passwordHash, userId]
    );

    res.json({
      success: true,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Change password error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to change password',
      timestamp: new Date().toISOString(),
    });
  }
}