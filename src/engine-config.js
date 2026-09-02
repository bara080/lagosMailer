// Central, env-overridable config for the campaign job engine. No magic numbers
// scattered through the code — tune here (or via env vars) so the engine drops
// cleanly into other apps (e.g. zinga-os) without edits.
function toInt(v, d) { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.floor(n) : d; }

export const ENGINE = {
  channel: process.env.ENGINE_CHANNEL || 'email',
  // Quota day boundary (operator's timezone). Overridable per deployment.
  timezone: process.env.ENGINE_QUOTA_TZ || 'America/New_York',
  // Recipients dispatched per chunk (default; a run can override via dispatch_chunk_size).
  defaultChunkSize: toInt(process.env.ENGINE_CHUNK_SIZE, 50),
  // DB paging.
  scanPageSize: toInt(process.env.ENGINE_SCAN_PAGE, 1000),
  insertBatchSize: toInt(process.env.ENGINE_INSERT_BATCH, 1000),
  // Durable-workflow pacing (duration strings the Workflow SDK `sleep` accepts).
  chunkSleep: process.env.ENGINE_CHUNK_SLEEP || '2s',
  capSleep: process.env.ENGINE_CAP_SLEEP || '1h',
  // Safety bound on the drain loop (≈ chunkSize × this = max emails per run).
  maxIterations: toInt(process.env.ENGINE_MAX_ITER, 200000),
  // Auto health-gate: when a cadence stage completes, HOLD the run (status
  // `gated`) if its fail+bounce rate exceeds this, so a bad batch can't ramp.
  healthMinSample: toInt(process.env.ENGINE_HEALTH_MIN_SAMPLE, 20), // don't gate tiny stages (e.g. Test=1)
  healthMaxFailRate: toFloat(process.env.ENGINE_HEALTH_MAX_FAIL_RATE, 0.15), // 15% fail+bounce
};
function toFloat(v, d) { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : d; }
