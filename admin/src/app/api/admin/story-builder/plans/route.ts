import { NextResponse } from 'next/server';
import { adminFetch } from '@/lib/adminApi';

export const dynamic = 'force-dynamic';

// GET /api/admin/story-builder/plans — List plans
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = searchParams.get('limit') || '50';
    const offset = searchParams.get('offset') || '0';

    const data = await adminFetch(`/admin/story-builder/plans?limit=${limit}&offset=${offset}`);
    return NextResponse.json(data);
  } catch (error) {
    console.error('Admin story-builder plans list error:', error);
    const status = (error as { status?: number })?.status ?? 500;
    return NextResponse.json({ success: false, error: (error as Error).message }, { status });
  }
}

// POST /api/admin/story-builder/plans — Create plan
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const data = await adminFetch('/admin/story-builder/plans', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return NextResponse.json(data);
  } catch (error) {
    console.error('Admin story-builder plans create error:', error);
    const status = (error as { status?: number })?.status ?? 500;
    return NextResponse.json({ success: false, error: (error as Error).message }, { status });
  }
}
