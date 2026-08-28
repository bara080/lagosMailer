import { NextRequest, NextResponse } from 'next/server';
import * as store from '@/src/store.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const company = req.headers.get('x-company') || 'LagosTSQ';
  const { id } = await params;
  const c = await store.getCampaign(company, id);
  if (!c) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json(c);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const company = req.headers.get('x-company') || 'LagosTSQ';
    const { id } = await params;
    const body = await req.json();
    return NextResponse.json(await store.updateCampaign(company, id, body));
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
