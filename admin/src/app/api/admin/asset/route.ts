import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const assetPath = searchParams.get('path');

    if (!assetPath) {
      return NextResponse.json({ success: false, error: 'path is required' }, { status: 400 });
    }

    const serverUrl = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000';
    const { cookies } = await import('next/headers');
    const cookieStore = cookies();
    const sessionCookie = cookieStore.get('jwt_session');

    const headers: Record<string, string> = {};
    if (sessionCookie) {
      headers['Cookie'] = `jwt_session=${sessionCookie.value}`;
    }

    const res = await fetch(`${serverUrl}/admin/asset?path=${encodeURIComponent(assetPath)}`, {
      headers,
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      const errorBody = await res.text();
      let errorJson: { success?: boolean; error?: string };
      try {
        errorJson = JSON.parse(errorBody);
      } catch {
        errorJson = { error: errorBody || 'Asset fetch failed' };
      }
      return NextResponse.json(errorJson, { status: res.status });
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    const contentType = res.headers.get('Content-Type') || 'image/png';
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=300',
      },
    });
  } catch (error) {
    console.error('Admin asset proxy error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch asset',
    }, { status: 500 });
  }
}
