import { NextRequest, NextResponse } from 'next/server';
import { adminFetch } from '@/lib/adminApi';

export const dynamic = 'force-dynamic';

export async function PUT(
  req: NextRequest,
  context: { params: { slug: string } }
) {
  const { slug } = context.params;
  try {
    const body = await req.json();
    const data = await adminFetch(`/admin/story-beats/${slug}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
    return NextResponse.json(data);
  } catch (error) {
    console.error('Admin story-beats PUT error:', error);
    const status = (error as { status?: number })?.status ?? 500;
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  context: { params: { slug: string } }
) {
  const { slug } = context.params;
  try {
    const data = await adminFetch(`/admin/story-beats/${slug}`, {
      method: 'DELETE',
    });
    return NextResponse.json(data);
  } catch (error) {
    console.error('Admin story-beats DELETE error:', error);
    const status = (error as { status?: number })?.status ?? 500;
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status }
    );
  }
}
