import { cookies } from 'next/headers';

export async function getAdminUser() {
  try {
    const serverUrl = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000';
    const cookieStore = cookies();
    const sessionCookie = cookieStore.get('jwt_session');

    if (!sessionCookie) {
      return null;
    }

    const response = await fetch(`${serverUrl}/auth/admin-me`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return data.data?.user || null;
  } catch (error) {
    console.error('Error fetching admin user:', error);
    return null;
  }
}

export async function adminFetch(url: string, options: RequestInit = {}) {
  const serverUrl = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000';

  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json');

  const response = await fetch(`${serverUrl}${url}`, {
    ...options,
    headers,
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status}`);
  }

  return response.json();
}
