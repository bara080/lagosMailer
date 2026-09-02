import { NextRequest, NextResponse } from 'next/server';
import * as store from '@/src/store.js';
import { smtpConfig, telnyxConfig, mailerConfig, renderSignatureHtml } from '@/lib/send.js';
import { resendConfig } from '@/lib/resend.js';
import { sheetConfig } from '@/lib/gsheets.js';
import { unsubFooterHtml } from '@/lib/unsubscribe.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const company = req.headers.get('x-company') || 'LagosTSQ';
  const cfg = smtpConfig(company);
  const mailer = mailerConfig(company);   // which provider is ACTIVE
  const resend = resendConfig(company);   // is Resend even available
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
    emailProvider: mailer.provider, mailReady: mailer.ready, resendReady: resend.ready,
    smsReady: sms.ready, smsFrom: sms.from || sms.messagingProfileId || '',
    sheetReady: sheet.ready, sheetHasCreds: sheet.hasCreds, sheetUrl: sheet.sheetUrl,
    company, stages: store.STAGES,
    signature: settings.signature || null,
    // Server-rendered preview extras (same renderers the engine uses at send time),
    // so read-only previews can show exactly what recipients get. Sample recipient
    // for the unsubscribe token — purely cosmetic in a preview.
    signaturePreviewHtml: renderSignatureHtml(settings.signature, { name: '', business: '', category: '', email: '' }),
    unsubFooterPreviewHtml: unsubFooterHtml(company, 'preview@example.com'),
    dailyCap: await store.getDailyCap(company),
    sentToday: await store.getSentToday(company),
  });
}
