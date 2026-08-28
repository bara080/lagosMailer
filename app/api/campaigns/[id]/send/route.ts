import { NextRequest, NextResponse } from 'next/server';
import { sendCampaign } from '@/lib/send.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    return NextResponse.json(await sendCampaign(id, { dryRun: !!body.dryRun }));
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
