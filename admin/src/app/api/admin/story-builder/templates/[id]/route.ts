import { NextResponse } from 'next/server';
import { adminFetch } from '@/lib/adminApi';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const body = await request.json();
    const data = await adminFetch(`/admin/story-builder/templates/${params.id}`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return NextResponse.json(data);
  } catch (error) {
    console.error('Admin story-builder template build error:', error);
    const status = (error as { status?: number })?.status ?? 500;
    return NextResponse.json({ success: false, error: (error as Error).message }, { status });
  }
}
