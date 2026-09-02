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
- NOT yet: UI wiring (compose→engine, run detail page), live pause/resume + remaining/failed modes, concurrency load test.

### Phase 2 — control + audit
Pause/resume/stop on the run, `campaign_events` timeline, retry-failed, per-run history UI.

### Phase 3 — controlled concurrency
Enable N active runs per company; fair round-robin dispatch; crash/redeploy recovery tests.

### Phase 4 — deliverability
Resend webhooks → delivered/bounced/complained ledger; suppression on bounce/complaint;
stage health-gates (canary 200 → ramp 1,000 → remainder).

### Phase 5 — cutover
Make relational tables authoritative; retire the KV campaign/queue path + the every-minute cron.

---

## Status
- Plan: this file.
- Next artifact: `supabase/campaign-engine.sql` (Phase 1 schema) → run it, then wire the snapshot + run API + per-run workflow.
