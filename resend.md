# Resend + Domain Deliverability — native125th.com

_Setup, what broke, what we fixed, and how sending/reputation works. Written 2026-09-02._

## TL;DR

- `native125th.com` now sends through **Resend** (verified domain) **and** Gmail SMTP — provider is chosen per-send in the app.
- The domain was landing Resend mail in **Spam** because it was **missing a root SPF record** and had a **broken/borrowed DMARC** — not because of Resend. Both are now fixed.
- Auth (SPF/DKIM/DMARC) is now correct and verified. Remaining placement issues are **sender reputation + recipient engagement** — solved only by **warmup**, not config or a plan upgrade.

---

## 1. Architecture (how the app uses Resend)

Sending is **provider-agnostic**. The engine renders one email (content + signature + unsubscribe) and hands it to whichever mailer is selected:

- `lib/resend.js` — `ResendMailer` (drop-in for the SMTP `Emailer`), `resendConfig()`, `verifyResendWebhook()` (Svix HMAC). Sends via `POST https://api.resend.com/emails`.
- `lib/send.js` — `mailerConfig()` / `openMailer()` pick **SMTP** or **Resend** per company. Selection order: a run/version's `provider_key` → `[PFX_]EMAIL_PROVIDER` env → default `smtp`. Explicit opt-in, so dropping in a Resend key never silently breaks live SMTP.
- **UI** — Provider dropdown in Compose (Delivery) and the Runs launch wizard (`smtp` = Gmail, `resend` = Resend).
- **Same email everywhere** — signature (`renderSignatureHtml/Text`) + unsubscribe footer + one-click `List-Unsubscribe` headers are appended by the engine for **both** providers. Attachments/inline images flow through too.
- **Webhooks** — `/api/webhooks/resend` verifies signatures and ingests delivered/bounced/complained → auto-suppression.

**Env vars** (values live only in gitignored `.env` / Vercel — never commit): `RESEND_API_KEY` (or `NATIVE125TH_RESEND_API_KEY`), `RESEND_WEBHOOK_SECRET`, optional `NATIVE125TH_RESEND_FROM`, and `[PFX_]EMAIL_PROVIDER=resend` to make Resend the company default.

**Resend account:** `clickbuild` · Free tier = **100 emails/day, 3,000/month** · Resend domain id `d9d886e0-a738-41b3-8fd5-a0797303c5f2` (region us-east-1).

---

## 2. The problem

Resend emails from `native125th.com` went to **Spam**, while Gmail-SMTP blasts always inboxed. Root cause was a comparison against `zingaapp.com` (inboxes fine): that domain had a **root SPF** and an **enforced, self-owned DMARC**; `native125th.com` had **neither**.

| Layer | Before | Issue |
|---|---|---|
| Resend DKIM (`resend._domainkey`) | present | ✅ fine |
| **Root SPF** (`@`) | **missing** | ❌ no SPF at the root — incomplete auth posture |
| **DMARC** (`_dmarc`) | `p=none; rua=company@cymbal.co` | ❌ not enforced + report address on a domain not owned (leftover template; `cymbal.co` is Google's demo domain) |

---

## 3. What we fixed — DNS records (Squarespace)

`native125th.com` DNS is managed by **Squarespace** (nameservers `ns0X.squarespacedns.com` / `nsone.net`). Google Workspace handles inbound mail (`@` MX → `aspmx.l.google.com`); Bento/SES uses the `em` subdomain; Resend uses the `send` subdomain — no collisions.

### Resend verification (domain sending)
| Type | Host | Value |
|---|---|---|
| TXT (DKIM) | `resend._domainkey` | `p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDzuDunpz9/7Tr21nMONsMurzQjHDdcngAzL4S9LY8MiG+Z24XXaRw4K+Ems+u+J8dwEjXZ3pTT2X3wallF5nw7WHtyKtv9MhXxBH/sNN4o1fAdIZatUg4Oy0JWmgO5Gg6o7kfN/S0tZs1HaIQVZTt5VGnV/i6ZfLVW6fbWDoiWzwIDAQAB` |
| MX (SPF) | `send` | `feedback-smtp.us-east-1.amazonses.com` (priority 10) |
| TXT (SPF) | `send` | `v=spf1 include:amazonses.com ~all` |

### The two deliverability fixes (the important ones)
| Type | Host | Value | Purpose |
|---|---|---|---|
| **TXT** | `@` | `v=spf1 include:_spf.google.com ~all` | **Added root SPF** — the missing piece; also aligns Google Workspace mail |
| **TXT** | `_dmarc` | `v=DMARC1; p=quarantine; rua=mailto:dmarc@native125th.com; pct=100; fo=1` | **Enforced, self-owned DMARC** (replaced the `p=none` / cymbal.co one) |

> Order matters: add the **root SPF first**, then enforce DMARC — otherwise `p=quarantine` could quarantine your own Google Workspace mail.

### Google Postmaster Tools
Verified `native125th.com` (TXT `google-site-verification=…` at `@`, or the CNAME method). Health shows **"Not enough data"** until real Gmail volume accumulates — it's the dashboard to watch during warmup.

---

## 4. Verification (all confirmed live)

- Resend domain: **verified** (DKIM + both SPF records).
- Root SPF: live, exactly one record. DMARC: live, enforced. Postmaster: **Verified**.
- Real sends via Resend from `admin@` and `info@`: **delivered** and reached **Inbox/Promotions** on Gmail *and* iCloud (previously Spam). Signature + unsubscribe render correctly; Apple shows its native "Unsubscribe" banner (List-Unsubscribe working).

---

## 5. Reputation — the part config can't fix

The tests proved the remaining variable is **reputation + engagement**, not authentication:

- **Auth passing ≠ inbox guaranteed** — necessary, not sufficient.
- **Provider strictness differs:** **Gmail** is strictest (engagement-based ML) → cold mail → Spam. **iCloud** is lenient (auth-focused) → same email inboxed. Yahoo/Outlook sit in between.
- **Per-sender reputation:** `admin@` inboxed on our own Gmail only because we **marked it "Not spam"**; `info@` (a fresh From) spammed — same domain/auth. On a **virgin account**, **both** `admin@` and `info@` spammed identically → it's reputation, not the From address.

### What actually moves placement
1. **Warm up gradually** — start with a small list of **engaged** recipients (open/reply/mark-not-spam), ramp volume over 1–2 weeks. Free-tier ~90/day cap is ideal for this.
2. **Drive engagement** — mark Spam→Not-spam, reply, add sender to contacts.
3. **Stop cold-testing dormant inboxes** — each Spam landing is a *negative* reputation signal.
4. **Pick ONE sender and stick with it** (e.g. `info@`) so reputation concentrates on one identity.
5. **Promotions is the correct home** for marketing blasts — not Spam, and don't chase Primary for bulk.
6. Optional later: **dedicated sending subdomain** (e.g. `email.native125th.com`) to isolate bulk reputation from corporate `admin@`/`info@` mail; **Postmaster Tools** to monitor Gmail reputation.

---

## 6. Operational notes

- **Free-tier caps:** 100/day, 3,000/month. Keep the app's daily cap ≤ ~90 for the company sending via Resend so the engine self-throttles.
- **Domain-level verification:** once verified, *any* mailbox on the domain (`admin@`, `info@`, `events@`…) can send — no per-address setup.
- **Replies** still route through Google Workspace inbound (the `@` MX); Resend only handles *outbound*. Ensure the From/Reply-To mailbox actually exists in Workspace.
- **Upgrading Resend does NOT change placement** — it's reputation, not plan tier.
