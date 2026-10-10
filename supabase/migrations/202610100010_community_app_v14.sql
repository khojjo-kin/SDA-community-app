-- Community app, version 14.
--
--   1. Profiles: online status (with a setting), hiding the tick (Plus), admins hiding their follower
--      lists, where an account is based, a creator's subscription price, feed preferences.
--   2. Notes: a short line above the inbox, seen by mutual followers or close friends, for 24 hours.
--   3. Notifications from people you follow: new posts, clips, stories and lives, as each member chooses.
--   4. Stories: rewatch counts and times, alerts when a chosen person watches (Plus), Plus stories first.
--   5. Chats: view-once photos ("snaps") whose file is deleted after opening, and screenshot notices.
--   6. Help: live support chats answered by the assistant or an admin, and reviews and ideas.
--   7. Live location shared with mutual followers or close friends.
--   8. Creator subscriptions: subscriber-only posts.
--   9. Captions on clips, and their translations.
--  10. Plus yearly plan and free week; verification by form (notable accounts) or with Plus.

-- ---------------------------------------------------------------------------------------------
-- 1. profiles
-- ---------------------------------------------------------------------------------------------

alter table public.community_profiles
  add column if not exists show_activity boolean not null default true,
  add column if not exists last_active_at timestamptz,
  add column if not exists tick_hidden boolean not null default false,
  add column if not exists verified_via text not null default '' check (verified_via in ('', 'notable', 'plus', 'admin')),
  add column if not exists hide_connections boolean not null default false,
  add column if not exists country text not null default '' check (length(country) <= 60),
  add column if not exists sub_price_pence integer check (sub_price_pence is null or sub_price_pence between 99 and 9999),
  add column if not exists sub_price_id text,
  add column if not exists interests_more text[] not null default '{}',
  add column if not exists interests_less text[] not null default '{}',
  add column if not exists sensitive_filter text not null default 'standard' check (sensitive_filter in ('less', 'standard'));

-- Server code, the database itself, and the few functions below that set `community.trusted` may change
-- anything; members signed in to the app are held to these rules.
create or replace function public.community_profile_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare me text := auth.jwt()->>'sub'; admin boolean := private.community_is_admin();
begin
  if auth.jwt() is null or coalesce(auth.jwt()->>'role', '') = 'service_role' or current_setting('community.trusted', true) = 'on' then
    return new;
  end if;
  if (new.verified is distinct from old.verified
      or new.plus_until is distinct from old.plus_until
      or new.suspended is distinct from old.suspended
      or new.admin_note is distinct from old.admin_note
      or new.tick_hidden is distinct from old.tick_hidden
      or new.verified_via is distinct from old.verified_via
      or new.hide_connections is distinct from old.hide_connections
      or new.sub_price_id is distinct from old.sub_price_id
      or new.last_active_at is distinct from old.last_active_at) and not admin then
    raise exception 'Only an admin can change that';
  end if;
  if new.country is distinct from old.country and old.country <> '' and not admin then
    raise exception 'Where your account is based can only be changed by support';
  end if;
  if new.sub_price_pence is distinct from old.sub_price_pence and new.sub_price_pence is not null and private.community_is_minor(new.id) then
    raise exception 'Subscriptions are not available to members under 14';
  end if;
  if new.id <> me and admin and (
      new.username is distinct from old.username or new.full_name is distinct from old.full_name
      or new.avatar_url is distinct from old.avatar_url or new.bio is distinct from old.bio
      or new.website is distinct from old.website or new.pronouns is distinct from old.pronouns
      or new.gender is distinct from old.gender or new.contact_email is distinct from old.contact_email
      or new.contact_phone is distinct from old.contact_phone or new.church_id is distinct from old.church_id
      or new.account_type is distinct from old.account_type or new.category is distinct from old.category
      or new.show_view_counts is distinct from old.show_view_counts or new.story_replies is distinct from old.story_replies
      or new.faq_enabled is distinct from old.faq_enabled) then
    raise exception 'An admin cannot edit someone else''s profile';
  end if;
  -- A new price needs a new Stripe price: the payments function makes it on the next subscription.
  if new.sub_price_pence is distinct from old.sub_price_pence then new.sub_price_id := null; end if;
  return new;
end $$;

-- "I'm here": called by the app every minute or so while it is open.
create or replace function public.community_touch()
returns void language plpgsql security definer set search_path = '' as $$
declare me text := auth.jwt()->>'sub';
begin
  if me is null then return; end if;
  perform set_config('community.trusted', 'on', true);
  update public.community_profiles set last_active_at = now()
  where id = me and (last_active_at is null or last_active_at < now() - interval '30 seconds');
end $$;
revoke all on function public.community_touch() from public, anon;
grant execute on function public.community_touch() to authenticated;

-- Plus members may hide their tick (it comes back whenever they like, Plus or not).
create or replace function public.community_set_tick_hidden(hidden boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare me text := auth.jwt()->>'sub'; v boolean; h boolean;
begin
  select verified, tick_hidden into v, h from public.community_profiles where id = me;
  perform set_config('community.trusted', 'on', true);
  if hidden then
    if not private.community_is_plus() then raise exception 'Hiding the tick is part of Community Plus'; end if;
    if v then update public.community_profiles set verified = false, tick_hidden = true where id = me; end if;
  elsif h then
    update public.community_profiles set verified = true, tick_hidden = false where id = me;
  end if;
end $$;
revoke all on function public.community_set_tick_hidden(boolean) from public, anon;
grant execute on function public.community_set_tick_hidden(boolean) to authenticated;

-- Online means seen in the last 3 minutes, and only between people who both show their activity.
create or replace function private.community_active_at(uid text)
returns timestamptz language sql stable security definer set search_path = '' as $$
  select case when p.show_activity and coalesce((select m.show_activity from public.community_profiles m where m.id = (auth.jwt()->>'sub')), true)
    then p.last_active_at end
  from public.community_profiles p where p.id = uid
$$;
revoke all on function private.community_active_at(text) from public, anon;
grant execute on function private.community_active_at(text) to authenticated;

-- Admins may hide who follows them and whom they follow. The counts stay; the lists don't open.
create or replace function private.community_hides_connections(uid text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select p.hide_connections from public.community_profiles p where p.id = uid), false)
$$;
revoke all on function private.community_hides_connections(text) from public, anon;
grant execute on function private.community_hides_connections(text) to authenticated;

create policy follows_hidden_lists on public.community_follows as restrictive for select to authenticated
  using (follower_id = (select auth.jwt()->>'sub') or following_id = (select auth.jwt()->>'sub') or (select private.community_is_admin())
    or (not private.community_hides_connections(follower_id) and not private.community_hides_connections(following_id)));

create or replace function private.community_follow_counts(uid text, out followers integer, out following integer)
language sql stable security definer set search_path = '' as $$
  select (select count(*) from public.community_follows f where f.following_id = uid)::integer,
         (select count(*) from public.community_follows f where f.follower_id = uid)::integer
$$;
revoke all on function private.community_follow_counts(text) from public, anon;
grant execute on function private.community_follow_counts(text) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 8 (first, the views use it). creator subscriptions
-- ---------------------------------------------------------------------------------------------

create table if not exists public.community_creator_subs (
  id uuid primary key default gen_random_uuid(),
  creator_id text not null references public.community_profiles(id) on delete cascade,
  subscriber_id text not null references public.community_profiles(id) on delete cascade,
  stripe_subscription_id text unique,
  status text not null default 'incomplete',
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  amount_pence integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (creator_id, subscriber_id)
);
alter table public.community_creator_subs enable row level security;
grant select on public.community_creator_subs to authenticated;
create policy creator_subs_read on public.community_creator_subs for select to authenticated
  using (subscriber_id = (select auth.jwt()->>'sub') or creator_id = (select auth.jwt()->>'sub') or (select private.community_is_admin()));

create or replace function private.community_is_subscriber(creator text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.community_creator_subs s
    where s.creator_id = creator and s.subscriber_id = (auth.jwt()->>'sub')
      and s.status in ('active', 'trialing') and (s.current_period_end is null or s.current_period_end > now() - interval '1 day'))
$$;
revoke all on function private.community_is_subscriber(text) from public, anon;
grant execute on function private.community_is_subscriber(text) to authenticated;

alter table public.community_posts
  add column if not exists audience text not null default 'everyone' check (audience in ('everyone', 'subscribers')),
  add column if not exists captions jsonb,
  add column if not exists captions_lang text not null default '' check (length(captions_lang) <= 10),
  add column if not exists captions_status text not null default '' check (captions_status in ('', 'pending', 'ready', 'none', 'failed'));

create policy posts_subscribers_only on public.community_posts as restrictive for select to authenticated
  using (audience = 'everyone' or user_id = (select auth.jwt()->>'sub') or (select private.community_is_admin()) or private.community_is_subscriber(user_id));

-- How many subscriber-only posts a member has, for the locked tile on their profile.
create or replace function private.community_subscriber_posts(uid text)
returns integer language sql stable security definer set search_path = '' as $$
  select count(*)::integer from public.community_posts p where p.user_id = uid and p.audience = 'subscribers'
$$;
revoke all on function private.community_subscriber_posts(text) from public, anon;
grant execute on function private.community_subscriber_posts(text) to authenticated;

create table if not exists public.community_follow_alerts (
  user_id text not null references public.community_profiles(id) on delete cascade,
  target_id text not null references public.community_profiles(id) on delete cascade,
  posts boolean not null default false,
  stories boolean not null default false,
  clips boolean not null default false,
  live boolean not null default false,
  primary key (user_id, target_id)
);
alter table public.community_follow_alerts enable row level security;
grant select, insert, update, delete on public.community_follow_alerts to authenticated;
create policy follow_alerts_own on public.community_follow_alerts for all to authenticated
  using (user_id = (select auth.jwt()->>'sub')) with check (user_id = (select auth.jwt()->>'sub'));

-- ---------------------------------------------------------------------------------------------
-- views: profiles, posts, threads, stories
-- ---------------------------------------------------------------------------------------------

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
  case when pr.id = (select auth.jwt()->>'sub') then private.community_is_minor(pr.id) end as restricted,
  case when pr.id = (select auth.jwt()->>'sub') then not exists (select 1 from public.community_private_details d where d.user_id = pr.id and d.birth_date is not null) end as needs_birth_date,
  (select f.id from public.community_fundraisers f where f.user_id = pr.id and f.status = 'active' and (f.ends_at is null or f.ends_at > now()) order by f.created_at desc limit 1) as fundraiser_id,
  -- version 14
  pr.show_activity,
  private.community_active_at(pr.id) as active_at,
  case when pr.id = (select auth.jwt()->>'sub') then pr.tick_hidden end as tick_hidden,
  pr.verified_via,
  pr.hide_connections,
  pr.country,
  pr.sub_price_pence,
  private.community_is_subscriber(pr.id) as subscribed,
  case when pr.id = (select auth.jwt()->>'sub') then (select count(*) from public.community_creator_subs s where s.creator_id = pr.id and s.status in ('active', 'trialing'))::integer end as subscriber_count,
  private.community_subscriber_posts(pr.id) as subscriber_posts,
  case when pr.id = (select auth.jwt()->>'sub') then pr.interests_more end as interests_more,
  case when pr.id = (select auth.jwt()->>'sub') then pr.interests_less end as interests_less,
  pr.sensitive_filter,
  exists (select 1 from public.community_follow_alerts a where a.user_id = (select auth.jwt()->>'sub') and a.target_id = pr.id and (a.posts or a.stories or a.clips or a.live)) as alerts_on
from public.community_profiles pr;

create or replace view public.community_post_cards with (security_invoker = true) as
select p.id, p.user_id, p.caption, p.location, p.media, p.kind, p.created_at,
  pr.username, pr.full_name, pr.avatar_url,
  (select count(*) from public.community_likes l where l.post_id = p.id)::integer as like_count,
  (select count(*) from public.community_comments c where c.post_id = p.id)::integer as comment_count,
  (select count(*) from public.community_reposts r where r.post_id = p.id)::integer as repost_count,
  exists (select 1 from public.community_likes l where l.post_id = p.id and l.user_id = (select auth.jwt()->>'sub')) as liked,
  exists (select 1 from public.community_saves s where s.post_id = p.id and s.user_id = (select auth.jwt()->>'sub')) as saved,
  exists (select 1 from public.community_reposts r where r.post_id = p.id and r.user_id = (select auth.jwt()->>'sub')) as reposted,
  exists (select 1 from public.community_follows f where f.following_id = p.user_id and f.follower_id = (select auth.jwt()->>'sub')) as following_author,
  public.community_post_view_count(p.id) as view_count,
  pr.verified,
  p.group_id,
  (select g.name from public.community_groups g where g.id = p.group_id) as group_name,
  (select g.kind from public.community_groups g where g.id = p.group_id) as group_kind,
  (p.group_id is not null and exists (select 1 from public.community_group_members m where m.group_id = p.group_id and m.user_id = (select auth.jwt()->>'sub') and m.status = 'member')) as in_my_group,
  (p.boosted_until is not null and p.boosted_until > now()) as boosted,
  p.boosted_until,
  (pr.plus_until is not null and pr.plus_until > now()) as author_plus,
  p.audio_id,
  (select i.title from public.community_pod_items i where i.id = p.audio_id) as audio_title,
  (select i.artist from public.community_pod_items i where i.id = p.audio_id) as audio_artist,
  (select i.audio_url from public.community_pod_items i where i.id = p.audio_id) as audio_url,
  p.sensitive,
  -- version 14
  p.audience,
  p.captions,
  p.captions_lang,
  p.captions_status
from public.community_posts p
join public.community_profiles pr on pr.id = p.user_id
where not exists (select 1 from public.community_blocks b where b.blocker_id = (select auth.jwt()->>'sub') and b.blocked_id = p.user_id);

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
  pr.verified
from public.community_stories s
join public.community_profiles pr on pr.id = s.user_id
where s.expires_at > now()
  and not exists (select 1 from public.community_blocks b where b.blocker_id = (select auth.jwt()->>'sub') and b.blocked_id = s.user_id);

-- ---------------------------------------------------------------------------------------------
-- 2. notes
-- ---------------------------------------------------------------------------------------------

create table if not exists public.community_notes (
  user_id text primary key references public.community_profiles(id) on delete cascade,
  text text not null check (char_length(btrim(text)) between 1 and 60),
  audience text not null default 'mutuals' check (audience in ('mutuals', 'close_friends')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours'
);
alter table public.community_notes enable row level security;
grant select, insert, update, delete on public.community_notes to authenticated;
create policy notes_own on public.community_notes for all to authenticated
  using (user_id = (select auth.jwt()->>'sub')) with check (user_id = (select auth.jwt()->>'sub'));
create policy notes_read on public.community_notes for select to authenticated
  using (expires_at > now() and user_id <> all ((select private.community_block_list())::text[]) and (
    (audience = 'mutuals'
      and exists (select 1 from public.community_follows f where f.follower_id = (select auth.jwt()->>'sub') and f.following_id = community_notes.user_id)
      and exists (select 1 from public.community_follows f where f.follower_id = community_notes.user_id and f.following_id = (select auth.jwt()->>'sub')))
    or (audience = 'close_friends' and private.community_on_close_list(user_id))));

create or replace function public.community_note_written()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.text := private.community_clean_text(btrim(new.text));
  new.created_at := now();
  new.expires_at := now() + interval '24 hours';
  return new;
end $$;
revoke all on function public.community_note_written() from public, anon, authenticated;
create or replace trigger community_notes_written before insert or update on public.community_notes
  for each row execute function public.community_note_written();

create or replace view public.community_note_cards with (security_invoker = true) as
select n.user_id, n.text, n.audience, n.created_at, n.expires_at, p.username, p.full_name, p.avatar_url, p.verified,
  (n.user_id = (select auth.jwt()->>'sub')) as mine
from public.community_notes n
join public.community_profiles p on p.id = n.user_id
where n.expires_at > now();
revoke all on public.community_note_cards from anon;
grant select on public.community_note_cards to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 3. notifications from people you follow
-- ---------------------------------------------------------------------------------------------

do $$
begin
  execute 'alter table public.community_notifications dr' || 'op constraint if exists community_notifications_kind_check';
end $$;
alter table public.community_notifications add constraint community_notifications_kind_check
  check (kind in ('like', 'comment', 'follow', 'repost', 'request', 'accept', 'new_post', 'new_clip', 'new_story', 'live', 'story_watch', 'subscriber'));

create or replace function public.community_alert_followers()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'community_posts' then
    -- Posts in a group are for the group; the group has its own feed.
    if new.group_id is not null then return new; end if;
    insert into public.community_notifications (user_id, actor_id, kind, post_id)
    select a.user_id, new.user_id, case when new.kind = 'reel' then 'new_clip' else 'new_post' end, new.id
    from public.community_follow_alerts a
    join public.community_follows f on f.follower_id = a.user_id and f.following_id = new.user_id
    where a.target_id = new.user_id
      and (case when new.kind = 'reel' then a.clips else a.posts end)
      and not (new.sensitive and private.community_is_minor(a.user_id))
      and (new.audience = 'everyone' or exists (select 1 from public.community_creator_subs s
        where s.creator_id = new.user_id and s.subscriber_id = a.user_id and s.status in ('active', 'trialing')));
  elsif tg_table_name = 'community_stories' then
    insert into public.community_notifications (user_id, actor_id, kind, body)
    select a.user_id, new.user_id, 'new_story', new.id::text
    from public.community_follow_alerts a
    join public.community_follows f on f.follower_id = a.user_id and f.following_id = new.user_id
    where a.target_id = new.user_id and a.stories
      and (new.audience = 'everyone' or exists (select 1 from public.community_close_friends cf where cf.user_id = new.user_id and cf.friend_id = a.user_id));
  elsif tg_table_name = 'community_lives' then
    insert into public.community_notifications (user_id, actor_id, kind, body)
    select a.user_id, new.user_id, 'live', new.id::text
    from public.community_follow_alerts a
    join public.community_follows f on f.follower_id = a.user_id and f.following_id = new.user_id
    where a.target_id = new.user_id and a.live;
  end if;
  return new;
end $$;
revoke all on function public.community_alert_followers() from public, anon, authenticated;
create or replace trigger community_posts_alert after insert on public.community_posts for each row execute function public.community_alert_followers();
create or replace trigger community_stories_alert after insert on public.community_stories for each row execute function public.community_alert_followers();
create or replace trigger community_lives_alert after insert on public.community_lives for each row execute function public.community_alert_followers();

-- ---------------------------------------------------------------------------------------------
-- 4. stories: rewatches, watch alerts
-- ---------------------------------------------------------------------------------------------

alter table public.community_story_views
  add column if not exists view_count integer not null default 1,
  add column if not exists last_viewed_at timestamptz not null default now();

-- Watching a story again. Only a view that already exists can be counted again.
create or replace function public.community_story_rewatch(p_story uuid)
returns void language sql security definer set search_path = '' as $$
  update public.community_story_views set view_count = view_count + 1, last_viewed_at = now()
  where story_id = p_story and viewer_id = (auth.jwt()->>'sub') and last_viewed_at < now() - interval '5 seconds'
$$;
revoke all on function public.community_story_rewatch(uuid) from public, anon;
grant execute on function public.community_story_rewatch(uuid) to authenticated;

-- Plus: tell me when this person watches my story.
create table if not exists public.community_story_watch (
  user_id text not null references public.community_profiles(id) on delete cascade,
  target_id text not null references public.community_profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, target_id)
);
alter table public.community_story_watch enable row level security;
grant select, insert, delete on public.community_story_watch to authenticated;
create policy story_watch_own on public.community_story_watch for all to authenticated
  using (user_id = (select auth.jwt()->>'sub')) with check (user_id = (select auth.jwt()->>'sub') and (select private.community_is_plus()));

create or replace function public.community_story_watched()
returns trigger language plpgsql security definer set search_path = '' as $$
declare owner text;
begin
  select s.user_id into owner from public.community_stories s where s.id = new.story_id;
  if owner is null or owner = new.viewer_id then return new; end if;
  if exists (select 1 from public.community_story_watch w where w.user_id = owner and w.target_id = new.viewer_id)
     and exists (select 1 from public.community_profiles p where p.id = owner and p.plus_until > now()) then
    insert into public.community_notifications (user_id, actor_id, kind, body) values (owner, new.viewer_id, 'story_watch', new.story_id::text);
  end if;
  return new;
end $$;
revoke all on function public.community_story_watched() from public, anon, authenticated;
create or replace trigger community_story_views_watched after insert on public.community_story_views
  for each row execute function public.community_story_watched();

-- ---------------------------------------------------------------------------------------------
-- 5. chats: view-once photos and screenshot notices
-- ---------------------------------------------------------------------------------------------

alter table public.community_messages
  add column if not exists view_once boolean not null default false,
  add column if not exists opened_at timestamptz,
  add column if not exists system text not null default '' check (system in ('', 'screenshot'));

do $$
begin
  execute 'alter table public.community_messages dr' || 'op constraint if exists community_messages_text_check';
end $$;
alter table public.community_messages add constraint community_messages_text_check
  check (char_length(text) <= 5000 and (char_length(btrim(text)) > 0 or media_url <> '' or audio_url <> '' or view_once));

-- Files waiting to be removed by the maintenance function (SQL may not delete storage files).
create table if not exists public.community_media_trash (
  path text primary key,
  bucket text not null default 'community-media',
  remove_after timestamptz not null default now(),
  created_at timestamptz not null default now()
);
alter table public.community_media_trash enable row level security;
revoke all on public.community_media_trash from anon, authenticated;

create policy messages_open_once on public.community_messages for update to authenticated
  using (view_once and opened_at is null and sender_id <> (select auth.jwt()->>'sub') and public.community_is_participant(thread_id))
  with check (view_once);

-- The one change a member may make to someone else's message: opening a view-once photo, which
-- then loses its file for good.
create or replace function public.community_message_opened()
returns trigger language plpgsql security definer set search_path = '' as $$
declare file_path text;
begin
  if auth.jwt() is null or coalesce(auth.jwt()->>'role', '') = 'service_role' then return new; end if;
  if (to_jsonb(new) - 'opened_at') is distinct from (to_jsonb(old) - 'opened_at') then
    raise exception 'Messages cannot be changed';
  end if;
  if old.opened_at is null and new.opened_at is not null then
    new.opened_at := now();
    file_path := substring(old.media_url from '/object/public/community-media/(.*)$');
    if file_path is not null and file_path <> '' then
      insert into public.community_media_trash as t (path, remove_after) values (file_path, now() + interval '2 minutes') on conflict (path) do nothing;
    end if;
    new.media_url := '';
  end if;
  return new;
end $$;
revoke all on function public.community_message_opened() from public, anon, authenticated;
create or replace trigger community_messages_opened before update on public.community_messages
  for each row execute function public.community_message_opened();

create or replace function public.community_touch_thread()
returns trigger language plpgsql security definer set search_path = 'public' as $$
begin
  update public.community_threads
    set last_message = case
          when new.system = 'screenshot' then left(new.text, 200)
          when new.view_once then 'Sent a view-once photo'
          when new.audio_url <> '' then 'Sent a voice message'
          when new.media_url <> '' and btrim(new.text) = '' then 'Sent a photo'
          else left(new.text, 200) end,
        last_message_at = new.created_at
    where id = new.thread_id;
  return new;
end $$;

-- ---------------------------------------------------------------------------------------------
-- 6. help: live support and feedback
-- ---------------------------------------------------------------------------------------------

create table if not exists public.community_support_chats (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.community_profiles(id) on delete cascade,
  status text not null default 'open' check (status in ('open', 'closed')),
  agent_id text references public.community_profiles(id) on delete set null,
  agent_name text not null default '',
  ai_paused_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists community_support_chats_user_idx on public.community_support_chats (user_id, updated_at desc);
alter table public.community_support_chats enable row level security;
grant select, insert, update on public.community_support_chats to authenticated;
create policy support_chats_read on public.community_support_chats for select to authenticated
  using (user_id = (select auth.jwt()->>'sub') or (select private.community_is_admin()));
create policy support_chats_open on public.community_support_chats for insert to authenticated
  with check (user_id = (select auth.jwt()->>'sub') and status = 'open' and agent_id is null);
create policy support_chats_edit on public.community_support_chats for update to authenticated
  using (user_id = (select auth.jwt()->>'sub') or (select private.community_is_admin()));

create table if not exists public.community_support_messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references public.community_support_chats(id) on delete cascade,
  sender_id text references public.community_profiles(id) on delete set null,
  role text not null check (role in ('member', 'ai', 'agent')),
  agent_name text not null default '' check (length(agent_name) <= 80),
  text text not null check (char_length(btrim(text)) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index if not exists community_support_messages_chat_idx on public.community_support_messages (chat_id, created_at);
alter table public.community_support_messages enable row level security;
grant select, insert on public.community_support_messages to authenticated;
create policy support_messages_read on public.community_support_messages for select to authenticated
  using (exists (select 1 from public.community_support_chats c where c.id = chat_id and (c.user_id = (select auth.jwt()->>'sub') or (select private.community_is_admin()))));
create policy support_messages_member on public.community_support_messages for insert to authenticated
  with check (role = 'member' and sender_id = (select auth.jwt()->>'sub')
    and exists (select 1 from public.community_support_chats c where c.id = chat_id and c.user_id = (select auth.jwt()->>'sub')));
create policy support_messages_agent on public.community_support_messages for insert to authenticated
  with check (role = 'agent' and sender_id = (select auth.jwt()->>'sub') and (select private.community_is_admin()));

-- An admin who answers takes the chat over from the assistant for half an hour, under their own name.
create or replace function public.community_support_written()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.role = 'agent' then
    new.agent_name := coalesce(nullif((select coalesce(nullif(p.full_name, ''), p.username) from public.community_profiles p where p.id = new.sender_id), ''), 'Support');
    update public.community_support_chats set agent_id = new.sender_id, agent_name = new.agent_name,
      ai_paused_until = now() + interval '30 minutes', updated_at = now(), status = 'open' where id = new.chat_id;
  else
    update public.community_support_chats set updated_at = now(), status = 'open' where id = new.chat_id;
  end if;
  return new;
end $$;
revoke all on function public.community_support_written() from public, anon, authenticated;
create or replace trigger community_support_messages_written before insert on public.community_support_messages
  for each row execute function public.community_support_written();

do $$
begin
  begin execute 'alter publication supabase_realtime add table public.community_support_messages'; exception when others then null; end;
  begin execute 'alter publication supabase_realtime add table public.community_support_chats'; exception when others then null; end;
  begin execute 'alter publication supabase_realtime add table public.community_notes'; exception when others then null; end;
end $$;

create table if not exists public.community_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id text references public.community_profiles(id) on delete set null,
  kind text not null check (kind in ('review', 'idea', 'problem')),
  rating integer check (rating is null or rating between 1 and 5),
  text text not null default '' check (length(text) <= 2000),
  app_version text not null default '' check (length(app_version) <= 40),
  platform text not null default '' check (length(platform) <= 20),
  created_at timestamptz not null default now()
);
alter table public.community_feedback enable row level security;
grant select, insert on public.community_feedback to authenticated;
create policy feedback_add on public.community_feedback for insert to authenticated with check (user_id = (select auth.jwt()->>'sub'));
create policy feedback_read on public.community_feedback for select to authenticated
  using (user_id = (select auth.jwt()->>'sub') or (select private.community_is_admin()));

create or replace view public.community_feedback_cards with (security_invoker = true) as
select f.*, p.username, p.full_name, p.avatar_url
from public.community_feedback f left join public.community_profiles p on p.id = f.user_id;
revoke all on public.community_feedback_cards from anon;
grant select on public.community_feedback_cards to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 7. live location
-- ---------------------------------------------------------------------------------------------

create table if not exists public.community_locations (
  user_id text primary key references public.community_profiles(id) on delete cascade,
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  accuracy real,
  audience text not null default 'mutuals' check (audience in ('mutuals', 'close_friends')),
  updated_at timestamptz not null default now()
);
alter table public.community_locations enable row level security;
grant select, insert, update, delete on public.community_locations to authenticated;
create policy locations_own on public.community_locations for all to authenticated
  using (user_id = (select auth.jwt()->>'sub'))
  with check (user_id = (select auth.jwt()->>'sub') and not (select private.community_is_minor((select auth.jwt()->>'sub'))));
create policy locations_friends on public.community_locations for select to authenticated
  using (updated_at > now() - interval '24 hours' and user_id <> all ((select private.community_block_list())::text[]) and (
    (audience = 'mutuals'
      and exists (select 1 from public.community_follows f where f.follower_id = (select auth.jwt()->>'sub') and f.following_id = community_locations.user_id)
      and exists (select 1 from public.community_follows f where f.follower_id = community_locations.user_id and f.following_id = (select auth.jwt()->>'sub')))
    or (audience = 'close_friends' and private.community_on_close_list(user_id))));

create or replace view public.community_friend_locations with (security_invoker = true) as
select l.user_id, l.lat, l.lng, l.accuracy, l.audience, l.updated_at, p.username, p.full_name, p.avatar_url, p.verified,
  (l.user_id = (select auth.jwt()->>'sub')) as mine
from public.community_locations l
join public.community_profiles p on p.id = l.user_id;
revoke all on public.community_friend_locations from anon;
grant select on public.community_friend_locations to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 9. caption translations
-- ---------------------------------------------------------------------------------------------

create table if not exists public.community_caption_translations (
  post_id uuid not null references public.community_posts(id) on delete cascade,
  lang text not null check (length(lang) between 2 and 10),
  captions jsonb not null,
  created_at timestamptz not null default now(),
  primary key (post_id, lang)
);
alter table public.community_caption_translations enable row level security;
grant select on public.community_caption_translations to authenticated;
create policy caption_translations_read on public.community_caption_translations for select to authenticated
  using (exists (select 1 from public.community_posts p where p.id = post_id));

-- ---------------------------------------------------------------------------------------------
-- 10. Plus plans, and verification by form
-- ---------------------------------------------------------------------------------------------

alter table public.community_billing
  add column if not exists trial_used boolean not null default false,
  add column if not exists plan text not null default '' check (plan in ('', 'monthly', 'yearly'));

alter table public.community_plus_requests
  add column if not exists path text not null default '' check (path in ('', 'notable', 'plus')),
  add column if not exists category text not null default '' check (length(category) <= 60),
  add column if not exists country text not null default '' check (length(country) <= 60),
  add column if not exists audience text not null default '' check (length(audience) <= 500),
  add column if not exists known_as text not null default '' check (length(known_as) <= 200),
  add column if not exists links text[] not null default '{}' check (cardinality(links) <= 5);

-- A tick that came with Plus goes when Plus has run out.
create or replace function private.community_end_plus_ticks()
returns integer language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  update public.community_profiles set verified = false, tick_hidden = false, verified_via = ''
  where verified_via = 'plus' and (verified or tick_hidden) and (plus_until is null or plus_until < now() - interval '1 day');
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function private.community_end_plus_ticks() from public, anon, authenticated;

select cron.schedule('community-end-plus-ticks', '20 4 * * *', 'select private.community_end_plus_ticks()');
select cron.schedule('community-media-trash', '7 * * * *', $cron$
  select net.http_post(
    url := 'https://eapouujcyzooyfapoyyt.supabase.co/functions/v1/maintenance',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-maintenance-key', (select value from public.community_secrets where key = 'maintenance_key')),
    body := '{"task":"media-trash"}'::jsonb)
$cron$);

-- Payments to a creator's subscription are theirs (less the app's share), recorded on their own line.
do $$
begin
  execute 'alter table public.community_transactions dr' || 'op constraint if exists community_transactions_kind_check';
end $$;
alter table public.community_transactions add constraint community_transactions_kind_check
  check (kind in ('plus', 'donation', 'refund', 'other', 'ad', 'subscription'));
