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

    // Drain the FIRST chunk synchronously → instant progress in the UI (and works
    // in local dev where the durable workflow runtime isn't running).
    let first: any = null;
    try { first = await engine.drainRunOnce(company, run.id); } catch { /* reported via run status */ }

    // Hand the rest off to the durable workflow (cron drains as fallback).
    let workflowStarted = false;
    if (!first?.done) {
      try { await start(sendRunWorkflow, [company, run.id]); workflowStarted = true; } catch { /* cron fallback */ }
    }

    return NextResponse.json({ run, snapshot, first, workflowStarted });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
