import { NextResponse } from 'next/server';
import { adminFetch } from '@/lib/adminApi';

export const dynamic = 'force-dynamic';

// GET /api/admin/story-builder/plans/:id/versions
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const data = await adminFetch(`/admin/story-builder/plans/${params.id}/versions`);
    return NextResponse.json(data);
  } catch (error) {
    console.error('Admin story-builder versions error:', error);
    const status = (error as { status?: number })?.status ?? 500;
    return NextResponse.json({ success: false, error: (error as Error).message }, { status });
  }
}