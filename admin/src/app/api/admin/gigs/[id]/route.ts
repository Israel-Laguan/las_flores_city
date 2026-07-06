import { NextRequest, NextResponse } from 'next/server';
import { adminFetch } from '@/lib/adminApi';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  context: { params: { id: string } }
) {
  const { id } = context.params;
  try {
    const data = await adminFetch(`/admin/gigs/${id}`);
    return NextResponse.json(data);
  } catch (error) {
    const status = (error as { status?: number })?.status ?? 500;
    const message = status === 404 ? 'Gig not found' : 'Internal server error';
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
