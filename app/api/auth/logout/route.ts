import { NextResponse } from 'next/server';
import { SESSION_COOKIE } from '@/lib/auth/token';

// POST /api/auth/logout — clears the session cookie (ports zinga-os's
// app/src/app/api/auth/logout/route.ts, which called supabase.auth.signOut()
// and deleted its session/activity cookies).
export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
  return res;
}
