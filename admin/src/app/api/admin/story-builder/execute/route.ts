import { NextResponse } from 'next/server';
import { adminFetch } from '@/lib/adminApi';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { plan } = body;

    if (!plan) {
      return NextResponse.json(
        { success: false, error: 'plan is required' },
        { status: 400 }
      );
    }

    const data = await adminFetch('/admin/story-builder/execute', {
      method: 'POST',
      body: JSON.stringify({ plan }),
    });
    return NextResponse.json(data);
  } catch (error) {
    console.error('Admin story-builder execute error:', error);
    const status = (error as { status?: number })?.status ?? 500;
    return NextResponse.json({
      success: false,
      error: (error as Error).message || 'Internal server error'
    }, { status });
  }
}
