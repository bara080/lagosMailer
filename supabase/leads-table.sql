-- lagosMailer — real leads table (one row per lead), replacing the crm_store
-- jsonb blob (`${company}:leads`). Run ONCE in the Supabase SQL editor.
--
-- Why: the 63k Native125th import made an ~18 MB jsonb value; a single-row upsert
-- of that size hits Postgres statement timeout. Real rows fix writes and make
-- filtered reads / counts / pagination fast.

create table if not exists public.leads (
  id            bigint       not null,
  company       text         not null,
  business      text         not null default '',
  name          text         not null default '',
  email         text         not null default '',
  phone         text         not null default '',
  instagram     text         not null default '',
  website       text         not null default '',
  borough       text         not null default '',
  category      text         not null default '',
  source        text         not null default 'manual',
  stage         text         not null default 'new',
  subject       text         not null default '',
  notes         text         not null default '',
  contacted_at  timestamptz,
  replied_at    timestamptz,
  created_at    timestamptz  not null default now(),
  primary key (company, id)
);

-- One email per company (case-insensitive). Partial so blank-email leads
-- (instagram-only) don't collide.
create unique index if not exists leads_company_email_uidx
  on public.leads (company, lower(email)) where email <> '';

-- Filtered-read / pagination / rolling-batch indexes.
create index if not exists leads_company_stage_idx     on public.leads (company, stage);
create index if not exists leads_company_created_idx    on public.leads (company, created_at desc);
create index if not exists leads_company_contacted_idx  on public.leads (company, contacted_at);
create index if not exists leads_company_source_idx     on public.leads (company, source);

-- Service-role key bypasses RLS, so no policies are required for the server.
-- (Enable RLS + policies later if the anon key ever touches this table.)
