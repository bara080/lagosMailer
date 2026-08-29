// Server-side send logic shared by the /api/blast and /api/campaigns/[id]/send
// route handlers. Wraps the reusable Emailer + the lead store.
import * as store from '../src/store.js';
import { Emailer } from '../index.js';
import { sendSms } from './telnyx.js';

// Per-company SMTP. Looks up company-prefixed env vars (e.g. LAGOSTSQ_SMTP_USER,
// NATIVE125TH_MAILER_FROM) first, falling back to the generic SMTP_* / MAILER_FROM.
// Company name is normalized to an env-safe prefix: "Native125th" → "NATIVE125TH".
export function smtpConfig(company) {
  const e = process.env;
  const p = String(company || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const pick = (name) => (p && e[`${p}_${name}`]) || e[name];
  const host = pick('SMTP_HOST');
  const user = pick('SMTP_USER');
  const password = pick('SMTP_PASSWORD');
  return {
    ready: !!(host && user && password),
    host,
    port: parseInt(pick('SMTP_PORT') || '587', 10),
    user,
    password,
    from: pick('MAILER_FROM') || user || '',
  };
}

// Per-company Telnyx SMS config. Company-prefixed env first (e.g.
// LAGOSTSQ_TELNYX_FROM), falling back to generic TELNYX_*.
export function telnyxConfig(company) {
  const e = process.env;
  const p = String(company || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const pick = (name) => (p && e[`${p}_${name}`]) || e[name];
  const apiKey = pick('TELNYX_API_KEY');
  const from = pick('TELNYX_FROM');
  const messagingProfileId = pick('TELNYX_MESSAGING_PROFILE_ID');
  return { ready: !!(apiKey && (from || messagingProfileId)), apiKey, from, messagingProfileId };
}

export function render(tpl, lead) {
  return (tpl || '')
    .replaceAll('{{name}}', lead.name || 'there')
    .replaceAll('{{business}}', lead.business || '')
    .replaceAll('{{category}}', lead.category || '')
    .replaceAll('{{email}}', lead.email || '');
}

const withHttp = (u) => (!u ? '' : /^https?:\/\//i.test(u) ? u : `https://${u}`);
const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const SOCIAL_LABELS = { instagram: 'Instagram', tiktok: 'TikTok', facebook: 'Facebook', x: 'X' };
const SOCIAL_BASE = { instagram: 'https://instagram.com/', tiktok: 'https://tiktok.com/@', facebook: 'https://facebook.com/', x: 'https://x.com/' };

// Normalize a social value (a handle like "native125th" or a full URL) to a URL.
function socialUrl(kind, val) {
  if (!val) return '';
  if (/^https?:\/\//i.test(val)) return val;
  return SOCIAL_BASE[kind] + String(val).replace(/^@/, '');
}

// Build the rich HTML signature block for one recipient (tokens filled).
export function renderSignatureHtml(sig, lead) {
  if (!sig || sig.enabled === false) return '';
  const r = (s) => esc(render(s || '', lead));
  const rows = [];
  if (sig.logoUrl) rows.push(`<img src="${esc(sig.logoUrl)}" alt="${r(sig.businessName)}" style="max-height:52px;margin-bottom:10px;display:block;border:0" />`);
  if (sig.businessName) rows.push(`<div style="font-weight:700;color:#111827;font-size:14px">${r(sig.businessName)}</div>`);
  if (sig.tagline) rows.push(`<div>${r(sig.tagline)}</div>`);
  if (sig.address) rows.push(`<div>${r(sig.address)}</div>`);
  const contact = [
    sig.phone ? r(sig.phone) : '',
    sig.website ? `<a href="${esc(withHttp(sig.website))}" style="color:#2563eb;text-decoration:none">${r(sig.website)}</a>` : '',
  ].filter(Boolean).join(' &middot; ');
  if (contact) rows.push(`<div>${contact}</div>`);
  const links = Object.keys(SOCIAL_LABELS)
    .map((k) => { const u = socialUrl(k, sig.socials?.[k]); return u ? `<a href="${esc(u)}" style="color:#6b7280;text-decoration:none;font-weight:600">${SOCIAL_LABELS[k]}</a>` : ''; })
    .filter(Boolean).join(' &nbsp;&bull;&nbsp; ');
  if (links) rows.push(`<div style="margin-top:6px">${links}</div>`);
  if (!rows.length) return '';
  return `<div style="margin-top:26px;padding-top:14px;border-top:1px solid #e5e7eb;font-family:Arial,Helvetica,sans-serif;color:#374151;font-size:13px;line-height:1.55">${rows.join('')}</div>`;
}

// Plain-text signature fallback.
export function renderSignatureText(sig, lead) {
  if (!sig || sig.enabled === false) return '';
  const r = (s) => render(s || '', lead);
  const lines = [sig.businessName, sig.tagline, sig.address,
    [sig.phone, sig.website].filter(Boolean).join(' · '),
    Object.keys(SOCIAL_LABELS).map((k) => { const u = socialUrl(k, sig.socials?.[k]); return u ? `${SOCIAL_LABELS[k]}: ${u}` : ''; }).filter(Boolean).join('  '),
  ].map(r).filter((l) => l && l.trim());
  if (!lines.length) return '';
  return `\n\n--\n${lines.join('\n')}`;
}

// Send a SINGLE test email to one address (the operator's own inbox). Creates
// no lead and never touches the real audience — this is how a user safely tries
// out a draft. Personalization tokens are filled with sample values so the test
// looks like a real send.
export async function runTestSend({ company, to, subject, html, text }) {
  const co = company || 'LagosTSQ';
  if (!to) throw new Error('No test recipient.');
  const cfg = smtpConfig(co);
  if (!cfg.ready) throw new Error('SMTP is not configured for this company.');
  const sample = { name: (to.split('@')[0] || 'there'), business: 'Your Business', category: 'sample', email: to };
  const sig = (await store.getSettings(co)).signature;
  const emailer = await Emailer.open(cfg);
  try {
    await emailer.send({
      to,
      subject: render(subject, sample) || '(no subject)',
      text: text ? render(text, sample) + renderSignatureText(sig, sample) : undefined,
      html: html ? render(html, sample) + renderSignatureHtml(sig, sample) : undefined,
    });
  } finally {
    await emailer.close();
  }
  await store.logActivity(co, { type: 'test', text: `Test email sent to ${to}` });
  return { sent: 1, to };
}

// Send a message to an explicit list of leads.
export async function runBlast({ company, ids, subject, html, text, dryRun }) {
  const co = company || 'LagosTSQ';
  const all = await store.list(co, {});
  const targets = all.filter((l) => ids.includes(l.id) && l.email && l.stage !== 'unsub');
  const cfg = smtpConfig(co);
  const results = [];

  if (dryRun || !cfg.ready) {
    for (const l of targets) results.push({ id: l.id, email: l.email, status: dryRun ? 'preview' : 'skipped (SMTP not configured)' });
    return { sent: 0, total: targets.length, dryRun: true, smtpReady: cfg.ready, results };
  }

  const label = (subject || 'Blast').slice(0, 40);
  await store.logActivity(co, { type: 'send', text: `Blast "${label}" started — ${targets.length} recipient(s)` });
  const emailer = await Emailer.open(cfg);
  let sent = 0;
  try {
    for (const l of targets) {
      const subj = render(subject, l) || '(no subject)';
      try {
        await emailer.send({ to: l.email, subject: subj, text: text ? render(text, l) : undefined, html: html ? render(html, l) : undefined });
        await store.markContacted(co, l.id, subj);
        await store.logSend(co, { to: l.email, subject: subj, status: 'sent', source: l.source });
        results.push({ id: l.id, email: l.email, status: 'sent' });
        sent++;
      } catch (e) {
        await store.logSend(co, { to: l.email, subject: render(subject, l), status: 'failed', source: l.source });
        results.push({ id: l.id, email: l.email, status: 'failed', error: e.message });
      }
    }
  } finally {
    await emailer.close();
  }
  const summary = { sent, total: targets.length, failed: targets.length - sent, label };
  await store.setLastBlast(co, summary);
  await store.logActivity(co, { type: 'done', text: `Blast "${label}" completed — ${sent} sent, ${summary.failed} failed` });
  return { ...summary, dryRun: false, smtpReady: true, results };
}

// Bulk SMS to an explicit list of leads (those with a phone number), via Telnyx.
export async function runSmsBlast({ company, ids, text, dryRun }) {
  const co = company || 'LagosTSQ';
  const all = await store.list(co, {});
  const targets = all.filter((l) => ids.includes(l.id) && l.phone && l.stage !== 'unsub');
  const cfg = telnyxConfig(co);
  const results = [];

  if (dryRun || !cfg.ready) {
    for (const l of targets) results.push({ id: l.id, to: l.phone, status: dryRun ? 'preview' : 'skipped (Telnyx not configured)' });
    return { sent: 0, total: targets.length, dryRun: true, smsReady: cfg.ready, results };
  }

  const label = (text || 'SMS').slice(0, 40);
  await store.logActivity(co, { type: 'sms', text: `SMS blast started — ${targets.length} recipient(s)` });
  let sent = 0;
  for (const l of targets) {
    const msg = render(text, l);
    try {
      await sendSms({ apiKey: cfg.apiKey, from: cfg.from, messagingProfileId: cfg.messagingProfileId, to: l.phone, text: msg });
      await store.logSend(co, { to: l.phone, subject: msg.slice(0, 40), status: 'sent', source: l.source });
      results.push({ id: l.id, to: l.phone, status: 'sent' });
      sent++;
    } catch (e) {
      await store.logSend(co, { to: l.phone, subject: msg.slice(0, 40), status: 'failed', source: l.source });
      results.push({ id: l.id, to: l.phone, status: 'failed', error: e.message });
    }
  }
  await store.logActivity(co, { type: 'done', text: `SMS blast "${label}" completed — ${sent}/${targets.length}` });
  return { sent, total: targets.length, failed: targets.length - sent, dryRun: false, smsReady: true, results };
}

// How many emails to send per request. Kept well under Vercel's function
// timeout so a large audience is delivered across several short calls instead
// of one long request that times out. The client loops until `done`.
export const BATCH_SIZE = 40;

// Send ONE batch of a campaign, then return progress. On the first call it
// snapshots the audience into a frozen `queue` of lead ids on the campaign;
// each subsequent call drains the next `size` ids. This makes large sends
// reliable (no single long-running request) and resumable.
export async function sendCampaignBatch(company, id, { dryRun, size = BATCH_SIZE } = {}) {
  const co = company || 'LagosTSQ';
  const camp = await store.getCampaign(co, id);
  if (!camp) throw new Error(`campaign ${id} not found`);
  const cfg = smtpConfig(co);

  // Existing frozen queue (resuming) or a fresh snapshot of the audience.
  const hasQueue = Array.isArray(camp.queue);
  let queue = hasQueue ? camp.queue : (await store.resolveAudience(co, camp.audience)).map((t) => t.id);

  // Dry run: preview the first chunk, send nothing, leave the campaign a draft.
  if (dryRun || !cfg.ready) {
    const all = await store.list(co, {});
    const preview = queue.slice(0, size).map((qid) => all.find((l) => l.id === qid)).filter(Boolean);
    if (!hasQueue) await store.updateCampaign(co, id, { status: 'draft', queue: null });
    return {
      done: true, dryRun: true, sent: 0, sentNow: 0, total: queue.length, remaining: 0, smtpReady: cfg.ready,
      results: preview.map((l) => ({ id: l.id, email: l.email, status: dryRun ? 'preview' : 'skipped (SMTP not configured)' })),
    };
  }

  // Respect a pause/stop requested from the UI BEFORE doing any work. The flag
  // lives in its own KV row, so it can't be overwritten by this in-flight batch.
  const control0 = await store.getControl(co, id);
  if (control0 === 'stop') {
    await store.clearControl(co, id);
    await store.updateCampaign(co, id, { status: 'stopped', queue: null });
    await store.logActivity(co, { type: 'stop', text: `Campaign "${camp.name}" stopped — ${camp.sent || 0} sent` });
    return { done: true, stopped: true, dryRun: false, sent: camp.sent || 0, sentNow: 0, total: camp.recipients ?? queue.length, remaining: 0, smtpReady: true, results: [] };
  }
  if (control0 === 'pause') {
    await store.updateCampaign(co, id, { status: 'paused', queue });
    await store.logActivity(co, { type: 'pause', text: `Campaign "${camp.name}" paused — ${queue.length} remaining` });
    return { done: true, paused: true, dryRun: false, sent: camp.sent || 0, sentNow: 0, total: camp.recipients ?? queue.length, remaining: queue.length, smtpReady: true, results: [] };
  }

  // Mark sending. On a fresh start also set recipients/log; on resume just flip
  // the status back to sending and keep the existing counts.
  if (camp.status !== 'sending') {
    const fresh = !hasQueue;
    await store.updateCampaign(co, id, {
      status: 'sending', queue,
      recipients: fresh ? queue.length : (camp.recipients ?? queue.length),
      sent: camp.sent || 0,
      sent_at: camp.sent_at || new Date().toISOString(),
    });
    if (fresh && queue.length) await store.logActivity(co, { type: 'send', text: `Campaign "${camp.name}" started — ${queue.length} recipient(s)` });
  }

  const batchIds = queue.slice(0, size);
  const all = await store.list(co, {});
  const byId = new Map(all.map((l) => [l.id, l]));
  const sig = (await store.getSettings(co)).signature; // append to every email

  const results = [];
  let sentNow = 0;
  let interrupted = null; // 'pause' | 'stop'
  let processed = 0;      // how many queue ids we finished (sent, failed, or skipped)

  const emailer = await Emailer.open({ ...cfg, from: camp.fromName ? `${camp.fromName} <${cfg.from}>` : cfg.from });
  try {
    for (const qid of batchIds) {
      // Check the pause/stop flag before EACH email so Stop takes effect within
      // one message, not one batch.
      const control = await store.getControl(co, id);
      if (control === 'pause' || control === 'stop') { interrupted = control; break; }

      processed++;
      const l = byId.get(qid);
      if (!l || !l.email || l.stage === 'unsub') continue; // skip, still consumed

      const subj = render(camp.subject, l) || camp.name;
      try {
        await emailer.send({
          to: l.email, subject: subj,
          text: camp.text ? render(camp.text, l) + renderSignatureText(sig, l) : undefined,
          html: camp.html ? render(camp.html, l) + renderSignatureHtml(sig, l) : undefined,
          headers: camp.replyTo ? { 'Reply-To': camp.replyTo } : undefined,
        });
        await store.markContacted(co, l.id, subj);
        await store.logSend(co, { to: l.email, subject: subj, status: 'sent', source: l.source });
        results.push({ id: l.id, email: l.email, status: 'sent' });
        sentNow++;
      } catch (e) {
        await store.logSend(co, { to: l.email, subject: render(camp.subject, l), status: 'failed', source: l.source });
        results.push({ id: l.id, email: l.email, status: 'failed', error: e.message });
      }
    }
  } finally {
    await emailer.close();
  }

  const remainingQueue = queue.slice(processed);
  const freshCamp = await store.getCampaign(co, id);
  const totalSent = (freshCamp?.sent || 0) + sentNow;

  // Handle a mid-batch pause/stop.
  if (interrupted === 'stop') {
    await store.clearControl(co, id);
    await store.updateCampaign(co, id, { status: 'stopped', queue: null, sent: totalSent, delivered: totalSent });
    await store.logActivity(co, { type: 'stop', text: `Campaign "${camp.name}" stopped — ${totalSent} sent` });
    return { done: true, stopped: true, dryRun: false, sent: totalSent, sentNow, total: freshCamp?.recipients ?? queue.length, remaining: remainingQueue.length, smtpReady: true, results };
  }
  if (interrupted === 'pause') {
    await store.updateCampaign(co, id, { status: 'paused', queue: remainingQueue, sent: totalSent, delivered: totalSent });
    await store.logActivity(co, { type: 'pause', text: `Campaign "${camp.name}" paused — ${remainingQueue.length} remaining` });
    return { done: true, paused: true, dryRun: false, sent: totalSent, sentNow, total: freshCamp?.recipients ?? queue.length, remaining: remainingQueue.length, smtpReady: true, results };
  }

  const done = remainingQueue.length === 0;
  await store.updateCampaign(co, id, {
    queue: done ? null : remainingQueue,
    sent: totalSent, delivered: totalSent,
    status: done ? 'completed' : 'sending',
    ...(done ? { sent_at: freshCamp?.sent_at || new Date().toISOString() } : {}),
  });
  if (done) await store.logActivity(co, { type: 'done', text: `Campaign "${camp.name}" completed — ${totalSent} sent` });

  return { done, dryRun: false, sent: totalSent, sentNow, total: freshCamp?.recipients ?? queue.length, remaining: remainingQueue.length, smtpReady: true, results };
}

// Send a saved campaign to its resolved audience, updating campaign stats.
export async function sendCampaign(company, id, { dryRun }) {
  const co = company || 'LagosTSQ';
  const camp = await store.getCampaign(co, id);
  if (!camp) throw new Error(`campaign ${id} not found`);
  const targets = await store.resolveAudience(co, camp.audience);
  const cfg = smtpConfig(co);
  const sig = (await store.getSettings(co)).signature;
  const results = [];

  if (dryRun || !cfg.ready) {
    for (const l of targets) results.push({ id: l.id, email: l.email, status: dryRun ? 'preview' : 'skipped (SMTP not configured)' });
    return { sent: 0, total: targets.length, dryRun: true, smtpReady: cfg.ready, results };
  }

  await store.updateCampaign(co, id, { status: 'sending' });
  await store.logActivity(co, { type: 'send', text: `Campaign "${camp.name}" started — ${targets.length} recipient(s)` });
  const emailer = await Emailer.open({ ...cfg, from: camp.fromName ? `${camp.fromName} <${cfg.from}>` : cfg.from });
  let sent = 0, replied = 0;
  try {
    for (const l of targets) {
      const subj = render(camp.subject, l) || camp.name;
      try {
        await emailer.send({
          to: l.email, subject: subj,
          text: camp.text ? render(camp.text, l) + renderSignatureText(sig, l) : undefined,
          html: camp.html ? render(camp.html, l) + renderSignatureHtml(sig, l) : undefined,
          headers: camp.replyTo ? { 'Reply-To': camp.replyTo } : undefined,
        });
        await store.markContacted(co, l.id, subj);
        await store.logSend(co, { to: l.email, subject: subj, status: 'sent', source: l.source });
        if (l.stage === 'replied') replied++;
        results.push({ id: l.id, email: l.email, status: 'sent' });
        sent++;
      } catch (e) {
        await store.logSend(co, { to: l.email, subject: subj, status: 'failed', source: l.source });
        results.push({ id: l.id, email: l.email, status: 'failed', error: e.message });
      }
    }
  } finally {
    await emailer.close();
  }
  const failed = targets.length - sent;
  await store.updateCampaign(co, id, {
    status: 'completed', sent_at: new Date().toISOString(),
    recipients: targets.length, sent, delivered: sent, replied, bounces: failed,
  });
  await store.logActivity(co, { type: 'done', text: `Campaign "${camp.name}" completed — ${sent} sent, ${failed} failed` });
  return { sent, total: targets.length, failed, dryRun: false, smtpReady: true, results };
}
