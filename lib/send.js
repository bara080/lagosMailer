// Server-side send logic shared by the /api/blast and /api/campaigns/[id]/send
// route handlers. Wraps the reusable Emailer + the lead store.
import * as store from '../src/store.js';
import { Emailer } from '../index.js';
import { sendSms } from './telnyx.js';
import { unsubHeaders, unsubFooterHtml, unsubFooterText } from './unsubscribe.js';
import { resendConfig, ResendMailer } from './resend.js';

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

// Which email provider is ACTIVE for a company + its readiness/from. Explicit
// opt-in: `[PFX_]EMAIL_PROVIDER=resend` selects Resend (only if its key is set);
// anything else (default) uses SMTP. Keeping it explicit means dropping in a
// Resend key never silently breaks live SMTP sends before the domain is verified.
// `prefer` (e.g. a campaign version's provider_key) overrides the env default
// when set — so a run's chosen provider wins over the deployment-wide flag.
export function mailerConfig(company, prefer) {
  const e = process.env;
  const p = String(company || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const pick = (name) => (p && e[`${p}_${name}`]) || e[name];
  const want = String(prefer || pick('EMAIL_PROVIDER') || 'smtp').toLowerCase();
  const resend = resendConfig(company);
  if (want === 'resend' && resend.ready) {
    return { ready: true, provider: 'resend', from: resend.from };
  }
  const smtp = smtpConfig(company);
  return { ready: smtp.ready, provider: 'smtp', from: smtp.from };
}

// Amazon SES only routes bounce/complaint/delivery events to SNS for messages tagged
// with a configuration set. When sending through SES over SMTP, this header carries
// that tag so events reach /api/webhooks/ses. Reads [PFX_]SES_CONFIG_SET; returns {}
// when unset (e.g. Gmail SMTP), so non-SES sends are unaffected.
export function sesConfigHeaders(company) {
  const e = process.env;
  const p = String(company || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const cs = (p && e[`${p}_SES_CONFIG_SET`]) || e.SES_CONFIG_SET;
  return cs ? { 'X-SES-CONFIGURATION-SET': cs } : {};
}

// Open a provider-appropriate mailer with the given From line. Same interface
// either way: `.send(msg)` + `.close()`. `prefer` picks the provider explicitly.
export async function openMailer(company, fromLine, prefer) {
  const m = mailerConfig(company, prefer);
  if (m.provider === 'resend') {
    const r = resendConfig(company);
    return new ResendMailer({ apiKey: r.apiKey, from: fromLine || r.from });
  }
  const smtp = smtpConfig(company);
  return await Emailer.open({ ...smtp, from: fromLine || smtp.from });
}

// Reusable multi-send. Sends an array of messages through `mailer` as efficiently
// as the provider allows — Resend's batch API (up to 100/call, ~50-100x faster)
// when available, otherwise one-at-a-time. Results are returned ALIGNED to the
// input order: [{ ok: true, id }] | [{ ok: false, error }] — so each caller can
// map a result back to its recipient (e.g. to store provider_message_id).
//
// Used by the campaign engine drain and any other path that sends many emails.
// `provider` is the resolved provider string ('resend' | 'smtp'). Messages that
// carry attachments force the sequential path (Resend batch has no attachment
// support). A batch-level failure transparently falls back to sequential for that
// slice, so one bad address never stalls the rest.
const _sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Is a send error transient (should be RETRIED, and if still failing, REQUEUED —
// never marked a terminal failure)? Provider throttling (SES SMTP 454 "Maximum
// sending rate exceeded" / Resend 429), 4xx-temporary (421), 5xx, and connection
// blips all qualify. This is the guard against the Resend-blast bug where ~7,300
// rate-limited recipients were marked `failed` and silently never sent.
export function isTransientSendError(msg) {
  const s = String(msg || '').toLowerCase();
  // SMTP 5xx (550/553/554 …) are PERMANENT (bad address, policy) — never requeue,
  // or a genuinely-bad recipient loops forever. Only SMTP 4xx are temporary.
  if (/smtp unexpected reply 5\d\d/.test(s)) return false;
  return /(?:\b429\b|\b421\b|\b45\d\b|throttl|rate exceeded|maximum sending rate|too many requests|rate limit|timeout|timed out|econnreset|etimedout|socket|temporar|try again|service unavailable|throttling)/.test(s)
    || /\b5\d\d\b/.test(s); // HTTP 5xx (e.g. Resend API) is transient
}

// Reusable multi-send with retry/backoff. Each message is retried on transient
// errors with exponential backoff + jitter; if it still fails transiently it is
// returned as { ok:false, retryable:true } so the caller REQUEUES it (pending)
// rather than failing it. Non-transient errors return { ok:false, retryable:false }.
export async function sendMany(mailer, provider, messages, { batchSize = 100, maxRetries = 5 } = {}) {
  const results = new Array(messages.length);
  const canBatch = provider === 'resend'
    && typeof mailer.sendBatch === 'function'
    && messages.length > 1
    && messages.every((m) => !(Array.isArray(m.attachments) && m.attachments.length));

  const sendOne = async (i) => {
    let lastErr;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const res = await mailer.send(messages[i]);
        results[i] = { ok: true, id: res?.id || null };
        return;
      } catch (err) {
        lastErr = String(err?.message || err);
        if (!isTransientSendError(lastErr) || attempt === maxRetries) break;
        // Backoff ~0.5s, 1s, 2s, 4s, 8s (+ up to 250ms jitter) to ride out throttling.
        await _sleep(Math.min(8000, 500 * 2 ** attempt) + Math.floor(Math.random() * 250));
      }
    }
    results[i] = { ok: false, retryable: isTransientSendError(lastErr), error: String(lastErr).slice(0, 500) };
  };

  if (!canBatch) {
    for (let i = 0; i < messages.length; i++) await sendOne(i);
    return results;
  }

  for (let start = 0; start < messages.length; start += batchSize) {
    const slice = messages.slice(start, start + batchSize);
    try {
      const ids = await mailer.sendBatch(slice);
      slice.forEach((_, j) => { results[start + j] = { ok: true, id: ids[j]?.id || null }; });
    } catch {
      // Batch call failed as a whole → retry this slice one-by-one (with per-message
      // backoff) so a single bad message is isolated instead of failing the slice.
      for (let j = 0; j < slice.length; j++) await sendOne(start + j);
    }
  }
  return results;
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
// Absolute base for email images (icons must load without a logged-in session).
const APP_URL = (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://lagosmailer-psi.vercel.app').replace(/\/$/, '');
const SOCIAL_BASE = { instagram: 'https://instagram.com/', tiktok: 'https://tiktok.com/@', facebook: 'https://facebook.com/', x: 'https://x.com/' };

// Inline Lucide (lucide.dev, ISC) icon paths — rendered as inline SVG so no
// hosted asset is needed. NOTE: Gmail strips inline SVG, so the text label after
// each icon is the intentional fallback there; Apple Mail / iOS / Outlook.com
// show the icon. (TikTok isn't in Lucide → its closest music-note glyph.)
const SOCIAL_ICON_PATHS = {
  instagram: '<rect width="20" height="20" x="2" y="2" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" x2="17.51" y1="6.5" y2="6.5"/>',
  tiktok: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  facebook: '<path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/>',
  x: '<path d="M22 4s-.7 2.1-2 3.4c1.6 10-9.4 17.3-18 11.6 2.2.1 4.4-.6 6-2C3 15.5.5 9.6 3 5c2.2 2.6 5.6 4.1 9 4-.9-4.2 4-6.6 7-3.8 1.1 0 3-1.2 3-1.2z"/>',
};
const socialIconSvg = (k) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:5px">${SOCIAL_ICON_PATHS[k] || ''}</svg>`;

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
  if (sig.logoUrl) rows.push(`<div style="display:inline-block;background:#1a1220;padding:10px 16px;border-radius:10px;margin-bottom:12px"><img src="${esc(sig.logoUrl)}" alt="${r(sig.businessName)}" style="max-height:46px;display:block;border:0" /></div>`);
  if (sig.businessName) rows.push(`<div style="font-weight:700;color:#111827;font-size:14px">${r(sig.businessName)}</div>`);
  if (sig.tagline) rows.push(`<div>${r(sig.tagline)}</div>`);
  if (sig.address) rows.push(`<div>${r(sig.address)}</div>`);
  const contact = [
    sig.phone ? r(sig.phone) : '',
    sig.website ? `<a href="${esc(withHttp(sig.website))}" style="color:#2563eb;text-decoration:none">${r(sig.website)}</a>` : '',
  ].filter(Boolean).join(' &middot; ');
  if (contact) rows.push(`<div>${contact}</div>`);
  const links = Object.keys(SOCIAL_LABELS)
    .map((k) => {
      const u = socialUrl(k, sig.socials?.[k]);
      if (!u) return '';
      return `<a href="${esc(u)}" style="color:#6b7280;text-decoration:none;font-weight:600;display:inline-block;margin-right:16px">${socialIconSvg(k)}${SOCIAL_LABELS[k]}</a>`;
    })
    .filter(Boolean).join('');
  if (links) rows.push(`<div style="margin-top:8px">${links}</div>`);
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

// Turn a campaign's attachment list into what the mailer needs: `inlineHtml`
// (image assets embedded in the body via their public Blob URL) and `files`
// (non-inline assets fetched once as Buffers and sent as real attachments).
export async function prepareAttachments(attachments) {
  const list = Array.isArray(attachments) ? attachments : [];
  const files = [];
  const imgs = [];
  for (const a of list) {
    if (!a || !a.url) continue;
    if (a.inline && String(a.contentType || '').startsWith('image/')) {
      imgs.push(`<img src="${esc(a.url)}" alt="${esc(a.name)}" style="max-width:100%;height:auto;display:block;margin:14px 0;border-radius:6px;border:0" />`);
    } else {
      try {
        const res = await fetch(a.url);
        if (!res.ok) continue;
        files.push({ filename: a.name || 'attachment', content: Buffer.from(await res.arrayBuffer()), contentType: a.contentType || 'application/octet-stream' });
      } catch { /* skip unfetchable asset */ }
    }
  }
  return { files, inlineHtml: imgs.length ? `<div style="margin-top:16px">${imgs.join('')}</div>` : '' };
}

// Send a SINGLE test email to one address (the operator's own inbox). Creates
// no lead and never touches the real audience — this is how a user safely tries
// out a draft. Personalization tokens are filled with sample values so the test
// looks like a real send.
export async function runTestSend({ company, to, subject, html, text, attachments }) {
  const co = company || 'LagosTSQ';
  if (!to) throw new Error('No test recipient.');
  const cfg = mailerConfig(co);
  if (!cfg.ready) throw new Error('No email provider is configured for this company.');
  const sample = { name: (to.split('@')[0] || 'there'), business: 'Your Business', category: 'sample', email: to };
  const sig = (await store.getSettings(co)).signature;
  const att = await prepareAttachments(attachments);
  const emailer = await openMailer(co, cfg.from);
  try {
    await emailer.send({
      to,
      subject: render(subject, sample) || '(no subject)',
      text: text ? render(text, sample) + renderSignatureText(sig, sample) : undefined,
      html: html ? render(html, sample) + att.inlineHtml + renderSignatureHtml(sig, sample) : undefined,
      attachments: att.files.length ? att.files : undefined,
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
  const targets = await store.resolveAudience(co, { ids, emailOnly: true }); // indexed by id
  const cfg = mailerConfig(co);
  const results = [];

  if (dryRun || !cfg.ready) {
    for (const l of targets) results.push({ id: l.id, email: l.email, status: dryRun ? 'preview' : 'skipped (SMTP not configured)' });
    return { sent: 0, total: targets.length, dryRun: true, smtpReady: cfg.ready, results };
  }

  // Daily cap (safety): only blast up to today's remaining allowance.
  const dailyCap = await store.getDailyCap(co);
  const allowanceToday = Math.max(0, dailyCap - (await store.getSentToday(co)));
  const capped = targets.slice(0, allowanceToday);
  const cappedToday = targets.length - capped.length;

  const label = (subject || 'Blast').slice(0, 40);
  await store.logActivity(co, { type: 'send', text: `Blast "${label}" started — ${capped.length} recipient(s)${cappedToday ? ` (${cappedToday} held by daily cap)` : ''}` });
  const emailer = await openMailer(co, cfg.from);
  let sent = 0;
  try {
    for (const l of capped) {
      const subj = render(subject, l) || '(no subject)';
      try {
        await emailer.send({
          to: l.email, subject: subj,
          text: text ? render(text, l) + unsubFooterText(co, l.email) : undefined,
          html: html ? render(html, l) + unsubFooterHtml(co, l.email) : undefined,
          headers: unsubHeaders(co, l.email),
        });
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
  if (sent) await store.bumpSentToday(co, sent); // count toward today's cap
  const summary = { sent, total: targets.length, failed: capped.length - sent, cappedToday, label };
  await store.setLastBlast(co, summary);
  await store.logActivity(co, { type: 'done', text: `Blast "${label}" completed — ${sent} sent, ${summary.failed} failed` });
  return { ...summary, dryRun: false, smtpReady: true, results };
}

// Bulk SMS to an explicit list of leads (those with a phone number), via Telnyx.
export async function runSmsBlast({ company, ids, text, dryRun }) {
  const co = company || 'LagosTSQ';
  const byId = await store.resolveAudience(co, { ids, emailOnly: false }); // indexed by id
  const targets = byId.filter((l) => l.phone && l.stage !== 'unsub');
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
let lockSeq = 0; // monotonic part of the per-batch concurrency lock token

// Send ONE batch of a campaign, then return progress. On the first call it
// snapshots the audience into a frozen `queue` of lead ids on the campaign;
// each subsequent call drains the next `size` ids. This makes large sends
// reliable (no single long-running request) and resumable.
export async function sendCampaignBatch(company, id, { dryRun, size = BATCH_SIZE } = {}) {
  const co = company || 'LagosTSQ';
  let camp = await store.getCampaign(co, id);
  if (!camp) throw new Error(`campaign ${id} not found`);
  const cfg = mailerConfig(co);

  // Idempotency guard: a finished campaign is never re-sent (a re-trigger just
  // reports the prior result). `sentTo` (below) additionally guarantees no single
  // address is emailed twice within a campaign, even across retries/resumes.
  if (!dryRun && camp.status === 'completed' && !Array.isArray(camp.queue)) {
    return { done: true, alreadyCompleted: true, dryRun: false, sent: camp.sent || 0, sentNow: 0, total: camp.recipients ?? (camp.sent || 0), remaining: 0, smtpReady: true, results: [] };
  }

  // Concurrency lock: stop the cron and the client "send now" kick (or overlapping
  // cron ticks) from draining the SAME campaign at once — that's what double-sent.
  // Best-effort: set a short lock token, re-read, and only proceed if we hold it.
  if (!dryRun && cfg.ready) {
    const now = Date.now();
    const lockedResult = () => ({ done: false, locked: true, dryRun: false, sent: camp.sent || 0, sentNow: 0, total: camp.recipients ?? 0, remaining: Array.isArray(camp.queue) ? camp.queue.length : 0, smtpReady: true, results: [] });
    if (camp.lockedUntil && camp.lockedUntil > now) return lockedResult();
    const token = `${now}.${++lockSeq}.${process.pid}`;
    await store.updateCampaign(co, id, { lockedUntil: now + 180000, lockToken: token });
    camp = await store.getCampaign(co, id); // re-read to confirm ownership + freshest state
    if (!camp || camp.lockToken !== token) return lockedResult();
  }

  const sentTo = new Set((camp.sentTo || []).map((e) => String(e).toLowerCase()));

  // Existing frozen queue (resuming) or a fresh snapshot of the audience. The
  // queue holds full target OBJECTS (email + name/business/…), so custom email
  // lists — recipients that aren't leads — work the same as lead audiences.
  const hasQueue = Array.isArray(camp.queue);
  let queue = hasQueue ? camp.queue : await store.resolveAudience(co, camp.audience);

  // Dry run: preview the first chunk, send nothing, leave the campaign a draft.
  if (dryRun || !cfg.ready) {
    const preview = queue.slice(0, size);
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

  // Daily cap (safety): never send more than the company's daily allowance. When
  // the cap is already hit, HOLD — keep the queue + `sending` status and release
  // the lock; the every-minute cron resumes automatically after midnight (NY).
  const dailyCap = await store.getDailyCap(co);
  const sentToday = await store.getSentToday(co);
  const allowanceToday = Math.max(0, dailyCap - sentToday);
  if (allowanceToday <= 0 && queue.length) {
    await store.updateCampaign(co, id, { status: 'sending', queue, lockedUntil: null, lockToken: null });
    return { done: false, dailyCapReached: true, dryRun: false, sent: camp.sent || 0, sentNow: 0, total: camp.recipients ?? queue.length, remaining: queue.length, dailyCap, sentToday, smtpReady: true, results: [] };
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

  const batch = queue.slice(0, Math.min(size, allowanceToday)); // capped by day's allowance
  const sig = (await store.getSettings(co)).signature; // append to every email
  const att = await prepareAttachments(camp.attachments); // fetch files once, reuse per email

  const results = [];
  let sentNow = 0;
  let interrupted = null; // 'pause' | 'stop'
  let processed = 0;      // how many queue entries we finished (sent, failed, or skipped)

  const fromAddr = camp.fromAddress || cfg.from;
  const emailer = await openMailer(co, camp.fromName ? `${camp.fromName} <${fromAddr}>` : fromAddr);
  try {
    for (const l of batch) {
      // Check the pause/stop flag before EACH email so Stop takes effect within
      // one message, not one batch.
      const control = await store.getControl(co, id);
      if (control === 'pause' || control === 'stop') { interrupted = control; break; }

      processed++;
      if (!l || !l.email || l.stage === 'unsub') continue; // skip, still consumed

      // Idempotency: never email the same address twice within this campaign.
      const emailKey = String(l.email).toLowerCase();
      if (sentTo.has(emailKey)) { results.push({ id: l.id, email: l.email, status: 'skipped (already sent)' }); continue; }

      const subj = render(camp.subject, l) || camp.name;
      try {
        await emailer.send({
          to: l.email, subject: subj,
          text: camp.text ? render(camp.text, l) + renderSignatureText(sig, l) + unsubFooterText(co, l.email) : undefined,
          html: camp.html ? render(camp.html, l) + att.inlineHtml + renderSignatureHtml(sig, l) + unsubFooterHtml(co, l.email) : undefined,
          headers: { ...(camp.replyTo ? { 'Reply-To': camp.replyTo } : {}), ...unsubHeaders(co, l.email) },
          attachments: att.files.length ? att.files : undefined,
        });
        sentTo.add(emailKey);
        if (l.id) await store.markContacted(co, l.id, subj); // custom (non-lead) targets have no id
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

  // Count these toward today's cap.
  if (sentNow) await store.bumpSentToday(co, sentNow);

  const remainingQueue = queue.slice(processed);
  const freshCamp = await store.getCampaign(co, id);
  const totalSent = (freshCamp?.sent || 0) + sentNow;

  const sentToArr = [...sentTo]; // idempotency: addresses already emailed for this campaign

  // Handle a mid-batch pause/stop. Always release the concurrency lock so the
  // next batch (cron) can pick up.
  if (interrupted === 'stop') {
    await store.clearControl(co, id);
    await store.updateCampaign(co, id, { status: 'stopped', queue: null, sent: totalSent, delivered: totalSent, sentTo: sentToArr, lockedUntil: null, lockToken: null });
    await store.logActivity(co, { type: 'stop', text: `Campaign "${camp.name}" stopped — ${totalSent} sent` });
    return { done: true, stopped: true, dryRun: false, sent: totalSent, sentNow, total: freshCamp?.recipients ?? queue.length, remaining: remainingQueue.length, smtpReady: true, results };
  }
  if (interrupted === 'pause') {
    await store.updateCampaign(co, id, { status: 'paused', queue: remainingQueue, sent: totalSent, delivered: totalSent, sentTo: sentToArr, lockedUntil: null, lockToken: null });
    await store.logActivity(co, { type: 'pause', text: `Campaign "${camp.name}" paused — ${remainingQueue.length} remaining` });
    return { done: true, paused: true, dryRun: false, sent: totalSent, sentNow, total: freshCamp?.recipients ?? queue.length, remaining: remainingQueue.length, smtpReady: true, results };
  }

  const done = remainingQueue.length === 0;
  await store.updateCampaign(co, id, {
    queue: done ? null : remainingQueue,
    sent: totalSent, delivered: totalSent, sentTo: sentToArr,
    status: done ? 'completed' : 'sending',
    lockedUntil: null, lockToken: null, // release lock; next batch may proceed
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
  const cfg = mailerConfig(co);
  const sig = (await store.getSettings(co)).signature;
  const att = await prepareAttachments(camp.attachments);
  const results = [];

  if (dryRun || !cfg.ready) {
    for (const l of targets) results.push({ id: l.id, email: l.email, status: dryRun ? 'preview' : 'skipped (SMTP not configured)' });
    return { sent: 0, total: targets.length, dryRun: true, smtpReady: cfg.ready, results };
  }

  await store.updateCampaign(co, id, { status: 'sending' });
  await store.logActivity(co, { type: 'send', text: `Campaign "${camp.name}" started — ${targets.length} recipient(s)` });
  const fromAddr = camp.fromAddress || cfg.from;
  const emailer = await openMailer(co, camp.fromName ? `${camp.fromName} <${fromAddr}>` : fromAddr);
  let sent = 0, replied = 0;
  try {
    for (const l of targets) {
      const subj = render(camp.subject, l) || camp.name;
      try {
        await emailer.send({
          to: l.email, subject: subj,
          text: camp.text ? render(camp.text, l) + renderSignatureText(sig, l) + unsubFooterText(co, l.email) : undefined,
          html: camp.html ? render(camp.html, l) + att.inlineHtml + renderSignatureHtml(sig, l) + unsubFooterHtml(co, l.email) : undefined,
          headers: { ...(camp.replyTo ? { 'Reply-To': camp.replyTo } : {}), ...unsubHeaders(co, l.email) },
          attachments: att.files.length ? att.files : undefined,
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
