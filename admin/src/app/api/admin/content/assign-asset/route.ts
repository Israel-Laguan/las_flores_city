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
  } catch (error: unknown) {
    console.error('Admin content assign-asset error:', error);
    const status = (error as { status?: number })?.status ?? 500;
    const message = (error as { body?: { error?: string } })?.body?.error
      ?? 'Internal server error';
    return NextResponse.json(
      { success: false, error: message },
      { status }
    );
  }
}
