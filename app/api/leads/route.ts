import { NextRequest, NextResponse } from 'next/server';
import * as store from '@/src/store.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const company = req.headers.get('x-company') || 'LagosTSQ';
  const sp = req.nextUrl.searchParams;
  const stage = sp.get('stage') || undefined;
  const q = sp.get('q') || undefined;
  const hasPhone = sp.get('hasPhone') === '1';
  const limit = Math.min(Math.max(Number(sp.get('limit')) || 50, 1), 200);
  const page = Math.max(Number(sp.get('page')) || 1, 1);
  const { leads, total } = await store.listPage(company, { stage, q, hasPhone, limit, offset: (page - 1) * limit });
  return NextResponse.json({ leads, total, page, limit, counts: await store.counts(company) });
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
