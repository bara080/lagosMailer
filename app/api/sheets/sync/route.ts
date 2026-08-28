import { NextRequest, NextResponse } from 'next/server';
import { syncSheet } from '@/lib/gsheets.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const company = req.headers.get('x-company') || 'LagosTSQ';
    return NextResponse.json(await syncSheet(company));
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
