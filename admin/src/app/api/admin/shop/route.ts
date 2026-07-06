import { NextResponse } from 'next/server';
import { adminFetch } from '@/lib/adminApi';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const page = searchParams.get('page') ?? '1';
    const pageSize = searchParams.get('pageSize') ?? '50';
    const data = await adminFetch(`/admin/shop?page=${page}&pageSize=${pageSize}`);
    return NextResponse.json(data);
  } catch (error) {
    const status = (error as { status?: number })?.status ?? 500;
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status });
  }
}
