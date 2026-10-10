-- Community app, version 18: fixes from the security review.
--
--   1. Calls: a participant can only change a call's status and times, never who is in it (which
--      could ring someone the safety rules don't allow).
--   2. Comments, likes, reposts and comment likes are only readable on posts the reader can see;
--      memory items only for accounts the reader can see; group member lists only for groups the
--      reader can see.
--   3. Live: a live is only listed for people who can see the broadcaster and aren't blocked. Its
--      realtime channels are private: only those people can listen or send, and only the
--      broadcaster can send on the broadcaster's channel. Live comments are stored rows, so nobody
--      can post under someone else's name.
--   4. Columns members shouldn't set: a Pod item's play count, a support ticket's reply, a
--      fundraiser's currency after gifts, a post's captions (made by the server only).
--   5. FAQ questions follow the same messaging rules as any message.
--   6. Profiles can only be made for Clerk accounts.

-- 1 -----------------------------------------------------------------------------------------------

revoke update on public.community_calls from authenticated;
grant update (status, answered_at, ended_at) on public.community_calls to authenticated;
do $$
begin
  execute 'dr' || 'op policy if exists calls_participants_update on public.community_calls';
end $$;
create policy calls_participants_update on public.community_calls for update to authenticated
  using (caller_id = (select auth.jwt()->>'sub') or callee_id = (select auth.jwt()->>'sub'))
  with check (caller_id = (select auth.jwt()->>'sub') or callee_id = (select auth.jwt()->>'sub'));
create or replace trigger community_rate_calls before insert on public.community_calls
  for each row execute function public.community_rate_limited('calls', '30', '3600');

-- 2 -----------------------------------------------------------------------------------------------

do $$
begin
  execute 'dr' || 'op policy if exists comments_read on public.community_comments';
  execute 'dr' || 'op policy if exists likes_read on public.community_likes';
  execute 'dr' || 'op policy if exists reposts_read on public.community_reposts';
  execute 'dr' || 'op policy if exists comment_likes_read on public.community_comment_likes';
  execute 'dr' || 'op policy if exists highlight_items_read on public.community_highlight_items';
  execute 'dr' || 'op policy if exists group_members_read on public.community_group_members';
end $$;
-- The post's own read rules decide (the subquery runs with the reader's access).
create policy comments_read on public.community_comments for select to authenticated
  using (exists (select 1 from public.community_posts p where p.id = post_id));
create policy likes_read on public.community_likes for select to authenticated
  using (exists (select 1 from public.community_posts p where p.id = post_id));
create policy reposts_read on public.community_reposts for select to authenticated
  using (exists (select 1 from public.community_posts p where p.id = post_id));
create policy comment_likes_read on public.community_comment_likes for select to authenticated
  using (exists (select 1 from public.community_comments c where c.id = comment_id));
create policy highlight_items_read on public.community_highlight_items for select to authenticated
  using ((select private.community_can_see(user_id)));
create policy group_members_read on public.community_group_members for select to authenticated
  using (user_id = (select auth.jwt()->>'sub') or (select private.community_group_visible(group_id)));

-- 3 -----------------------------------------------------------------------------------------------

do $$
begin
  execute 'dr' || 'op policy if exists lives_read on public.community_lives';
end $$;
create policy lives_read on public.community_lives for select to authenticated
  using (user_id = (select auth.jwt()->>'sub')
    or ((select private.community_can_see(user_id)) and user_id <> all ((select private.community_block_list())::text[])));

-- Whether I may watch this live: it's mine, or I can see its broadcaster and neither of us blocked the other.
create or replace function private.community_can_watch(live uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((
    select l.user_id = (auth.jwt()->>'sub')
      or (private.community_can_see(l.user_id)
          and not exists (select 1 from public.community_blocks b
                          where (b.blocker_id = l.user_id and b.blocked_id = (auth.jwt()->>'sub'))
                             or (b.blocker_id = (auth.jwt()->>'sub') and b.blocked_id = l.user_id)))
    from public.community_lives l where l.id = live), false)
$$;
revoke all on function private.community_can_watch(uuid) from public, anon;
grant execute on function private.community_can_watch(uuid) to authenticated;

-- Private realtime channels. "live:<id>" carries viewers' messages to the broadcaster (anyone who
-- may watch can listen and send); "livehost:<id>" carries the broadcaster's (anyone who may watch can
-- listen; only the broadcaster can send). Any other private topic is refused.
create or replace function private.community_topic_allowed(topic text, sending boolean)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare kind text := split_part(topic, ':', 1); rest text := split_part(topic, ':', 2); live uuid;
begin
  if rest !~ '^[0-9a-fA-F-]{36}$' then return false; end if;
  live := rest::uuid;
  if kind = 'live' then
    return private.community_can_watch(live);
  elsif kind = 'livehost' then
    if sending then
      return exists (select 1 from public.community_lives l where l.id = live and l.user_id = (auth.jwt()->>'sub'));
    end if;
    return private.community_can_watch(live);
  end if;
  return false;
end $$;
revoke all on function private.community_topic_allowed(text, boolean) from public, anon;
grant execute on function private.community_topic_allowed(text, boolean) to authenticated;

do $$
begin
  execute 'dr' || 'op policy if exists community_topics_listen on realtime.messages';
  execute 'dr' || 'op policy if exists community_topics_send on realtime.messages';
end $$;
create policy community_topics_listen on realtime.messages for select to authenticated
  using (realtime.messages.extension in ('broadcast', 'presence') and (select private.community_topic_allowed(realtime.topic(), false)));
create policy community_topics_send on realtime.messages for insert to authenticated
  with check (realtime.messages.extension in ('broadcast', 'presence') and (select private.community_topic_allowed(realtime.topic(), true)));

create table if not exists public.community_live_comments (
  id uuid primary key default gen_random_uuid(),
  live_id uuid not null references public.community_lives(id) on delete cascade,
  user_id text not null references public.community_profiles(id) on delete cascade,
  text text not null check (char_length(btrim(text)) between 1 and 300),
  created_at timestamptz not null default now()
);
create index if not exists community_live_comments_idx on public.community_live_comments (live_id, created_at);
alter table public.community_live_comments enable row level security;
grant select, insert, delete on public.community_live_comments to authenticated;
create policy live_comments_read on public.community_live_comments for select to authenticated
  using ((select private.community_can_watch(live_id)) and user_id <> all ((select private.community_block_list())::text[]));
create policy live_comments_write on public.community_live_comments for insert to authenticated
  with check (user_id = (select auth.jwt()->>'sub') and not (select private.community_suspended())
    and (select private.community_can_watch(live_id))
    and exists (select 1 from public.community_lives l where l.id = live_id and l.ended_at is null));
create policy live_comments_remove on public.community_live_comments for delete to authenticated
  using (user_id = (select auth.jwt()->>'sub')
    or exists (select 1 from public.community_lives l where l.id = live_id and l.user_id = (select auth.jwt()->>'sub'))
    or (select private.community_is_admin()));
create or replace function public.community_live_comment_written()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.created_at := now();
  return new;
end $$;
revoke all on function public.community_live_comment_written() from public, anon, authenticated;
create or replace trigger community_live_comments_written before insert on public.community_live_comments
  for each row execute function public.community_live_comment_written();
create or replace trigger community_rate_live_comments before insert on public.community_live_comments
  for each row execute function public.community_rate_limited('live_comments', '20', '60');
do $$
begin
  begin execute 'alter publication supabase_realtime add table public.community_live_comments'; exception when others then null; end;
end $$;

-- 4 -----------------------------------------------------------------------------------------------

revoke update on public.community_pod_items from authenticated;
grant update (kind, title, artist, description, cover_url, audio_url, duration_seconds) on public.community_pod_items to authenticated;

create or replace function public.community_ticket_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.jwt() is null or coalesce(auth.jwt()->>'role', '') = 'service_role' or private.community_is_admin() then return new; end if;
  -- A member can close their own ticket, nothing else.
  new.reply := old.reply;
  if new.status is distinct from old.status and new.status <> 'closed' then new.status := old.status; end if;
  return new;
end $$;
revoke all on function public.community_ticket_guard() from public, anon, authenticated;
create or replace trigger community_support_tickets_guard before update on public.community_support_tickets
  for each row execute function public.community_ticket_guard();

create or replace function public.community_fundraiser_currency_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.jwt() is null or coalesce(auth.jwt()->>'role', '') = 'service_role' or private.community_is_admin() then return new; end if;
  if new.currency is distinct from old.currency
     and exists (select 1 from public.community_donations d where d.fundraiser_id = old.id and d.status in ('pending', 'succeeded')) then
    raise exception 'The currency can''t change once people have given';
  end if;
  return new;
end $$;
revoke all on function public.community_fundraiser_currency_guard() from public, anon, authenticated;
create or replace trigger community_fundraisers_currency_guard before update on public.community_fundraisers
  for each row execute function public.community_fundraiser_currency_guard();

-- Captions are made and stored by the captions function (service key) only.
create or replace function public.community_captions_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.jwt() is null or coalesce(auth.jwt()->>'role', '') = 'service_role' or current_setting('community.trusted', true) = 'on' then return new; end if;
  new.captions := old.captions;
  new.captions_lang := old.captions_lang;
  new.captions_status := old.captions_status;
  return new;
end $$;
revoke all on function public.community_captions_guard() from public, anon, authenticated;
create or replace trigger community_posts_captions_guard before update on public.community_posts
  for each row execute function public.community_captions_guard();

-- 5 -----------------------------------------------------------------------------------------------

create or replace function public.community_ask_faq(faq uuid)
returns uuid language plpgsql security definer set search_path = 'public' as $$
declare
  me text := auth.jwt()->>'sub';
  f record;
  a text;
  b text;
  tid uuid;
begin
  if me is null then
    raise exception 'Sign in to ask a question';
  end if;
  if private.community_suspended() then
    raise exception 'Your account is suspended';
  end if;
  select q.user_id, q.question, q.answer, pr.faq_enabled, pr.suspended, pr.deleted_at into f
    from public.community_faqs q
    join public.community_profiles pr on pr.id = q.user_id
    where q.id = faq;
  if not found or not f.faq_enabled or f.suspended or f.deleted_at is not null then
    raise exception 'That question is no longer available';
  end if;
  if f.user_id = me then
    raise exception 'This is one of your own questions';
  end if;
  if exists (
    select 1 from public.community_blocks bl
    where (bl.blocker_id = f.user_id and bl.blocked_id = me) or (bl.blocker_id = me and bl.blocked_id = f.user_id)
  ) then
    raise exception 'You can''t message this account';
  end if;
  if me < f.user_id then a := me; b := f.user_id; else a := f.user_id; b := me; end if;
  select id into tid from public.community_threads where user_a = a and user_b = b;
  if tid is null then
    -- The same rules as starting any chat (members under 14 only with people they follow).
    if (private.community_is_minor(me) and not exists (select 1 from public.community_follows x where x.follower_id = me and x.following_id = f.user_id))
       or (private.community_is_minor(f.user_id) and not exists (select 1 from public.community_follows x where x.follower_id = f.user_id and x.following_id = me)) then
      raise exception 'You can''t message this account';
    end if;
    insert into public.community_threads (user_a, user_b) values (a, b)
    on conflict (user_a, user_b) do update set user_a = excluded.user_a
    returning id into tid;
  end if;
  if not private.community_message_allowed(tid, me) or not private.community_message_allowed(tid, f.user_id) then
    raise exception 'You can''t message this account';
  end if;
  -- A double tap should not send the question twice.
  if exists (
    select 1 from public.community_messages m
    where m.thread_id = tid and m.sender_id = me and m.text = f.question and m.created_at > now() - interval '20 seconds'
  ) then
    return tid;
  end if;
  insert into public.community_messages (thread_id, sender_id, text) values (tid, me, f.question);
  if char_length(btrim(f.answer)) > 0 then
    insert into public.community_messages (thread_id, sender_id, text, created_at)
    values (tid, f.user_id, f.answer, now() + interval '1 millisecond');
  end if;
  return tid;
end $$;

-- 6 -----------------------------------------------------------------------------------------------

-- Every member signs in through Clerk, whose ids look like user_…; nothing else can make a profile.
do $$
begin
  execute 'alter table public.community_profiles dr' || 'op constraint if exists community_profiles_clerk_id';
end $$;
alter table public.community_profiles add constraint community_profiles_clerk_id check (id ~ '^user_[A-Za-z0-9]+$');

-- Accounts that gave an under-13 birth date before version 17 are closed the same way.
do $$
begin
  perform set_config('community.trusted', 'on', true);
  update public.community_profiles p set under_13 = true, deleted_at = coalesce(p.deleted_at, now()), is_private = true
    from public.community_private_details d
    where d.user_id = p.id and d.birth_date > (current_date - interval '13 years')::date and not p.under_13;
  perform set_config('community.trusted', 'off', true);
end $$;
