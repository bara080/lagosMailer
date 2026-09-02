import { NextRequest, NextResponse } from 'next/server';
import * as engine from '@/src/engine.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Recent notable run events + unread (attention-needed) count for the bell.
export async function GET(req: NextRequest) {
  const company = req.headers.get('x-company') || 'LagosTSQ';
  return NextResponse.json(await engine.recentNotifications(company, { limit: 25 }));
}
