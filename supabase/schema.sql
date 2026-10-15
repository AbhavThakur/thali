-- Run this once in the Supabase SQL editor (Project → SQL Editor → New query).
-- One row per person per account. Row-level security means each signed-in user can only
-- ever read or change their own rows, so the public anon key can't expose anyone's data.

create table if not exists public.backups (
  user_id     uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  profile_key text        not null,
  name        text        not null default '',
  data        jsonb       not null,
  updated_at  timestamptz not null default now(),
  primary key (user_id, profile_key)
);

alter table public.backups enable row level security;

drop policy if exists "backups_select_own" on public.backups;
drop policy if exists "backups_insert_own" on public.backups;
drop policy if exists "backups_update_own" on public.backups;
drop policy if exists "backups_delete_own" on public.backups;

create policy "backups_select_own" on public.backups
  for select to authenticated using (auth.uid() = user_id);
create policy "backups_insert_own" on public.backups
  for insert to authenticated with check (auth.uid() = user_id);
create policy "backups_update_own" on public.backups
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "backups_delete_own" on public.backups
  for delete to authenticated using (auth.uid() = user_id);

-- The anon role must not touch the table at all.
revoke all on public.backups from anon;
grant select, insert, update, delete on public.backups to authenticated;

-- A harmless ping that touches the database. The GitHub Action calls it twice a week so the
-- free project never counts as inactive (Supabase pauses free projects after 7 days of silence).
create or replace function public.keepalive()
returns timestamptz
language sql
stable
as $$ select now() $$;

grant execute on function public.keepalive() to anon, authenticated;
