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

-- ---------------------------------------------------------------------------------------------
-- Sign-in without email (recovery code)
-- Turn on Authentication > Sign In / Providers > "Allow anonymous sign-ins".
-- Each phone gets a private anonymous account. The server makes a random recovery code for it;
-- entering that code on a new phone moves the backups to the new phone's account.
-- Only a hash of the code is stored.
-- ---------------------------------------------------------------------------------------------

create extension if not exists pgcrypto with schema extensions;

-- Stops one account from filling the free 500 MB with a single oversized backup.
alter table public.backups drop constraint if exists backups_data_size;
alter table public.backups add constraint backups_data_size check (pg_column_size(data) < 5000000);

create table if not exists public.recovery_codes (
  user_id   uuid primary key references auth.users (id) on delete cascade,
  code_hash text not null unique
);

-- No policies and no grants: only the functions below can touch this table.
alter table public.recovery_codes enable row level security;
revoke all on public.recovery_codes from anon, authenticated;

create or replace function public.create_recovery_code()
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  me uuid := auth.uid();
  code text;
begin
  if me is null then
    raise exception 'not signed in';
  end if;
  code := upper(encode(gen_random_bytes(12), 'hex'));
  insert into recovery_codes (user_id, code_hash)
    values (me, encode(digest(code, 'sha256'), 'hex'))
    on conflict (user_id) do update set code_hash = excluded.code_hash;
  return code;
end;
$$;

create or replace function public.claim_recovery_code(code text)
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  me uuid := auth.uid();
  owner uuid;
  moved integer;
begin
  if me is null then
    raise exception 'not signed in';
  end if;
  select user_id into owner from recovery_codes
    where code_hash = encode(digest(upper(regexp_replace(code, '[^0-9A-Za-z]', '', 'g')), 'sha256'), 'hex');
  if owner is null then
    raise exception 'invalid recovery code';
  end if;
  if owner = me then
    return (select count(*) from backups where user_id = me);
  end if;
  -- Restoring wins: whatever this account had is replaced by the code's backups.
  delete from backups where user_id = me;
  delete from recovery_codes where user_id = me;
  update backups set user_id = me where user_id = owner;
  get diagnostics moved = row_count;
  update recovery_codes set user_id = me where user_id = owner;
  return moved;
end;
$$;

revoke all on function public.create_recovery_code() from public, anon;
revoke all on function public.claim_recovery_code(text) from public, anon;
grant execute on function public.create_recovery_code() to authenticated;
grant execute on function public.claim_recovery_code(text) to authenticated;
