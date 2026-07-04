import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function POST(request: Request) {
  try {
    const cookieStore = cookies();
    const sessionCookie = cookieStore.get('jwt_session');

    cookieStore.delete('jwt_session');

    if (sessionCookie) {
      const serverUrl = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000';
      const serverResponse = await fetch(`${serverUrl}/auth/logout`, {
        method: 'POST',
        headers: {
          'Cookie': `jwt_session=${sessionCookie.value}`,
        },
      });

      // Forward the server's Set-Cookie (clear cookie) to the browser
      const setCookieHeader = serverResponse.headers.get('set-cookie');
      if (setCookieHeader) {
        const responseHeaders: Record<string, string> = {
          'location': new URL('/login', request.url).toString(),
        };
        responseHeaders['set-cookie'] = setCookieHeader;
        return new NextResponse(null, {
          status: 303,
          headers: responseHeaders,
        });
      }
    }

    return NextResponse.redirect(new URL('/login', request.url), { status: 303 });
  } catch (error) {
    console.error('Logout error:', error);
    return NextResponse.redirect(new URL('/login', request.url), { status: 303 });
  }
}
