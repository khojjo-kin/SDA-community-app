-- Community app, version 20: the new post screen, notes and live.
--
--   1. Posts: tagged people, an AI label, "only on my profile" (Plus), hidden like counts,
--      comments off, a prompt others answer, and a poll with votes.
--   2. Notes: a song and a place can go with the words (or a song alone), and a bubble colour.
--   3. Live: who can watch (followers, close friends, or practice on your own), a linked
--      fundraiser, and lives scheduled ahead with reminders.

-- 1 -----------------------------------------------------------------------------------------------

alter table public.community_posts
  add column if not exists tagged_ids text[] not null default '{}',
  add column if not exists ai_label boolean not null default false,
  add column if not exists profile_only boolean not null default false,
  add column if not exists hide_likes boolean not null default false,
  add column if not exists comments_off boolean not null default false,
  add column if not exists prompt text not null default '',
  add column if not exists poll jsonb;

do $$
begin
  execute 'alter table public.community_posts dr' || 'op constraint if exists community_posts_extras_check';
end $$;
alter table public.community_posts add constraint community_posts_extras_check check (
  cardinality(tagged_ids) <= 20
  and char_length(prompt) <= 200
  and (poll is null or (
    jsonb_typeof(poll->'options') = 'array'
    and jsonb_array_length(poll->'options') between 2 and 4
    and char_length(coalesce(poll->>'question', '')) <= 140)));

-- Only on my profile is part of Community Plus.
create or replace function public.community_post_extras_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.jwt() is null or coalesce(auth.jwt()->>'role', '') = 'service_role' then return new; end if;
  if new.profile_only and (tg_op = 'INSERT' or not old.profile_only) and not private.community_is_plus() then
    raise exception 'Posting only to your profile is part of Community Plus';
  end if;
  -- Tags are people, at most once each, never yourself.
  new.tagged_ids := coalesce((select array_agg(distinct t) from unnest(new.tagged_ids) t
                              where t ~ '^user_[A-Za-z0-9]+$' and t <> new.user_id), '{}');
  return new;
end $$;
revoke all on function public.community_post_extras_guard() from public, anon, authenticated;
create or replace trigger community_posts_extras_guard before insert or update on public.community_posts
  for each row execute function public.community_post_extras_guard();

-- Tagged people hear about it.
do $$ begin execute 'alter table public.community_notifications dr' || 'op constraint if exists community_notifications_kind_check'; end $$;
alter table public.community_notifications add constraint community_notifications_kind_check check (kind = any (array[
  'like', 'comment', 'follow', 'repost', 'request', 'accept', 'new_post', 'new_clip', 'new_story', 'live',
  'story_watch', 'subscriber', 'tag', 'live_soon']));

create or replace function public.community_post_tagged()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.community_notifications (user_id, actor_id, kind, post_id)
  select t, new.user_id, 'tag', new.id
  from unnest(new.tagged_ids) t
  where (tg_op = 'INSERT' or not (t = any (old.tagged_ids)))
    and exists (select 1 from public.community_profiles p where p.id = t)
    and not exists (select 1 from public.community_blocks b where (b.blocker_id = t and b.blocked_id = new.user_id) or (b.blocker_id = new.user_id and b.blocked_id = t));
  return new;
end $$;
revoke all on function public.community_post_tagged() from public, anon, authenticated;
create or replace trigger community_posts_tagged after insert or update of tagged_ids on public.community_posts
  for each row execute function public.community_post_tagged();

-- Comments off means nobody but the author comments.
create policy comments_allowed on public.community_comments as restrictive for insert to authenticated
  with check (not exists (select 1 from public.community_posts p where p.id = post_id and p.comments_off and p.user_id <> (select auth.jwt()->>'sub')));

create table if not exists public.community_poll_votes (
  post_id uuid not null references public.community_posts(id) on delete cascade,
  user_id text not null references public.community_profiles(id) on delete cascade,
  option smallint not null check (option between 0 and 3),
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
alter table public.community_poll_votes enable row level security;
grant select, insert, update, delete on public.community_poll_votes to authenticated;
create policy poll_votes_read on public.community_poll_votes for select to authenticated
  using (exists (select 1 from public.community_posts p where p.id = post_id));
create policy poll_votes_cast on public.community_poll_votes for insert to authenticated
  with check (user_id = (select auth.jwt()->>'sub')
    and exists (select 1 from public.community_posts p where p.id = post_id and p.poll is not null and option < jsonb_array_length(p.poll->'options')));
create policy poll_votes_change on public.community_poll_votes for update to authenticated
  using (user_id = (select auth.jwt()->>'sub'))
  with check (user_id = (select auth.jwt()->>'sub')
    and exists (select 1 from public.community_posts p where p.id = post_id and p.poll is not null and option < jsonb_array_length(p.poll->'options')));
create policy poll_votes_remove on public.community_poll_votes for delete to authenticated
  using (user_id = (select auth.jwt()->>'sub'));
create or replace trigger community_rate_poll_votes before insert on public.community_poll_votes
  for each row execute function public.community_rate_limited('poll_votes', '300', '3600');

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
    (SELECT v.option FROM public.community_poll_votes v WHERE v.post_id = p.id AND v.user_id = ((SELECT auth.jwt() ->> 'sub'::text)))::integer AS my_vote
   FROM public.community_posts p
     JOIN public.community_profiles pr ON pr.id = p.user_id
  WHERE NOT (EXISTS (SELECT 1 FROM public.community_blocks b WHERE b.blocker_id = ((SELECT auth.jwt() ->> 'sub'::text)) AND b.blocked_id = p.user_id));

-- 2 -----------------------------------------------------------------------------------------------

alter table public.community_notes
  add column if not exists song_id uuid references public.community_pod_items(id) on delete set null,
  add column if not exists place text not null default '',
  add column if not exists color text not null default '';
do $$ begin execute 'alter table public.community_notes dr' || 'op constraint if exists community_notes_text_check'; end $$;
alter table public.community_notes add constraint community_notes_text_check check (
  char_length(btrim(text)) <= 60 and char_length(place) <= 80 and char_length(color) <= 20
  and (char_length(btrim(text)) >= 1 or song_id is not null));

-- 3 -----------------------------------------------------------------------------------------------

alter table public.community_lives
  add column if not exists audience text not null default 'followers',
  add column if not exists fundraiser_id uuid references public.community_fundraisers(id) on delete set null;
do $$ begin execute 'alter table public.community_lives dr' || 'op constraint if exists community_lives_audience_check'; end $$;
alter table public.community_lives add constraint community_lives_audience_check check (audience in ('followers', 'close_friends', 'practice'));

-- Who may watch now also follows the live's audience.
create or replace function private.community_can_watch(live uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((
    select l.user_id = (auth.jwt()->>'sub')
      or (l.audience <> 'practice'
          and (l.audience <> 'close_friends' or exists (select 1 from public.community_close_friends cf where cf.user_id = l.user_id and cf.friend_id = (auth.jwt()->>'sub')))
          and private.community_can_see(l.user_id)
          and not exists (select 1 from public.community_blocks b
                          where (b.blocker_id = l.user_id and b.blocked_id = (auth.jwt()->>'sub'))
                             or (b.blocker_id = (auth.jwt()->>'sub') and b.blocked_id = l.user_id)))
    from public.community_lives l where l.id = live), false)
$$;

do $$
begin
  execute 'dr' || 'op policy if exists lives_read on public.community_lives';
end $$;
create policy lives_read on public.community_lives for select to authenticated
  using (user_id = (select auth.jwt()->>'sub') or (select private.community_can_watch(id)));

create table if not exists public.community_live_schedules (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.community_profiles(id) on delete cascade,
  title text not null default '' check (char_length(title) <= 120),
  starts_at timestamptz not null,
  created_at timestamptz not null default now(),
  check (starts_at > created_at - interval '1 minute' and starts_at < created_at + interval '90 days')
);
create index if not exists community_live_schedules_user_idx on public.community_live_schedules (user_id, starts_at);
alter table public.community_live_schedules enable row level security;
grant select, insert, update, delete on public.community_live_schedules to authenticated;
create policy live_schedules_read on public.community_live_schedules for select to authenticated
  using (user_id = (select auth.jwt()->>'sub') or ((select private.community_can_see(user_id)) and user_id <> all ((select private.community_block_list())::text[])));
create policy live_schedules_own on public.community_live_schedules for all to authenticated
  using (user_id = (select auth.jwt()->>'sub'))
  with check (user_id = (select auth.jwt()->>'sub') and not (select private.community_is_minor((select auth.jwt()->>'sub'))));
create or replace trigger community_rate_live_schedules before insert on public.community_live_schedules
  for each row execute function public.community_rate_limited('live_schedules', '10', '86400');

create table if not exists public.community_live_reminders (
  schedule_id uuid not null references public.community_live_schedules(id) on delete cascade,
  user_id text not null references public.community_profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (schedule_id, user_id)
);
alter table public.community_live_reminders enable row level security;
grant select, insert, delete on public.community_live_reminders to authenticated;
create policy live_reminders_own on public.community_live_reminders for all to authenticated
  using (user_id = (select auth.jwt()->>'sub'))
  with check (user_id = (select auth.jwt()->>'sub')
    and exists (select 1 from public.community_live_schedules s where s.id = schedule_id));
create policy live_reminders_host on public.community_live_reminders for select to authenticated
  using (exists (select 1 from public.community_live_schedules s where s.id = schedule_id and s.user_id = (select auth.jwt()->>'sub')));

-- When a broadcaster goes live, people who asked to be reminded of a live of theirs within the
-- last or next hour hear about it.
create or replace function public.community_live_started_reminders()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.community_notifications (user_id, actor_id, kind, body)
  select distinct r.user_id, new.user_id, 'live_soon', new.id::text
  from public.community_live_reminders r
  join public.community_live_schedules s on s.id = r.schedule_id
  where s.user_id = new.user_id and s.starts_at between now() - interval '1 hour' and now() + interval '1 hour'
    and new.audience <> 'practice';
  return new;
end $$;
revoke all on function public.community_live_started_reminders() from public, anon, authenticated;
create or replace trigger community_lives_reminders after insert on public.community_lives
  for each row execute function public.community_live_started_reminders();

-- Alerts for new posts skip posts kept to the profile; alerts for a live follow who may watch it.
create or replace function public.community_alert_followers()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'community_posts' then
    if new.group_id is not null or new.profile_only then return new; end if;
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
    if new.audience = 'practice' then return new; end if;
    insert into public.community_notifications (user_id, actor_id, kind, body)
    select a.user_id, new.user_id, 'live', new.id::text
    from public.community_follow_alerts a
    join public.community_follows f on f.follower_id = a.user_id and f.following_id = new.user_id
    where a.target_id = new.user_id and a.live
      and (new.audience <> 'close_friends' or exists (select 1 from public.community_close_friends cf where cf.user_id = new.user_id and cf.friend_id = a.user_id));
  end if;
  return new;
end $$;

-- The cards the app reads carry the new fields.
create or replace view public.community_note_cards with (security_invoker = true) as
SELECT n.user_id, n.text, n.audience, n.created_at, n.expires_at, p.username, p.full_name, p.avatar_url, p.verified,
    n.user_id = ((SELECT auth.jwt() ->> 'sub'::text)) AS mine,
    n.song_id,
    (SELECT i.title FROM public.community_pod_items i WHERE i.id = n.song_id) AS song_title,
    (SELECT i.artist FROM public.community_pod_items i WHERE i.id = n.song_id) AS song_artist,
    (SELECT i.audio_url FROM public.community_pod_items i WHERE i.id = n.song_id) AS song_url,
    (SELECT i.cover_url FROM public.community_pod_items i WHERE i.id = n.song_id) AS song_cover,
    n.place,
    n.color
   FROM public.community_notes n
     JOIN public.community_profiles p ON p.id = n.user_id
  WHERE n.expires_at > now();

create or replace view public.community_live_cards with (security_invoker = true) as
SELECT l.id, l.user_id, l.title, l.started_at, l.ended_at, l.viewers, p.username, p.full_name, p.avatar_url, p.verified,
    (EXISTS (SELECT 1 FROM public.community_follows f WHERE f.following_id = l.user_id AND f.follower_id = ((SELECT auth.jwt() ->> 'sub'::text)))) AS following,
    l.audience,
    l.fundraiser_id
   FROM public.community_lives l
     JOIN public.community_profiles p ON p.id = l.user_id
  WHERE l.ended_at IS NULL AND l.started_at > (now() - '12:00:00'::interval) AND (p.id <> ALL (((SELECT private.community_block_list() AS community_block_list))::text[]));
