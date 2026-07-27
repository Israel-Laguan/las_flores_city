import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

/**
 * Forward a jwt_session cookie from an Express backend response to the
 * Next.js admin origin, using admin-side cookie attributes.
 *
 * This avoids coupling browser cookie behavior (Secure / SameSite) to the
 * internal server's NODE_ENV.
 */
export async function forwardSessionCookie(
  setCookieHeader: string | null,
): Promise<NextResponse<{ success: boolean }>> {
  if (!setCookieHeader) {
    return NextResponse.json(
      { success: false, error: 'No session cookie in response' },
      { status: 401 },
    );
  }

  const match = setCookieHeader.match(/jwt_session=([^;]+)/);
  if (!match) {
    return NextResponse.json(
      { success: false, error: 'Missing or malformed session cookie' },
      { status: 401 },
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

  return NextResponse.json({ success: true });
}