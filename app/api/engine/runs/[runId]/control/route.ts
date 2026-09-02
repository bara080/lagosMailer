import { NextRequest, NextResponse } from 'next/server';
import { start } from 'workflow/api';
import * as engine from '@/src/engine.js';
import { sendRunWorkflow } from '@/workflows/send-run';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Pause / resume / stop a run. Resume flips it back to running and re-kicks the
// workflow (the prior one exits on pause); the cron drains as fallback.
// Body: { action: 'pause' | 'resume' | 'stop' }
export async function POST(req: NextRequest, { params }: { params: Promise<{ runId: string }> }) {
  try {
    const company = req.headers.get('x-company') || 'LagosTSQ';
    const { runId } = await params;
    const { action } = await req.json();
    const result = await engine.controlRun(company, runId, action);
    // Releasing a run (resume or continue-past-gate) → drain a chunk now for
    // instant feedback, then hand back to the durable workflow.
    if (action === 'resume' || action === 'continue') {
      try { await engine.drainRunOnce(company, runId); } catch { /* reported via status */ }
      try { await start(sendRunWorkflow, [company, runId]); } catch { /* cron fallback */ }
    }
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
