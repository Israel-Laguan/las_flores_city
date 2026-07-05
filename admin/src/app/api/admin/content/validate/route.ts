import { NextResponse } from 'next/server';
import { adminFetch } from '@/lib/adminApi';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const data = await adminFetch('/admin/content/validate', { method: 'POST' });
    return NextResponse.json(data);
  } catch (error) {
    console.error('Admin content validate error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
