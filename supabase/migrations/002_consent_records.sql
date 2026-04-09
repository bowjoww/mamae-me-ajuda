-- LGPD consent audit log
-- Stores parental consent records for LGPD compliance.
-- user_id is nullable because consent may be submitted before account creation.
create table if not exists public.consent_records (
  id           uuid primary key default uuid_generate_v4(),
  user_id      uuid references auth.users(id) on delete set null,
  accepted     boolean not null,
  version      text not null check (char_length(version) between 1 and 50),
  accepted_at  timestamptz not null,
  parental_consent boolean not null,
  created_at   timestamptz not null default now()
);

create index on public.consent_records(user_id);
create index on public.consent_records(accepted_at);

-- RLS: users can only read their own consent records; inserts are allowed
-- without auth (for pre-signup consent flows).
alter table public.consent_records enable row level security;

create policy "consent_records_select_own" on public.consent_records
  for select using (auth.uid() = user_id);

-- Allow anonymous inserts so consent can be recorded before signup.
-- The row's user_id will be null in that case.
create policy "consent_records_insert_open" on public.consent_records
  for insert with check (true);
