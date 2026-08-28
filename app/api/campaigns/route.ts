import { NextRequest, NextResponse } from 'next/server';
import * as store from '@/src/store.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ campaigns: await store.listCampaigns(), counts: await store.campaignCounts() });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    return NextResponse.json(await store.addCampaign(body));
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
