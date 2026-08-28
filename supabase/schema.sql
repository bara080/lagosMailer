-- lagosMailer data layer schema.
--
-- Run this ONCE in the Supabase SQL editor (Dashboard → SQL Editor → New query)
-- to provision the KV table that backs the CRM store. Each whole-document
-- collection (leads, campaigns, sends, activity, last-blast) is stored as one
-- row: key text primary key, value jsonb.

create table if not exists crm_store (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- Lock the table down. The app connects with the SERVICE ROLE key, which
-- bypasses RLS, so no policies are needed. Enabling RLS blocks the anon key.
alter table crm_store enable row level security;
