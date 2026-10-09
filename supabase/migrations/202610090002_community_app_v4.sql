-- Community app, version 4: privacy and safety hardening after an independent review.
-- Applied to the live project as four migrations (community_v4_*). Everything here adds or tightens;
-- nothing is removed.
--
--   1. Blocking works in both directions (see, follow, like, comment, message, notify).
--   2. Nobody can find out whose close friends list they are on.
--   3. A chat cannot be handed to a third person, and rows cannot be dated in the future.
--   4. A creator cannot change a question after someone has seen it and have them "send" the new words.
--   5. Who viewed a post is private to the viewer; the owner only gets totals.
--   6. Reports keep what they were about, and only Clerk accounts can own a profile.

-- ---------------------------------------------------------------------------------------------
-- 1. helpers that are not reachable through the API
-- ---------------------------------------------------------------------------------------------

create schema if not exists private;
grant usage on schema private to authenticated;

-- Everyone the caller has blocked, and everyone who has blocked the caller.
create or replace function private.community_block_list()
returns text[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(x.id), '{}'::text[])
  from (
    select b.blocked_id as id from public.community_blocks b where b.blocker_id = (auth.jwt()->>'sub')
    union
    select b.blocker_id as id from public.community_blocks b where b.blocked_id = (auth.jwt()->>'sub')
  ) x
$$;
revoke all on function private.community_block_list() from public, anon;
grant execute on function private.community_block_list() to authenticated;

-- Whether the caller is on this person's close friends list.
create or replace function private.community_on_close_list(story_owner text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.community_close_friends cf
                 where cf.user_id = story_owner and cf.friend_id = (auth.jwt()->>'sub'))
$$;
revoke all on function private.community_on_close_list(text) from public, anon;
grant execute on function private.community_on_close_list(text) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 2. blocking, both ways
-- ---------------------------------------------------------------------------------------------

-- Neither side reads the other's posts, comments, stories or highlights. The read models inherit this.
create policy posts_not_blocked on public.community_posts as restrictive for select to authenticated
  using (user_id <> all ((select private.community_block_list())::text[]));
create policy comments_not_blocked on public.community_comments as restrictive for select to authenticated
  using (user_id <> all ((select private.community_block_list())::text[]));
create policy stories_not_blocked on public.community_stories as restrictive for select to authenticated
  using (user_id <> all ((select private.community_block_list())::text[]));
create policy highlights_not_blocked on public.community_highlights as restrictive for select to authenticated
  using (user_id <> all ((select private.community_block_list())::text[]));
create policy highlight_items_not_blocked on public.community_highlight_items as restrictive for select to authenticated
  using (user_id <> all ((select private.community_block_list())::text[]));

-- No new follows, chats or messages across a block.
create policy follows_not_blocked on public.community_follows as restrictive for insert to authenticated
  with check (following_id <> all ((select private.community_block_list())::text[]));
create policy messages_not_blocked on public.community_messages as restrictive for insert to authenticated
  with check (not exists (
    select 1 from public.community_threads t
    where t.id = community_messages.thread_id
      and (case when t.user_a = (select auth.jwt()->>'sub') then t.user_b else t.user_a end)
          = any ((select private.community_block_list())::text[])));

-- No likes, comments or reposts on a post the caller cannot read.
create policy likes_on_readable_post on public.community_likes as restrictive for insert to authenticated
  with check (exists (select 1 from public.community_posts p where p.id = community_likes.post_id));
create policy comments_on_readable_post on public.community_comments as restrictive for insert to authenticated
  with check (exists (select 1 from public.community_posts p where p.id = community_comments.post_id));
create policy reposts_on_readable_post on public.community_reposts as restrictive for insert to authenticated
  with check (exists (select 1 from public.community_posts p where p.id = community_reposts.post_id));

-- Follows across a block are hidden from both people, and anyone can remove one of their own followers
-- (the app does that when you block someone).
create policy follows_not_blocked_read on public.community_follows as restrictive for select to authenticated
  using (follower_id <> all ((select private.community_block_list())::text[])
     and following_id <> all ((select private.community_block_list())::text[]));
create policy follows_remove_follower on public.community_follows for delete to authenticated
  using ((select auth.jwt()->>'sub') = following_id);

-- No notifications across a block.
create or replace function public.community_notify()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare owner_id text; actor text;
begin
  if tg_table_name = 'community_follows' then
    owner_id := new.following_id; actor := new.follower_id;
  else
    select user_id into owner_id from public.community_posts where id = new.post_id;
    actor := new.user_id;
  end if;
  if owner_id is null or owner_id = actor then return new; end if;
  if exists (select 1 from public.community_blocks b
             where (b.blocker_id = owner_id and b.blocked_id = actor)
                or (b.blocker_id = actor and b.blocked_id = owner_id)) then
    return new;
  end if;
  if tg_table_name = 'community_follows' then
    insert into public.community_notifications (user_id, actor_id, kind) values (owner_id, actor, 'follow')
    on conflict (user_id, actor_id) where kind = 'follow' do update set created_at = now(), read_at = null;
  elsif tg_table_name = 'community_likes' then
    insert into public.community_notifications (user_id, actor_id, kind, post_id) values (owner_id, actor, 'like', new.post_id)
    on conflict (user_id, actor_id, kind, post_id) where kind in ('like','repost') do update set created_at = now(), read_at = null;
  elsif tg_table_name = 'community_reposts' then
    insert into public.community_notifications (user_id, actor_id, kind, post_id) values (owner_id, actor, 'repost', new.post_id)
    on conflict (user_id, actor_id, kind, post_id) where kind in ('like','repost') do update set created_at = now(), read_at = null;
  elsif tg_table_name = 'community_comments' then
    insert into public.community_notifications (user_id, actor_id, kind, post_id, comment_id, body)
    values (owner_id, actor, 'comment', new.post_id, new.id, left(new.text, 140));
  end if;
  return new;
end $$;
revoke all on function public.community_notify() from public, anon, authenticated;

-- Starting a chat: a clear message across a block, and no UPDATE on the chat row is needed any more.
create or replace function public.community_open_thread(other text)
returns uuid language plpgsql security invoker set search_path to 'public' as $$
declare me text := auth.jwt()->>'sub'; a text; b text; tid uuid;
begin
  if me is null or other is null or me = other then
    raise exception 'A chat needs two different people';
  end if;
  if other = any (private.community_block_list()) then
    raise exception 'You can''t message this account';
  end if;
  if me < other then a := me; b := other; else a := other; b := me; end if;
  select id into tid from public.community_threads where user_a = a and user_b = b;
  if tid is not null then return tid; end if;
  insert into public.community_threads (user_a, user_b) values (a, b)
  on conflict (user_a, user_b) do nothing
  returning id into tid;
  if tid is null then
    select id into tid from public.community_threads where user_a = a and user_b = b;
  end if;
  return tid;
end $$;
revoke all on function public.community_open_thread(text) from public, anon;
grant execute on function public.community_open_thread(text) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 3. chats and timestamps
-- ---------------------------------------------------------------------------------------------

-- A chat row is only ever changed by the database itself (the preview trigger).
create policy threads_no_client_update on public.community_threads as restrictive for update to authenticated
  using (false);

-- New chats start empty and dated now, and not with someone across a block.
create policy threads_start_clean on public.community_threads as restrictive for insert to authenticated
  with check (
    last_message = ''
    and created_at between now() - interval '2 minutes' and now() + interval '2 minutes'
    and last_message_at between now() - interval '2 minutes' and now() + interval '2 minutes'
    and (case when user_a = (select auth.jwt()->>'sub') then user_b else user_a end)
        <> all ((select private.community_block_list())::text[]));

-- Rows cannot be dated in the past or the future by the person inserting them.
create policy posts_dated_now on public.community_posts as restrictive for insert to authenticated
  with check (created_at between now() - interval '2 minutes' and now() + interval '2 minutes');
create policy comments_dated_now on public.community_comments as restrictive for insert to authenticated
  with check (created_at between now() - interval '2 minutes' and now() + interval '2 minutes');
create policy messages_dated_now on public.community_messages as restrictive for insert to authenticated
  with check (created_at between now() - interval '2 minutes' and now() + interval '2 minutes');
create policy stories_dated_now on public.community_stories as restrictive for insert to authenticated
  with check (created_at between now() - interval '2 minutes' and now() + interval '2 minutes'
              and expires_at > now());

-- One story, or one highlight item, cannot be made large enough to hang the people who open it.
alter table public.community_stories add constraint community_stories_item_size
  check (octet_length(item::text) <= 300000) not valid;
alter table public.community_highlight_items add constraint community_highlight_items_item_size
  check (octet_length(item::text) <= 300000) not valid;

-- ---------------------------------------------------------------------------------------------
-- 4. close friends, questions, post views
-- ---------------------------------------------------------------------------------------------

-- Only the owner of a close friends list can read it. Stories check membership through the helper.
alter policy stories_audience on public.community_stories
  using (audience = 'everyone' or user_id = (select auth.jwt()->>'sub') or private.community_on_close_list(user_id));
alter policy close_friends_read on public.community_close_friends
  using ((select auth.jwt()->>'sub') = user_id);

-- Questions are readable only while their owner has them switched on.
alter policy faqs_read on public.community_faqs
  using (user_id = (select auth.jwt()->>'sub')
      or exists (select 1 from public.community_profiles pr where pr.id = community_faqs.user_id and pr.faq_enabled));

-- A question whose wording changes gets a new id, so a chip someone is already looking at
-- stops working instead of sending words they never saw.
create or replace function public.community_faq_fresh_id()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.id := gen_random_uuid();
  elsif new.question is distinct from old.question then
    new.id := gen_random_uuid();
  end if;
  return new;
end $$;
revoke all on function public.community_faq_fresh_id() from public, anon, authenticated;
create or replace trigger community_faqs_fresh_id before insert or update on public.community_faqs
  for each row execute function public.community_faq_fresh_id();

-- Who viewed a post is private to the viewer. The owner sees totals through community_stats and
-- community_post_view_count, which only ever return numbers about the caller's own posts.
alter policy post_views_read on public.community_post_views
  using ((select auth.jwt()->>'sub') = viewer_id);
alter function public.community_stats(timestamptz, timestamptz) security definer;

-- ---------------------------------------------------------------------------------------------
-- 5. reports and profiles
-- ---------------------------------------------------------------------------------------------

-- A report remembers who and what it was about, even after that account or post is deleted.
alter table public.community_reports
  add column if not exists reported_user text,
  add column if not exists reported_post uuid,
  add column if not exists reported_post_owner text;
create or replace function public.community_report_snapshot()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.reported_user := new.target_user_id;
  new.reported_post := new.post_id;
  new.reported_post_owner := null;
  if new.post_id is not null then
    select p.user_id into new.reported_post_owner from public.community_posts p where p.id = new.post_id;
  end if;
  return new;
end $$;
revoke all on function public.community_report_snapshot() from public, anon, authenticated;
create or replace trigger community_reports_snapshot before insert on public.community_reports
  for each row execute function public.community_report_snapshot();

-- Only accounts that signed in through Clerk can own a profile.
alter table public.community_profiles add constraint community_profiles_clerk_id
  check (id like 'user\_%') not valid;

-- ---------------------------------------------------------------------------------------------
-- 6. read models: chats and notifications leave out people across a block
-- ---------------------------------------------------------------------------------------------

create or replace view public.community_thread_cards with (security_invoker = true) as
select t.id, t.last_message, t.last_message_at, t.created_at, o.id as other_id, o.username, o.full_name, o.avatar_url,
  (select count(*) from public.community_messages m
     where m.thread_id = t.id and m.sender_id <> me.sub
       and m.created_at > greatest(
         coalesce((select r.last_read_at from public.community_thread_reads r where r.thread_id = t.id and r.user_id = me.sub), '1970-01-01 00:00:00+00'::timestamptz),
         coalesce(st.hidden_before, '1970-01-01 00:00:00+00'::timestamptz)))::integer as unread_count,
  exists (select 1 from public.community_messages m
     where m.thread_id = t.id and m.created_at > coalesce(st.hidden_before, '1970-01-01 00:00:00+00'::timestamptz)) as has_messages,
  coalesce(st.muted, false) as muted,
  st.hidden_before
from public.community_threads t
cross join lateral (select auth.jwt()->>'sub' as sub) me
join public.community_profiles o on o.id = case when t.user_a = me.sub then t.user_b else t.user_a end
left join public.community_thread_settings st on st.thread_id = t.id and st.user_id = me.sub
where o.id <> all ((select private.community_block_list())::text[]);

create or replace view public.community_notification_cards with (security_invoker = true) as
select n.id, n.user_id, n.actor_id, n.kind, n.post_id, n.body, n.created_at, n.read_at,
  a.username, a.full_name, a.avatar_url,
  (select p.media->0 from public.community_posts p where p.id = n.post_id) as post_media,
  exists (select 1 from public.community_follows f where f.following_id = n.actor_id and f.follower_id = n.user_id) as is_following
from public.community_notifications n
join public.community_profiles a on a.id = n.actor_id
where n.actor_id <> all ((select private.community_block_list())::text[])
  and case n.kind
    when 'like' then exists (select 1 from public.community_likes l where l.user_id = n.actor_id and l.post_id = n.post_id)
    when 'repost' then exists (select 1 from public.community_reposts r where r.user_id = n.actor_id and r.post_id = n.post_id)
    when 'follow' then exists (select 1 from public.community_follows f where f.follower_id = n.actor_id and f.following_id = n.user_id)
    else true end;

revoke all on public.community_thread_cards, public.community_notification_cards from anon;
grant select on public.community_thread_cards, public.community_notification_cards to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 7. functions the API does not need to offer
-- ---------------------------------------------------------------------------------------------

revoke execute on function public.community_touch_thread() from public, anon, authenticated;
revoke execute on function public.community_is_participant(uuid) from public, anon;
grant execute on function public.community_is_participant(uuid) to authenticated;
