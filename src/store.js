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

function seed() {
  const now = new Date().toISOString();
  return [
    { business: 'Lagos Cuts Barber', email: 'demo1@example.com', name: 'Tunde', category: 'barber', stage: 'new' },
    { business: 'Ikeja Nail Studio', email: 'demo2@example.com', name: 'Ada', category: 'salon', stage: 'new' },
    { business: 'Victoria Island Spa', email: 'demo3@example.com', name: 'Ngozi', category: 'spa', stage: 'contacted' },
  ].map((r, i) => normalize({ id: i + 1, created_at: now, ...r }));
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

// Read all leads for a company, seeding the 3 demo leads the first time (key
// absent). Each company seeds independently on first access.
async function readAll(company) {
  const existing = await kvGet(company, 'leads', null);
  if (existing === null) {
    const seeded = seed();
    await kvSet(company, 'leads', seeded);
    return seeded;
  }
  return existing;
}

async function writeAll(company, leads) {
  await kvSet(company, 'leads', leads);
  return leads;
}

function nextId(leads) {
  return leads.reduce((m, l) => Math.max(m, l.id || 0), 0) + 1;
}

// ── Public API ───────────────────────────────────────────────────────────────

export async function list(company, { stage, q } = {}) {
  let leads = await readAll(company);
  if (stage && stage !== 'all') {
    const tab = STAGE_TABS.find((t) => t.key === stage);
    if (tab) leads = leads.filter(tab.match);
  }
  if (q) {
    const s = q.toLowerCase();
    leads = leads.filter((l) =>
      [l.business, l.name, l.email, l.category, l.instagram].some((v) => (v || '').toLowerCase().includes(s)),
    );
  }
  return leads.sort((a, b) => (b.created_at > a.created_at ? 1 : -1));
}

export async function counts(company) {
  const leads = await readAll(company);
  const out = {};
  for (const t of STAGE_TABS) out[t.key] = leads.filter(t.match).length;
  return out;
}

export async function add(company, input) {
  const leads = await readAll(company);
  const lead = normalize({ ...input, id: nextId(leads), created_at: new Date().toISOString() });
  if (!lead.email && !lead.instagram) throw new Error('a lead needs an email or an instagram handle');
  leads.push(lead);
  await writeAll(company, leads);
  return lead;
}

export async function update(company, id, patch) {
  const leads = await readAll(company);
  const i = leads.findIndex((l) => l.id === Number(id));
  if (i === -1) throw new Error(`lead ${id} not found`);
  leads[i] = normalize({ ...leads[i], ...patch, id: leads[i].id, created_at: leads[i].created_at });
  await writeAll(company, leads);
  return leads[i];
}

export async function remove(company, id) {
  const leads = (await readAll(company)).filter((l) => l.id !== Number(id));
  await writeAll(company, leads);
  return { ok: true };
}

// Advance a lead to `contacted` after a successful send (stage-guarded, like
// zinga's operator_crm_mark_sent — only promotes from `new`).
export async function markContacted(company, id, subject) {
  const leads = await readAll(company);
  const i = leads.findIndex((l) => l.id === Number(id));
  if (i === -1) return;
  if (leads[i].stage === 'new') leads[i].stage = 'contacted';
  leads[i].contacted_at = new Date().toISOString();
  if (subject) leads[i].subject = subject;
  await writeAll(company, leads);
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
  const leads = await readAll(company);
  let added = 0;
  for (const r of rows) {
    const email = pick(r, 'email', 'to_email', 'email address', 'emailaddress', 'e-mail', 'mail');
    const instagram = pick(r, 'instagram', 'ig', 'handle', 'instagram handle');
    if (!email && !instagram) continue;
    if (email && leads.some((l) => l.email.toLowerCase() === email.toLowerCase())) continue; // dedup
    leads.push(
      normalize({
        id: nextId(leads),
        business: pick(r, 'business', 'business_name', 'business name', 'company', 'company name', 'organization'),
        name: pick(r, 'name', 'owner', 'full name', 'fullname', 'first name', 'contact', 'contact name'),
        email,
        instagram,
        phone: pick(r, 'phone', 'phone number', 'mobile', 'tel', 'telephone'),
        website: pick(r, 'website', 'url', 'site', 'web'),
        category: pick(r, 'category', 'type', 'vertical'),
        borough: pick(r, 'borough', 'city', 'area', 'location'),
        source: pick(r, 'source') || 'import',
        subject: pick(r, 'subject'),
        created_at: new Date().toISOString(),
      }),
    );
    added++;
  }
  await writeAll(company, leads);
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

// Aggregate everything the dashboard/home page needs, from real data.
export async function dashboard(company) {
  const leads = await readAll(company);
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
// Resolve which leads a campaign's audience filter targets (real data).
export async function resolveAudience(company, f = {}) {
  let leads = await readAll(company);
  if (f.ids && f.ids.length) return leads.filter((l) => f.ids.includes(l.id));
  if (f.stage && f.stage !== 'all') {
    const tab = STAGE_TABS.find((t) => t.key === f.stage);
    leads = tab ? leads.filter(tab.match) : leads.filter((l) => l.stage === f.stage);
  }
  if (f.category) leads = leads.filter((l) => (l.category || '').toLowerCase() === f.category.toLowerCase());
  if (f.source) leads = leads.filter((l) => l.source === f.source);
  if (f.q) {
    const s = f.q.toLowerCase();
    leads = leads.filter((l) => [l.business, l.name, l.email].some((v) => (v || '').toLowerCase().includes(s)));
  }
  if (f.emailOnly !== false) leads = leads.filter((l) => l.email && l.stage !== 'unsub');
  return leads;
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
    replyTo: data.replyTo || '',
    audience: data.audience || {},
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
  rec.recipients = (await resolveAudience(company, rec.audience)).length;
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
