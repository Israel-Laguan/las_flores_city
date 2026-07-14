import { NextResponse } from 'next/server';

const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000';

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
    const responseHeaders: Record<string, string> = {
      location: new URL('/', request.url).toString(),
    };
    if (setCookieHeader) {
      responseHeaders['set-cookie'] = setCookieHeader;
    }

    return new NextResponse(null, { status: 303, headers: responseHeaders });
  } catch (error) {
    console.error('Admin login error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
