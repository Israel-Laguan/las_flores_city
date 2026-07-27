import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

const SERVER_URL = process.env.INTERNAL_SERVER_URL || process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000';

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

    const response = await fetch(`${SERVER_URL}/auth/admin-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
      credentials: 'include',
    });

    if (!response.ok) {
      const errorData = await response.json();
      return NextResponse.json(
        { success: false, error: errorData.error || 'Login failed' },
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
    console.error('Admin login error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
