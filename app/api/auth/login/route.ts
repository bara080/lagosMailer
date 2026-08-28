import { NextResponse } from 'next/server';
import {
  signToken,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SEC,
  type Role,
} from '@/lib/auth/token';

// POST /api/auth/login
// Ports zinga-os's login route (app/src/app/api/auth/login/route.ts): validate
// email/password, verify credentials, and on success set an httpOnly session
// cookie. Zinga verified against Supabase (signInWithPassword); here we verify
// against env vars for a zero-dependency local setup, keeping the same
// signed-cookie session mechanism.

const AUTH_EMAIL = process.env.AUTH_EMAIL || 'admin@lagosmailer.com';
const AUTH_PASSWORD = process.env.AUTH_PASSWORD || 'admin';
// The single env-configured account is a full operator.
const AUTH_ROLE: Role = 'admin';

// Constant-time-ish string comparison to avoid trivial timing leaks.
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const email = typeof body?.email === 'string' ? body.email.trim() : '';
    const password = typeof body?.password === 'string' ? body.password : '';

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
    }

    const emailOk = safeEqual(email.toLowerCase(), AUTH_EMAIL.toLowerCase());
    const passOk = safeEqual(password, AUTH_PASSWORD);
    if (!emailOk || !passOk) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
    }

    const token = await signToken({
      _id: AUTH_EMAIL,
      email: AUTH_EMAIL,
      displayName: AUTH_EMAIL.split('@')[0] || 'admin',
      role: AUTH_ROLE,
    });

    const res = NextResponse.json({
      ok: true,
      user: { _id: AUTH_EMAIL, email: AUTH_EMAIL, role: AUTH_ROLE },
    });
    res.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_MAX_AGE_SEC,
    });
    return res;
  } catch (err) {
    console.error('login error', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
