import { NextResponse } from 'next/server';
import { cookies, headers } from 'next/headers';

const SERVER_URL = process.env.INTERNAL_SERVER_URL || process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000';

export async function POST() {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get('jwt_session');

    const headersList = await headers();
    const host = headersList.get('host');
    const protocol = headersList.get('x-forwarded-proto') || 'http';
    const origin = `${protocol}://${host}`;

    let clearCookieHeader: string | null = null;

    if (sessionCookie) {
      const serverResponse = await fetch(`${SERVER_URL}/auth/logout`, {
        method: 'POST',
        headers: { 'Cookie': `jwt_session=${sessionCookie.value}` },
      });

      clearCookieHeader = serverResponse.headers.get('set-cookie');
    }

    cookieStore.delete('jwt_session');

    const response = NextResponse.redirect(new URL('/login', origin), { status: 303 });
    if (clearCookieHeader) {
      response.headers.set('set-cookie', clearCookieHeader);
    }
    return response;
  } catch (error) {
    console.error('Logout error:', error);
    const cookieStore = await cookies();
    cookieStore.delete('jwt_session');
    return NextResponse.redirect(new URL('/login', process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3002'), { status: 303 });
  }
}
