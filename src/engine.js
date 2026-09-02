// Multi-Campaign Job Engine — data layer (Phase 1).
// Campaign / Version / Run / Recipient live in real Postgres tables (see
// supabase/campaign-engine.sql). A run's recipient snapshot is the durable
// source of truth; UNIQUE(run_id, normalized_email) is the dedup Set.
import { getSupabase } from '../lib/supabase.js';
import * as store from './store.js';
import {
  openMailer, render, renderSignatureHtml, renderSignatureText, prepareAttachments, mailerConfig,
} from '../lib/send.js';
import { unsubHeaders, unsubFooterHtml, unsubFooterText } from '../lib/unsubscribe.js';
import { ENGINE } from './engine-config.js';

const norm = (e) => String(e || '').trim().toLowerCase();
// Quota day boundary in the configured timezone (default operator's NY day).
const quotaDate = () => new Date().toLocaleDateString('en-CA', { timeZone: ENGINE.timezone });

// Page through a filtered query in configurable chunks.
async function scanAll(build) {
  const out = [];
  const size = ENGINE.scanPageSize;
  for (let from = 0; ; from += size) {
    const { data, error } = await build().range(from, from + size - 1);
    if (error) throw new Error(`engine scan: ${error.message}`);
    out.push(...(data || []));
    if (!data || data.length < size) break;
  }
  return out;
}

// ── Audit events ─────────────────────────────────────────────────────────────
export async function logEvent(company, runId, eventType, data = {}, actorType = 'workflow') {
  const sb = getSupabase();
  await sb.from('campaign_events').insert({ company, run_id: runId, event_type: eventType, actor_type: actorType, data });
}

// ── Campaign + version ───────────────────────────────────────────────────────
export async function createCampaign(company, { name, createdBy } = {}) {
  const sb = getSupabase();
  const { data, error } = await sb.from('campaigns')
    .insert({ company, name: name || 'Untitled campaign', created_by: createdBy || null })
    .select().single();
  if (error) throw new Error(`createCampaign: ${error.message}`);
  return data;
}

export async function addVersion(company, campaignId, v = {}) {
  const sb = getSupabase();
  const { data: last } = await sb.from('campaign_versions')
    .select('version').eq('company', company).eq('campaign_id', campaignId)
    .order('version', { ascending: false }).limit(1).maybeSingle();
  const version = (last?.version || 0) + 1;
  const { data, error } = await sb.from('campaign_versions').insert({
    company, campaign_id: campaignId, version,
    subject: v.subject || '', html_body: v.html || '', text_body: v.text || '',
    sender_key: v.senderKey || '', provider_key: v.providerKey || null, reply_to: v.replyTo || null,
    attachment_manifest: Array.isArray(v.attachments) ? v.attachments : [],
    personalization_schema: v.personalization || {},
  }).select().single();
  if (error) throw new Error(`addVersion: ${error.message}`);
  await sb.from('campaigns').update({ current_version_id: data.id, updated_at: new Date().toISOString() })
    .eq('company', company).eq('id', campaignId);
  return data;
}

// ── Runs ─────────────────────────────────────────────────────────────────────
export async function createRun(company, r = {}) {
  const sb = getSupabase();
  const { data, error } = await sb.from('campaign_runs').insert({
    company, campaign_id: r.campaignId, campaign_version_id: r.versionId,
    status: 'preparing',
    audience_mode: r.audienceMode || 'all',
    audience_filter: r.audienceFilter || {},
    source_run_id: r.sourceRunId || null,
    duplicate_policy: r.duplicatePolicy || 'exclude_in_run',
    stage_plan: r.stagePlan || [],
    dispatch_chunk_size: r.dispatchChunkSize || ENGINE.defaultChunkSize,
    priority: r.priority ?? 100,
    max_rate_per_minute: r.maxRatePerMinute || null,
    created_by: r.createdBy || null,
  }).select().single();
  if (error) throw new Error(`createRun: ${error.message}`);
  await logEvent(company, data.id, 'run.created', { audience_mode: data.audience_mode, duplicate_policy: data.duplicate_policy });
  return data;
}

// Idempotency guard: find an already in-flight run matching this launch signature,
// so a double-click (or a timed-out request that got retried) reuses it instead of
// spawning a duplicate. Used for retries — same campaign + failed_only + source run.
const ACTIVE_RUN_STATUSES = ['preparing', 'queued', 'running', 'sending', 'paused', 'gated', 'stopping'];
export async function findActiveRun(company, { campaignId, audienceMode, sourceRunId }) {
  const sb = getSupabase();
  let q = sb.from('campaign_runs').select('*').eq('company', company)
    .eq('campaign_id', campaignId).eq('audience_mode', audienceMode).in('status', ACTIVE_RUN_STATUSES);
  q = sourceRunId ? q.eq('source_run_id', sourceRunId) : q.is('source_run_id', null);
  const { data } = await q.order('created_at', { ascending: false }).limit(1).maybeSingle();
  return data || null;
}

// List a company's campaigns (newest first).
export async function listCampaigns(company) {
  const sb = getSupabase();
  const { data, error } = await sb.from('campaigns').select('*').eq('company', company).order('updated_at', { ascending: false });
  if (error) throw new Error(`listCampaigns: ${error.message}`);
  return data || [];
}

// Recent notable events across a company's runs (for the notification bell).
// `unread` = items that need attention (a run paused at a gate).
const NOTABLE_EVENTS = ['run.completed', 'stage.health_gated', 'stage.gated', 'quota.waiting', 'run.stop'];
export async function recentNotifications(company, { limit = 25 } = {}) {
  const sb = getSupabase();
  const { data: events } = await sb.from('campaign_events').select('*')
    .eq('company', company).in('event_type', NOTABLE_EVENTS).order('created_at', { ascending: false }).limit(limit);
  const runIds = [...new Set((events || []).map((e) => e.run_id).filter(Boolean))];
  const runs = runIds.length ? (await sb.from('campaign_runs').select('id, campaign_id, status').eq('company', company).in('id', runIds)).data || [] : [];
  const runMap = new Map(runs.map((r) => [r.id, r]));
  const campIds = [...new Set(runs.map((r) => r.campaign_id))];
  const camps = campIds.length ? (await sb.from('campaigns').select('id, name').eq('company', company).in('id', campIds)).data || [] : [];
  const campMap = new Map(camps.map((c) => [c.id, c.name]));
  const items = (events || []).map((e) => {
    const run = runMap.get(e.run_id);
    const gate = e.event_type === 'stage.gated' || e.event_type === 'stage.health_gated';
    return {
      id: e.id, type: e.event_type, run_id: e.run_id, run_status: run?.status || null,
      campaign: (run && campMap.get(run.campaign_id)) || 'Campaign',
      data: e.data || {}, created_at: e.created_at,
      actionable: gate && run?.status === 'gated', // a run waiting at a gate
    };
  });
  return { items, unread: items.filter((i) => i.actionable).length };
}

// Delete a run (cascades its recipients; also clears its audit events).
export async function deleteRun(company, runId) {
  const sb = getSupabase();
  await sb.from('campaign_events').delete().eq('company', company).eq('run_id', runId);
  const { error } = await sb.from('campaign_runs').delete().eq('company', company).eq('id', runId);
  if (error) throw new Error(`deleteRun: ${error.message}`);
  return { ok: true };
}

// Delete a campaign (cascades versions → runs → recipients; clears run events).
export async function deleteCampaign(company, campaignId) {
  const sb = getSupabase();
  const runs = (await sb.from('campaign_runs').select('id').eq('company', company).eq('campaign_id', campaignId)).data || [];
  const runIds = runs.map((r) => r.id);
  if (runIds.length) await sb.from('campaign_events').delete().eq('company', company).in('run_id', runIds);
  const { error } = await sb.from('campaigns').delete().eq('company', company).eq('id', campaignId);
  if (error) throw new Error(`deleteCampaign: ${error.message}`);
  return { ok: true };
}

// Fetch a single campaign (incl. current_version_id).
export async function getCampaign(company, campaignId) {
  const sb = getSupabase();
  const { data, error } = await sb.from('campaigns').select('*').eq('company', company).eq('id', campaignId).maybeSingle();
  if (error) throw new Error(`getCampaign: ${error.message}`);
  return data;
}

// List runs for a campaign (newest first), each with a compact { total, accepted,
// failed, pending, suppressed } progress — computed in ONE grouped query.
export async function listRuns(company, campaignId) {
  const sb = getSupabase();
  const { data, error } = await sb.from('campaign_runs').select('*')
    .eq('company', company).eq('campaign_id', campaignId).order('created_at', { ascending: false });
  if (error) throw new Error(`listRuns: ${error.message}`);
  const runs = data || [];
  const { data: counts } = await sb.rpc('campaign_run_counts', { p_company: company, p_campaign: campaignId });
  const byRun = new Map((counts || []).map((c) => [c.run_id, c]));
  return runs.map((r) => {
    const c = byRun.get(r.id) || {};
    return { ...r, progress: {
      total: Number(c.total || 0), accepted: Number(c.accepted || 0),
      failed: Number(c.failed || 0), pending: Number(c.pending || 0), suppressed: Number(c.suppressed || 0),
    } };
  });
}

// Run + live per-status progress + cadence stages + recent audit events (the
// full monitor view).
export async function getRunDetail(company, runId, eventLimit = 30) {
  const sb = getSupabase();
  const run = await getRun(company, runId);
  if (!run) return null;
  const progress = await runProgress(company, runId);
  const { data: events } = await sb.from('campaign_events').select('*')
    .eq('company', company).eq('run_id', runId).order('created_at', { ascending: false }).limit(eventLimit);

  // Cadence stages: per-stage counts + derived status (complete / running / waiting).
  const { data: stageRows } = await sb.rpc('run_stage_counts', { p_company: company, p_run: runId });
  const plan = Array.isArray(run.stage_plan) ? run.stage_plan : [];
  const cur = run.current_stage || 1;
  const running = run.status === 'running';
  const stages = (stageRows || []).map((s) => {
    const n = s.stage_number;
    const pending = Number(s.pending);
    const label = plan[n - 1]?.label || (n > plan.length && plan.length ? 'Full remainder' : `Stage ${n}`);
    const status = pending === 0 ? 'complete' : (n < cur ? 'complete' : n === cur ? (running ? 'running' : 'ready') : 'waiting');
    return { stage: n, label, total: Number(s.total), accepted: Number(s.accepted), failed: Number(s.failed), pending, suppressed: Number(s.suppressed), status };
  });
  return { run, progress, events: events || [], stages };
}

// Paginated recipients for a run (Recipients tab). Optional status filter.
export async function listRecipients(company, runId, opts = {}) {
  const page = opts.page || 1;
  const limit = opts.limit || 50;
  const status = opts.status;
  const sb = getSupabase();
  let q = sb.from('campaign_recipients')
    .select('id, normalized_email, status, stage_number, attempt_count, provider, provider_message_id, last_error_message, accepted_at', { count: 'exact' })
    .eq('company', company).eq('run_id', runId);
  if (status) q = q.eq('status', status);
  const from = (page - 1) * limit;
  const { data, error, count } = await q.order('created_at', { ascending: true }).range(from, from + limit - 1);
  if (error) throw new Error(`listRecipients: ${error.message}`);
  return { recipients: data || [], total: count ?? 0, page, limit };
}

// Provider webhook → recipient delivery signal. Idempotent (dedup by event id),
// matches the recipient by provider_message_id, records the delivery timestamp,
// and suppresses hard bounces / complaints for future runs.
const RESEND_MAP = {
  'email.delivered': { field: 'delivered_at' },
  'email.bounced': { field: 'bounced_at', suppress: 'bounce' },
  'email.complained': { field: 'complained_at', suppress: 'complaint' },
};

export async function ingestProviderEvent(provider, eventId, type, data = {}) {
  const sb = getSupabase();
  // Idempotency: first insert wins; a replay hits the unique PK and no-ops.
  const { error: dupErr } = await sb.from('provider_events')
    .insert({ provider, provider_event_id: eventId, event_type: type, payload: data });
  if (dupErr) { if (dupErr.code === '23505') return { duplicate: true }; throw new Error(`provider_events: ${dupErr.message}`); }

  const map = RESEND_MAP[type];
  if (!map) return { ignored: true };
  const emailId = data.email_id;
  if (!emailId) return { noMatch: true };

  const { data: rcp } = await sb.from('campaign_recipients')
    .select('id, company, run_id, normalized_email').eq('provider_message_id', emailId).maybeSingle();
  if (!rcp) return { noMatch: true };

  await sb.from('campaign_recipients').update({ [map.field]: new Date().toISOString() }).eq('id', rcp.id);
  if (map.suppress) {
    await sb.from('suppression_list').upsert(
      { company: rcp.company, normalized_email: rcp.normalized_email, reason: map.suppress, source: 'resend-webhook' },
      { onConflict: 'company,normalized_email', ignoreDuplicates: true });
  }
  await logEvent(rcp.company, rcp.run_id, `email.${map.field.replace('_at', '')}`, { email: rcp.normalized_email }, 'webhook');
  return { ok: true, recipient: rcp.id };
}

// Today's engine quota usage (for the monitor's "Daily quota" header).
// Start of the current quota day (ENGINE.timezone) as a UTC ISO string. DST-safe.
function quotaDayStartUTC() {
  const tz = ENGINE.timezone || 'UTC';
  const dateStr = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date()); // YYYY-MM-DD in tz
  const utcGuess = new Date(`${dateStr}T00:00:00Z`);
  const tzAtGuess = new Date(utcGuess.toLocaleString('en-US', { timeZone: tz }));
  return new Date(utcGuess.getTime() + (utcGuess.getTime() - tzAtGuess.getTime())).toISOString();
}

// Today's send count. Derived from ACTUAL recipient records (accepted_at within the
// quota day), not the mutable quota_buckets counter — so an interrupted run or a
// manual DB edit can't make the nav-bar total drift from reality. `reserved` is the
// live in-flight count. The bucket remains only the atomic reservation guard.
export async function quotaToday(company) {
  const sb = getSupabase();
  const cap = await store.getDailyCap(company);
  const since = quotaDayStartUTC();
  const { count: accepted } = await sb.from('campaign_recipients').select('*', { count: 'exact', head: true })
    .eq('company', company).in('status', ['accepted', 'delivered']).gte('accepted_at', since);
  const { count: reserved } = await sb.from('campaign_recipients').select('*', { count: 'exact', head: true })
    .eq('company', company).eq('status', 'sending');
  return { accepted: accepted || 0, reserved: reserved || 0, limit: cap };
}

// Reconcile the atomic reservation bucket back to reality: accepted = today's actual
// accepted, reserved = actual in-flight. Fixes leaked reservations (e.g. after a
// stopped/interrupted run) that would otherwise block reserve_quota for the rest of
// the day. Safe to call when no run is actively draining.
export async function reconcileQuota(company) {
  const sb = getSupabase();
  const cap = await store.getDailyCap(company);
  const q = await quotaToday(company);
  await sb.from('quota_buckets').upsert({
    company, channel: ENGINE.channel, quota_date: quotaDate(),
    accepted_count: q.accepted, reserved_count: q.reserved, limit_count: cap,
  }, { onConflict: 'company,channel,quota_date' });
  return { ...q, reconciled: true };
}

export async function getRun(company, runId) {
  const sb = getSupabase();
  const { data, error } = await sb.from('campaign_runs').select('*').eq('company', company).eq('id', runId).maybeSingle();
  if (error) throw new Error(`getRun: ${error.message}`);
  return data;
}

export async function setRunStatus(company, runId, status, extra = {}) {
  const sb = getSupabase();
  await sb.from('campaign_runs').update({ status, ...extra }).eq('company', company).eq('id', runId);
}

export async function runProgress(company, runId) {
  const sb = getSupabase();
  const statuses = ['pending', 'sending', 'accepted', 'delivered', 'bounced', 'complained', 'failed', 'suppressed', 'cancelled'];
  const counts = {};
  await Promise.all(statuses.map(async (s) => {
    const { count } = await sb.from('campaign_recipients')
      .select('*', { count: 'exact', head: true }).eq('company', company).eq('run_id', runId).eq('status', s);
    counts[s] = count ?? 0;
  }));
  const base = () => sb.from('campaign_recipients').select('*', { count: 'exact', head: true }).eq('company', company).eq('run_id', runId);
  const [{ count: total }, { count: delivered }, { count: bounced }] = await Promise.all([
    base(),
    base().not('delivered_at', 'is', null),
    base().not('bounced_at', 'is', null),
  ]);
  // Spread status counts FIRST, then override delivered/bounced with the
  // timestamp-based (webhook) counts — those are the source of truth.
  return { total: total ?? 0, ...counts, delivered: delivered ?? 0, bounced: bounced ?? 0 };
}

// Emails that reached a given status set across ALL runs of a campaign.
async function campaignEmailsByStatus(company, campaignId, statuses) {
  const sb = getSupabase();
  const rows = await scanAll(() =>
    sb.from('campaign_recipients').select('normalized_email')
      .eq('company', company).eq('campaign_id', campaignId).in('status', statuses));
  return new Set(rows.map((r) => r.normalized_email));
}

// ── Audience snapshot (freeze the recipient list) ───────────────────────────
// Resolves the run's audience ONCE and inserts unique recipients, excluding
// suppressed addresses and (for `remaining`) prior campaign successes.
export async function snapshotAudience(company, runId) {
  const sb = getSupabase();
  const run = await getRun(company, runId);
  if (!run) throw new Error(`snapshot: run ${runId} not found`);
  const f = run.audience_filter || {};

  // 1) Base audience by mode → array of {email, name, business, category, lead_id}.
  let base = [];
  if (run.audience_mode === 'previous_run' || run.audience_mode === 'failed_only') {
    // Source = prior recipients (whole prior audience, or just its failures).
    const statuses = run.audience_mode === 'failed_only' ? ['failed', 'bounced'] : null;
    let q = () => {
      let query = sb.from('campaign_recipients')
        .select('normalized_email, lead_id, personalization')
        .eq('company', company);
      query = run.source_run_id ? query.eq('run_id', run.source_run_id) : query.eq('campaign_id', run.campaign_id);
      if (statuses) query = query.in('status', statuses);
      return query;
    };
    const rows = await scanAll(q);
    base = rows.map((r) => ({ email: r.normalized_email, lead_id: r.lead_id, ...(r.personalization || {}) }));
  } else {
    // all | segment | explicit | remaining → resolve from the live lead store.
    const leads = await store.resolveAudience(company, { ...f, emailOnly: true });
    base = leads.map((l) => ({ email: l.email, lead_id: l.id || null, name: l.name || '', business: l.business || '', category: l.category || '' }));
  }

  // 2) Exclusions: suppression list + (remaining) prior successes.
  const suppressed = new Set((await scanAll(() =>
    sb.from('suppression_list').select('normalized_email').eq('company', company))).map((r) => r.normalized_email));
  let excludeSuccess = new Set();
  if (run.audience_mode === 'remaining' || run.duplicate_policy === 'exclude_campaign_successes') {
    excludeSuccess = await campaignEmailsByStatus(company, run.campaign_id, ['accepted', 'delivered']);
  }

  // 3) Build unique recipient rows.
  const seen = new Set();
  const rows = [];
  for (const b of base) {
    const email = norm(b.email);
    if (!/^\S+@\S+\.\S+$/.test(email)) continue;
    if (suppressed.has(email) || excludeSuccess.has(email)) continue;
    if (seen.has(email)) continue;
    seen.add(email);
    rows.push({
      company, run_id: runId, campaign_id: run.campaign_id, stage_number: 1,
      lead_id: b.lead_id ?? null, normalized_email: email,
      personalization: { name: b.name || '', business: b.business || '', category: b.category || '' },
    });
  }

  // 4) Insert, dedup via UNIQUE(run_id, normalized_email) — ON CONFLICT DO NOTHING.
  for (let i = 0; i < rows.length; i += ENGINE.insertBatchSize) {
    const chunk = rows.slice(i, i + ENGINE.insertBatchSize);
    const { error } = await sb.from('campaign_recipients').upsert(chunk, { onConflict: 'run_id,normalized_email', ignoreDuplicates: true });
    if (error) throw new Error(`snapshot insert @${i}: ${error.message}`);
  }
  // Cadence: assign recipients to stages by the run's stage_plan limits (Test →
  // Canary → Ramp → remainder). No limits ⇒ everyone stays stage 1.
  const limits = (Array.isArray(run.stage_plan) ? run.stage_plan : []).map((s) => Number(s.limit)).filter((n) => Number.isFinite(n) && n > 0);
  if (limits.length) await sb.rpc('assign_stages', { p_company: company, p_run: runId, p_limits: limits });
  await setRunStatus(company, runId, 'queued', { audience_count: rows.length });
  await logEvent(company, runId, 'audience.snapshotted', { count: rows.length, mode: run.audience_mode });
  return { count: rows.length };
}

// ── Quota (atomic, shared per company/day) ──────────────────────────────────
async function reserveQuota(company, want) {
  const sb = getSupabase();
  const cap = await store.getDailyCap(company);
  const { data, error } = await sb.rpc('reserve_quota', {
    p_company: company, p_channel: ENGINE.channel, p_date: quotaDate(), p_want: want, p_limit: cap,
  });
  if (error) throw new Error(`reserve_quota: ${error.message}`);
  return data ?? 0;
}
async function releaseQuota(company, n) {
  if (!n) return;
  const sb = getSupabase();
  await sb.rpc('release_quota', { p_company: company, p_channel: ENGINE.channel, p_date: quotaDate(), p_n: n });
}
async function commitQuota(company, n) {
  if (!n) return;
  const sb = getSupabase();
  await sb.rpc('commit_quota', { p_company: company, p_channel: ENGINE.channel, p_date: quotaDate(), p_n: n });
}

// ── Drain one chunk (the unit the per-run workflow repeats) ─────────────────
// Returns { done | paused | stopped | capReached | sentNow }.
export async function drainChunk(company, runId) {
  const sb = getSupabase();
  const run = await getRun(company, runId);
  if (!run) return { stopped: true };
  if (run.status === 'paused') return { paused: true };
  if (run.status === 'gated') return { gated: true };
  if (run.status === 'stopping' || run.status === 'stopped') {
    await cancelPending(company, runId);
    await setRunStatus(company, runId, 'stopped', { completed_at: new Date().toISOString() });
    return { stopped: true };
  }

  // Cadence gating: only the CURRENT stage sends. When it drains, advance to the
  // next stage (or finish). Stage size is enforced by the recipients' assigned
  // stage_number, so claiming at the current stage naturally caps the batch.
  const cur = run.current_stage || 1;
  const pendingAt = (q) => q.select('*', { count: 'exact', head: true }).eq('company', company).eq('run_id', runId).eq('status', 'pending');
  const { count: pendingStage } = await pendingAt(sb.from('campaign_recipients')).eq('stage_number', cur);
  if (!pendingStage) {
    const { count: ahead } = await pendingAt(sb.from('campaign_recipients')).gt('stage_number', cur);
    if (ahead) {
      await logEvent(company, runId, 'stage.completed', { stage: cur });

      // Auto health-gate: HOLD the run if the just-completed stage's fail+bounce
      // rate is too high, so a bad batch can't ramp to the next (larger) stage.
      const cnt = (q) => q.select('*', { count: 'exact', head: true }).eq('company', company).eq('run_id', runId).eq('stage_number', cur);
      const [{ count: stTot }, { count: stFail }, { count: stBounce }] = await Promise.all([
        cnt(sb.from('campaign_recipients')),
        cnt(sb.from('campaign_recipients')).eq('status', 'failed'),
        cnt(sb.from('campaign_recipients')).not('bounced_at', 'is', null),
      ]);
      const bad = (stFail ?? 0) + (stBounce ?? 0);
      const rate = (stTot ?? 0) ? bad / stTot : 0;
      if ((stTot ?? 0) >= ENGINE.healthMinSample && rate > ENGINE.healthMaxFailRate) {
        await setRunStatus(company, runId, 'gated');
        await logEvent(company, runId, 'stage.health_gated', { stage: cur, total: stTot, failed: stFail ?? 0, bounced: stBounce ?? 0, rate: Math.round(rate * 1000) / 10, threshold: Math.round(ENGINE.healthMaxFailRate * 100) });
        return { gated: true, health: true };
      }

      // Gate: if the NEXT stage requires approval, HOLD (status `gated`) until the
      // operator continues. plan[cur] is stage cur+1 (0-indexed).
      const plan = Array.isArray(run.stage_plan) ? run.stage_plan : [];
      if (plan[cur]?.gate === 'manual') {
        await setRunStatus(company, runId, 'gated');
        await logEvent(company, runId, 'stage.gated', { completed: cur, next: cur + 1 });
        return { gated: true };
      }
      await setRunStatus(company, runId, 'running', { current_stage: cur + 1 });
      await logEvent(company, runId, 'stage.started', { stage: cur + 1 });
      return { advanced: true, sentNow: 0 };
    }
    return { done: true };
  }

  // Reserve daily-cap capacity for this chunk.
  const want = Math.min(run.dispatch_chunk_size || ENGINE.defaultChunkSize, pendingStage);
  const grant = await reserveQuota(company, want);
  if (grant <= 0) { await logEvent(company, runId, 'quota.waiting', { want }); return { capReached: true }; }

  // Claim `grant` pending recipients of the current stage (single-driver → mark sending).
  const { data: claimIds } = await sb.from('campaign_recipients')
    .select('id').eq('company', company).eq('run_id', runId).eq('status', 'pending').eq('stage_number', cur)
    .order('created_at', { ascending: true }).limit(grant);
  const ids = (claimIds || []).map((r) => r.id);
  if (!ids.length) { await releaseQuota(company, grant); return { done: true }; }
  await sb.from('campaign_recipients').update({ status: 'sending' }).in('id', ids);
  const { data: batch } = await sb.from('campaign_recipients').select('*').in('id', ids);

  // Content + sender from the frozen version.
  const { data: version } = await sb.from('campaign_versions').select('*').eq('id', run.campaign_version_id).single();
  const settings = await store.getSettings(company);
  const sig = settings.signature;
  const att = await prepareAttachments(version.attachment_manifest || []);
  const fromLine = version.sender_key || mailerConfig(company).from;
  const emailer = await openMailer(company, fromLine, version.provider_key || undefined);
  const provider = version.provider_key || mailerConfig(company).provider;

  let accepted = 0;
  try {
    for (const rcp of (batch || [])) {
      const lead = { email: rcp.normalized_email, name: rcp.personalization?.name || '', business: rcp.personalization?.business || '', category: rcp.personalization?.category || '' };
      try {
        const res = await emailer.send({
          to: rcp.normalized_email,
          subject: render(version.subject, lead) || 'Message',
          text: version.text_body ? render(version.text_body, lead) + renderSignatureText(sig, lead) + unsubFooterText(company, rcp.normalized_email) : undefined,
          html: version.html_body ? render(version.html_body, lead) + att.inlineHtml + renderSignatureHtml(sig, lead) + unsubFooterHtml(company, rcp.normalized_email) : undefined,
          headers: { ...(version.reply_to ? { 'Reply-To': version.reply_to } : {}), ...unsubHeaders(company, rcp.normalized_email) },
          attachments: att.files.length ? att.files : undefined,
        });
        await sb.from('campaign_recipients').update({
          status: 'accepted', provider, provider_message_id: res?.id || null,
          accepted_at: new Date().toISOString(), attempt_count: (rcp.attempt_count || 0) + 1,
        }).eq('id', rcp.id);
        if (rcp.lead_id) await store.markContacted(company, rcp.lead_id, render(version.subject, lead));
        accepted++;
      } catch (e) {
        await sb.from('campaign_recipients').update({
          status: 'failed', provider, last_error_message: String(e.message || e).slice(0, 500),
          attempt_count: (rcp.attempt_count || 0) + 1,
        }).eq('id', rcp.id);
      }
    }
  } finally {
    await emailer.close();
  }

  // Reconcile quota: keep `accepted`, return the rest.
  await commitQuota(company, accepted);
  await releaseQuota(company, grant - accepted);
  await logEvent(company, runId, 'batch.sent', { accepted, attempted: ids.length });
  return { sentNow: accepted, done: false };
}

async function cancelPending(company, runId) {
  const sb = getSupabase();
  await sb.from('campaign_recipients').update({ status: 'cancelled' })
    .eq('company', company).eq('run_id', runId).eq('status', 'pending');
}

// Pause / resume / stop / continue a run (status-flag driven; drainChunk honors it).
const CONTROL_STATUS = { pause: 'paused', resume: 'running', stop: 'stopping' };
export async function controlRun(company, runId, action) {
  // `continue` releases a gated run into its next cadence stage.
  if (action === 'continue') {
    const run = await getRun(company, runId);
    const next = (run?.current_stage || 1) + 1;
    await setRunStatus(company, runId, 'running', { current_stage: next });
    await logEvent(company, runId, 'stage.started', { stage: next }, 'user');
    return { ok: true, status: 'running' };
  }
  const status = CONTROL_STATUS[action];
  if (!status) throw new Error(`unknown run action: ${action}`);
  await setRunStatus(company, runId, status);
  await logEvent(company, runId, `run.${action}`, {}, 'user');
  return { ok: true, status };
}

// Runs that still have work (for the cron fallback when no workflow engine runs).
export async function listRunnableRuns(company) {
  const sb = getSupabase();
  const { data, error } = await sb.from('campaign_runs')
    .select('id, status').eq('company', company).in('status', ['queued', 'running']);
  if (error) throw new Error(`listRunnableRuns: ${error.message}`);
  return data || [];
}

// Drain ONE chunk of a run, advancing lifecycle (queued→running, →completed).
// Used by both the durable workflow and the cron fallback.
export async function drainRunOnce(company, runId) {
  const run = await getRun(company, runId);
  if (!run) return { skip: true };
  if (run.status === 'queued') await startRun(company, runId);
  const out = await drainChunk(company, runId);
  if (out.done) await finishRun(company, runId);
  return out;
}

// Mark run running/finished (called by the workflow around the drain loop).
export async function startRun(company, runId) {
  const run = await getRun(company, runId);
  const extra = { started_at: run?.started_at || new Date().toISOString() };
  if (!run?.current_stage) extra.current_stage = 1; // begin at the first cadence stage
  await setRunStatus(company, runId, 'running', extra);
  await logEvent(company, runId, 'run.started', {});
}
export async function finishRun(company, runId) {
  await setRunStatus(company, runId, 'completed', { completed_at: new Date().toISOString() });
  await logEvent(company, runId, 'run.completed', await runProgress(company, runId));
}
