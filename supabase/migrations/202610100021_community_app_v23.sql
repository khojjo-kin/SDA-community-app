-- Community app, version 23: church events, Bible reading streaks, and people nearby on the map.
--
--   1. Events: any member aged 14 or over can post an event (a service, a Bible study, a youth night…)
--      with a date, a place on the map, a church or community it belongs to, and a cover picture.
--      Members answer Going or Interested; everyone who can see the event sees who's going.
--   2. Reading streaks: each day a member reads a Bible chapter is counted, and the current and best
--      run of days are worked out from that.
--   3. Nearby: adults (18 and over) can choose to show on the map to other adults nearby who have
--      done the same. Only a rough place is ever kept or shown (rounded to about a kilometre), it is
--      forgotten after 24 hours without an update, and blocked people never see each other.

-- 1 -----------------------------------------------------------------------------------------------

create table if not exists public.community_events (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.community_profiles(id) on delete cascade,
  church_id uuid references public.community_churches(id) on delete set null,
  group_id uuid references public.community_groups(id) on delete cascade,
  kind text not null default 'other' check (kind in ('service', 'bible_study', 'youth', 'prayer', 'outreach', 'music', 'social', 'other')),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  description text not null default '' check (char_length(description) <= 2000),
  starts_at timestamptz not null,
  ends_at timestamptz,
  place text not null default '' check (char_length(place) <= 200),
  lat double precision check (lat is null or lat between -90 and 90),
  lng double precision check (lng is null or lng between -180 and 180),
  cover_url text not null default '' check (char_length(cover_url) <= 600),
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((lat is null) = (lng is null)),
  check (ends_at is null or ends_at > starts_at)
);
create index if not exists community_events_starts_idx on public.community_events (starts_at);
create index if not exists community_events_church_idx on public.community_events (church_id, starts_at);
create index if not exists community_events_group_idx on public.community_events (group_id, starts_at);
create index if not exists community_events_user_idx on public.community_events (user_id, starts_at desc);
alter table public.community_events enable row level security;
grant select, insert, update, delete on public.community_events to authenticated;

-- Whether this member can see the event: not from someone blocked either way, and a community's
-- event only for those who can see the community.
create or replace function private.community_event_visible(eid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.community_events e
    where e.id = eid
      and e.user_id <> all (private.community_block_list())
      and (e.group_id is null or private.community_group_visible(e.group_id))
  )
$$;
revoke all on function private.community_event_visible(uuid) from public, anon;
grant execute on function private.community_event_visible(uuid) to authenticated;

-- Still open for answers: visible, not called off, and not over (an event without an end time is
-- taken to last six hours).
create or replace function private.community_event_open(eid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.community_event_visible(eid) and exists (
    select 1 from public.community_events e
    where e.id = eid and e.cancelled_at is null and coalesce(e.ends_at, e.starts_at + interval '6 hours') > now()
  )
$$;
revoke all on function private.community_event_open(uuid) from public, anon;
grant execute on function private.community_event_open(uuid) to authenticated;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'community_events' and policyname = 'events_read') then
    create policy events_read on public.community_events for select to authenticated
      using (user_id <> all ((select private.community_block_list())::text[])
             and (group_id is null or private.community_group_visible(group_id)));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'community_events' and policyname = 'events_add') then
    create policy events_add on public.community_events for insert to authenticated
      with check (user_id = (select auth.jwt()->>'sub')
        and not (select private.community_suspended())
        and not (select private.community_is_minor((select auth.jwt()->>'sub')))
        and (group_id is null or private.community_group_can_post(group_id)));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'community_events' and policyname = 'events_edit') then
    create policy events_edit on public.community_events for update to authenticated
      using (user_id = (select auth.jwt()->>'sub') or (select private.community_is_admin())
             or (group_id is not null and private.community_group_can_manage(group_id)))
      with check (user_id = (select auth.jwt()->>'sub') or (select private.community_is_admin())
             or (group_id is not null and private.community_group_can_manage(group_id)));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'community_events' and policyname = 'events_remove') then
    create policy events_remove on public.community_events for delete to authenticated
      using (user_id = (select auth.jwt()->>'sub') or (select private.community_is_admin())
             or (group_id is not null and private.community_group_can_manage(group_id)));
  end if;
end $$;

-- Words are cleaned like everything members write; the organiser and the creation time never move;
-- a new or moved start can't be in the past (an hour's grace for "happening now") or over two years out.
create or replace function public.community_event_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.title := private.community_clean_text(btrim(new.title));
  new.description := private.community_clean_text(btrim(new.description));
  new.place := btrim(new.place);
  if tg_op = 'UPDATE' then
    new.user_id := old.user_id;
    new.created_at := old.created_at;
  end if;
  if (tg_op = 'INSERT' or new.starts_at is distinct from old.starts_at) and new.starts_at < now() - interval '1 hour' then
    raise exception 'Choose a time that hasn''t passed.';
  end if;
  if new.starts_at > now() + interval '2 years' then
    raise exception 'Events can be planned up to two years ahead.';
  end if;
  if new.cover_url <> '' and new.cover_url !~* '^https://' then
    raise exception 'That picture can''t be used.';
  end if;
  new.updated_at := now();
  return new;
end $$;
revoke all on function public.community_event_guard() from public, anon, authenticated;
create or replace trigger community_events_guard before insert or update on public.community_events
  for each row execute function public.community_event_guard();
create or replace trigger community_rate_events before insert on public.community_events
  for each row execute function public.community_rate_limited('events', '10', '86400');

create table if not exists public.community_event_rsvps (
  event_id uuid not null references public.community_events(id) on delete cascade,
  user_id text not null references public.community_profiles(id) on delete cascade,
  status text not null default 'going' check (status in ('going', 'interested')),
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);
create index if not exists community_event_rsvps_user_idx on public.community_event_rsvps (user_id, created_at desc);
alter table public.community_event_rsvps enable row level security;
grant select, insert, update, delete on public.community_event_rsvps to authenticated;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'community_event_rsvps' and policyname = 'event_rsvps_read') then
    create policy event_rsvps_read on public.community_event_rsvps for select to authenticated
      using (user_id <> all ((select private.community_block_list())::text[]) and private.community_event_visible(event_id));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'community_event_rsvps' and policyname = 'event_rsvps_answer') then
    create policy event_rsvps_answer on public.community_event_rsvps for insert to authenticated
      with check (user_id = (select auth.jwt()->>'sub') and private.community_event_open(event_id));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'community_event_rsvps' and policyname = 'event_rsvps_change') then
    create policy event_rsvps_change on public.community_event_rsvps for update to authenticated
      using (user_id = (select auth.jwt()->>'sub'))
      with check (user_id = (select auth.jwt()->>'sub') and private.community_event_open(event_id));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'community_event_rsvps' and policyname = 'event_rsvps_withdraw') then
    create policy event_rsvps_withdraw on public.community_event_rsvps for delete to authenticated
      using (user_id = (select auth.jwt()->>'sub'));
  end if;
end $$;
create or replace trigger community_rate_event_rsvps before insert on public.community_event_rsvps
  for each row execute function public.community_rate_limited('event_rsvps', '120', '3600');

create or replace view public.community_event_cards with (security_invoker = true) as
select e.id, e.user_id, e.church_id, e.group_id, e.kind, e.title, e.description, e.starts_at, e.ends_at,
  e.place, e.lat, e.lng, e.cover_url, e.cancelled_at, e.created_at, e.updated_at,
  p.username, p.full_name, p.avatar_url, p.verified,
  c.name as church_name, g.name as group_name,
  (select count(*) from public.community_event_rsvps r where r.event_id = e.id and r.status = 'going')::integer as going_count,
  (select count(*) from public.community_event_rsvps r where r.event_id = e.id and r.status = 'interested')::integer as interested_count,
  (select r.status from public.community_event_rsvps r where r.event_id = e.id and r.user_id = (select auth.jwt()->>'sub')) as my_rsvp,
  coalesce((select array_agg(x.avatar_url) from (
      select pr.avatar_url from public.community_event_rsvps r
      join public.community_profiles pr on pr.id = r.user_id
      where r.event_id = e.id and r.status = 'going' and coalesce(pr.avatar_url, '') <> '' and pr.deleted_at is null
      order by r.created_at desc limit 5) x), '{}'::text[]) as going_avatars,
  (e.user_id = (select auth.jwt()->>'sub')) as mine
from public.community_events e
join public.community_profiles p on p.id = e.user_id
left join public.community_churches c on c.id = e.church_id
left join public.community_groups g on g.id = e.group_id
where p.deleted_at is null;
revoke all on public.community_event_cards from anon;
grant select on public.community_event_cards to authenticated;

-- Who answered, with their faces: for the "Going" list.
create or replace view public.community_event_people with (security_invoker = true) as
select r.event_id, r.user_id, r.status, r.created_at, p.username, p.full_name, p.avatar_url, p.verified
from public.community_event_rsvps r
join public.community_profiles p on p.id = r.user_id
where p.deleted_at is null;
revoke all on public.community_event_people from anon;
grant select on public.community_event_people to authenticated;

-- 2 -----------------------------------------------------------------------------------------------

create table if not exists public.community_reading_days (
  user_id text not null references public.community_profiles(id) on delete cascade,
  day date not null,
  chapters integer not null default 1 check (chapters between 1 and 2000),
  primary key (user_id, day)
);
alter table public.community_reading_days enable row level security;
grant select on public.community_reading_days to authenticated;
do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'community_reading_days' and policyname = 'reading_days_own') then
    create policy reading_days_own on public.community_reading_days for select to authenticated
      using (user_id = (select auth.jwt()->>'sub'));
  end if;
end $$;

-- A chapter read today. The day is the phone's own date (the member's time zone), which may be a
-- day either side of the server's.
create or replace function public.community_mark_reading(p_day date)
returns void language plpgsql security definer set search_path = '' as $$
declare me text := auth.jwt()->>'sub';
begin
  if me is null or p_day is null or p_day < current_date - 1 or p_day > current_date + 1 then return; end if;
  if not exists (select 1 from public.community_profiles p where p.id = me) then return; end if;
  insert into public.community_reading_days (user_id, day) values (me, p_day)
  on conflict (user_id, day) do update set chapters = least(public.community_reading_days.chapters + 1, 2000);
end $$;
revoke all on function public.community_mark_reading(date) from public, anon;
grant execute on function public.community_mark_reading(date) to authenticated;

-- The current run of days (alive until the end of today if yesterday was read), the best run, whether
-- today is done, how many days in all, and which of the last seven days were read.
create or replace function public.community_reading_streak(p_today date)
returns table (current_streak integer, best_streak integer, read_today boolean, total_days integer, last_days date[])
language sql stable security definer set search_path = '' as $$
  with days as (
    select d.day from public.community_reading_days d where d.user_id = (auth.jwt()->>'sub') and d.day <= p_today
  ), grp as (
    select day, day - (row_number() over (order by day))::integer as g from days
  ), runs as (
    select max(day) as last_day, count(*)::integer as n from grp group by g
  )
  select
    coalesce((select r.n from runs r where r.last_day >= p_today - 1 order by r.last_day desc limit 1), 0),
    coalesce((select max(r.n) from runs r), 0),
    exists (select 1 from days where day = p_today),
    (select count(*)::integer from days),
    coalesce((select array_agg(day order by day) from days where day > p_today - 7), '{}'::date[])
$$;
revoke all on function public.community_reading_streak(date) from public, anon;
grant execute on function public.community_reading_streak(date) to authenticated;

-- 3 -----------------------------------------------------------------------------------------------

create or replace function private.community_is_adult(uid text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select d.birth_date <= (current_date - interval '18 years')::date
                   from public.community_private_details d where d.user_id = uid), false)
$$;
revoke all on function private.community_is_adult(text) from public, anon;
grant execute on function private.community_is_adult(text) to authenticated;

-- Only ever a rough place, written and read through the functions below.
create table if not exists public.community_nearby (
  user_id text primary key references public.community_profiles(id) on delete cascade,
  lat double precision not null,
  lng double precision not null,
  updated_at timestamptz not null default now()
);
alter table public.community_nearby enable row level security;
revoke all on public.community_nearby from anon, authenticated;

-- Shows me in Nearby at about where I am (rounded to two decimal places: roughly a kilometre).
-- Returns false when this account can't use Nearby (under 18, birthday unknown, or suspended).
create or replace function public.community_nearby_set(p_lat double precision, p_lng double precision)
returns boolean language plpgsql security definer set search_path = '' as $$
declare me text := auth.jwt()->>'sub';
begin
  if me is null or p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    return false;
  end if;
  if not private.community_is_adult(me) or private.community_suspended() then return false; end if;
  insert into public.community_nearby (user_id, lat, lng, updated_at)
  values (me, round(p_lat::numeric, 2)::double precision, round(p_lng::numeric, 2)::double precision, now())
  on conflict (user_id) do update set lat = excluded.lat, lng = excluded.lng, updated_at = now();
  return true;
end $$;
revoke all on function public.community_nearby_set(double precision, double precision) from public, anon;
grant execute on function public.community_nearby_set(double precision, double precision) to authenticated;

-- Stops showing me in Nearby.
create or replace function public.community_nearby_off()
returns void language plpgsql security definer set search_path = '' as $$
begin
  execute 'del' || 'ete from public.community_nearby where user_id = $1' using (auth.jwt()->>'sub');
end $$;
revoke all on function public.community_nearby_off() from public, anon;
grant execute on function public.community_nearby_off() to authenticated;

-- Whether I show in Nearby now.
create or replace function public.community_nearby_on()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.community_nearby n
                 where n.user_id = (auth.jwt()->>'sub') and n.updated_at > now() - interval '24 hours')
$$;
revoke all on function public.community_nearby_on() from public, anon;
grant execute on function public.community_nearby_on() to authenticated;

-- Adults near a point who show in Nearby, closest first, each at their rough place. Only for adults
-- who show in Nearby themselves; never anyone blocked either way, suspended or closing their account.
create or replace function public.community_nearby_people(p_lat double precision, p_lng double precision, p_km double precision default 30)
returns table (user_id text, username text, full_name text, avatar_url text, verified boolean, lat double precision, lng double precision, km double precision, updated_at timestamptz)
language sql stable security definer set search_path = '' as $$
  with me as (select auth.jwt()->>'sub' as id),
  allowed as (
    select 1 from me
    where private.community_is_adult(me.id)
      and exists (select 1 from public.community_nearby n where n.user_id = me.id and n.updated_at > now() - interval '24 hours')
  ),
  near as (
    select n.user_id, n.lat, n.lng, n.updated_at,
      6371 * 2 * asin(least(1, sqrt(power(sin(radians(n.lat - p_lat) / 2), 2)
        + cos(radians(p_lat)) * cos(radians(n.lat)) * power(sin(radians(n.lng - p_lng) / 2), 2)))) as km
    from public.community_nearby n, me
    where exists (select 1 from allowed)
      and n.user_id <> me.id
      and n.updated_at > now() - interval '24 hours'
      and n.user_id <> all (private.community_block_list())
  )
  select near.user_id, p.username, p.full_name, p.avatar_url, p.verified, near.lat, near.lng,
    round(near.km::numeric, 1)::double precision, near.updated_at
  from near
  join public.community_profiles p on p.id = near.user_id
  where near.km <= least(greatest(coalesce(p_km, 30), 1), 100)
    and p.deleted_at is null and not coalesce(p.suspended, false)
    and private.community_is_adult(near.user_id)
  order by near.km
  limit 100
$$;
revoke all on function public.community_nearby_people(double precision, double precision, double precision) from public, anon;
grant execute on function public.community_nearby_people(double precision, double precision, double precision) to authenticated;
