import { adminFetch } from '@/lib/adminApi';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const data = await adminFetch('/admin/story-beats/story-arc');
    return NextResponse.json(data);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Failed to fetch story arc';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
