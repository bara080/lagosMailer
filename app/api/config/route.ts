import { NextRequest, NextResponse } from 'next/server';
import * as store from '@/src/store.js';
import { smtpConfig, telnyxConfig } from '@/lib/send.js';
import { sheetConfig } from '@/lib/gsheets.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const company = req.headers.get('x-company') || 'LagosTSQ';
  const cfg = smtpConfig(company);
  const sms = telnyxConfig(company);
  const sheet = await sheetConfig(company);
  const settings = await store.getSettings(company);

  // Dynamic "send from" options: custom list from settings, else derive common
  // aliases (info@ / admin@) from the configured sender's domain.
  const domain = (cfg.from || '').split('@')[1] || '';
  const derived = domain ? [cfg.from, `info@${domain}`, `admin@${domain}`] : [cfg.from];
  const senders = Array.from(new Set(
    (Array.isArray(settings.senders) && settings.senders.length ? settings.senders : derived)
      .map((s: string) => String(s).trim()).filter(Boolean),
  ));

  return NextResponse.json({
    smtpReady: cfg.ready, from: cfg.from, senders,
    smsReady: sms.ready, smsFrom: sms.from || sms.messagingProfileId || '',
    sheetReady: sheet.ready, sheetHasCreds: sheet.hasCreds, sheetUrl: sheet.sheetUrl,
    company, stages: store.STAGES,
    signature: settings.signature || null,
    dailyCap: await store.getDailyCap(company),
    sentToday: await store.getSentToday(company),
  });
}
