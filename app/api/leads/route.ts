import { NextRequest, NextResponse } from 'next/server';
import * as store from '@/src/store.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const stage = req.nextUrl.searchParams.get('stage') || undefined;
  const q = req.nextUrl.searchParams.get('q') || undefined;
  return NextResponse.json({ leads: await store.list({ stage, q }), counts: await store.counts() });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    return NextResponse.json(await store.add(body));
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
