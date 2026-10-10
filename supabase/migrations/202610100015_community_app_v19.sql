-- Community app, version 19: fixes from review of versions 17 and 18.
--
--   1. The under-13 test counts a 13th birthday as reached once it is that date anywhere in the
--      world (UTC+14), so nobody turning 13 today is closed because the server's clock is behind
--      their phone.
--   2. Only the broadcaster can listen on a live's "live:<id>" channel, where viewers' connection
--      details travel; viewers can still send there.
--   3. The member's consent to information that may reveal religious belief is recorded, with when.

-- 1 -----------------------------------------------------------------------------------------------

create or replace function private.community_is_under_13(uid text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select d.birth_date > ((now() at time zone 'Etc/GMT-14')::date - interval '13 years')::date
                   from public.community_private_details d where d.user_id = uid), false)
$$;
revoke all on function private.community_is_under_13(text) from public, anon, authenticated;

create or replace function public.community_birth_date_applied()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.birth_date is not null and new.birth_date > ((now() at time zone 'Etc/GMT-14')::date - interval '13 years')::date then
    -- Under 13 wherever in the world it is today: the account goes now, and can't be switched back on.
    perform set_config('community.trusted', 'on', true);
    update public.community_profiles set under_13 = true, deleted_at = coalesce(deleted_at, now()), is_private = true where id = new.user_id;
    perform set_config('community.trusted', 'off', true);
  elsif new.birth_date is not null and new.birth_date > (current_date - interval '14 years')::date then
    update public.community_profiles set is_private = true where id = new.user_id and not is_private;
  end if;
  return new;
end $$;

-- 2 -----------------------------------------------------------------------------------------------

create or replace function private.community_topic_allowed(topic text, sending boolean)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare kind text := split_part(topic, ':', 1); rest text := split_part(topic, ':', 2); live uuid; host boolean;
begin
  if rest !~ '^[0-9a-fA-F-]{36}$' then return false; end if;
  live := rest::uuid;
  host := exists (select 1 from public.community_lives l where l.id = live and l.user_id = (auth.jwt()->>'sub'));
  if kind = 'live' then
    -- Viewers' messages to the broadcaster: anyone who may watch can send, only the broadcaster listens.
    return case when sending then private.community_can_watch(live) else host end;
  elsif kind = 'livehost' then
    -- The broadcaster's messages to viewers: only the broadcaster sends, anyone who may watch listens.
    return case when sending then host else private.community_can_watch(live) end;
  end if;
  return false;
end $$;

-- 3 -----------------------------------------------------------------------------------------------

alter table public.community_private_details add column if not exists religious_consent_at timestamptz;

-- Records my consent (once; the first time stands).
create or replace function public.community_record_consent()
returns void language plpgsql security definer set search_path = '' as $$
declare me text := auth.jwt()->>'sub';
begin
  if me is null then raise exception 'Sign in first'; end if;
  if not exists (select 1 from public.community_profiles p where p.id = me) then raise exception 'Make your profile first'; end if;
  perform set_config('community.trusted', 'on', true);
  insert into public.community_private_details (user_id, religious_consent_at) values (me, now())
  on conflict (user_id) do update set religious_consent_at = coalesce(public.community_private_details.religious_consent_at, now());
  perform set_config('community.trusted', 'off', true);
end $$;
revoke all on function public.community_record_consent() from public, anon;
grant execute on function public.community_record_consent() to authenticated;
