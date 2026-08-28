import { NextRequest, NextResponse } from 'next/server';
import * as store from '@/src/store.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const company = req.headers.get('x-company') || 'LagosTSQ';
  const stage = req.nextUrl.searchParams.get('stage') || undefined;
  const q = req.nextUrl.searchParams.get('q') || undefined;
  return NextResponse.json({ leads: await store.list(company, { stage, q }), counts: await store.counts(company) });
}

export async function POST(req: NextRequest) {
  try {
    const company = req.headers.get('x-company') || 'LagosTSQ';
    const body = await req.json();
    return NextResponse.json(await store.add(company, body));
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
