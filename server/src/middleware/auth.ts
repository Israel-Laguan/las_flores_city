import { Request, Response, NextFunction } from 'express';

import jwt from 'jsonwebtoken';

// Read lazily (per call) so `_FILE` secrets resolved by `resolveFileEnvVars()`
// during startup are honored even though this module (and its import) are
// evaluated before the resolver runs in the entrypoints.
function getJwtSecret(): string {
  return process.env.JWT_SECRET || 'your-jwt-secret-change-in-production';
}

export interface AuthRequest extends Request {
  userId?: string;
  user?: {
    id: string;
    email: string;
    username: string;
  };
}

export function generateToken(userId: string): string {
  return jwt.sign({ userId }, getJwtSecret(), { expiresIn: '24h' });
}

export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  // 1. Prefer the secure HttpOnly cookie.
  let token = (req as any).cookies?.jwt_session;

  // 2. Fall back to the Authorization header for tests / curl / transitional clients.
  if (!token) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    }
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'No token provided',
      timestamp: new Date().toISOString(),
    });
  }

  try {
    const decoded = jwt.verify(token, getJwtSecret()) as { userId: string };
    req.userId = decoded.userId;
    next();
  } catch {
    return res.status(401).json({
      success: false,
      error: 'Invalid token',
      timestamp: new Date().toISOString(),
    });
  }
}

export function optionalAuth(req: AuthRequest, res: Response, next: NextFunction) {
  let token = (req as any).cookies?.jwt_session;

  if (!token) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    }
  }

  if (!token) {
    return next();
  }

  try {
    const decoded = jwt.verify(token, getJwtSecret()) as { userId: string };
    req.userId = decoded.userId;
  } catch {
    // Token invalid, continue without auth
  }

  next();
}
