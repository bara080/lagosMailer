// Server-side session helpers. Ports zinga-os's `readSession()` +
// `requireOperator` pattern (app/src/lib/auth/session/session.ts and
// app/src/lib/operator/guard.ts) onto the signed-cookie mechanism in
// ./token.ts.

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SESSION_COOKIE, verifyToken, type Role, type SessionPayload } from './token';

// Public session shape (mirrors zinga's `UserSession`), without token internals.
export type UserSession = {
  _id: string;
  email: string;
  displayName: string;
  role: Role;
};

// Operator roles, mirroring zinga's guard.ts OPERATOR_ROLES.
export const OPERATOR_ROLES = new Set<Role>(['superadmin', 'admin']);

function toSession(p: SessionPayload): UserSession {
  return { _id: p._id, email: p.email, displayName: p.displayName, role: p.role };
}

// Reads and verifies the httpOnly session cookie. Returns the trusted session
// or null. Server-only (uses next/headers). Equivalent to zinga's readSession().
export async function readSession(): Promise<UserSession | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  const payload = await verifyToken(token);
  return payload ? toSession(payload) : null;
}

// Auth gate for server components / route handlers. Redirects to /login when
// unauthenticated. Optionally enforces that the role is in `allowed`
// (defaults to any authenticated user), mirroring zinga's requireOperator.
export async function requireAuth(allowed?: Set<Role>): Promise<UserSession> {
  const session = await readSession();
  if (!session) redirect('/login');
  if (allowed && !allowed.has(session.role)) redirect('/login');
  return session;
}

// Convenience guard: authenticated AND an operator role (superadmin | admin).
export async function requireOperator(): Promise<UserSession> {
  return requireAuth(OPERATOR_ROLES);
}
