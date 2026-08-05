import { Request, Response } from 'express';

/**
 * Parse the Cookie header into a flat key→value map.
 *
 * We intentionally do NOT implement signed cookies: the JWT itself is signed
 * by JWT_SECRET, so a tampered cookie simply fails jwt.verify() and is
 * rejected as INVALID_TOKEN — there is no privilege-escalation path. This
 * mirrors the zero-new-deps decision established in Task 4.3 (native fetch
 * over axios).
 */
export function parseCookies(req: Request): Record<string, string> {
  const header = req.headers.cookie;
  if (!header) return {};
  const out: Record<string, string> = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) {
      try { out[k] = decodeURIComponent(v); } catch { out[k] = v; }
    }
  }
  return out;
}

/** Middleware: populate req.cookies from the Cookie header. */
export function cookieParserMiddleware(req: Request, _res: Response, next: () => void): void {
  (req as any).cookies = parseCookies(req);
  next();
}

const COOKIE_NAME = 'jwt_session';
const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24h — matches generateToken()'s expiresIn

function sameSiteValue(): 'strict' | 'lax' {
  return process.env.NODE_ENV === 'production' ? 'strict' : 'lax';
}

export function setSessionCookie(res: Response, token: string): void {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: sameSiteValue(),
    maxAge: MAX_AGE_MS,
    path: '/',
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: sameSiteValue(),
    path: '/',
  });
}
