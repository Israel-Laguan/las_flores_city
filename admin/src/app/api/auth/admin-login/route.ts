import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;

    if (!email || !password) {
      return NextResponse.json(
        { success: false, error: 'Email and password are required' },
        { status: 400 }
      );
    }

    // Forward the request to the server API
    const serverUrl = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000';
    const response = await fetch(`${serverUrl}/auth/admin-login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
      credentials: 'include', // This is important for cookies
    });

    if (!response.ok) {
      const errorData = await response.json();
      return NextResponse.json(
        { success: false, error: errorData.error || 'Login failed' },
        { status: response.status }
      );
    }

    const data = await response.json();

    // Set the session cookie from the server response
    const setCookieHeader = response.headers.get('set-cookie');
    if (setCookieHeader) {
      cookies().set('jwt_session', setCookieHeader.split('=')[1].split(';')[0], {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
      });
    }

    return NextResponse.redirect(new URL('/', request.url));
  } catch (error) {
    console.error('Admin login error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}