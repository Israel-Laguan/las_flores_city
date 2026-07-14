import { NextResponse } from 'next/server';
import { adminFetch } from '@/lib/adminApi';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const path = searchParams.get('path');
    if (!path) {
      return NextResponse.json(
        { success: false, error: 'Missing required query parameter: path' },
        { status: 400 }
      );
    }
    const data = await adminFetch(`/admin/lore/file?path=${encodeURIComponent(path)}`, { method: 'GET' });
    return NextResponse.json(data);
  } catch (error) {
    console.error('Admin lore file error:', error);
    const status = (error as { status?: number })?.status ?? 500;
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { path, content } = body;

    if (!path || content === undefined) {
      return NextResponse.json(
        { success: false, error: 'path and content are required' },
        { status: 400 }
      );
    }

    const data = await adminFetch('/admin/lore/file', {
      method: 'POST',
      body: JSON.stringify({ path, content }),
    });
    return NextResponse.json(data);
  } catch (error) {
    console.error('Admin lore file POST error:', error);
    const status = (error as { status?: number })?.status ?? 500;
    return NextResponse.json(
      { success: false, error: (error as Error).message || 'Failed to save lore file' },
      { status }
    );
  }
}
