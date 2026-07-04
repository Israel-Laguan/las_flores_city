import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function POST(request: Request) {
  try {
    const cookieStore = cookies();
    const sessionCookie = cookieStore.get('jwt_session');

    cookieStore.delete('jwt_session');

    if (sessionCookie) {
      const serverUrl = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000';
      await fetch(`${serverUrl}/auth/logout`, {
        method: 'POST',
        headers: {
          'Cookie': `jwt_session=${sessionCookie.value}`,
        },
      });
    }

    return NextResponse.redirect(new URL('/login', request.url));
  } catch (error) {
    console.error('Logout error:', error);
    return NextResponse.redirect(new URL('/login', request.url));
  }
}
