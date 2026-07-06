import { NextResponse } from 'next/server';
import { adminFetch } from '@/lib/adminApi';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const q = searchParams.get('q') ?? '';
    const data = await adminFetch(`/admin/lore/search?q=${encodeURIComponent(q)}`, { method: 'GET' });
    return NextResponse.json(data);
  } catch (error) {
    console.error('Admin lore search error:', error);
    const status = (error as { status?: number })?.status ?? 500;
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status }
    );
  }
}
