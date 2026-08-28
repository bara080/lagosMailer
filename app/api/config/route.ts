import { NextResponse } from 'next/server';
import * as store from '@/src/store.js';
import { smtpConfig } from '@/lib/send.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const cfg = smtpConfig();
  return NextResponse.json({ smtpReady: cfg.ready, from: cfg.from, stages: store.STAGES });
}
