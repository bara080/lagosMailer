import { NextRequest, NextResponse } from 'next/server';
import { sendCampaign } from '@/lib/send.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const company = req.headers.get('x-company') || 'LagosTSQ';
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    return NextResponse.json(await sendCampaign(company, id, { dryRun: !!body.dryRun }));
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
