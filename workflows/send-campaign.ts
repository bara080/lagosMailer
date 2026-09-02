import { sleep } from 'workflow';
import { sendCampaignBatch } from '@/lib/send.js';

// A slim, serializable summary of one batch (the SDK persists step return values,
// so we drop the heavy per-email `results` array).
type BatchSummary = {
  done: boolean;
  stopped: boolean;
  paused: boolean;
  dailyCapReached: boolean;
  locked: boolean;
  sent: number;
  sentNow: number;
  remaining: number;
};

// ONE durable batch. Reuses the ENTIRE existing send pipeline — per-campaign
// idempotency (`sentTo`), the concurrency lock, the daily cap, and the
// pause/stop control flag all live inside sendCampaignBatch. Declared as a
// step so the SDK checkpoints it and auto-retries on unhandled (transient
// SMTP) errors.
async function drainOneBatch(company: string, campaignId: number): Promise<BatchSummary> {
  'use step';
  const out: any = await sendCampaignBatch(company, campaignId, { dryRun: false } as any);
  return {
    done: !!out.done,
    stopped: !!out.stopped,
    paused: !!out.paused,
    dailyCapReached: !!out.dailyCapReached,
    locked: !!out.locked,
    sent: out.sent ?? 0,
    sentNow: out.sentNow ?? 0,
    remaining: out.remaining ?? 0,
  };
}

// Durable campaign send: drains the audience batch-by-batch until complete,
// pacing gently, waiting out the daily cap, and surviving crashes/redeploys
// (the SDK resumes from the last checkpointed step). This REPLACES the
// every-minute cron drain for workflow-started campaigns.
export async function sendCampaignWorkflow(company: string, campaignId: number) {
  'use workflow';
  let totalSent = 0;
  // Hard upper bound so a stuck campaign can never loop forever. At 40/batch
  // this covers ~4M emails — far beyond any real send.
  for (let i = 0; i < 100_000; i++) {
    const out = await drainOneBatch(company, campaignId);
    totalSent = out.sent || totalSent;
    if (out.done || out.stopped) return { done: true, sent: totalSent };
    if (out.paused) return { paused: true, sent: totalSent };
    // Daily cap hit → wait and retry; it clears at midnight (NY). Hourly polling
    // is cheap and durable.
    if (out.dailyCapReached) { await sleep('1h'); continue; }
    // Another worker (cron / a concurrent kick) holds the lock → back off.
    if (out.locked) { await sleep('30s'); continue; }
    // Gentle pacing between batches so we don't hammer the SMTP relay.
    await sleep('2s');
  }
  return { done: false, sent: totalSent, note: 'max-iterations' as const };
}
