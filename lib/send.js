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

  // Initialize the queue on the first batch (or if a previous run left none).
  let queue = Array.isArray(camp.queue) ? camp.queue : null;
  if (!queue || camp.status !== 'sending') {
    const targets = await store.resolveAudience(co, camp.audience);
    queue = targets.map((t) => t.id);
  }

  // Dry run: preview the first chunk, send nothing, leave the campaign a draft.
  if (dryRun || !cfg.ready) {
    const all = await store.list(co, {});
    const preview = queue.slice(0, size).map((qid) => all.find((l) => l.id === qid)).filter(Boolean);
    await store.updateCampaign(co, id, { status: 'draft', queue: null });
    return {
      done: true, dryRun: true, sent: 0, sentNow: 0, total: queue.length, remaining: 0,
      smtpReady: cfg.ready,
      results: preview.map((l) => ({ id: l.id, email: l.email, status: dryRun ? 'preview' : 'skipped (SMTP not configured)' })),
    };
  }

  // First real batch: mark the campaign sending and record the frozen queue.
  if (!Array.isArray(camp.queue) || camp.status !== 'sending') {
    await store.updateCampaign(co, id, {
      status: 'sending', queue, recipients: queue.length, sent: 0, delivered: 0, bounces: 0,
      sent_at: camp.sent_at || new Date().toISOString(),
    });
    if (queue.length) await store.logActivity(co, { type: 'send', text: `Campaign "${camp.name}" started — ${queue.length} recipient(s)` });
  }

  const batchIds = queue.slice(0, size);
  const all = await store.list(co, {});
  const targets = batchIds.map((qid) => all.find((l) => l.id === qid)).filter((l) => l && l.email && l.stage !== 'unsub');

  const results = [];
  let sentNow = 0;
  if (targets.length) {
    const emailer = await Emailer.open({ ...cfg, from: camp.fromName ? `${camp.fromName} <${cfg.from}>` : cfg.from });
    try {
      for (const l of targets) {
        const subj = render(camp.subject, l) || camp.name;
        try {
          await emailer.send({
            to: l.email, subject: subj,
            text: camp.text ? render(camp.text, l) : undefined,
            html: camp.html ? render(camp.html, l) : undefined,
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
  }

  const remainingQueue = queue.slice(batchIds.length);
  const fresh = await store.getCampaign(co, id);
  const totalSent = (fresh.sent || 0) + sentNow;
  const done = remainingQueue.length === 0;
  await store.updateCampaign(co, id, {
    queue: done ? null : remainingQueue,
    sent: totalSent, delivered: totalSent,
    status: done ? 'completed' : 'sending',
    ...(done ? { sent_at: fresh.sent_at || new Date().toISOString() } : {}),
  });
  if (done) await store.logActivity(co, { type: 'done', text: `Campaign "${camp.name}" completed — ${totalSent} sent` });

  return { done, dryRun: false, sent: totalSent, sentNow, total: fresh.recipients ?? queue.length, remaining: remainingQueue.length, smtpReady: true, results };
}

// Send a saved campaign to its resolved audience, updating campaign stats.
export async function sendCampaign(company, id, { dryRun }) {
  const co = company || 'LagosTSQ';
  const camp = await store.getCampaign(co, id);
  if (!camp) throw new Error(`campaign ${id} not found`);
  const targets = await store.resolveAudience(co, camp.audience);
  const cfg = smtpConfig(co);
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
          text: camp.text ? render(camp.text, l) : undefined,
          html: camp.html ? render(camp.html, l) : undefined,
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
