import { NextResponse } from 'next/server';
import { adminFetch } from '@/lib/adminApi';

export const dynamic = 'force-dynamic';

// POST /api/admin/story-builder/plans/:id/refine
export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const body = await request.json();
    const { feedback } = body;

    if (!feedback || typeof feedback !== 'string') {
      return NextResponse.json({ success: false, error: 'feedback is required' }, { status: 400 });
    }

    const data = await adminFetch(`/admin/story-builder/plans/${params.id}/refine`, {
      method: 'POST',
      body: JSON.stringify({ feedback }),
    });
    return NextResponse.json(data);
  } catch (error) {
    console.error('Admin story-builder plan refine error:', error);
    const status = (error as { status?: number })?.status ?? 500;
    return NextResponse.json({ success: false, error: (error as Error).message }, { status });
  }
}
