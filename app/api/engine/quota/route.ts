import { NextRequest, NextResponse } from 'next/server';
import * as engine from '@/src/engine.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Today's engine send quota (for the monitor's Daily quota header).
export async function GET(req: NextRequest) {
  const company = req.headers.get('x-company') || 'LagosTSQ';
  return NextResponse.json(await engine.quotaToday(company));
}
