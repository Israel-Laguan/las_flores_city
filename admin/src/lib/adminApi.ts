import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';

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
        'Cookie': `jwt_session=${sessionCookie.value}`,
        'Content-Type': 'application/json',
      },
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
  
  // Only set Content-Type for JSON-compatible bodies; skip for FormData uploads
  if (!(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const cookieStore = cookies();
  const sessionCookie = cookieStore.get('jwt_session');
  if (sessionCookie && !headers.has('Cookie')) {
    headers.set('Cookie', `jwt_session=${sessionCookie.value}`);
  }

  const response = await fetch(`${serverUrl}${url}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const error = new Error(`API request failed: ${response.status}`) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }

  return response.json();
}

// ---------------------------------------------------------------------------
// Shared proxy-route factories
// ---------------------------------------------------------------------------

export function createPaginatedProxyHandler(endpoint: string) {
  return async function GET(req: Request) {
    try {
      const { searchParams } = new URL(req.url);
      const params = new URLSearchParams({
        page: searchParams.get('page') ?? '1',
        pageSize: searchParams.get('pageSize') ?? '50',
      });
      const data = await adminFetch(`${endpoint}?${params.toString()}`);
      return NextResponse.json(data);
    } catch (error) {
      const status = (error as { status?: number })?.status ?? 500;
      const message = (error as { message?: string })?.message ?? 'Internal server error';
      return NextResponse.json({ success: false, error: message }, { status });
    }
  };
}

export function createDetailProxyHandler(endpoint: string) {
  return async function GET(_req: NextRequest, context: { params: { id: string } }) {
    const { id } = context.params;
    try {
      const data = await adminFetch(`${endpoint}/${encodeURIComponent(id)}`);
      return NextResponse.json(data);
    } catch (error) {
      const status = (error as { status?: number })?.status ?? 500;
      const message = (error as { message?: string })?.message ?? 'Internal server error';
      return NextResponse.json({ success: false, error: message }, { status });
    }
  };
}
