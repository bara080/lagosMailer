import { NextRequest, NextResponse } from 'next/server';
import * as store from '@/src/store.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Pause / stop / resume a campaign. Sets a control flag the batch sender reads
// before every email, so a running send halts within one message. Resume clears
// the flag; the client then drains the remaining queue.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const co = req.headers.get('x-company') || 'LagosTSQ';
    const { id } = await params;
    const cid = Number(id);
    const { action } = await req.json().catch(() => ({}));

    if (action === 'pause') {
      await store.setControl(co, cid, 'pause');
    } else if (action === 'stop') {
      await store.setControl(co, cid, 'stop');
    } else if (action === 'resume') {
      await store.clearControl(co, cid);
    } else {
      return NextResponse.json({ error: 'unknown action' }, { status: 400 });
    }
    return NextResponse.json({ ok: true, action });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
