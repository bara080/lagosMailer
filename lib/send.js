// Server-side send logic shared by the /api/blast and /api/campaigns/[id]/send
// route handlers. Wraps the reusable Emailer + the lead store.
import * as store from '../src/store.js';
import { Emailer } from '../index.js';

export function smtpConfig() {
  const e = process.env;
  return {
    ready: !!(e.SMTP_HOST && e.SMTP_USER && e.SMTP_PASSWORD),
    host: e.SMTP_HOST,
    port: parseInt(e.SMTP_PORT || '587', 10),
    user: e.SMTP_USER,
    password: e.SMTP_PASSWORD,
    from: e.MAILER_FROM || e.SMTP_USER || '',
  };
}

export function render(tpl, lead) {
  return (tpl || '')
    .replaceAll('{{name}}', lead.name || 'there')
    .replaceAll('{{business}}', lead.business || '')
    .replaceAll('{{category}}', lead.category || '')
    .replaceAll('{{email}}', lead.email || '');
}

// Send a message to an explicit list of leads.
export async function runBlast({ ids, subject, html, text, dryRun }) {
  const all = await store.list({});
  const targets = all.filter((l) => ids.includes(l.id) && l.email && l.stage !== 'unsub');
  const cfg = smtpConfig();
  const results = [];

  if (dryRun || !cfg.ready) {
    for (const l of targets) results.push({ id: l.id, email: l.email, status: dryRun ? 'preview' : 'skipped (SMTP not configured)' });
    return { sent: 0, total: targets.length, dryRun: true, smtpReady: cfg.ready, results };
  }

  const label = (subject || 'Blast').slice(0, 40);
  await store.logActivity({ type: 'send', text: `Blast "${label}" started — ${targets.length} recipient(s)` });
  const emailer = await Emailer.open(cfg);
  let sent = 0;
  try {
    for (const l of targets) {
      const subj = render(subject, l) || '(no subject)';
      try {
        await emailer.send({ to: l.email, subject: subj, text: text ? render(text, l) : undefined, html: html ? render(html, l) : undefined });
        await store.markContacted(l.id, subj);
        await store.logSend({ to: l.email, subject: subj, status: 'sent', source: l.source });
        results.push({ id: l.id, email: l.email, status: 'sent' });
        sent++;
      } catch (e) {
        await store.logSend({ to: l.email, subject: render(subject, l), status: 'failed', source: l.source });
        results.push({ id: l.id, email: l.email, status: 'failed', error: e.message });
      }
    }
  } finally {
    await emailer.close();
  }
  const summary = { sent, total: targets.length, failed: targets.length - sent, label };
  await store.setLastBlast(summary);
  await store.logActivity({ type: 'done', text: `Blast "${label}" completed — ${sent} sent, ${summary.failed} failed` });
  return { ...summary, dryRun: false, smtpReady: true, results };
}

// Send a saved campaign to its resolved audience, updating campaign stats.
export async function sendCampaign(id, { dryRun }) {
  const camp = await store.getCampaign(id);
  if (!camp) throw new Error(`campaign ${id} not found`);
  const targets = await store.resolveAudience(camp.audience);
  const cfg = smtpConfig();
  const results = [];

  if (dryRun || !cfg.ready) {
    for (const l of targets) results.push({ id: l.id, email: l.email, status: dryRun ? 'preview' : 'skipped (SMTP not configured)' });
    return { sent: 0, total: targets.length, dryRun: true, smtpReady: cfg.ready, results };
  }

  await store.updateCampaign(id, { status: 'sending' });
  await store.logActivity({ type: 'send', text: `Campaign "${camp.name}" started — ${targets.length} recipient(s)` });
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
        await store.markContacted(l.id, subj);
        await store.logSend({ to: l.email, subject: subj, status: 'sent', source: l.source });
        if (l.stage === 'replied') replied++;
        results.push({ id: l.id, email: l.email, status: 'sent' });
        sent++;
      } catch (e) {
        await store.logSend({ to: l.email, subject: subj, status: 'failed', source: l.source });
        results.push({ id: l.id, email: l.email, status: 'failed', error: e.message });
      }
    }
  } finally {
    await emailer.close();
  }
  const failed = targets.length - sent;
  await store.updateCampaign(id, {
    status: 'completed', sent_at: new Date().toISOString(),
    recipients: targets.length, sent, delivered: sent, replied, bounces: failed,
  });
  await store.logActivity({ type: 'done', text: `Campaign "${camp.name}" completed — ${sent} sent, ${failed} failed` });
  return { sent, total: targets.length, failed, dryRun: false, smtpReady: true, results };
}
