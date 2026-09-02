import { NextRequest, NextResponse } from 'next/server';
import * as store from '@/src/store.js';
import * as engine from '@/src/engine.js';
import { sendCampaignBatch } from '@/lib/send.js';
import { COMPANIES } from '@/lib/companies';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Background sender. Vercel Cron hits this on a schedule; for every company it
// finds campaigns still `sending` (with a queue) and drains ONE batch each,
// advancing them toward completion — entirely server-side, independent of any
// browser tab. Pause/stop/idempotency are all honored inside sendCampaignBatch.
export async function GET(req: NextRequest) {
  // If CRON_SECRET is set, require it (Vercel Cron sends it automatically).
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const processed: any[] = [];
  for (const co of COMPANIES.map((c) => c.id)) {
    // Legacy KV campaigns.
    let camps: any[] = [];
    try { camps = await store.listCampaigns(co); } catch { camps = []; }
    for (const c of camps) {
      if (c.status === 'sending' && Array.isArray(c.queue) && c.queue.length) {
        try {
          const out = await sendCampaignBatch(co, c.id, { dryRun: false } as any);
          processed.push({ company: co, id: c.id, sentNow: out.sentNow, remaining: out.remaining, done: out.done });
        } catch (e: any) {
          processed.push({ company: co, id: c.id, error: e.message });
        }
      }
    }
    // New job engine: drain one chunk per runnable run (fallback when the durable
    // workflow isn't driving it). Fair enough for the cron; the workflow paces itself.
    try {
      for (const r of await engine.listRunnableRuns(co)) {
        try {
          const out: any = await engine.drainRunOnce(co, r.id);
          processed.push({ company: co, runId: r.id, engine: true, sentNow: out.sentNow, done: out.done });
        } catch (e: any) {
          processed.push({ company: co, runId: r.id, engine: true, error: e.message });
        }
      }
    } catch { /* engine tables may not exist yet — skip */ }
  }
  return NextResponse.json({ ok: true, at: new Date().toISOString(), processed });
}
