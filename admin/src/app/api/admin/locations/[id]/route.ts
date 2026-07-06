import { NextRequest, NextResponse } from 'next/server';
import { adminFetch } from '@/lib/adminApi';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  context: { params: { id: string } }
) {
  const { id } = context.params;
  try {
    const data = await adminFetch(`/admin/locations/${id}`);
    return NextResponse.json(data);
  } catch (error) {
    const status = (error as { status?: number })?.status ?? 500;
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status });
  }
}
