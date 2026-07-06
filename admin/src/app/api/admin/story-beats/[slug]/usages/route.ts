import { NextRequest, NextResponse } from 'next/server';
import { adminFetch } from '@/lib/adminApi';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  context: { params: { slug: string } }
) {
  const slug = encodeURIComponent(context.params.slug);
  try {
    const data = await adminFetch(`/admin/story-beats/${slug}/usages`, {
      method: 'GET',
    });
    return NextResponse.json(data);
  } catch (error) {
    console.error('Admin story-beats usages GET error:', error);
    const status = (error as { status?: number })?.status ?? 500;
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status }
    );
  }
}
