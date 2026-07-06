import { NextResponse } from 'next/server';
import { adminFetch } from '@/lib/adminApi';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const data = await adminFetch('/admin/content/assign-asset', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return NextResponse.json(data);
  } catch (error) {
    console.error('Admin content assign-asset error:', error);
    const status = (error as { status?: number })?.status ?? 500;
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status }
    );
  }
}
