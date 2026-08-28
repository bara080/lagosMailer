import { NextResponse } from 'next/server';
import { readSession } from '@/lib/auth/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Returns the current authenticated session (or { user: null }).
export async function GET() {
  const user = await readSession();
  return NextResponse.json({ user });
}
