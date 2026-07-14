import { NextRequest, NextResponse } from 'next/server';
import { adminFetch } from '@/lib/adminApi';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const data = await adminFetch('/admin/story-beats', { method: 'GET' });
    return NextResponse.json(data);
  } catch (error) {
    console.error('Admin story-beats GET error:', error);
    const status = (error as { status?: number })?.status ?? 500;
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const data = await adminFetch('/admin/story-beats', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return NextResponse.json(data);
  } catch (error) {
    console.error('Admin story-beats POST error:', error);
    const status = (error as { status?: number })?.status ?? 500;
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status }
    );
  }
}
