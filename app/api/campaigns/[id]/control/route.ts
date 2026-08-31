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
      // Reflect immediately so the UI updates even if no send loop is running;
      // a loop that IS running also halts on the flag.
      await store.updateCampaign(co, cid, { status: 'paused' });
    } else if (action === 'stop') {
      await store.setControl(co, cid, 'stop');
      await store.updateCampaign(co, cid, { status: 'stopped', queue: null });
    } else if (action === 'resume') {
      await store.clearControl(co, cid);
      // Flip back to sending so the background cron drains the remaining queue.
      await store.updateCampaign(co, cid, { status: 'sending' });
    } else if (action === 'resend') {
      // Re-send a finished campaign: clear the idempotency set + queue + counters
      // so the next kick re-resolves the audience and emails everyone AGAIN.
      await store.clearControl(co, cid);
      await store.updateCampaign(co, cid, { status: 'draft', queue: null, sentTo: [], sent: 0, delivered: 0 });
    } else {
      return NextResponse.json({ error: 'unknown action' }, { status: 400 });
    }
    return NextResponse.json({ ok: true, action });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
