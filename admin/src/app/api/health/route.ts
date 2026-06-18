import { NextResponse } from 'next/server';
import { oltpPool } from '@/lib/database';

// ============================================================
// Admin Health Endpoint (Task 5.2 Foundations)
//
// Proof-of-life: confirms the admin app can reach the OLTP
// database. Runs SELECT 1 and returns { status: 'ok', db: true }
// on success, or { status: 'degraded', db: false } on failure.
//
// No auth required — this is the admin equivalent of the server's
// GET /health. Does not expose any data.
// ============================================================

export async function GET() {
  try {
    await oltpPool.query('SELECT 1');
    return NextResponse.json({ status: 'ok', db: true });
  } catch (error) {
    console.error('Admin DB health check failed:', error);
    return NextResponse.json(
      { status: 'degraded', db: false },
      { status: 503 }
    );
  }
}
