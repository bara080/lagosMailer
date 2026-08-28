#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Email blast CLI. Reads a recipients CSV, opens ONE authenticated SMTP
// connection, and sends a rate-limited batch — reusing the Emailer component.
//
// Safety gates (ported from zinga-os): dry-run by default; a real send needs
// BOTH --send AND MAILER_APPROVED=yes. Sends are rate-limited and logged.
//
//   # preview (no send, no network):
//   node src/blast.js --list recipients.csv --limit 5
//
//   # single self-test to your own inbox:
//   node src/blast.js --to you@domain.com --subject "test" --send
//
//   # go live, 50 recipients, 60s apart:
//   MAILER_APPROVED=yes node src/blast.js --list recipients.csv --send --delay 60
//
// CSV columns: `email` (or `to_email`), optional `subject`, `name`.
// Body/subject come from a template file (--template md/html) or --subject flag.
// ─────────────────────────────────────────────────────────────────────────────
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from './load-env.js';
import { Emailer } from '../index.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url)) + '/..';
const LOG = path.join(ROOT, 'sent-log.csv');

function parseArgs(argv) {
  const a = { delay: 60, limit: 0 };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const next = () => argv[++i];
    if (k === '--list') a.list = next();
    else if (k === '--to') a.to = next();
    else if (k === '--subject') a.subject = next();
    else if (k === '--html') a.htmlFile = next();
    else if (k === '--text') a.textFile = next();
    else if (k === '--attach') a.attach = next();
    else if (k === '--limit') a.limit = parseInt(next(), 10) || 0;
    else if (k === '--delay') a.delay = parseFloat(next());
    else if (k === '--send') a.send = true;
    else if (k === '--self-test') a.selfTest = true;
    else if (k === '-h' || k === '--help') a.help = true;
  }
  return a;
}

// Minimal CSV parser (handles quoted fields + embedded commas/newlines).
function parseCsv(txt) {
  const rows = [];
  let row = [], field = '', q = false;
  for (let i = 0; i < txt.length; i++) {
    const c = txt[i];
    if (q) {
      if (c === '"' && txt[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c === '\r') { /* skip */ }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  if (!rows.length) return [];
  const header = rows.shift().map((h) => h.trim().toLowerCase());
  return rows
    .filter((r) => r.some((v) => v.trim()))
    .map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? '').trim()])));
}

function recipients(args) {
  if (args.to) {
    return [{ email: args.to, subject: args.subject || '(no subject)', name: '' }];
  }
  const rows = parseCsv(fs.readFileSync(args.list, 'utf8'));
  return rows
    .map((r) => ({
      email: r.email || r.to_email || '',
      subject: r.subject || args.subject || '(no subject)',
      name: r.name || r.business_name || '',
    }))
    .filter((r) => r.email);
}

// Render a template, substituting {{name}}, {{email}}, {{subject}}.
function render(tpl, r) {
  return tpl
    .replaceAll('{{name}}', r.name || 'there')
    .replaceAll('{{email}}', r.email)
    .replaceAll('{{subject}}', r.subject);
}

function logSend(to, subject, status, err = '') {
  const exists = fs.existsSync(LOG) && fs.statSync(LOG).size > 0;
  const esc = (s) => `"${String(s).replaceAll('"', '""')}"`;
  const line = [new Date().toISOString(), to, subject, status, err].map(esc).join(',') + '\n';
  if (!exists) fs.appendFileSync(LOG, 'date,to,subject,status,error\n');
  fs.appendFileSync(LOG, line);
}

const HELP = `lagos-mailer — email blast

  --list <csv>       recipients CSV (columns: email[,subject,name])
  --to <addr>        single recipient (self-test)
  --subject <s>      subject (fallback if CSV has no subject column)
  --html <file>      HTML body template (supports {{name}} {{email}})
  --text <file>      plain-text body template
  --attach <file>    file to attach to every message
  --limit <n>        cap number of recipients (0 = all)
  --delay <secs>     seconds between sends (default 60)
  --send             actually send (also needs MAILER_APPROVED=yes)
  --self-test        allow a single --to send without full gates
  -h, --help

.env keys: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, MAILER_FROM`;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || (!args.list && !args.to)) {
    console.log(HELP);
    process.exit(args.help ? 0 : 1);
  }

  const env = loadEnv(ROOT);
  const from = env.MAILER_FROM || env.SMTP_USER || '';

  const text = args.textFile ? fs.readFileSync(args.textFile, 'utf8') : undefined;
  const html = args.htmlFile ? fs.readFileSync(args.htmlFile, 'utf8') : undefined;
  const attachments = args.attach
    ? [{ filename: path.basename(args.attach), content: fs.readFileSync(args.attach) }]
    : [];

  let rows = recipients(args);
  if (args.limit) rows = rows.slice(0, args.limit);

  console.log(`from:       ${from || '(unset)'}`);
  console.log(`recipients: ${rows.length}`);
  console.log(`body:       ${html ? 'html' : ''}${html && text ? '+' : ''}${text ? 'text' : ''}${!html && !text ? 'MISSING — use --html/--text' : ''}`);
  if (attachments.length) console.log(`attach:     ${attachments[0].filename}`);
  console.log();
  for (const r of rows.slice(0, 5)) console.log(`  → ${r.email.padEnd(34)} | ${r.subject}`);
  if (rows.length > 5) console.log(`  … +${rows.length - 5} more`);

  if (!args.send) {
    console.log('\nDRY RUN — nothing sent. Add --send (and MAILER_APPROVED=yes) to go live.');
    return;
  }

  // ── Gates ──────────────────────────────────────────────────────────────────
  if (!from) exit('MAILER_FROM (or SMTP_USER) not set in .env');
  if (!html && !text) exit('no body — provide --html and/or --text');
  for (const k of ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASSWORD']) {
    if (!env[k]) exit(`${k} not set in .env`);
  }
  if (process.env.MAILER_APPROVED !== 'yes' && !args.selfTest) {
    exit('set MAILER_APPROVED=yes to send (per-batch human approval).');
  }

  const emailer = await Emailer.open({
    host: env.SMTP_HOST,
    port: parseInt(env.SMTP_PORT || '587', 10),
    user: env.SMTP_USER,
    password: env.SMTP_PASSWORD,
    from,
  });

  let sent = 0;
  try {
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      try {
        await emailer.send({
          to: r.email,
          subject: render(r.subject, r),
          text: text ? render(text, r) : undefined,
          html: html ? render(html, r) : undefined,
          attachments,
        });
        console.log(`sent  ${r.email}`);
        logSend(r.email, r.subject, 'sent');
        sent++;
      } catch (e) {
        console.log(`FAIL  ${r.email}: ${e.message}`);
        logSend(r.email, r.subject, 'failed', e.message);
      }
      if (i < rows.length - 1) await sleep(args.delay * 1000);
    }
  } finally {
    await emailer.close();
  }
  console.log(`\n${sent}/${rows.length} sent, logged to sent-log.csv`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function exit(msg) { console.error(`refusing: ${msg}`); process.exit(1); }

main().catch((e) => { console.error(e); process.exit(1); });
