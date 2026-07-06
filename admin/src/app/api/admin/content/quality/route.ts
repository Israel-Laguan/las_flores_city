import { NextResponse } from 'next/server';
import { adminFetch } from '@/lib/adminApi';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const data = await adminFetch('/admin/content/quality', { method: 'POST' });
    return NextResponse.json(data);
  } catch (error) {
    console.error('Admin content quality error:', error);
    const status = (error as { status?: number })?.status ?? 500;
    const message = (error as { message?: string })?.message || 'Internal server error';
    return NextResponse.json(
      { success: false, error: message },
      { status }
    );
  }
}
