# upgrade.md — Multi-Campaign Job Engine

Phased build plan for the campaign-engine upgrade. Full design spec lives
separately (the long proposal); this is the **plan of record**, reconciled with
what's already built, with the MVP slice marked.

## Core decisions (locked)
- **Storage:** campaign runs + recipients live in **real Postgres tables**, never a
  `crm_store` jsonb blob. `UNIQUE (run_id, lower(email))` is the durable dedup Set.
- **Parallelism unit:** a **campaign run**. One **durable Vercel Workflow per run**
  (we already installed `workflow` v4.8.5 + `workflows/send-campaign.ts`).
- **Batching:** the run's workflow drives its own small chunks (25–100). We do NOT
  add a separate pull-based worker/queue pool in the MVP — the workflow is the
  orchestrator. (Revisit a claim/lease worker pool only if we outgrow it.)
- **Quota:** a shared, **atomic** per-company/day bucket (`quota_buckets` + a
  `reserve_quota()` RPC that locks the row) so concurrent runs never exceed the cap.
- **Provider:** per-sender `provider_key` (`smtp` | `resend`), NOT a deployment-wide
  `EMAIL_PROVIDER` env. (Today's env switch is the interim; this replaces it.)
- **Lead id:** stays **`bigint`** (matches the existing `leads` table `(company,id)`);
  the spec's `uuid` assumption is not adopted. New engine tables use `uuid` PKs.
- **Immutability:** a launched run points at a frozen `campaign_versions` row, so
  editing a draft can't mutate an active send.
- **Compliance:** unsubscribe/suppression is re-checked in the **final send path**,
  not only at snapshot time.

## Reconciliation with what already exists
| Already built | Reuse / evolve |
| --- | --- |
| `leads` table (`company,id bigint`) | Audience source for the snapshot. |
| Durable workflow (`sendCampaignWorkflow`) | Becomes **one workflow per run**; drains `campaign_recipients`. |
| Idempotency (`sentTo` set on campaign) | Superseded by `UNIQUE(run_id,email)` in `campaign_recipients`. |
| Daily cap (KV `daily` + get/bump) | Superseded by `quota_buckets` + `reserve_quota()`. |
| Provider switch (`mailerConfig`/`openMailer`) | Evolve to per-sender `provider_key`. |
| Unsubscribe (`/api/unsubscribe`, headers) | Feeds `suppression_list`; checked in send path. |
| `resolveAudience` / `audienceCount` | Used by the snapshot step. |

## Open items to resolve as we go
- **Company from auth, not `x-company` header.** Current handlers trust the browser's
  `x-company`. The engine derives company server-side from membership. (Security follow-up.)
- Stage plan: MVP keeps it as `stage_plan jsonb` on the run; materialize into a
  `campaign_stages` table only when health-gates land.
- Webhooks (`provider_events`) + health-gate thresholds are **Phase 3+**.

---

## Phases

### ✅ Phase 0 — foundation (DONE)
Leads table, durable workflow SDK, provider abstraction, unsubscribe, daily cap.

### ✅ Phase 1 — relational ledger (MVP — DONE 2026-09-02)
Campaign runs are durable rows; dedup + atomic quota are real. All tested E2E.
- [x] `supabase/campaign-engine.sql` — 7 tables + `reserve/release/commit_quota()` RPCs (applied via Supabase MCP).
- [x] `src/engine.js` — data layer: campaigns, versions, runs, snapshot, quota, `drainChunk`, lifecycle, control, events.
- [x] `src/engine-config.js` — all tunables env-overridable (no magic numbers).
- [x] `snapshotAudience()` — dedup via `UNIQUE(run_id,email)`, excludes suppression + prior successes.
- [x] Per-run durable workflow `workflows/send-run.ts` (drains chunks, atomic quota, paces, resumes).
- [x] API: `POST/GET /api/engine/campaigns`, `.../[id]/runs`, `GET /api/engine/runs/[runId]`, `.../control`.
- [x] Cron fallback drains engine runs when the workflow engine isn't driving.
- [x] Provider per-version (Gmail SMTP / Resend); unsubscribe + suppression in the send path.
- [x] Audience modes coded: `all | segment | explicit | remaining | previous_run | failed_only` (explicit tested live).
- Verified live: snapshot+dedup, atomic quota (`reserved`/`accepted`), real Resend send, queued→running→completed.

### ✅ Phase 2 — control + audit (DONE 2026-09-02)
- [x] Pause / resume / stop / **continue** run controls (`/api/engine/runs/[runId]/control`).
- [x] `campaign_events` timeline + retry-failed (audienceMode `failed_only`, sourceRunId).
- [x] Client: `/runs` page + hooks; live polling while active.
- [x] **5-step Launch wizard** (Campaign → Audience → Cadence → Delivery → Review) + reusable `<Stepper>`.
- [x] **Full run monitor page** — daily-quota header, `% complete`, metric tiles, **cadence stage cards**,
      Activity / Recipients / Run-settings tabs (`getRunDetail` + `run_stage_counts`/`campaign_run_counts`/`listRecipients`/`quotaToday`).

### ✅ Cadence + stage gates (DONE 2026-09-02)
- [x] Cadence = `stage_plan` limits → `assign_stages` RPC tags recipients per stage; `drainChunk` sends only the
      current stage, then advances. Verified `Test 1 / Canary 2 / remainder` → `{1:1, 2:2, 3:3}`.
- [x] **Stage gates:** a `gate:'manual'` stage HOLDS the run at status `gated`; operator **Continue** releases the
      next stage. Verified `stage1→gated→continue→stage2→gated→continue→done`.

### ✅ Phase 4 — deliverability (DONE 2026-09-02)
- [x] `/api/webhooks/resend` — Svix signature verify (zero-dep HMAC, validated vs the real `whsec_` secret),
      idempotent via `provider_events`.
- [x] `ingestProviderEvent` — matches recipient by `provider_message_id`, stamps `delivered_at`/`bounced_at`/
      `complained_at` (delivery is SEPARATE from send `status` → delivered ≤ accepted), auto-suppresses
      bounces/complaints (excluded from future snapshots). Verified `accepted 2 · delivered 1 · bounced 1`.
- [x] Monitor **Delivered** tile is real; Failed rolls in bounces.
- [ ] Env to activate: `RESEND_WEBHOOK_SECRET` (+ webhook added in Resend dashboard) — set locally; needs Vercel + deploy.
- [ ] Stage HEALTH-gates (auto-gate on bounce/complaint thresholds) — still manual-only.

### ~ Phase 3 — controlled concurrency (PARTIAL)
- [x] Atomic shared quota (`reserve_quota` locks the bucket) — concurrent runs already can't exceed the cap.
- [ ] Weighted round-robin fair scheduler (only matters meaningfully past 1,900/day).

### Phase 5 — cutover (PENDING)
- [ ] **Compose → engine convergence** (one send path); make relational tables authoritative; comment out
      (don't delete) the legacy KV campaign/queue path + every-minute cron once proven.

---

## Status
Engine spec is built end-to-end (relational ledger → concurrency-safe quota → cadence → gates → wizard →
monitor → delivery webhooks + suppression), all verified via node/MCP + `next build`. Remaining: activate
webhooks in prod (env + deploy), Compose→engine convergence, and the fair scheduler.
