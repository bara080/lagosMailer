// HMAC-signed session token — runtime-agnostic (works in both the Edge
// middleware and Node route handlers) using the Web Crypto API only, so no
// extra dependency (no `jose`) and no Node-only `crypto` import is needed.
//
// This ports zinga-os's signed-cookie session mechanism (the pre-Supabase
// `zinga_session` JWT). The credential source is swapped for env vars, but the
// session/cookie/token shape is preserved: a compact signed token carrying the
// user's id, email, display name and role.

// Role model mirrors zinga-os (`superadmin | admin | guest`).
export type Role = 'superadmin' | 'admin' | 'guest';

// Trusted session payload. `_id/email/displayName/role` mirror zinga's
// `UserSession`; `iat/exp` are epoch-ms token lifetime bounds.
export type SessionPayload = {
  _id: string;
  email: string;
  displayName: string;
  role: Role;
  iat: number;
  exp: number;
};

// Cookie the signed token lives in (analogous to zinga's `zinga_session`).
export const SESSION_COOKIE = 'lm_session';

// Default session lifetime: 12h (matches zinga's ABSOLUTE_TIMEOUT default).
export const SESSION_MAX_AGE_SEC = 12 * 60 * 60;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function base64url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64url(str: string): Uint8Array {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

// Dev fallback secret. In production SESSION_SECRET MUST be set.
export function getSecret(): string {
  return process.env.SESSION_SECRET || 'dev-insecure-session-secret-change-me';
}

// Sign `<base64url(json)>.<base64url(hmac)>`.
export async function signToken(
  payload: Omit<SessionPayload, 'iat' | 'exp'>,
  secret: string = getSecret(),
  maxAgeSec: number = SESSION_MAX_AGE_SEC,
): Promise<string> {
  const now = Date.now();
  const full: SessionPayload = {
    ...payload,
    iat: now,
    exp: now + maxAgeSec * 1000,
  };
  const body = base64url(encoder.encode(JSON.stringify(full)));
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(body));
  return `${body}.${base64url(new Uint8Array(sig))}`;
}

// Verify signature + expiry. Returns the trusted payload or null.
export async function verifyToken(
  token: string | undefined | null,
  secret: string = getSecret(),
): Promise<SessionPayload | null> {
  if (!token) return null;
  const dot = token.indexOf('.');
  if (dot < 1) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!body || !sig) return null;

  try {
    const key = await hmacKey(secret);
    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      fromBase64url(sig),
      encoder.encode(body),
    );
    if (!valid) return null;

    const payload = JSON.parse(decoder.decode(fromBase64url(body))) as SessionPayload;
    if (!payload || typeof payload.exp !== 'number' || Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}
