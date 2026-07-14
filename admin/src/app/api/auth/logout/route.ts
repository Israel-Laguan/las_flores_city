import { NextResponse } from 'next/server';
import { cookies, headers } from 'next/headers';

const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000';

export async function POST() {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get('jwt_session');

    cookieStore.delete('jwt_session');

    const headersList = await headers();
    const host = headersList.get('host');
    const protocol = headersList.get('x-forwarded-proto') || 'http';
    const origin = `${protocol}://${host}`;

    if (sessionCookie) {
      const serverResponse = await fetch(`${SERVER_URL}/auth/logout`, {
        method: 'POST',
        headers: { 'Cookie': `jwt_session=${sessionCookie.value}` },
      });

      const setCookieHeader = serverResponse.headers.get('set-cookie');
      if (setCookieHeader) {
        return new NextResponse(null, {
          status: 303,
          headers: {
            location: new URL('/login', origin).toString(),
            'set-cookie': setCookieHeader,
          },
        });
      }
    }

    return NextResponse.redirect(new URL('/login', origin), { status: 303 });
  } catch (error) {
    console.error('Logout error:', error);
    return NextResponse.redirect(new URL('/login', process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001'), { status: 303 });
  }
}
