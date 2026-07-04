import { Request, Response, NextFunction } from 'express';
import { queryOLTP } from '../database/connection.js';
import { authMiddleware, AuthRequest } from './auth.js';

/**
 * Admin middleware that checks if the authenticated user has admin or developer role.
 * Must be used after authMiddleware or will return 401.
 */
export async function adminMiddleware(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    // First, ensure the user is authenticated
    if (!req.userId) {
      res.status(401).json({
        success: false,
        error: 'Authentication required for admin routes',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // Check if the user has admin or developer role
    const result = await queryOLTP(
      `SELECT role FROM users WHERE id = $1`,
      [req.userId]
    );

    if (result.rows.length === 0) {
      res.status(403).json({
        success: false,
        error: 'User not found',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const role = result.rows[0].role;
    
    if (role !== 'admin' && role !== 'developer') {
      res.status(403).json({
        success: false,
        error: 'Admin access required',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // User is authenticated and has admin privileges
    next();
  } catch (error) {
    console.error('Admin middleware error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      timestamp: new Date().toISOString(),
    });
  }
}

/**
 * Combined auth + admin middleware for convenience
 */
export function authAndAdminMiddleware(req: AuthRequest, res: Response, next: NextFunction): void {
  authMiddleware(req, res, () => {
    adminMiddleware(req, res, next);
  });
}