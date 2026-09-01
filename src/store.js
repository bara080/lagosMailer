import { getSupabase } from '../lib/supabase.js';

// ─────────────────────────────────────────────────────────────────────────────
// Lead store — the CRM data layer.
//
// Ported from zinga-os `ops.leads` (Supabase Postgres). Originally backed by a
// local JSON file for zero-dependency localhost dev; now backed by Supabase
// (Postgres) so it runs on Vercel's read-only filesystem. Same record shape and
// same stage lifecycle; the storage engine is the only thing swapped.
//
// Each whole-document collection (`leads`, `campaigns`, `sends`, `activity`,
// `last-blast`) maps to ONE row in the `crm_store` KV table: key text primary
// key, value jsonb.
// ─────────────────────────────────────────────────────────────────────────────

// Stage lifecycle (copied from zinga-os, trimmed to the load-bearing stages).
export const STAGES = ['new', 'contacted', 'replied', 'qualified', 'won', 'unsub'];

// Tabs group stages the way the zinga CRM does.
export const STAGE_TABS = [
  { key: 'all', label: 'All', match: () => true },
  { key: 'new', label: 'New', match: (l) => l.stage === 'new' },
  { key: 'contacted', label: 'Contacted', match: (l) => l.stage === 'contacted' },
  { key: 'replied', label: 'Replied', match: (l) => l.stage === 'replied' },
  { key: 'qualified', label: 'Qualified', match: (l) => l.stage === 'qualified' },
  { key: 'won', label: 'Won', match: (l) => l.stage === 'won' },
];

// ── KV primitives (crm_store) ────────────────────────────────────────────────
const TABLE = 'crm_store';

// Multi-tenant: every collection is namespaced per company. The KV row key is
// `${company}:${collection}` (e.g. `LagosTSQ:leads`, `Native125th:leads`), so
// each company gets its own independent row → fully isolated data.
function nsKey(company, collection) {
  return `${company}:${collection}`;
}

// Read a KV row's `value`, or `fallback` when the key does not exist yet.
async function kvGet(company, collection, fallback) {
  const key = nsKey(company, collection);
  const sb = getSupabase();
  const { data, error } = await sb.from(TABLE).select('value').eq('key', key).maybeSingle();
  if (error) throw new Error(`crm_store read failed (${key}): ${error.message}`);
  if (!data) return fallback;
  return data.value;
}

// Upsert a KV row's `value`.
async function kvSet(company, collection, value) {
  const key = nsKey(company, collection);
  const sb = getSupabase();
  const { error } = await sb
    .from(TABLE)
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) throw new Error(`crm_store write failed (${key}): ${error.message}`);
  return value;
}

// Fill in every field so the UI never sees `undefined`.
function normalize(r) {
  return {
    id: r.id,
    business: r.business || '',
    name: r.name || r.owner || '',
    email: r.email || '',
    phone: r.phone || '',
    instagram: r.instagram || '',
    website: r.website || '',
    borough: r.borough || '',
    category: r.category || '',
    source: r.source || 'manual',
    stage: STAGES.includes(r.stage) ? r.stage : 'new',
    subject: r.subject || '',
    notes: r.notes || '',
    contacted_at: r.contacted_at || null,
    replied_at: r.replied_at || null,
    created_at: r.created_at || new Date().toISOString(),
  };
}

// ── Leads: real Postgres table (one row per lead) ────────────────────────────
// Leads live in their OWN table `leads` (PK: company, id) — NOT the crm_store
// jsonb blob — so 63k+ rows read/write/paginate without loading everything at
// once. See supabase/leads-table.sql for the schema.
const LEADS = 'leads';

// PostgREST caps a single response, so any full scan pages through in chunks.
// `build` returns a FRESH query each call (a supabase query is single-use).
async function fetchAllRows(build) {
  const out = [];
  const size = 1000;
  for (let from = 0; ; from += size) {
    const { data, error } = await build().range(from, from + size - 1);
    if (error) throw new Error(`leads scan failed: ${error.message}`);
    out.push(...(data || []));
    if (!data || data.length < size) break;
  }
  return out;
}

// Next per-company id = max(id)+1. Ids are app-assigned (rare concurrent writes
// in an admin tool); the migration/import assign a contiguous block up front.
async function nextLeadId(company) {
  const sb = getSupabase();
  const { data, error } = await sb
    .from(LEADS).select('id').eq('company', company)
    .order('id', { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error(`leads nextId failed: ${error.message}`);
  return (data?.id || 0) + 1;
}

// Apply the stage / search filters shared by list + audience.
function leadFilter(query, { stage, q, hasPhone } = {}) {
  if (stage && stage !== 'all') query = query.eq('stage', stage);
  if (hasPhone) query = query.neq('phone', ''); // SMS: only leads with a phone
  if (q) {
    const s = String(q).replace(/[%,()]/g, ' ').trim();
    if (s) query = query.or(`business.ilike.%${s}%,name.ilike.%${s}%,email.ilike.%${s}%,category.ilike.%${s}%,instagram.ilike.%${s}%`);
  }
  return query;
}

// ── Public API ───────────────────────────────────────────────────────────────

// Server-side paginated list. Pass a finite `limit` for one page (+ exact
// total); omit it to scan every matching row. Returns { leads, total }.
export async function listPage(company, { stage, q, limit, offset, hasPhone } = {}) {
  const sb = getSupabase();
  const applied = (query) => leadFilter(query, { stage, q, hasPhone }).order('created_at', { ascending: false });
  if (Number.isFinite(limit)) {
    const from = offset || 0;
    const { data, error, count } = await applied(
      sb.from(LEADS).select('*', { count: 'exact' }).eq('company', company),
    ).range(from, from + limit - 1);
    if (error) throw new Error(`leads list failed: ${error.message}`);
    return { leads: (data || []).map(normalize), total: count ?? 0 };
  }
  const rows = await fetchAllRows(() => applied(sb.from(LEADS).select('*').eq('company', company)));
  return { leads: rows.map(normalize), total: rows.length };
}

// Array-returning list (backward-compatible with existing callers).
export async function list(company, opts = {}) {
  return (await listPage(company, opts)).leads;
}

export async function counts(company) {
  const sb = getSupabase();
  const head = () => sb.from(LEADS).select('*', { count: 'exact', head: true }).eq('company', company);
  const stages = ['new', 'contacted', 'replied', 'qualified', 'won'];
  const [all, ...rest] = await Promise.all([head(), ...stages.map((s) => head().eq('stage', s))]);
  const out = { all: all.count ?? 0 };
  stages.forEach((s, i) => { out[s] = rest[i].count ?? 0; });
  return out;
}

export async function add(company, input) {
  const sb = getSupabase();
  const lead = normalize({ ...input, id: await nextLeadId(company), created_at: new Date().toISOString() });
  if (!lead.email && !lead.instagram) throw new Error('a lead needs an email or an instagram handle');
  if (lead.email) {
    const { data: dup } = await sb.from(LEADS).select('id').eq('company', company).ilike('email', lead.email).limit(1).maybeSingle();
    if (dup) throw new Error('a lead with that email already exists');
  }
  const { error } = await sb.from(LEADS).insert({ company, ...lead });
  if (error) throw new Error(`lead add failed: ${error.message}`);
  return lead;
}

export async function update(company, id, patch) {
  const sb = getSupabase();
  const { data: cur, error: e1 } = await sb.from(LEADS).select('*').eq('company', company).eq('id', Number(id)).maybeSingle();
  if (e1) throw new Error(`lead read failed: ${e1.message}`);
  if (!cur) throw new Error(`lead ${id} not found`);
  const next = normalize({ ...cur, ...patch, id: cur.id, created_at: cur.created_at });
  const { error } = await sb.from(LEADS).update(next).eq('company', company).eq('id', cur.id);
  if (error) throw new Error(`lead update failed: ${error.message}`);
  return next;
}

export async function remove(company, id) {
  const sb = getSupabase();
  const { error } = await sb.from(LEADS).delete().eq('company', company).eq('id', Number(id));
  if (error) throw new Error(`lead remove failed: ${error.message}`);
  return { ok: true };
}

// Advance a lead to `contacted` after a successful send (stage-guarded, like
// zinga's operator_crm_mark_sent — only promotes from `new`).
export async function markContacted(company, id, subject) {
  const sb = getSupabase();
  const patch = { contacted_at: new Date().toISOString() };
  if (subject) patch.subject = subject;
  await sb.from(LEADS).update(patch).eq('company', company).eq('id', Number(id));
  await sb.from(LEADS).update({ stage: 'contacted' }).eq('company', company).eq('id', Number(id)).eq('stage', 'new');
}

// Per-company settings blob (e.g. { sheetId, sheetRange }) stored in crm_store.
export async function getSettings(company) {
  return (await kvGet(company, 'settings', {})) || {};
}
export async function setSettings(company, patch) {
  const s = (await kvGet(company, 'settings', {})) || {};
  const next = { ...s, ...patch };
  await kvSet(company, 'settings', next);
  return next;
}

// ── Daily send cap (safety valve) ────────────────────────────────────────────
// A per-company guard so a runaway campaign can't blow past the provider's daily
// send limit (Gmail Workspace SMTP is ~2,000/day and will hard-block beyond it).
// ON by default. The counter lives in its own KV row and resets each calendar
// day (America/New_York, matching the operator's day).
export const DEFAULT_DAILY_CAP = 1900; // headroom under Gmail Workspace's ~2,000/day limit

function todayKey() {
  // Local NY date as YYYY-MM-DD, so the cap resets at the operator's midnight.
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

// The effective cap for a company (settings.dailyCap, else the safe default).
export async function getDailyCap(company) {
  const s = await getSettings(company);
  const n = Number(s.dailyCap);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_DAILY_CAP;
}

// How many emails this company has sent so far TODAY (0 after the day rolls).
export async function getSentToday(company) {
  const d = (await kvGet(company, 'daily', null)) || {};
  return d.date === todayKey() ? (d.count || 0) : 0;
}

// Add to today's count (used by the sender after a batch). Read-modify-write is
// fine here: only one batch per campaign runs at a time (concurrency lock), and
// a small cross-campaign undercount just means the cap is a hair conservative.
export async function bumpSentToday(company, n) {
  if (!n) return;
  const cur = (await kvGet(company, 'daily', null)) || {};
  const base = cur.date === todayKey() ? (cur.count || 0) : 0;
  await kvSet(company, 'daily', { date: todayKey(), count: base + Number(n) });
}

// Pick the first non-empty value among a set of header aliases (case-insensitive;
// keys are already lowercased by the CSV parser / sheet reader).
function pick(r, ...aliases) {
  for (const a of aliases) {
    const v = r[a];
    if (v != null && String(v).trim()) return String(v).trim();
  }
  return '';
}

// Import rows (from CSV or Google Sheets). Tolerant of common header names, e.g.
// "Email Address", "Full Name", "Company", "Phone Number".
export async function importCsv(company, rows) {
  const sb = getSupabase();
  // Existing emails (email column only) → dedup set. Fast, slim scan.
  const existing = await fetchAllRows(() => sb.from(LEADS).select('email').eq('company', company).neq('email', ''));
  const seen = new Set(existing.map((r) => String(r.email || '').toLowerCase()));
  let id = await nextLeadId(company);
  const now = new Date().toISOString();
  const toInsert = [];
  for (const r of rows) {
    const email = pick(r, 'email', 'to_email', 'email address', 'emailaddress', 'e-mail', 'mail');
    const instagram = pick(r, 'instagram', 'ig', 'handle', 'instagram handle');
    if (!email && !instagram) continue;
    if (email) {
      const key = email.toLowerCase();
      if (seen.has(key)) continue; // dedup vs existing + within this import
      seen.add(key);
    }
    toInsert.push({
      company,
      ...normalize({
        id: id++,
        business: pick(r, 'business', 'business_name', 'business name', 'company', 'company name', 'organization'),
        name: pick(r, 'name', 'owner', 'full name', 'fullname', 'first name', 'contact', 'contact name', 'guest name', 'guest'),
        email,
        instagram,
        phone: pick(r, 'phone', 'phone number', 'mobile', 'tel', 'telephone'),
        website: pick(r, 'website', 'url', 'site', 'web'),
        category: pick(r, 'category', 'type', 'vertical'),
        borough: pick(r, 'borough', 'city', 'area', 'location'),
        source: pick(r, 'source') || 'import',
        subject: pick(r, 'subject'),
        created_at: now,
      }),
    });
  }
  // Batched inserts (1000/req) — never one giant payload, so no statement timeout.
  let added = 0;
  for (let i = 0; i < toInsert.length; i += 1000) {
    const chunk = toInsert.slice(i, i + 1000);
    const { error } = await sb.from(LEADS).insert(chunk);
    if (error) throw new Error(`leads import failed at row ${i}: ${error.message}`);
    added += chunk.length;
  }
  return { added };
}

// ── Sends + activity log (feeds the dashboard) ───────────────────────────────

export async function logSend(company, { to, subject, status, source }) {
  const sends = await kvGet(company, 'sends', []);
  sends.push({ at: new Date().toISOString(), to, subject: subject || '', status, source: source || '' });
  await kvSet(company, 'sends', sends);
}

export async function logActivity(company, { type, text }) {
  const acts = await kvGet(company, 'activity', []);
  acts.unshift({ at: new Date().toISOString(), type, text });
  await kvSet(company, 'activity', acts.slice(0, 100));
}

// ── Campaign send control (pause / stop) ─────────────────────────────────────
// A tiny per-company map { [campaignId]: 'pause' | 'stop' } kept in its OWN KV
// row. The batch sender only READS this (never writes it), so a pause/stop flag
// set from the UI can't be clobbered by an in-flight batch — it always wins.
export async function getControl(company, id) {
  const map = await kvGet(company, 'controls', {});
  return map[String(id)] || null;
}
export async function setControl(company, id, action) {
  const map = await kvGet(company, 'controls', {});
  map[String(id)] = action;
  await kvSet(company, 'controls', map);
}
export async function clearControl(company, id) {
  const map = await kvGet(company, 'controls', {});
  delete map[String(id)];
  await kvSet(company, 'controls', map);
}

// ── Asset registry (email attachments / images) ──────────────────────────────
// Metadata only — the file bytes live in Vercel Blob. This is a per-company,
// reusable library so a flyer uploaded once can be attached to many campaigns.
export async function listAssets(company) {
  return await kvGet(company, 'assets', []);
}
export async function addAsset(company, asset) {
  const assets = await kvGet(company, 'assets', []);
  // Dedup: re-adding the same file (same URL, or same filename + byte size) returns
  // the existing asset instead of piling up duplicates.
  const dup = assets.find((a) =>
    (asset.url && a.url === asset.url) ||
    (a.name === asset.name && a.size === asset.size && (asset.size || 0) > 0));
  if (dup) return dup;
  const id = assets.reduce((m, a) => Math.max(m, a.id || 0), 0) + 1;
  const row = { id, at: new Date().toISOString(), ...asset };
  assets.unshift(row);
  await kvSet(company, 'assets', assets);
  return row;
}
export async function removeAsset(company, id) {
  const assets = await kvGet(company, 'assets', []);
  const gone = assets.find((a) => a.id === Number(id)) || null;
  await kvSet(company, 'assets', assets.filter((a) => a.id !== Number(id)));
  return gone;
}

// Aggregate everything the dashboard/home page needs, from real data.
export async function dashboard(company) {
  const sb = getSupabase();
  // Slim projection (few columns) — enough for week windows + source segments,
  // without pulling every field of every lead.
  const leads = await fetchAllRows(() =>
    sb.from(LEADS).select('source,stage,contacted_at,replied_at,created_at').eq('company', company));
  const sends = await kvGet(company, 'sends', []);
  const acts = await kvGet(company, 'activity', []);
  const c = await counts(company);
  const sent = sends.filter((s) => s.status === 'sent');

  // 7-day window (oldest → today)
  const days = [];
  const today = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    days.push({
      key,
      label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      sent: sent.filter((s) => s.at.slice(0, 10) === key).length,
      replies: leads.filter((l) => l.replied_at && l.replied_at.slice(0, 10) === key).length,
    });
  }
  const weekAgo = new Date(today); weekAgo.setDate(weekAgo.getDate() - 7);
  const newThisWeek = leads.filter((l) => new Date(l.created_at) >= weekAgo).length;
  const sentThisWeek = sent.filter((s) => new Date(s.at) >= weekAgo).length;

  // "Campaigns" derived from the lead `source` segments (real data).
  const bySource = {};
  for (const l of leads) {
    const k = l.source || 'manual';
    bySource[k] = bySource[k] || { name: k, recipients: 0, sent: 0, replied: 0 };
    bySource[k].recipients++;
    if (l.contacted_at) bySource[k].sent++;
    if (l.stage === 'replied') bySource[k].replied++;
  }
  const segments = Object.values(bySource).sort((a, b) => b.recipients - a.recipients);
  const campaigns = await listCampaigns(company);

  const failed = sends.filter((s) => s.status === 'failed').length;
  const lastBlast = await kvGet(company, 'last-blast', null);

  return {
    metrics: {
      totalLeads: leads.length,
      newLeads: c.new,
      newThisWeek,
      emailsSent: sent.length,
      sentThisWeek,
      delivered: sent.length, // SMTP-accepted; open/bounce tracking not wired
      opens: 0,
      replies: c.replied,
      qualified: c.qualified,
      won: c.won,
      bounces: failed,
      unsubscribes: leads.filter((l) => l.stage === 'unsub').length,
    },
    series: days,
    stageDonut: [
      { key: 'new', label: 'New', value: c.new },
      { key: 'contacted', label: 'Contacted', value: c.contacted },
      { key: 'replied', label: 'Replied', value: c.replied },
      { key: 'qualified', label: 'Qualified', value: c.qualified },
      { key: 'won', label: 'Won', value: c.won },
    ],
    campaigns,
    segments,
    activity: acts.slice(0, 8),
    lastBlast,
  };
}

export async function setLastBlast(company, summary) {
  await kvSet(company, 'last-blast', { ...summary, at: new Date().toISOString() });
}

// ── Campaigns ────────────────────────────────────────────────────────────────
// Resolve which recipients a campaign's audience targets. Returns lead-like
// target objects. Supports:
//   - emails: [..]  → send to exactly these addresses (custom test list). Matched
//                     to existing leads when possible, else synthetic targets.
//   - ids / stage / category / source / q → filter the lead list
//   - limit: N      → cap the audience to the first N (safe batch)
// Normalize + dedup an explicit email list into the original casings to query.
function cleanEmails(list) {
  const seen = new Set();
  const out = [];
  for (const raw of list) {
    const email = String(raw).trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) continue;
    const key = email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(email);
  }
  return out;
}

// Build the audience query (stage/category/source/q/ids + emailOnly/skipEmailed)
// against the leads table for a given company.
function audienceQuery(sb, company, f) {
  let query = sb.from(LEADS).select('*').eq('company', company);
  if (f.ids && f.ids.length) {
    query = query.in('id', f.ids.map(Number));
  } else {
    if (f.stage && f.stage !== 'all') query = query.eq('stage', f.stage);
    if (f.category) query = query.ilike('category', f.category);
    if (f.source) query = query.eq('source', f.source);
    if (f.q) {
      const s = String(f.q).replace(/[%,()]/g, ' ').trim();
      if (s) query = query.or(`business.ilike.%${s}%,name.ilike.%${s}%,email.ilike.%${s}%`);
    }
  }
  if (f.emailOnly !== false) query = query.neq('email', '').neq('stage', 'unsub');
  // Rolling batches: exclude anyone already emailed (has contacted_at) so a new
  // "send N" continues from where the last one stopped — no repeats across sends.
  if (f.skipEmailed) query = query.is('contacted_at', null);
  return query;
}

export async function resolveAudience(company, f = {}) {
  const sb = getSupabase();

  // Custom explicit email list → fetch matching leads (chunked IN), fall back to
  // a synthetic target for addresses not in the CRM (still gets emailed).
  if (Array.isArray(f.emails) && f.emails.length) {
    const wanted = cleanEmails(f.emails);
    const found = new Map();
    for (let i = 0; i < wanted.length; i += 500) {
      const chunk = wanted.slice(i, i + 500);
      const { data, error } = await sb.from(LEADS).select('*').eq('company', company).in('email', chunk);
      if (error) throw new Error(`audience emails failed: ${error.message}`);
      for (const l of (data || [])) found.set(String(l.email).toLowerCase(), normalize(l));
    }
    const targets = wanted.map((email) =>
      found.get(email.toLowerCase()) || { id: null, email, name: '', business: '', category: '', source: 'custom', stage: 'new' });
    return f.limit > 0 ? targets.slice(0, f.limit) : targets;
  }

  // Limited (rolling batch) → one page is enough. Unlimited → scan all matches.
  if (f.limit > 0) {
    const { data, error } = await audienceQuery(sb, company, f).order('created_at', { ascending: false }).limit(f.limit);
    if (error) throw new Error(`audience failed: ${error.message}`);
    return (data || []).map(normalize);
  }
  const rows = await fetchAllRows(() => audienceQuery(sb, company, f).order('created_at', { ascending: false }));
  return rows.map(normalize);
}

// Count-only audience size (no rows pulled) — used to stamp campaign.recipients.
export async function audienceCount(company, f = {}) {
  if (Array.isArray(f.emails) && f.emails.length) {
    const n = cleanEmails(f.emails).length;
    return f.limit > 0 ? Math.min(n, f.limit) : n;
  }
  const sb = getSupabase();
  const { count, error } = await audienceCountQuery(sb, company, f);
  if (error) throw new Error(`audience count failed: ${error.message}`);
  return f.limit > 0 ? Math.min(count ?? 0, f.limit) : (count ?? 0);
}

// Same filters as audienceQuery but a head/count select (no rows returned).
function audienceCountQuery(sb, company, f) {
  let query = sb.from(LEADS).select('*', { count: 'exact', head: true }).eq('company', company);
  if (f.ids && f.ids.length) {
    query = query.in('id', f.ids.map(Number));
  } else {
    if (f.stage && f.stage !== 'all') query = query.eq('stage', f.stage);
    if (f.category) query = query.ilike('category', f.category);
    if (f.source) query = query.eq('source', f.source);
    if (f.q) {
      const s = String(f.q).replace(/[%,()]/g, ' ').trim();
      if (s) query = query.or(`business.ilike.%${s}%,name.ilike.%${s}%,email.ilike.%${s}%`);
    }
  }
  if (f.emailOnly !== false) query = query.neq('email', '').neq('stage', 'unsub');
  if (f.skipEmailed) query = query.is('contacted_at', null);
  return query;
}

export async function listCampaigns(company) {
  return (await kvGet(company, 'campaigns', [])).sort((a, b) => (b.created_at > a.created_at ? 1 : -1));
}

export async function getCampaign(company, id) {
  return (await kvGet(company, 'campaigns', [])).find((c) => c.id === Number(id)) || null;
}

export async function addCampaign(company, data) {
  const cs = await kvGet(company, 'campaigns', []);
  const id = cs.reduce((m, c) => Math.max(m, c.id || 0), 0) + 1;
  const rec = {
    id,
    name: data.name || 'Untitled campaign',
    description: data.description || '',
    subject: data.subject || '',
    html: data.html || '',
    text: data.text || '',
    fromName: data.fromName || '',
    fromAddress: data.fromAddress || '', // chosen "send from" address (else per-company default)
    replyTo: data.replyTo || '',
    audience: data.audience || {},
    attachments: Array.isArray(data.attachments) ? data.attachments : [], // flyers/images
    status: data.status || 'draft', // draft | sending | completed | paused | scheduled
    recipients: 0,
    sent: 0,
    delivered: 0,
    opens: 0,
    replied: 0,
    bounces: 0,
    created_at: new Date().toISOString(),
    sent_at: null,
    scheduled_at: data.scheduled_at || null,
  };
  rec.recipients = await audienceCount(company, rec.audience);
  cs.push(rec);
  await kvSet(company, 'campaigns', cs);
  return rec;
}

export async function updateCampaign(company, id, patch) {
  const cs = await kvGet(company, 'campaigns', []);
  const i = cs.findIndex((c) => c.id === Number(id));
  if (i === -1) throw new Error(`campaign ${id} not found`);
  cs[i] = { ...cs[i], ...patch, id: cs[i].id, created_at: cs[i].created_at };
  await kvSet(company, 'campaigns', cs);
  return cs[i];
}

export async function campaignCounts(company) {
  const cs = await listCampaigns(company);
  return {
    all: cs.length,
    sending: cs.filter((c) => c.status === 'sending').length,
    completed: cs.filter((c) => c.status === 'completed').length,
    draft: cs.filter((c) => c.status === 'draft').length,
    paused: cs.filter((c) => c.status === 'paused').length,
    scheduled: cs.filter((c) => c.status === 'scheduled').length,
  };
}
