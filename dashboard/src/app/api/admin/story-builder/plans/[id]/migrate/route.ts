import { NextResponse } from 'next/server';
import { adminFetch } from '@/lib/adminApi';

export const dynamic = 'force-dynamic';

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  try {
    const data = await adminFetch(`/admin/story-builder/plans/${params.id}/migrate`, {
      method: 'POST',
    });
    return NextResponse.json(data);
  } catch (error) {
    console.error('Admin story-builder migrate error:', error);
    const status = (error as { status?: number })?.status ?? 500;
    return NextResponse.json({ success: false, error: (error as Error).message }, { status });
  }
}
