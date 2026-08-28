import { NextRequest, NextResponse } from 'next/server';
import * as store from '@/src/store.js';
import { smtpConfig, telnyxConfig } from '@/lib/send.js';
import { gsheetConfig } from '@/lib/gsheets.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const company = req.headers.get('x-company') || 'LagosTSQ';
  const cfg = smtpConfig(company);
  const sms = telnyxConfig(company);
  const sheet = gsheetConfig(company);
  return NextResponse.json({
    smtpReady: cfg.ready, from: cfg.from,
    smsReady: sms.ready, smsFrom: sms.from || sms.messagingProfileId || '',
    sheetReady: sheet.ready,
    company, stages: store.STAGES,
  });
}
