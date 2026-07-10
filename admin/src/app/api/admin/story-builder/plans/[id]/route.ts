import { NextResponse } from 'next/server';
import { adminFetch } from '@/lib/adminApi';

export const dynamic = 'force-dynamic';

// GET /api/admin/story-builder/plans/:id
export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const data = await adminFetch(`/admin/story-builder/plans/${params.id}`);
    return NextResponse.json(data);
  } catch (error) {
    console.error('Admin story-builder plan get error:', error);
    const status = (error as { status?: number })?.status ?? 500;
    return NextResponse.json({ success: false, error: (error as Error).message }, { status });
  }
}

// PUT /api/admin/story-builder/plans/:id
export async function PUT(request: Request, { params }: { params: { id: string } }) {
  try {
    const body = await request.json();
    const data = await adminFetch(`/admin/story-builder/plans/${params.id}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
    return NextResponse.json(data);
  } catch (error) {
    console.error('Admin story-builder plan update error:', error);
    const status = (error as { status?: number })?.status ?? 500;
    return NextResponse.json({ success: false, error: (error as Error).message }, { status });
  }
}

// DELETE /api/admin/story-builder/plans/:id
export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  try {
    const data = await adminFetch(`/admin/story-builder/plans/${params.id}`, {
      method: 'DELETE',
    });
    return NextResponse.json(data);
  } catch (error) {
    console.error('Admin story-builder plan delete error:', error);
    const status = (error as { status?: number })?.status ?? 500;
    return NextResponse.json({ success: false, error: (error as Error).message }, { status });
  }
}
