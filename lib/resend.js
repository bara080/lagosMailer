// Resend email provider — a drop-in alternative to the SMTP `Emailer` (same
// .send()/.close() shape), so the send pipeline is provider-agnostic. Sends via
// the Resend HTTP API (https://resend.com/docs/api-reference/emails/send-email).
// Dependency-free (uses fetch), mirrors lib/telnyx.js.
import crypto from 'crypto';

// Verify a Resend (Svix) webhook signature. Returns true when no secret is set
// (dev). Signed content is `${id}.${timestamp}.${body}`, HMAC-SHA256 with the
// base64 secret (after the `whsec_` prefix), compared to any `v1,<sig>` entry.
export function verifyResendWebhook(secret, { id, timestamp, signature }, body) {
  if (!secret) return true;
  if (!id || !timestamp || !signature) return false;
  const key = Buffer.from(String(secret).replace(/^whsec_/, ''), 'base64');
  const expected = crypto.createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest('base64');
  const provided = String(signature).split(' ').map((s) => s.split(',')[1] || s).filter(Boolean);
  return provided.some((s) => { try { return crypto.timingSafeEqual(Buffer.from(s), Buffer.from(expected)); } catch { return false; } });
}

// Per-company Resend config. Company-prefixed env first (e.g.
// NATIVE125TH_RESEND_API_KEY / NATIVE125TH_RESEND_FROM), then generic RESEND_*,
// falling back to MAILER_FROM for the sender.
export function resendConfig(company) {
  const e = process.env;
  const p = String(company || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const pick = (name) => (p && e[`${p}_${name}`]) || e[name];
  const apiKey = pick('RESEND_API_KEY');
  const from = pick('RESEND_FROM') || pick('MAILER_FROM') || '';
  return { ready: !!apiKey, apiKey, from };
}

export class ResendMailer {
  constructor({ apiKey, from }) {
    this.apiKey = apiKey;
    this.from = from;
  }

  // Build the Resend API payload for one message (shared by send + sendBatch).
  _payload(msg) {
    const from = msg.from || this.from;
    if (!from) throw new Error('Resend: no From address (set RESEND_FROM or a campaign From on a verified domain).');
    return {
      from,
      to: msg.to,
      subject: msg.subject,
      ...(msg.text ? { text: msg.text } : {}),
      ...(msg.html ? { html: msg.html } : {}),
      ...(msg.headers ? { headers: msg.headers } : {}),
      ...(Array.isArray(msg.attachments) && msg.attachments.length
        ? {
            attachments: msg.attachments.map((a) => ({
              filename: a.filename,
              content: Buffer.isBuffer(a.content) ? a.content.toString('base64') : a.content,
              ...(a.contentType ? { content_type: a.contentType } : {}),
            })),
          }
        : {}),
    };
  }

  // Same message shape as Emailer.send: { to, subject, text?, html?, from?,
  // headers?, attachments?: [{ filename, content: Buffer|base64, contentType? }] }.
  async send(msg) {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(this._payload(msg)),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      throw new Error(data?.message || data?.error?.message || data?.name || `Resend error ${r.status}`);
    }
    return data; // { id }
  }

  // Batch send — up to 100 messages in ONE API call (POST /emails/batch). ~50-100x
  // faster than sending one at a time. Returns an array of { id } aligned to the
  // input order, so each recipient can be matched to its provider_message_id.
  // NOTE: Resend's batch endpoint does NOT support attachments — callers must route
  // messages with attachments through send() instead. Max 100 per call; the caller
  // splits larger chunks. Throws on a request-level failure (caller falls back to
  // sequential send for resilience).
  async sendBatch(msgs) {
    if (!Array.isArray(msgs) || !msgs.length) return [];
    if (msgs.length > 100) throw new Error('Resend sendBatch: max 100 messages per call');
    const body = msgs.map((m) => this._payload(m));
    const r = await fetch('https://api.resend.com/emails/batch', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      throw new Error(data?.message || data?.error?.message || data?.name || `Resend batch error ${r.status}`);
    }
    // Resend returns { data: [ { id }, ... ] } in the same order as the input.
    return Array.isArray(data?.data) ? data.data : [];
  }

  // No persistent connection to tear down (HTTP per message).
  async close() {}
}
