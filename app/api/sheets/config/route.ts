import { NextRequest, NextResponse } from 'next/server';
import { setSheet } from '@/lib/gsheets.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Connect a Google Sheet to the current company (dynamic; stored in the DB).
export async function POST(req: NextRequest) {
  try {
    const company = req.headers.get('x-company') || 'LagosTSQ';
    const body = await req.json();
    return NextResponse.json(await setSheet(company, body.url || '', body.range));
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
