import { NextRequest, NextResponse } from 'next/server';
import * as engine from '@/src/engine.js';
import { verifyResendWebhook } from '@/lib/resend.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Resend delivery webhooks (public). Verifies the Svix signature, then records
// delivered / bounced / complained on the matching recipient (idempotently) and
// suppresses hard bounces + complaints. Set RESEND_WEBHOOK_SECRET (whsec_…) from
// the Resend dashboard → Webhooks.
export async function POST(req: NextRequest) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  const body = await req.text(); // raw body required for signature
  const id = req.headers.get('svix-id');
  const timestamp = req.headers.get('svix-timestamp');
  const signature = req.headers.get('svix-signature');

  if (!verifyResendWebhook(secret, { id, timestamp, signature }, body)) {
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
  }

  let event: any;
  try { event = JSON.parse(body); } catch { return NextResponse.json({ error: 'bad body' }, { status: 400 }); }

  const eventId = id || `${event.type}:${event.data?.email_id}:${event.created_at || ''}`;
  const result = await engine.ingestProviderEvent('resend', eventId, event.type, event.data || {});
  return NextResponse.json({ ok: true, ...result });
}
