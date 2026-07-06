import { NextResponse } from 'next/server';
import { adminFetch } from '@/lib/adminApi';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const data = await adminFetch('/admin/content/diff', { method: 'POST' });
    return NextResponse.json(data);
  } catch (error) {
    const status = (error as { status?: number })?.status ?? 500;
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status });
  }
}
