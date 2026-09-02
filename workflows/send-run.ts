import { sleep } from 'workflow';
import * as engine from '@/src/engine.js';
import { ENGINE } from '@/src/engine-config.js';

// One durable chunk. drainChunk reserves quota atomically, claims pending
// recipients, sends them via the run's provider, and writes results to the
// ledger. Auto-retried by the SDK on unhandled errors.
async function drain(company: string, runId: string) {
  'use step';
  return await engine.drainChunk(company, runId);
}
async function begin(company: string, runId: string) {
  'use step';
  await engine.startRun(company, runId);
}
async function finish(company: string, runId: string) {
  'use step';
  await engine.finishRun(company, runId);
}

// One durable workflow PER campaign run. Runs progress independently — Campaign
// B's workflow can drain while Campaign A's is sleeping/paused/capped. Survives
// crashes/redeploys (the SDK resumes from the last checkpointed step). The
// atomic quota bucket keeps concurrent runs inside the shared daily cap.
export async function sendRunWorkflow(company: string, runId: string) {
  'use workflow';
  await begin(company, runId);
  let accepted = 0;
  for (let i = 0; i < ENGINE.maxIterations; i++) {
    const out = await drain(company, runId);
    accepted += out.sentNow || 0;
    if (out.done) { await finish(company, runId); return { done: true, accepted }; }
    if (out.stopped) return { stopped: true, accepted };
    if (out.paused) return { paused: true, accepted };
    if (out.gated) return { gated: true, accepted };                       // stage gate — wait for operator "Continue"
    if (out.advanced) continue;                                            // cadence stage rolled over — keep going
    if (out.capReached) { await sleep(ENGINE.capSleep as any); continue; } // daily cap → wait for the next window
    await sleep(ENGINE.chunkSleep as any);                                  // gentle pacing between chunks (config durations)
  }
  return { done: false, accepted, note: 'max-iterations' as const };
}
