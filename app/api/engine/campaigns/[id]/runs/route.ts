import { NextRequest, NextResponse } from 'next/server';
import { start } from 'workflow/api';
import * as engine from '@/src/engine.js';
import { sendRunWorkflow } from '@/workflows/send-run';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Runs of one campaign.
//   GET  → list runs.
//   POST → launch a run: create it → freeze the recipient snapshot → hand off to
//          the durable per-run workflow. The cron drains as a fallback if the
//          workflow engine isn't running (e.g. local dev).
// Body: { versionId?, audienceMode, audienceFilter, duplicatePolicy?, stagePlan?,
//         dispatchChunkSize?, sourceRunId?, priority? }
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const company = req.headers.get('x-company') || 'LagosTSQ';
  const { id } = await params;
  return NextResponse.json({ runs: await engine.listRuns(company, id) });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const company = req.headers.get('x-company') || 'LagosTSQ';
    const { id } = await params;
    const b = await req.json().catch(() => ({}));

    // Retry idempotency: if a retry for these same failures is already in flight,
    // reuse it instead of spawning a duplicate (guards double-clicks + timed-out
    // requests that get retried). Only for failed_only retries — launching several
    // normal batches of one campaign is a legitimate, intended action.
    if (b.audienceMode === 'failed_only' && b.sourceRunId) {
      const existing = await engine.findActiveRun(company, { campaignId: id, audienceMode: 'failed_only', sourceRunId: b.sourceRunId });
      if (existing) return NextResponse.json({ run: existing, snapshot: null, first: null, workflowStarted: false, idempotent: true });
    }

    // Default to the campaign's current (latest) frozen version.
    const versionId = b.versionId || (await engine.getCampaign(company, id))?.current_version_id;
    if (!versionId) return NextResponse.json({ error: 'campaign has no version' }, { status: 400 });

    const run = await engine.createRun(company, {
      campaignId: id, versionId,
      audienceMode: b.audienceMode, audienceFilter: b.audienceFilter,
      duplicatePolicy: b.duplicatePolicy, stagePlan: b.stagePlan,
      dispatchChunkSize: b.dispatchChunkSize, sourceRunId: b.sourceRunId, priority: b.priority,
    });
    const snapshot = await engine.snapshotAudience(company, run.id);

    // NOTE: previously we drained the FIRST chunk synchronously here for "instant
    // progress". But sending ~50 emails via SMTP in-request took 1–2+ min, hanging
    // the HTTP request past the client/proxy timeout — which re-enabled the Send
    // button and led to accidental double-submits (two runs for one click).
    // Now we snapshot and hand off to the durable workflow immediately; the run
    // monitor shows live progress within seconds as the workflow drains.
    // LEGACY (commented for rollback):
    // let first: any = null;
    // try { first = await engine.drainRunOnce(company, run.id); } catch { /* reported via run status */ }
    const first: any = null;

    // Hand off to the durable workflow (cron drains as fallback in local dev).
    let workflowStarted = false;
    try { await start(sendRunWorkflow, [company, run.id]); workflowStarted = true; } catch { /* cron fallback */ }

    return NextResponse.json({ run, snapshot, first, workflowStarted });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
