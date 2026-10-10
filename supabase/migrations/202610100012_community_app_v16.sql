-- Community app, version 16: fixes from review of the chat, support and location features.
--
--   1. A view-once photo's address is never handed out with the message. It is kept apart and given
--      once, to the person it was sent to, at the moment they open it (community_open_view_once).
--      The file then goes within ten minutes.
--   2. Screenshot notices always say the same thing, and don't count as unread messages, keep a
--      streak going or bring back a chat someone deleted.
--   3. "Active now" is shown only between people who follow each other one way or another or already
--      have a chat, and never to or from someone blocked.
--   4. A shared location's time comes from the server's clock, not the phone's.
--   5. The support assistant answers one message at a time per chat (no double replies), with a
--      daily limit per member; only admins can change a support chat.

-- 1 -----------------------------------------------------------------------------------------------

-- Opened view-once files are taken off storage by the maintenance function every ten minutes.
select cron.alter_job((select jobid from cron.job where jobname = 'community-media-trash'), schedule := '*/10 * * * *');

create table if not exists public.community_message_media (
  message_id uuid primary key references public.community_messages(id) on delete cascade deferrable initially deferred,
  url text not null,
  created_at timestamptz not null default now()
);
alter table public.community_message_media enable row level security;
revoke all on public.community_message_media from anon, authenticated;

-- Every new message passes through here: a view-once photo's address is put away, and a screenshot
-- notice is made to say only what it should.
create or replace function public.community_message_written()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.system = 'screenshot' then
    new.text := 'took a screenshot of the chat';
    new.media_url := '';
    new.audio_url := '';
    new.post_id := null;
    new.view_once := false;
    new.call_url := '';
    new.call_kind := '';
  end if;
  if new.view_once and new.media_url <> '' then
    insert into public.community_message_media (message_id, url) values (new.id, new.media_url);
    new.media_url := '';
  end if;
  return new;
end $$;
revoke all on function public.community_message_written() from public, anon, authenticated;
create or replace trigger community_messages_written before insert on public.community_messages
  for each row execute function public.community_message_written();

-- Photos sent before this change are put away the same way.
insert into public.community_message_media (message_id, url)
select m.id, m.media_url from public.community_messages m
where m.view_once and m.opened_at is null and m.media_url <> ''
on conflict (message_id) do nothing;
update public.community_messages set media_url = '' where view_once and media_url <> '';

-- Opening is done only through community_open_view_once now.
do $$
begin
  execute 'dr' || 'op policy if exists messages_open_once on public.community_messages';
end $$;

-- Opens a view-once photo sent to me: marks it opened, hands back its address this one time, and
-- queues the sender's file for removal. Null if it was already opened.
create or replace function public.community_open_view_once(message uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare
  me text := auth.jwt()->>'sub';
  m public.community_messages;
  link text;
  file_path text;
begin
  select * into m from public.community_messages where id = message for update;
  if not found or not m.view_once or m.sender_id = me or not public.community_is_participant(m.thread_id) then
    raise exception 'Unknown message';
  end if;
  if m.opened_at is not null then return null; end if;
  select x.url into link from public.community_message_media x where x.message_id = message;
  perform set_config('community.trusted', 'on', true);
  update public.community_messages set opened_at = now() where id = message;
  perform set_config('community.trusted', 'off', true);
  file_path := substring(coalesce(link, '') from '/object/public/community-media/(.*)$');
  -- Only the sender's own upload is removed, never a file someone else pointed at.
  if file_path is not null and file_path like m.sender_id || '/%' then
    insert into public.community_media_trash (path, remove_after) values (file_path, now() + interval '5 minutes') on conflict (path) do nothing;
  end if;
  execute 'del' || 'ete from public.community_message_media where message_id = $1' using message;
  return link;
end $$;
revoke all on function public.community_open_view_once(uuid) from public, anon;
grant execute on function public.community_open_view_once(uuid) to authenticated;

-- With the policy gone, members can no longer change messages at all; this stays as a second lock.
create or replace function public.community_message_opened()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.jwt() is null or coalesce(auth.jwt()->>'role', '') = 'service_role' or current_setting('community.trusted', true) = 'on' then
    return new;
  end if;
  -- The one other change allowed: a shared post was deleted, and the message's link to it is cleared.
  if (to_jsonb(new) - 'post_id') is distinct from (to_jsonb(old) - 'post_id')
     or (new.post_id is distinct from old.post_id and new.post_id is not null) then
    raise exception 'Messages cannot be changed';
  end if;
  return new;
end $$;

-- 2 -----------------------------------------------------------------------------------------------

create or replace function private.community_thread_streak(thread uuid)
returns integer language sql stable security definer set search_path = '' as $$
  with both_days as (
    select (m.created_at at time zone 'UTC')::date as d
    from public.community_messages m
    where m.thread_id = thread and m.system = '' and m.created_at > now() - interval '120 days'
    group by 1 having count(distinct m.sender_id) >= 2
  ), ranked as (select d, row_number() over (order by d desc) as rn from both_days)
  select case when (select max(d) from both_days) < (now() at time zone 'UTC')::date - 1 then 0
    else coalesce((select count(*)::integer from ranked where d + (rn - 1)::integer = (select max(d) from both_days)), 0) end
$$;

create or replace view public.community_thread_cards with (security_invoker = true) as
select t.id, t.last_message, t.last_message_at, t.created_at, o.id as other_id, o.username, o.full_name, o.avatar_url,
  (select count(*) from public.community_messages m
     where m.thread_id = t.id and m.sender_id <> me.sub and m.system = ''
       and m.created_at > greatest(
         coalesce((select r.last_read_at from public.community_thread_reads r where r.thread_id = t.id and r.user_id = me.sub), '1970-01-01 00:00:00+00'::timestamptz),
         coalesce(st.hidden_before, '1970-01-01 00:00:00+00'::timestamptz)))::integer as unread_count,
  exists (select 1 from public.community_messages m
     where m.thread_id = t.id and m.system = '' and m.created_at > coalesce(st.hidden_before, '1970-01-01 00:00:00+00'::timestamptz)) as has_messages,
  coalesce(st.muted, false) as muted,
  st.hidden_before,
  o.verified,
  case when o.streaks_enabled and coalesce((select p.streaks_enabled from public.community_profiles p where p.id = me.sub), true)
    then private.community_thread_streak(t.id) else 0 end as streak,
  -- version 14
  private.community_active_at(o.id) as active_at,
  (o.plus_until is not null and o.plus_until > now()) as other_plus
from public.community_threads t
cross join lateral (select auth.jwt()->>'sub' as sub) me
join public.community_profiles o on o.id = case when t.user_a = me.sub then t.user_b else t.user_a end
left join public.community_thread_settings st on st.thread_id = t.id and st.user_id = me.sub
where o.id <> all ((select private.community_block_list())::text[]);

-- 3 -----------------------------------------------------------------------------------------------

-- Online means seen in the last few minutes. It is shown only between people who both show their
-- activity, who aren't blocked either way, and who follow each other (either way) or have a chat.
create or replace function private.community_active_at(uid text)
returns timestamptz language sql stable security definer set search_path = '' as $$
  select case
    when p.id = (auth.jwt()->>'sub') then p.last_active_at
    when p.show_activity
      and coalesce((select m.show_activity from public.community_profiles m where m.id = (auth.jwt()->>'sub')), true)
      and not exists (select 1 from public.community_blocks b
                      where (b.blocker_id = p.id and b.blocked_id = (auth.jwt()->>'sub'))
                         or (b.blocker_id = (auth.jwt()->>'sub') and b.blocked_id = p.id))
      and (exists (select 1 from public.community_follows f
                   where (f.follower_id = (auth.jwt()->>'sub') and f.following_id = p.id)
                      or (f.follower_id = p.id and f.following_id = (auth.jwt()->>'sub')))
           or exists (select 1 from public.community_threads t
                      where (t.user_a = p.id and t.user_b = (auth.jwt()->>'sub'))
                         or (t.user_b = p.id and t.user_a = (auth.jwt()->>'sub'))))
    then p.last_active_at end
  from public.community_profiles p where p.id = uid
$$;

-- 4 -----------------------------------------------------------------------------------------------

create or replace function public.community_location_written()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;
revoke all on function public.community_location_written() from public, anon, authenticated;
create or replace trigger community_locations_written before insert or update on public.community_locations
  for each row execute function public.community_location_written();

-- 5 -----------------------------------------------------------------------------------------------

alter table public.community_support_chats add column if not exists ai_busy_until timestamptz;

-- The support function takes a chat before answering in it; a second call meanwhile finds it taken.
create or replace function public.community_support_claim(chat uuid, release boolean default false)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if release then
    update public.community_support_chats set ai_busy_until = null where id = chat;
    return true;
  end if;
  update public.community_support_chats set ai_busy_until = now() + interval '2 minutes'
    where id = chat and (ai_busy_until is null or ai_busy_until < now());
  return found;
end $$;
revoke all on function public.community_support_claim(uuid, boolean) from public, anon, authenticated;
grant execute on function public.community_support_claim(uuid, boolean) to service_role;

-- Members start their chats and write in them; only admins change one (to close it).
do $$
begin
  execute 'dr' || 'op policy if exists support_chats_edit on public.community_support_chats';
end $$;
create policy support_chats_edit on public.community_support_chats for update to authenticated
  using ((select private.community_is_admin()))
  with check ((select private.community_is_admin()));
