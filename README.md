# lagosMailer

A small, **zero-dependency** email-blast tool with a **live browser CRM for non-developers** — built around a **reusable emailer component**. The SMTP core was extracted from `zinga-os` (a hand-rolled SMTP client over `node:net`/`node:tls` — no nodemailer, no SendGrid) and the CRM's lead model + stage lifecycle were ported from the same project (Supabase swapped for a local JSON store so it runs on localhost with nothing to provision).

## Quick start (the UI)

```bash
node server.js            # → http://localhost:4000
```

Open the URL in a browser. A non-developer can then:
- **Leads** — view/add/import leads, filter by stage (New / Contacted / Replied / Qualified / Won), change a lead's stage, delete.
- **Compose & Blast** — write a subject + HTML/text body with `{{name}}` / `{{business}}` placeholders, select recipients, **Preview (dry run)** to see exactly who'd get it, then **Send blast**.
- Sending marks each recipient **contacted** automatically (stage-guarded, ported from zinga's CRM logic).

Without SMTP configured the UI runs in **dry-run only** mode (safe to demo). Add creds in `.env` and restart to send for real. Leads persist in `data/leads.json`.

## Why no dependencies

The emailer speaks SMTP directly (STARTTLS on 587/25, implicit TLS on 465, `AUTH LOGIN`). One authenticated connection is reused for the whole batch — an N-message blast is one login + N transactions. Works with Gmail Workspace, SMTP.com, Mailgun SMTP, SES SMTP, etc.

## Layout

```
server.js               # live UI backend (HTTP API + serves the CRM)
public/index.html       # the browser CRM (dark-theme, vanilla JS, no build)
src/store.js            # CRM lead store — ports zinga's ops.leads to local JSON
index.js                # public API: Emailer, SmtpClient, buildMessage, loadEnv
src/smtp-client.js      # reusable SMTP client (the core component)
src/build-message.js    # generic RFC822 builder (text/html/attachments)
src/load-env.js         # tiny .env loader
src/blast.js            # CSV-driven blast CLI (dry-run + approval gates)
templates/              # example html/text body templates
recipients.example.csv  # example recipients
```

> **On the CRM port:** zinga-os's CRM is bound to Supabase (a private `ops` schema + service-role RPCs), custom auth, Meta/Instagram, and Apify — none of which runs locally without external setup. So the *data model* (the `ops.leads` record shape) and the *stage lifecycle* were copied, but the storage engine was swapped for a local JSON file (`data/leads.json`). Same concepts, zero services to provision.

## Setup

```bash
cp .env.example .env      # fill in SMTP creds
cp recipients.example.csv recipients.csv
```

Gmail/Workspace needs an **App Password** (not your login password), with 2FA enabled.

## Use the CLI

```bash
# preview — no send, no network
node src/blast.js --list recipients.csv --html templates/example.html --limit 5

# single self-test to yourself
node src/blast.js --to you@domain.com --subject "test" \
  --html templates/example.html --send --self-test

# go live: dry-run gate requires BOTH --send and MAILER_APPROVED=yes
MAILER_APPROVED=yes node src/blast.js \
  --list recipients.csv \
  --html templates/example.html --text templates/example.txt \
  --subject "quick question" --delay 60 --send
```

Templates support `{{name}}`, `{{email}}`, `{{subject}}` substitution. CSV columns: `email` (or `to_email`), optional `subject`, `name`. Every attempt is appended to `sent-log.csv`.

### Safety gates (ported from zinga-os)

- **Dry-run by default** — nothing sends without `--send`.
- **Double gate** — a real blast needs `--send` *and* `MAILER_APPROVED=yes` in the env (per-batch human approval). `--self-test` relaxes this for a single `--to` send.
- **Rate limiting** — `--delay` seconds between messages (default 60) to protect domain reputation.

## Use the emailer as a library

```js
import { Emailer } from './index.js';

const emailer = await Emailer.open({
  host: 'smtp.gmail.com', port: 587,
  user: 'you@domain.com', password: process.env.SMTP_PASSWORD,
  from: 'You <you@domain.com>',
});

await emailer.send({
  to: 'someone@example.com',
  subject: 'Hello',
  html: '<p>Hi there</p>',
  text: 'Hi there',
  // attachments: [{ filename: 'doc.pdf', content: fs.readFileSync('doc.pdf'), contentType: 'application/pdf' }],
});

await emailer.close();
```

Lower-level pieces (`SmtpClient`, `buildMessage`) are also exported if you want to build messages or manage the connection yourself.
