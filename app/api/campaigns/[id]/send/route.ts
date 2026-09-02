import { NextRequest, NextResponse } from 'next/server';
import { start } from 'workflow/api';
import { sendCampaignBatch } from '@/lib/send.js';
import { sendCampaignWorkflow } from '@/workflows/send-campaign';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Allow long batches; each call still sends only BATCH_SIZE emails.
export const maxDuration = 300;

// Starts (or previews) a campaign send.
//   dryRun  → one-shot preview, nothing sent (unchanged).
//   real    → send the FIRST batch synchronously (instant feedback + flips the
//             campaign to `sending`), then hand off to the durable Workflow to
//             drain the rest in the background (retries, resume-on-crash, daily
//             cap). The every-minute cron remains as a safety net; the
//             concurrency lock keeps them from double-draining.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const company = req.headers.get('x-company') || 'LagosTSQ';
    const { id } = await params;
    const body = await req.json().catch(() => ({}));

    if (body.dryRun) {
      return NextResponse.json(await sendCampaignBatch(company, id, { dryRun: true, size: body.size } as any));
    }

    const first: any = await sendCampaignBatch(company, id, { dryRun: false, size: body.size } as any);
    // More to send → let the durable workflow finish it off.
    let workflowStarted = false;
    if (!first.done && !first.stopped && !first.paused) {
      try {
        await start(sendCampaignWorkflow, [company, Number(id)]);
        workflowStarted = true;
      } catch {
        // If the workflow engine isn't available (e.g. local dev without the
        // workflow runtime), the cron still drains it — no data loss.
        workflowStarted = false;
      }
    }
    return NextResponse.json({ ...first, workflowStarted });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
