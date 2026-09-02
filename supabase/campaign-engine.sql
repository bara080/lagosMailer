-- lagosMailer — Multi-Campaign Job Engine, Phase 1 (relational ledger).
-- Run ONCE in the Supabase SQL editor. Additive; does not touch leads/crm_store.
-- Status/enum values are validated in the app layer (kept out of the DB so this
-- file stays simple and paste-safe). See upgrade.md.

create extension if not exists pgcrypto;

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  company text not null,
  name text not null,
  status text not null default 'draft',
  current_version_id uuid,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists campaigns_company_idx on public.campaigns (company, updated_at desc);

create table if not exists public.campaign_versions (
  id uuid primary key default gen_random_uuid(),
  company text not null,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  version integer not null,
  subject text not null default '',
  html_body text not null default '',
  text_body text not null default '',
  sender_key text not null default '',
  provider_key text,
  reply_to text,
  attachment_manifest jsonb not null default '[]'::jsonb,
  personalization_schema jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (campaign_id, version)
);
create index if not exists campaign_versions_company_idx on public.campaign_versions (company, campaign_id);

create table if not exists public.campaign_runs (
  id uuid primary key default gen_random_uuid(),
  company text not null,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  campaign_version_id uuid not null references public.campaign_versions(id),
  status text not null default 'preparing',
  audience_mode text not null default 'all',
  audience_filter jsonb not null default '{}'::jsonb,
  source_run_id uuid,
  duplicate_policy text not null default 'exclude_in_run',
  stage_plan jsonb not null default '[]'::jsonb,
  current_stage integer not null default 0,
  priority integer not null default 100,
  dispatch_chunk_size integer not null default 50,
  max_rate_per_minute integer,
  audience_count integer not null default 0,
  scheduled_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  workflow_run_id text,
  created_by text,
  created_at timestamptz not null default now()
);
create index if not exists campaign_runs_runnable_idx on public.campaign_runs (company, status, priority, scheduled_at);
create index if not exists campaign_runs_campaign_idx on public.campaign_runs (company, campaign_id, created_at desc);

create table if not exists public.campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  company text not null,
  run_id uuid not null references public.campaign_runs(id) on delete cascade,
  campaign_id uuid not null,
  stage_number integer not null default 1,
  lead_id bigint,
  normalized_email text not null,
  personalization jsonb not null default '{}'::jsonb,
  status text not null default 'pending',
  attempt_count integer not null default 0,
  next_attempt_at timestamptz,
  claim_token uuid,
  claim_expires_at timestamptz,
  provider text,
  provider_message_id text,
  last_error_code text,
  last_error_message text,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (run_id, normalized_email)
);
create index if not exists campaign_recipients_claim_idx on public.campaign_recipients (company, run_id, stage_number, status, next_attempt_at);
create index if not exists campaign_recipients_lease_idx on public.campaign_recipients (claim_expires_at) where status in ('claimed','sending');
create index if not exists campaign_recipients_campaign_email_idx on public.campaign_recipients (company, campaign_id, normalized_email, status);

create table if not exists public.suppression_list (
  company text not null,
  normalized_email text not null,
  reason text not null default 'unsubscribe',
  source text,
  created_at timestamptz not null default now(),
  primary key (company, normalized_email)
);

create table if not exists public.quota_buckets (
  company text not null,
  channel text not null default 'email',
  quota_date date not null,
  limit_count integer not null default 1900,
  reserved_count integer not null default 0,
  accepted_count integer not null default 0,
  primary key (company, channel, quota_date)
);

create or replace function public.reserve_quota(p_company text, p_channel text, p_date date, p_want int, p_limit int)
returns int language plpgsql as $$
declare v_limit int; v_reserved int; v_grant int;
begin
  insert into public.quota_buckets (company, channel, quota_date, limit_count)
    values (p_company, p_channel, p_date, p_limit)
    on conflict (company, channel, quota_date) do nothing;
  select limit_count, reserved_count into v_limit, v_reserved
    from public.quota_buckets
    where company = p_company and channel = p_channel and quota_date = p_date
    for update;
  if p_limit > v_limit then v_limit := p_limit; end if;
  v_grant := greatest(0, least(p_want, v_limit - v_reserved));
  update public.quota_buckets set reserved_count = reserved_count + v_grant, limit_count = v_limit
    where company = p_company and channel = p_channel and quota_date = p_date;
  return v_grant;
end; $$;

create or replace function public.release_quota(p_company text, p_channel text, p_date date, p_n int)
returns void language plpgsql as $$
begin
  update public.quota_buckets set reserved_count = greatest(0, reserved_count - p_n)
    where company = p_company and channel = p_channel and quota_date = p_date;
end; $$;

create or replace function public.commit_quota(p_company text, p_channel text, p_date date, p_n int)
returns void language plpgsql as $$
begin
  update public.quota_buckets set accepted_count = accepted_count + p_n
    where company = p_company and channel = p_channel and quota_date = p_date;
end; $$;

create table if not exists public.campaign_events (
  id bigint generated always as identity primary key,
  company text not null,
  run_id uuid,
  stage_number integer,
  batch_id uuid,
  event_type text not null,
  actor_type text not null default 'workflow',
  actor_id text,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists campaign_events_timeline_idx on public.campaign_events (company, run_id, created_at desc);

alter table public.campaigns enable row level security;
alter table public.campaign_versions enable row level security;
alter table public.campaign_runs enable row level security;
alter table public.campaign_recipients enable row level security;
alter table public.suppression_list enable row level security;
alter table public.quota_buckets enable row level security;
alter table public.campaign_events enable row level security;

notify pgrst, 'reload schema';
