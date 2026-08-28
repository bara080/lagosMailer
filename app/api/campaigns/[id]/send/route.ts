import { NextRequest, NextResponse } from 'next/server';
import { sendCampaignBatch } from '@/lib/send.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Allow long batches; each call still sends only BATCH_SIZE emails.
export const maxDuration = 300;

// Sends ONE batch and returns progress ({ done, sent, total, remaining }).
// The client calls this repeatedly until `done` so a large audience is
// delivered across several short requests instead of one that times out.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const company = req.headers.get('x-company') || 'LagosTSQ';
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    return NextResponse.json(await sendCampaignBatch(company, id, { dryRun: !!body.dryRun, size: body.size } as any));
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
