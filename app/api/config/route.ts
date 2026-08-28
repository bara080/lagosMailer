import { NextRequest, NextResponse } from 'next/server';
import * as store from '@/src/store.js';
import { smtpConfig, telnyxConfig } from '@/lib/send.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const company = req.headers.get('x-company') || 'LagosTSQ';
  const cfg = smtpConfig(company);
  const sms = telnyxConfig(company);
  return NextResponse.json({
    smtpReady: cfg.ready, from: cfg.from,
    smsReady: sms.ready, smsFrom: sms.from || sms.messagingProfileId || '',
    company, stages: store.STAGES,
  });
}
