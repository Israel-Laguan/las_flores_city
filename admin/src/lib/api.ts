import { cookies } from 'next/headers';

const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000';

export async function getAdminUser() {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get('jwt_session');

    if (!sessionCookie) {
      return null;
    }

    const response = await fetch(`${SERVER_URL}/auth/admin-me`, {
      method: 'GET',
      headers: {
        'Cookie': `jwt_session=${sessionCookie.value}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return data.data?.user || null;
  } catch {
    return null;
  }
}

export async function adminFetch<T = unknown>(
  url: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers);

  if (!(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get('jwt_session');
  if (sessionCookie) {
    headers.set('Cookie', `jwt_session=${sessionCookie.value}`);
  }

  const response = await fetch(`${SERVER_URL}${url}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const error = new Error(`API request failed: ${response.status}`) as Error & {
      status?: number;
    };
    error.status = response.status;
    throw error;
  }

  return response.json();
}
