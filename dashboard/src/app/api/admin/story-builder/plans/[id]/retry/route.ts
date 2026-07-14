import { NextResponse } from 'next/server';
import { adminFetch } from '@/lib/adminApi';

export const dynamic = 'force-dynamic';

// POST /api/admin/story-builder/plans/:id/retry
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  try {
    const data = await adminFetch(`/admin/story-builder/plans/${params.id}/retry`, {
      method: 'POST',
    });
    return NextResponse.json(data);
  } catch (error) {
    console.error('Admin story-builder retry error:', error);
    const status = (error as { status?: number })?.status ?? 500;
    return NextResponse.json({ success: false, error: (error as Error).message }, { status });
  }
}