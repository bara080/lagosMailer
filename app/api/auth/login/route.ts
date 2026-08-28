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

// Operator accounts. Emails are fixed here (they aren't secrets); passwords come
// from env so real credentials never live in the repo. Add/adjust accounts here.
type Account = { email: string; password: string; role: Role };

function accounts(): Account[] {
  const list: Account[] = [
    {
      email: (process.env.SUPERADMIN_EMAIL || 'baraahmad232@gmail.com').toLowerCase(),
      password: process.env.SUPERADMIN_PASSWORD || 'admin',
      role: 'superadmin',
    },
    {
      email: (process.env.ADMIN_EMAIL || 'googs000@gmail.com').toLowerCase(),
      password: process.env.ADMIN_PASSWORD || 'admin',
      role: 'admin',
    },
  ];
  // Optional legacy single-account override (AUTH_EMAIL/AUTH_PASSWORD).
  if (process.env.AUTH_EMAIL && process.env.AUTH_PASSWORD) {
    list.push({
      email: process.env.AUTH_EMAIL.toLowerCase(),
      password: process.env.AUTH_PASSWORD,
      role: (process.env.AUTH_ROLE as Role) || 'admin',
    });
  }
  return list;
}

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
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body?.password === 'string' ? body.password : '';

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
    }

    // Match on email, then verify password (safeEqual on both to reduce timing leaks).
    const acct = accounts().find((a) => safeEqual(a.email, email));
    if (!acct || !safeEqual(password, acct.password)) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
    }

    const token = await signToken({
      _id: acct.email,
      email: acct.email,
      displayName: acct.email.split('@')[0] || 'user',
      role: acct.role,
    });

    const res = NextResponse.json({
      ok: true,
      user: { _id: acct.email, email: acct.email, role: acct.role },
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
