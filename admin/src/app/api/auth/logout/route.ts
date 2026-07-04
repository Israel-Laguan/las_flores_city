import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function GET(request: Request) {
  try {
    // Clear the session cookie
    cookies().delete('jwt_session');

    // Also clear it from the server by calling the logout endpoint
    const serverUrl = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000';
    await fetch(`${serverUrl}/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    });

    return NextResponse.redirect(new URL('/login', request.url));
  } catch (error) {
    console.error('Logout error:', error);
    return NextResponse.redirect(new URL('/login', request.url));
  }
}