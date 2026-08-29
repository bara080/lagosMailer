import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, verifyToken } from '@/lib/auth/token';

// Route protection. Ports zinga-os's middleware intent (app/src/middleware.ts +
// lib/supabase/middleware.ts): every request must carry a valid session, else
// redirect to /login. Verification uses the Web Crypto HMAC check in
// lib/auth/token.ts, which runs in the Edge middleware runtime.
//
// Public (unauthenticated) surface: the login page, the auth API routes, and
// static assets (excluded via the matcher below).
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Always-allow paths. The opt-in form + privacy policy are PUBLIC by design
  // (subscribers and carriers must reach them without logging in).
  if (
    pathname === '/login' ||
    pathname === '/optin' ||
    pathname === '/privacy' ||
    pathname === '/api/optin' ||
    pathname.startsWith('/api/auth/')
  ) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = await verifyToken(token);

  if (session) return NextResponse.next();

  // Unauthenticated: API callers get 401 JSON; everything else redirects.
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = request.nextUrl.clone();
  url.pathname = '/login';
  url.search = '';
  return NextResponse.redirect(url);
}

export const config = {
  // Match everything except Next internals and static asset files.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|txt|woff|woff2|ttf)$).*)',
  ],
};
