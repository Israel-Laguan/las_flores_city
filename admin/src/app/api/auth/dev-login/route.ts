import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

const SERVER_URL = process.env.INTERNAL_SERVER_URL || process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000';

/**
 * Dev login endpoint for development/testing only.
 * Uses the server's /auth/dev-admin-login to create/login a dev admin user.
 * This bypasses password authentication for local development.
 */
export async function POST() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      { success: false, error: 'Dev login is not available in production' },
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

    if (!setCookieHeader) {
      return NextResponse.json(
        { success: false, error: 'No session cookie in response' },
        { status: 401 }
      );
    }

    const match = setCookieHeader.match(/jwt_session=([^;]+)/);
    if (!match) {
      return NextResponse.json(
        { success: false, error: 'Missing or malformed session cookie' },
        { status: 401 }
      );
    }

    const cookieStore = await cookies();
    cookieStore.set('jwt_session', match[1], {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24,
      path: '/',
    });

    const response_ = NextResponse.json({ success: true });
    response_.headers.set('set-cookie', setCookieHeader);
    return response_;
  } catch (error) {
    console.error('Dev admin login error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}