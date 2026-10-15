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
  perform drop_family_data(me);
  update backups set user_id = me where user_id = owner;
  get diagnostics moved = row_count;
  update recovery_codes set user_id = me where user_id = owner;
  -- The family membership, shared days and cheers follow the backups to the new account.
  update family_members set user_id = me where user_id = owner;
  update family_days set user_id = me where user_id = owner;
  update kudos set from_user = me where from_user = owner;
  update kudos set to_user = me where to_user = owner;
  return moved;
end;
$$;

revoke all on function public.create_recovery_code() from public, anon;
revoke all on function public.claim_recovery_code(text) from public, anon;
grant execute on function public.create_recovery_code() to authenticated;
grant execute on function public.claim_recovery_code(text) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Family: see each other's progress and send cheers
-- Each person on their own phone joins one family with an invite code. Only a small daily
-- summary is shared (stars, meals logged, water, optional weight), never what anyone ate.
-- Clients can only read these tables; every change goes through the functions below.
-- ---------------------------------------------------------------------------------------------

create table if not exists public.families (
  id          uuid        primary key default gen_random_uuid(),
  name        text        not null check (char_length(name) between 1 and 40),
  invite_code text        not null unique,
  created_at  timestamptz not null default now()
);

create table if not exists public.family_members (
  user_id      uuid    primary key references auth.users (id) on delete cascade,
  family_id    uuid    not null references public.families (id) on delete cascade,
  name         text    not null check (char_length(name) between 1 and 30),
  emoji        text    not null default '🙂' check (char_length(emoji) between 1 and 8),
  -- Weight is only stored while this is on.
  share_weight boolean not null default false,
  joined_on    date    not null default current_date,
  streak       integer not null default 0 check (streak between 0 and 3650)
);
create index if not exists family_members_family_idx on public.family_members (family_id);

create table if not exists public.family_days (
  user_id   uuid     not null references auth.users (id) on delete cascade,
  day       date     not null,
  logged    boolean  not null default false,
  stars     smallint not null default 0 check (stars between 0 and 3),
  meals     smallint not null default 0 check (meals between 0 and 3),
  water_ok  boolean  not null default false,
  weight_kg numeric(5, 1) check (weight_kg is null or weight_kg between 20 and 400),
  primary key (user_id, day)
);

create table if not exists public.kudos (
  id         bigint      generated always as identity primary key,
  family_id  uuid        not null references public.families (id) on delete cascade,
  from_user  uuid        not null references auth.users (id) on delete cascade,
  to_user    uuid        not null references auth.users (id) on delete cascade,
  emoji      text        not null check (char_length(emoji) between 1 and 8),
  message    text        not null default '' check (char_length(message) <= 80),
  created_at timestamptz not null default now(),
  seen_at    timestamptz
);
create index if not exists kudos_to_idx on public.kudos (to_user, created_at desc);

alter table public.families enable row level security;
alter table public.family_members enable row level security;
alter table public.family_days enable row level security;
alter table public.kudos enable row level security;

revoke all on public.families, public.family_members, public.family_days, public.kudos from anon, authenticated;
grant select on public.family_days, public.kudos to authenticated;

-- Helpers run with the function owner's rights so the policies below don't loop on themselves.
create or replace function public.in_my_family(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from family_members m
    where m.user_id = uid
      and m.family_id = (select family_id from family_members where user_id = auth.uid())
  )
$$;

drop policy if exists "family_days_select_family" on public.family_days;
drop policy if exists "kudos_select_own" on public.kudos;
create policy "family_days_select_family" on public.family_days
  for select to authenticated using (public.in_my_family(user_id));
create policy "kudos_select_own" on public.kudos
  for select to authenticated using (to_user = auth.uid() or from_user = auth.uid());

-- Everything about my family in one call: who I am, the family, and its members. Null if I have none.
create or replace function public.family_overview()
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object(
    'me', auth.uid(),
    'family', json_build_object('id', f.id, 'name', f.name, 'invite_code', f.invite_code),
    'members', (
      select coalesce(json_agg(json_build_object(
        'user_id', m.user_id, 'name', m.name, 'emoji', m.emoji,
        'share_weight', m.share_weight, 'joined_on', m.joined_on, 'streak', m.streak
      ) order by m.joined_on, m.name), '[]'::json)
      from family_members m where m.family_id = f.id
    )
  )
  from family_members mine
  join families f on f.id = mine.family_id
  where mine.user_id = auth.uid()
$$;

-- Eight letters and digits without look-alikes (no 0/O, 1/I/L).
create or replace function public.make_invite_code()
returns text
language plpgsql
volatile
set search_path = public, extensions
as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  code text := '';
begin
  for i in 1..8 loop
    code := code || substr(alphabet, 1 + (get_byte(gen_random_bytes(1), 0) % length(alphabet)), 1);
  end loop;
  return code;
end;
$$;

-- Removes one account from its family, with its shared days and cheers; empty families go too.
create or replace function public.drop_family_data(uid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from kudos where from_user = uid or to_user = uid;
  delete from family_days where user_id = uid;
  delete from family_members where user_id = uid;
  delete from families f where not exists (select 1 from family_members m where m.family_id = f.id);
end;
$$;

create or replace function public.create_family(family_name text, my_name text, my_emoji text default '🙂')
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  me uuid := auth.uid();
  fid uuid;
  code text;
begin
  if me is null then raise exception 'thali:Sign in first.'; end if;
  family_name := btrim(coalesce(family_name, ''));
  my_name := btrim(coalesce(my_name, ''));
  if char_length(family_name) not between 1 and 40 then raise exception 'thali:Give the family a name (up to 40 letters).'; end if;
  if char_length(my_name) not between 1 and 30 then raise exception 'thali:Enter your name (up to 30 letters).'; end if;
  if exists (select 1 from family_members where user_id = me) then raise exception 'thali:You are already in a family.'; end if;
  for attempt in 1..5 loop
    code := make_invite_code();
    begin
      insert into families (name, invite_code) values (family_name, code) returning id into fid;
      exit;
    exception when unique_violation then
      fid := null;
    end;
  end loop;
  if fid is null then raise exception 'thali:Could not make an invite code. Try again.'; end if;
  insert into family_members (user_id, family_id, name, emoji) values (me, fid, my_name, coalesce(nullif(btrim(my_emoji), ''), '🙂'));
  return family_overview();
end;
$$;

create or replace function public.join_family(code text, my_name text, my_emoji text default '🙂')
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  fid uuid;
begin
  if me is null then raise exception 'thali:Sign in first.'; end if;
  my_name := btrim(coalesce(my_name, ''));
  if char_length(my_name) not between 1 and 30 then raise exception 'thali:Enter your name (up to 30 letters).'; end if;
  select id into fid from families where invite_code = upper(regexp_replace(coalesce(code, ''), '[^0-9A-Za-z]', '', 'g'));
  if fid is null then raise exception 'thali:That invite code isn''t right.'; end if;
  if exists (select 1 from family_members where user_id = me and family_id <> fid) then
    raise exception 'thali:You are already in another family. Leave it first.';
  end if;
  if not exists (select 1 from family_members where user_id = me) then
    if (select count(*) from family_members where family_id = fid) >= 12 then
      raise exception 'thali:This family is full (12 people).';
    end if;
    insert into family_members (user_id, family_id, name, emoji) values (me, fid, my_name, coalesce(nullif(btrim(my_emoji), ''), '🙂'));
  end if;
  return family_overview();
end;
$$;

create or replace function public.leave_family()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'thali:Sign in first.'; end if;
  perform drop_family_data(auth.uid());
end;
$$;

-- Makes a fresh invite code; the old one stops working.
create or replace function public.new_invite_code()
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  code text;
  fid uuid := (select family_id from family_members where user_id = auth.uid());
begin
  if fid is null then raise exception 'thali:Join a family first.'; end if;
  for attempt in 1..5 loop
    code := make_invite_code();
    begin
      update families set invite_code = code where id = fid;
      return code;
    exception when unique_violation then
      null;
    end;
  end loop;
  raise exception 'thali:Could not make an invite code. Try again.';
end;
$$;

create or replace function public.update_member(my_name text, my_emoji text, my_share_weight boolean, my_streak integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  my_name := btrim(coalesce(my_name, ''));
  if char_length(my_name) not between 1 and 30 then raise exception 'thali:Enter your name (up to 30 letters).'; end if;
  update family_members
    set name = my_name,
        emoji = coalesce(nullif(btrim(my_emoji), ''), '🙂'),
        share_weight = coalesce(my_share_weight, false),
        streak = least(greatest(coalesce(my_streak, 0), 0), 3650)
    where user_id = me;
  if not found then raise exception 'thali:Join a family first.'; end if;
  if not coalesce(my_share_weight, false) then
    update family_days set weight_kg = null where user_id = me and weight_kg is not null;
  end if;
end;
$$;

-- Saves up to ~10 weeks of daily summaries. Weight is dropped unless the person shares it.
create or replace function public.publish_days(days jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  share boolean;
begin
  select share_weight into share from family_members where user_id = me;
  if not found then raise exception 'thali:Join a family first.'; end if;
  if jsonb_typeof(days) <> 'array' or jsonb_array_length(days) > 70 then raise exception 'thali:Too many days.'; end if;
  insert into family_days (user_id, day, logged, stars, meals, water_ok, weight_kg)
  select me,
         (d->>'day')::date,
         coalesce((d->>'logged')::boolean, false),
         least(greatest(coalesce((d->>'stars')::int, 0), 0), 3),
         least(greatest(coalesce((d->>'meals')::int, 0), 0), 3),
         coalesce((d->>'water_ok')::boolean, false),
         case when share then nullif(d->>'weight_kg', '')::numeric(5, 1) else null end
  from jsonb_array_elements(days) d
  where (d->>'day')::date between current_date - 70 and current_date + 2
  on conflict (user_id, day) do update
    set logged = excluded.logged,
        stars = excluded.stars,
        meals = excluded.meals,
        water_ok = excluded.water_ok,
        weight_kg = excluded.weight_kg;
end;
$$;

create or replace function public.send_kudos(to_member uuid, kudos_emoji text, kudos_message text default '')
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  fid uuid := (select family_id from family_members where user_id = auth.uid());
begin
  if fid is null then raise exception 'thali:Join a family first.'; end if;
  if to_member = me or not exists (select 1 from family_members where user_id = to_member and family_id = fid) then
    raise exception 'thali:You can only cheer someone in your family.';
  end if;
  if (select count(*) from kudos where from_user = me and created_at > now() - interval '1 day') >= 30 then
    raise exception 'thali:That is plenty of cheers for today. Try again tomorrow.';
  end if;
  insert into kudos (family_id, from_user, to_user, emoji, message)
    values (fid, me, to_member, kudos_emoji, left(btrim(coalesce(kudos_message, '')), 80));
end;
$$;

create or replace function public.mark_kudos_seen()
returns void
language sql
security definer
set search_path = public
as $$
  update kudos set seen_at = now() where to_user = auth.uid() and seen_at is null
$$;

revoke all on function public.in_my_family(uuid), public.family_overview(), public.make_invite_code(),
  public.drop_family_data(uuid), public.create_family(text, text, text), public.join_family(text, text, text),
  public.leave_family(), public.new_invite_code(), public.update_member(text, text, boolean, integer),
  public.publish_days(jsonb), public.send_kudos(uuid, text, text), public.mark_kudos_seen()
  from public, anon, authenticated;
grant execute on function public.in_my_family(uuid), public.family_overview(), public.create_family(text, text, text),
  public.join_family(text, text, text), public.leave_family(), public.new_invite_code(),
  public.update_member(text, text, boolean, integer), public.publish_days(jsonb),
  public.send_kudos(uuid, text, text), public.mark_kudos_seen()
  to authenticated;
