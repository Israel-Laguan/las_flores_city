import { NextResponse } from 'next/server';
import { adminFetch } from '@/lib/api';

export async function GET() {
  try {
    const data = await adminFetch('/admin/stats');
    return NextResponse.json(data);
  } catch (error) {
    const status = (error as { status?: number })?.status ?? 500;
    const message = (error as { message?: string })?.message ?? 'Internal server error';
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
