// One-click unsubscribe (RFC 8058 + CAN-SPAM). Every campaign email carries a
// signed unsubscribe link + `List-Unsubscribe` headers so Gmail/Yahoo/Outlook
// show a native "Unsubscribe" button and bulk-sender requirements are met.
import crypto from 'crypto';

const APP_URL = (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://lagosmailer-psi.vercel.app').replace(/\/$/, '');
const SECRET = process.env.UNSUB_SECRET || process.env.SESSION_SECRET || 'lagosmailer-unsub-fallback';

// HMAC over company+email so a link can't be forged for an arbitrary address.
export function unsubToken(company, email) {
  return crypto.createHmac('sha256', SECRET).update(`${company}:${String(email).toLowerCase()}`).digest('base64url');
}

export function unsubUrl(company, email) {
  const q = new URLSearchParams({ c: company, e: String(email), t: unsubToken(company, email) });
  return `${APP_URL}/api/unsubscribe?${q.toString()}`;
}

export function verifyUnsub(company, email, token) {
  if (!company || !email || !token) return false;
  const expected = unsubToken(company, email);
  try {
    return crypto.timingSafeEqual(Buffer.from(String(token)), Buffer.from(expected));
  } catch {
    return false;
  }
}

// Headers that make mail clients render a one-click unsubscribe button.
export function unsubHeaders(company, email) {
  return {
    'List-Unsubscribe': `<${unsubUrl(company, email)}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  };
}

// Visible footer link (CAN-SPAM requires a clear opt-out in the body too).
export function unsubFooterHtml(company, email) {
  const url = unsubUrl(company, email);
  return `<div style="margin-top:20px;padding-top:12px;border-top:1px solid #e5e7eb;color:#9ca3af;font-size:12px;line-height:1.5">`
    + `You received this because you're on our contact list. `
    + `<a href="${url}" style="color:#6b7280;text-decoration:underline">Unsubscribe</a>.`
    + `</div>`;
}

export function unsubFooterText(company, email) {
  return `\n\n—\nUnsubscribe: ${unsubUrl(company, email)}`;
}
