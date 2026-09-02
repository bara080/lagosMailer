import { NextRequest, NextResponse } from 'next/server';
import * as store from '@/src/store.js';
import { verifyUnsub } from '@/lib/unsubscribe.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Verify the signed link, then set the lead's stage to `unsub` (the send
// pipeline excludes unsub leads). Idempotent + safe: a valid token for an
// address not in the CRM is still honored (no-op) so we never leak whether an
// address exists.
async function doUnsub(company: string | null, email: string | null, token: string | null): Promise<boolean> {
  if (!verifyUnsub(company || '', email || '', token || '')) return false;
  try {
    const matches = await store.resolveAudience(company, { emails: [email], emailOnly: false });
    const lead = (matches || []).find((l: any) => l && l.id);
    if (lead) await store.update(company, lead.id, { stage: 'unsub' });
    await store.logActivity(company, { type: 'unsub', text: `Unsubscribed: ${email}` });
  } catch {
    /* best-effort — still report success to the clicker */
  }
  return true;
}

// RFC 8058 one-click: Gmail/Outlook POST here directly (no user interaction).
export async function POST(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  await doUnsub(sp.get('c'), sp.get('e'), sp.get('t'));
  return new NextResponse(null, { status: 200 });
}

// Link click in the email body → mark unsub + show a confirmation page.
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const email = sp.get('e') || '';
  const ok = await doUnsub(sp.get('c'), email, sp.get('t'));
  const body = ok
    ? `<h1>You're unsubscribed</h1><p>${escapeHtml(email)} has been removed from our list and won't receive further emails.</p>`
    : `<h1>Link expired</h1><p>This unsubscribe link is invalid or expired. Please reply to the email and ask to be removed.</p>`;
  const page = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">`
    + `<title>Unsubscribe</title><style>body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;`
    + `max-width:520px;margin:12vh auto;padding:0 24px;color:#111;line-height:1.5}h1{font-size:22px}p{color:#444}</style>`
    + `</head><body>${body}</body></html>`;
  return new NextResponse(page, { status: ok ? 200 : 400, headers: { 'content-type': 'text/html; charset=utf-8' } });
}

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
