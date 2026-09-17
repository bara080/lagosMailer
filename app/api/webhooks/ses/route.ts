import { NextRequest, NextResponse } from 'next/server';
import * as engine from '@/src/engine.js';
import { verifySnsMessage } from '@/lib/ses.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Amazon SES delivery webhooks, delivered via SNS (the SES configuration set has an
// SNS event destination for BOUNCE/COMPLAINT/DELIVERY). Verifies the SNS signature,
// auto-confirms the topic subscription, then records the event + suppresses ONLY
// permanent bounces and complaints (transient bounces are recorded, not suppressed —
// see engine.ingestSesEvent). The SES equivalent of /api/webhooks/resend.
//
// Wire-up (after deploy): subscribe each SES topic to this URL, e.g.
//   aws sns subscribe --topic-arn arn:aws:sns:us-east-1:471112908289:native125th-ses-events \
//     --protocol https --notification-endpoint https://<app>/api/webhooks/ses
// The first delivery is a SubscriptionConfirmation, which this route auto-confirms.
export async function POST(req: NextRequest) {
  const raw = await req.text();
  let msg: any;
  try { msg = JSON.parse(raw); } catch { return NextResponse.json({ error: 'bad body' }, { status: 400 }); }

  // Verify the SNS signature (set SES_SNS_SKIP_VERIFY=1 only for local testing).
  const skip = process.env.SES_SNS_SKIP_VERIFY === '1';
  if (!skip && !(await verifySnsMessage(msg))) {
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
  }

  // Confirm the subscription on first contact (SNS sends a SubscribeURL to GET).
  if (msg.Type === 'SubscriptionConfirmation') {
    if (msg.SubscribeURL) { try { await fetch(msg.SubscribeURL); } catch { /* AWS retries */ } }
    return NextResponse.json({ ok: true, confirmed: true });
  }

  if (msg.Type === 'Notification') {
    let event: any;
    try { event = JSON.parse(msg.Message); } catch { return NextResponse.json({ error: 'bad message' }, { status: 400 }); }
    const result = await engine.ingestSesEvent(msg.MessageId, event);
    return NextResponse.json({ ok: true, ...result });
  }

  return NextResponse.json({ ok: true, ignored: msg.Type });
}
