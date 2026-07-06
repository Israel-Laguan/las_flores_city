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
