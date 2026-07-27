import { NextResponse } from 'next/server';

import { forwardSessionCookie } from '@/lib/cookie-forwarder';

const SERVER_URL = process.env.INTERNAL_SERVER_URL || process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000';

/**
 * Dev login endpoint for development/testing only.
 * Uses the server's /auth/dev-admin-login to create/login a dev admin user.
 * This bypasses password authentication for local development.
 *
 * Guarded by DEV_LOGIN_ENABLED=true (in addition to NODE_ENV !== 'production')
 * to prevent accidental exposure on staging or QA deployments.
 */
export async function POST() {
  if (process.env.NODE_ENV === 'production' || process.env.DEV_LOGIN_ENABLED !== 'true') {
    return NextResponse.json(
      { success: false, error: 'Dev login is not available' },
      { status: 403 }
    );
  }

  try {
    const response = await fetch(`${SERVER_URL}/auth/dev-admin-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
      credentials: 'include',
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      return NextResponse.json(
        { success: false, error: errorData?.error || 'Dev login failed' },
        { status: response.status }
      );
    }

    const setCookieHeader = response.headers.get('set-cookie');
    return forwardSessionCookie(setCookieHeader);
  } catch (error) {
    console.error('Dev admin login error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
