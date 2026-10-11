-- Community app, version 24: message requests, mute, restrict, and "Liked by".
--
--   1. Mute: a member can mute someone's posts, their stories, or both. Muted posts stay off every
--      feed and muted stories off the story tray; their profile still shows both. Nobody is told.
--   2. Restrict: a member can restrict someone. That person's comments on the member's posts are seen
--      only by the two of them (and don't notify the member), their messages arrive as requests, and
--      they can't see when the member is active or has read their messages. Nobody is told.
--   3. Message requests: a chat someone else started, that you haven't answered or accepted, from
--      someone you don't follow (or have restricted), waits in its own folder. Until it is accepted
--      the sender can't see that it was read. community_accept_request() moves it into the inbox.
--   4. Liked by: a post says which of the people you follow liked it last, for "Liked by … and others".
--
-- The read models are replaced in place: their existing columns stay exactly as they were, in the
-- same order, and the new ones are added at the end.

-- 1 and 2: the tables -----------------------------------------------------------------------------

create table if not exists public.community_mutes (
  muter_id text not null references public.community_profiles(id) on delete cascade,
  muted_id text not null references public.community_profiles(id) on delete cascade,
  posts boolean not null default false,
  stories boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (muter_id, muted_id),
  check (muter_id <> muted_id),
  -- Unmuting both removes the row (setMute in the app), so a row always mutes something.
  check (posts or stories)
);
-- The primary key serves "whom have I muted"; this one "who has muted this account" (removing an account).
create index if not exists community_mutes_muted_idx on public.community_mutes (muted_id);
alter table public.community_mutes enable row level security;
revoke all on public.community_mutes from anon;
grant select, insert, update, delete on public.community_mutes to authenticated;

create table if not exists public.community_restricts (
  restricter_id text not null references public.community_profiles(id) on delete cascade,
  restricted_id text not null references public.community_profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (restricter_id, restricted_id),
  check (restricter_id <> restricted_id)
);
create index if not exists community_restricts_restricted_idx on public.community_restricts (restricted_id);
alter table public.community_restricts enable row level security;
revoke all on public.community_restricts from anon;
grant select, insert, update, delete on public.community_restricts to authenticated;

-- A member reads and changes only their own rows: the muted or restricted person never sees them.
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'community_mutes' and policyname = 'mutes_own') then
    create policy mutes_own on public.community_mutes for all to authenticated
      using (muter_id = (select auth.jwt()->>'sub'))
      with check (muter_id = (select auth.jwt()->>'sub'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'community_restricts' and policyname = 'restricts_own') then
    create policy restricts_own on public.community_restricts for all to authenticated
      using (restricter_id = (select auth.jwt()->>'sub'))
      with check (restricter_id = (select auth.jwt()->>'sub'));
  end if;
end $$;

create or replace trigger community_rate_mutes before insert on public.community_mutes
  for each row execute function public.community_rate_limited('mutes', '300', '3600');
create or replace trigger community_rate_restricts before insert on public.community_restricts
  for each row execute function public.community_rate_limited('restricts', '100', '3600');

-- 2: restrict (the helpers are not reachable through the API) -------------------------------------

-- Whether a comment is kept from me: the post's owner has restricted its writer, and I am neither
-- the writer nor the post's owner. (The restrict row is the owner's own, so this needs the helper.)
create or replace function private.community_comment_hidden(post uuid, writer text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.community_posts p
    join public.community_restricts r on r.restricter_id = p.user_id and r.restricted_id = writer
    where p.id = post
      and writer is distinct from (auth.jwt()->>'sub')
      and p.user_id is distinct from (auth.jwt()->>'sub'))
$$;
revoke all on function private.community_comment_hidden(uuid, text) from public, anon;
grant execute on function private.community_comment_hidden(uuid, text) to authenticated;

-- Restricted people's comments are seen only by their writer and the post's owner, wherever comments
-- are read from (the comment cards, a post's comment count, likes on comments).
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'community_comments' and policyname = 'comments_restricted_private') then
    create policy comments_restricted_private on public.community_comments as restrictive for select to authenticated
      using (user_id = (select auth.jwt()->>'sub') or not private.community_comment_hidden(post_id, user_id));
  end if;
end $$;

-- Online status (version 16), and never shown to someone you have restricted.
create or replace function private.community_active_at(uid text)
returns timestamptz language sql stable security definer set search_path = '' as $$
  select case
    when p.id = (auth.jwt()->>'sub') then p.last_active_at
    when p.show_activity
      and coalesce((select m.show_activity from public.community_profiles m where m.id = (auth.jwt()->>'sub')), true)
      and not exists (select 1 from public.community_blocks b
                      where (b.blocker_id = p.id and b.blocked_id = (auth.jwt()->>'sub'))
                         or (b.blocker_id = (auth.jwt()->>'sub') and b.blocked_id = p.id))
      and not exists (select 1 from public.community_restricts r
                      where r.restricter_id = p.id and r.restricted_id = (auth.jwt()->>'sub'))
      and (exists (select 1 from public.community_follows f
                   where (f.follower_id = (auth.jwt()->>'sub') and f.following_id = p.id)
                      or (f.follower_id = p.id and f.following_id = (auth.jwt()->>'sub')))
           or exists (select 1 from public.community_threads t
                      where (t.user_a = p.id and t.user_b = (auth.jwt()->>'sub'))
                         or (t.user_b = p.id and t.user_a = (auth.jwt()->>'sub'))))
    then p.last_active_at end
  from public.community_profiles p where p.id = uid
$$;

-- Comment notifications (version 4), and none for a comment from someone the post's owner restricted.
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
    -- version 24: a restricted person's comment is between them and the owner, and makes no notification.
    if exists (select 1 from public.community_restricts r where r.restricter_id = owner_id and r.restricted_id = actor) then
      return new;
    end if;
    insert into public.community_notifications (user_id, actor_id, kind, post_id, comment_id, body)
    values (owner_id, actor, 'comment', new.post_id, new.id, left(new.text, 140));
  end if;
  return new;
end $$;
revoke all on function public.community_notify() from public, anon, authenticated;

-- 3: message requests -----------------------------------------------------------------------------

alter table public.community_thread_settings add column if not exists accepted_at timestamptz;

-- Accepts a message request: the chat moves into the inbox, and the other person can see "Seen".
create or replace function public.community_accept_request(thread uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare me text := auth.jwt()->>'sub';
begin
  if me is null then raise exception 'Sign in first'; end if;
  if not exists (select 1 from public.community_threads t where t.id = thread and me in (t.user_a, t.user_b)) then
    raise exception 'That chat isn''t available';
  end if;
  insert into public.community_thread_settings (thread_id, user_id, accepted_at)
  values (thread, me, now())
  on conflict (thread_id, user_id) do update set accepted_at = coalesce(public.community_thread_settings.accepted_at, now());
end $$;
revoke all on function public.community_accept_request(uuid) from public, anon;
grant execute on function public.community_accept_request(uuid) to authenticated;

-- Whether `reader`'s read marker in this chat is kept from me ("Seen"): they have restricted me, or
-- the chat is still a request for them (they haven't written in it or accepted it, and don't follow me).
create or replace function private.community_read_hidden(thread uuid, reader text)
returns boolean language sql stable security definer set search_path = '' as $$
  select reader is distinct from (auth.jwt()->>'sub') and (
    exists (select 1 from public.community_restricts r
            where r.restricter_id = reader and r.restricted_id = (auth.jwt()->>'sub'))
    or (not exists (select 1 from public.community_thread_settings s
                    where s.thread_id = thread and s.user_id = reader and s.accepted_at is not null)
        and not exists (select 1 from public.community_messages m
                        where m.thread_id = thread and m.sender_id = reader and m.system = '')
        and not exists (select 1 from public.community_follows f
                        where f.follower_id = reader and f.following_id = (auth.jwt()->>'sub'))))
$$;
revoke all on function private.community_read_hidden(uuid, text) from public, anon;
grant execute on function private.community_read_hidden(uuid, text) to authenticated;

-- "Seen" comes from the other person's row here (read directly and over Realtime, which applies the
-- same rule). Version 9's rule (read receipts off), and now also restrict and unanswered requests.
alter policy thread_reads_participants on public.community_thread_reads
  using (user_id = (select auth.jwt()->>'sub')
    or (exists (select 1 from public.community_threads t where t.id = thread_id
          and (t.user_a = (select auth.jwt()->>'sub') or t.user_b = (select auth.jwt()->>'sub')))
        and coalesce((select p.read_receipts from public.community_profiles p where p.id = user_id), true)
        and not private.community_read_hidden(thread_id, user_id)));

-- Who has written in a chat, for requests (and the read rule above).
create index if not exists community_messages_thread_sender_idx on public.community_messages (thread_id, sender_id);

-- 4: liked by -------------------------------------------------------------------------------------

-- Likes of a post, newest first, so the most recent liker I follow is found without reading them all.
create index if not exists community_likes_post_created_idx on public.community_likes (post_id, created_at desc);

-- The person I follow who liked this post most recently: not me, not its author, not anyone blocked
-- either way, not a closed account. No row when there is none. Only used by the post cards, whose
-- own rules have already decided that I can see the post.
create or replace function private.community_liked_by(post uuid)
returns table (username text, avatar_url text)
language sql stable security definer set search_path = '' as $$
  select lp.username, lp.avatar_url
  from public.community_likes l
  join public.community_follows f on f.follower_id = (auth.jwt()->>'sub') and f.following_id = l.user_id
  join public.community_profiles lp on lp.id = l.user_id
  where l.post_id = post
    and l.user_id <> (auth.jwt()->>'sub')
    and l.user_id is distinct from (select p.user_id from public.community_posts p where p.id = post)
    and lp.deleted_at is null
    and not exists (select 1 from public.community_blocks b
                    where (b.blocker_id = l.user_id and b.blocked_id = (auth.jwt()->>'sub'))
                       or (b.blocker_id = (auth.jwt()->>'sub') and b.blocked_id = l.user_id))
  order by l.created_at desc
  limit 1
$$;
revoke all on function private.community_liked_by(uuid) from public, anon;
grant execute on function private.community_liked_by(uuid) to authenticated;

-- The read models ---------------------------------------------------------------------------------

-- Posts: version 20's columns, then who I follow liked it, and whether I muted the author's posts.
create or replace view public.community_post_cards with (security_invoker = true) as
SELECT p.id, p.user_id, p.caption, p.location, p.media, p.kind, p.created_at, pr.username, pr.full_name, pr.avatar_url,
    ((SELECT count(*) FROM public.community_likes l WHERE l.post_id = p.id))::integer AS like_count,
    ((SELECT count(*) FROM public.community_comments c WHERE c.post_id = p.id))::integer AS comment_count,
    ((SELECT count(*) FROM public.community_reposts r WHERE r.post_id = p.id))::integer AS repost_count,
    (EXISTS (SELECT 1 FROM public.community_likes l WHERE l.post_id = p.id AND l.user_id = ((SELECT auth.jwt() ->> 'sub'::text)))) AS liked,
    (EXISTS (SELECT 1 FROM public.community_saves s WHERE s.post_id = p.id AND s.user_id = ((SELECT auth.jwt() ->> 'sub'::text)))) AS saved,
    (EXISTS (SELECT 1 FROM public.community_reposts r WHERE r.post_id = p.id AND r.user_id = ((SELECT auth.jwt() ->> 'sub'::text)))) AS reposted,
    (EXISTS (SELECT 1 FROM public.community_follows f WHERE f.following_id = p.user_id AND f.follower_id = ((SELECT auth.jwt() ->> 'sub'::text)))) AS following_author,
    public.community_post_view_count(p.id) AS view_count,
    pr.verified,
    p.group_id,
    (SELECT g.name FROM public.community_groups g WHERE g.id = p.group_id) AS group_name,
    (SELECT g.kind FROM public.community_groups g WHERE g.id = p.group_id) AS group_kind,
    p.group_id IS NOT NULL AND (EXISTS (SELECT 1 FROM public.community_group_members m WHERE m.group_id = p.group_id AND m.user_id = ((SELECT auth.jwt() ->> 'sub'::text)) AND m.status = 'member'::text)) AS in_my_group,
    p.boosted_until IS NOT NULL AND p.boosted_until > now() AS boosted,
    p.boosted_until,
    pr.plus_until IS NOT NULL AND pr.plus_until > now() AS author_plus,
    p.audio_id,
    (SELECT i.title FROM public.community_pod_items i WHERE i.id = p.audio_id) AS audio_title,
    (SELECT i.artist FROM public.community_pod_items i WHERE i.id = p.audio_id) AS audio_artist,
    (SELECT i.audio_url FROM public.community_pod_items i WHERE i.id = p.audio_id) AS audio_url,
    p.sensitive,
    p.audience,
    p.captions,
    p.captions_lang,
    p.captions_status,
    -- version 20
    p.tagged_ids,
    p.ai_label,
    p.profile_only,
    p.hide_likes,
    p.comments_off,
    p.prompt,
    p.poll,
    (SELECT coalesce(jsonb_agg(n ORDER BY o), '[]'::jsonb) FROM (
       SELECT o, (SELECT count(*) FROM public.community_poll_votes v WHERE v.post_id = p.id AND v.option = o)::integer AS n
       FROM generate_series(0, coalesce(jsonb_array_length(p.poll->'options'), 0) - 1) o) x) AS poll_counts,
    (SELECT v.option FROM public.community_poll_votes v WHERE v.post_id = p.id AND v.user_id = ((SELECT auth.jwt() ->> 'sub'::text)))::integer AS my_vote,
    -- version 24
    lb.username AS liked_by_username,
    lb.avatar_url AS liked_by_avatar_url,
    (EXISTS (SELECT 1 FROM public.community_mutes mu WHERE mu.muter_id = ((SELECT auth.jwt() ->> 'sub'::text)) AND mu.muted_id = p.user_id AND mu.posts)) AS author_muted
   FROM public.community_posts p
     JOIN public.community_profiles pr ON pr.id = p.user_id
     LEFT JOIN LATERAL private.community_liked_by(p.id) lb ON true
  WHERE NOT (EXISTS (SELECT 1 FROM public.community_blocks b WHERE b.blocker_id = ((SELECT auth.jwt() ->> 'sub'::text)) AND b.blocked_id = p.user_id));

-- Stories: version 14's columns, then whether I muted the author's stories.
create or replace view public.community_story_cards with (security_invoker = true) as
select s.id, s.user_id, s.item, s.created_at, s.expires_at, pr.username, pr.full_name, pr.avatar_url,
  exists (select 1 from public.community_story_views v where v.story_id = s.id and v.viewer_id = (select auth.jwt()->>'sub')) as seen,
  (s.user_id = (select auth.jwt()->>'sub') or exists (select 1 from public.community_follows f where f.following_id = s.user_id and f.follower_id = (select auth.jwt()->>'sub'))) as in_tray,
  (select count(*) from public.community_story_views v where v.story_id = s.id)::integer as view_count,
  s.audience,
  pr.story_replies,
  exists (select 1 from public.community_follows f where f.follower_id = s.user_id and f.following_id = (select auth.jwt()->>'sub')) as follows_viewer,
  -- version 14: Plus members' stories come first in the tray
  (pr.plus_until is not null and pr.plus_until > now()) as author_plus,
  pr.verified,
  -- version 24
  exists (select 1 from public.community_mutes mu where mu.muter_id = (select auth.jwt()->>'sub') and mu.muted_id = s.user_id and mu.stories) as author_muted
from public.community_stories s
join public.community_profiles pr on pr.id = s.user_id
where s.expires_at > now()
  and not exists (select 1 from public.community_blocks b where b.blocker_id = (select auth.jwt()->>'sub') and b.blocked_id = s.user_id);

-- Comments: version 5's columns, then `restricted`: the post's owner has restricted the writer. It is
-- only ever true for the post's owner (the writer isn't told), and such comments are left out for
-- everyone but the writer and the owner.
create or replace view public.community_comment_cards with (security_invoker = true) as
select c.id, c.post_id, c.user_id, c.text, c.created_at, pr.username, pr.full_name, pr.avatar_url,
  (select count(*) from public.community_comment_likes l where l.comment_id = c.id)::integer as like_count,
  exists (select 1 from public.community_comment_likes l where l.comment_id = c.id and l.user_id = (select auth.jwt()->>'sub')) as liked,
  pr.verified,
  -- version 24
  exists (select 1 from public.community_posts p
          join public.community_restricts r on r.restricter_id = p.user_id and r.restricted_id = c.user_id
          where p.id = c.post_id and p.user_id = (select auth.jwt()->>'sub')) as restricted
from public.community_comments c
join public.community_profiles pr on pr.id = c.user_id
where not exists (select 1 from public.community_blocks b where b.blocker_id = (select auth.jwt()->>'sub') and b.blocked_id = c.user_id)
  and (c.user_id = (select auth.jwt()->>'sub') or not private.community_comment_hidden(c.post_id, c.user_id));

-- Chats: version 16's columns, then `request`: they have written here (since I last cleared the chat),
-- I never have, I haven't accepted it, and I don't follow them or I have restricted them. Their
-- active_at is null when they have restricted me (private.community_active_at, above).
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
  (o.plus_until is not null and o.plus_until > now()) as other_plus,
  -- version 24
  (st.accepted_at is null
    and (not exists (select 1 from public.community_follows f where f.follower_id = me.sub and f.following_id = o.id)
         or exists (select 1 from public.community_restricts x where x.restricter_id = me.sub and x.restricted_id = o.id))
    and not exists (select 1 from public.community_messages m where m.thread_id = t.id and m.sender_id = me.sub and m.system = '')
    and exists (select 1 from public.community_messages m
                where m.thread_id = t.id and m.sender_id = o.id and m.system = ''
                  and m.created_at > coalesce(st.hidden_before, '1970-01-01 00:00:00+00'::timestamptz))) as request
from public.community_threads t
cross join lateral (select auth.jwt()->>'sub' as sub) me
join public.community_profiles o on o.id = case when t.user_a = me.sub then t.user_b else t.user_a end
left join public.community_thread_settings st on st.thread_id = t.id and st.user_id = me.sub
where o.id <> all ((select private.community_block_list())::text[]);

-- Profiles: version 15's columns. `restricted` was only ever about yourself (the under-14 rules, null
-- on anyone else's card); on anyone else's card it now says whether you have restricted them. Then
-- whether you have muted their posts and their stories.
create or replace view public.community_profile_cards with (security_invoker = true) as
select pr.id, pr.username, pr.full_name, pr.avatar_url, pr.bio, pr.website, pr.created_at,
  (select count(*) from public.community_posts p where p.user_id = pr.id)::integer as posts_count,
  (select c.followers from private.community_follow_counts(pr.id) c) as followers_count,
  (select c.following from private.community_follow_counts(pr.id) c) as following_count,
  exists (select 1 from public.community_follows f where f.following_id = pr.id and f.follower_id = (select auth.jwt()->>'sub')) as is_following,
  exists (select 1 from public.community_follows f where f.follower_id = pr.id and f.following_id = (select auth.jwt()->>'sub')) as follows_me,
  exists (select 1 from public.community_blocks b where b.blocked_id = pr.id and b.blocker_id = (select auth.jwt()->>'sub')) as is_blocked,
  exists (select 1 from public.community_stories s where s.user_id = pr.id and s.expires_at > now()) as has_story,
  pr.account_type, pr.category, pr.show_view_counts, pr.story_replies, pr.faq_enabled,
  exists (select 1 from public.community_close_friends cf where cf.user_id = (select auth.jwt()->>'sub') and cf.friend_id = pr.id) as is_close_friend,
  pr.pronouns, pr.gender, pr.contact_email, pr.contact_phone, pr.church_id,
  (select c.name from public.community_churches c where c.id = pr.church_id) as church_name,
  pr.verified,
  (pr.plus_until is not null and pr.plus_until > now()) as plus,
  pr.plus_until,
  pr.suspended,
  (select a.role from public.community_admins a where a.user_id = pr.id) as admin_role,
  pr.deleted_at,
  pr.is_private,
  pr.read_receipts,
  exists (select 1 from public.community_follow_requests r where r.requester_id = (select auth.jwt()->>'sub') and r.target_id = pr.id) as requested,
  exists (select 1 from public.community_follow_requests r where r.target_id = (select auth.jwt()->>'sub') and r.requester_id = pr.id) as requests_me,
  exists (select 1 from public.community_lives l where l.user_id = pr.id and l.ended_at is null and l.started_at > now() - interval '12 hours') as is_live,
  (select count(*) from public.community_profile_views v where v.profile_id = pr.id and v.viewed_at > now() - interval '7 days')::integer as views_week,
  pr.streaks_enabled,
  pr.ring_color,
  pr.profile_theme,
  case when pr.id = (select auth.jwt()->>'sub') then private.community_is_minor(pr.id)
       -- version 24: on anyone else's card, whether I have restricted them
       else exists (select 1 from public.community_restricts x where x.restricter_id = (select auth.jwt()->>'sub') and x.restricted_id = pr.id) end as restricted,
  case when pr.id = (select auth.jwt()->>'sub') then not exists (select 1 from public.community_private_details d where d.user_id = pr.id and d.birth_date is not null) end as needs_birth_date,
  (select f.id from public.community_fundraisers f where f.user_id = pr.id and f.status = 'active' and (f.ends_at is null or f.ends_at > now()) order by f.created_at desc limit 1) as fundraiser_id,
  pr.show_activity,
  private.community_active_at(pr.id) as active_at,
  (select o.tick_hidden from private.community_own_private(pr.id) o) as tick_hidden,
  private.community_verified_via(pr.id) as verified_via,
  pr.hide_connections,
  pr.country,
  pr.sub_price_pence,
  private.community_is_subscriber(pr.id) as subscribed,
  case when pr.id = (select auth.jwt()->>'sub') then (select count(*) from public.community_creator_subs s where s.creator_id = pr.id and s.status in ('active', 'trialing'))::integer end as subscriber_count,
  private.community_subscriber_posts(pr.id) as subscriber_posts,
  (select o.interests_more from private.community_own_private(pr.id) o) as interests_more,
  (select o.interests_less from private.community_own_private(pr.id) o) as interests_less,
  pr.sensitive_filter,
  exists (select 1 from public.community_follow_alerts a where a.user_id = (select auth.jwt()->>'sub') and a.target_id = pr.id and (a.posts or a.stories or a.clips or a.live)) as alerts_on,
  -- version 24
  coalesce((select mu.posts from public.community_mutes mu where mu.muter_id = (select auth.jwt()->>'sub') and mu.muted_id = pr.id), false) as muted_posts,
  coalesce((select mu.stories from public.community_mutes mu where mu.muter_id = (select auth.jwt()->>'sub') and mu.muted_id = pr.id), false) as muted_stories
from public.community_profiles pr;

revoke all on public.community_post_cards, public.community_story_cards, public.community_comment_cards,
  public.community_thread_cards, public.community_profile_cards from anon;
grant select on public.community_post_cards, public.community_story_cards, public.community_comment_cards,
  public.community_thread_cards, public.community_profile_cards to authenticated;
