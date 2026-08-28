import { NextRequest, NextResponse } from 'next/server';
import * as store from '@/src/store.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const company = req.headers.get('x-company') || 'LagosTSQ';
  return NextResponse.json({ campaigns: await store.listCampaigns(company), counts: await store.campaignCounts(company) });
}

export async function POST(req: NextRequest) {
  try {
    const company = req.headers.get('x-company') || 'LagosTSQ';
    const body = await req.json();
    return NextResponse.json(await store.addCampaign(company, body));
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
