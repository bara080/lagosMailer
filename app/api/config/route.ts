import { NextRequest, NextResponse } from 'next/server';
import * as store from '@/src/store.js';
import { smtpConfig } from '@/lib/send.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const company = req.headers.get('x-company') || 'LagosTSQ';
  const cfg = smtpConfig(company);
  return NextResponse.json({ smtpReady: cfg.ready, from: cfg.from, company, stages: store.STAGES });
}
