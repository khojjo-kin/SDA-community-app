-- Community app v2: reels, reposts, notifications, post sharing in chats, moderation, read models.
-- Additive only (no drops). Identity is the Clerk user id in auth.jwt()->>'sub', as in the existing tables.

-- 1. posts: reels are posts whose first media item is a video
alter table public.community_posts add column if not exists kind text not null default 'post';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'community_posts_kind_check') then
    alter table public.community_posts add constraint community_posts_kind_check check (kind in ('post','reel'));
  end if;
end $$;
create index if not exists community_posts_kind_idx on public.community_posts (kind, created_at desc);

-- 2. messages can carry a shared post
alter table public.community_messages add column if not exists post_id uuid references public.community_posts(id) on delete set null;
create index if not exists community_messages_post_idx on public.community_messages (post_id);

-- 3. reposts
create table if not exists public.community_reposts (
  user_id text not null references public.community_profiles(id) on delete cascade,
  post_id uuid not null references public.community_posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);
create index if not exists community_reposts_post_idx on public.community_reposts (post_id);
alter table public.community_reposts enable row level security;
create policy reposts_read on public.community_reposts for select to authenticated using (true);
create policy reposts_create on public.community_reposts for insert to authenticated with check ((select auth.jwt()->>'sub') = user_id);
create policy reposts_delete on public.community_reposts for delete to authenticated using ((select auth.jwt()->>'sub') = user_id);

-- 4. blocks and reports
create table if not exists public.community_blocks (
  blocker_id text not null references public.community_profiles(id) on delete cascade,
  blocked_id text not null references public.community_profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create index if not exists community_blocks_blocked_idx on public.community_blocks (blocked_id);
alter table public.community_blocks enable row level security;
create policy blocks_own_read on public.community_blocks for select to authenticated using ((select auth.jwt()->>'sub') = blocker_id);
create policy blocks_own_create on public.community_blocks for insert to authenticated with check ((select auth.jwt()->>'sub') = blocker_id);
create policy blocks_own_delete on public.community_blocks for delete to authenticated using ((select auth.jwt()->>'sub') = blocker_id);

create table if not exists public.community_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id text not null references public.community_profiles(id) on delete cascade,
  post_id uuid references public.community_posts(id) on delete set null,
  target_user_id text references public.community_profiles(id) on delete set null,
  reason text not null check (char_length(btrim(reason)) between 1 and 500),
  created_at timestamptz not null default now()
);
create index if not exists community_reports_reporter_idx on public.community_reports (reporter_id);
create index if not exists community_reports_post_idx on public.community_reports (post_id);
create index if not exists community_reports_target_idx on public.community_reports (target_user_id);
alter table public.community_reports enable row level security;
create policy reports_create on public.community_reports for insert to authenticated with check ((select auth.jwt()->>'sub') = reporter_id);

-- 5. notifications, written only by triggers
create table if not exists public.community_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.community_profiles(id) on delete cascade,
  actor_id text not null references public.community_profiles(id) on delete cascade,
  kind text not null check (kind in ('like','comment','follow','repost')),
  post_id uuid references public.community_posts(id) on delete cascade,
  comment_id uuid references public.community_comments(id) on delete cascade,
  body text not null default '',
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists community_notifications_user_idx on public.community_notifications (user_id, created_at desc);
create index if not exists community_notifications_actor_idx on public.community_notifications (actor_id);
create index if not exists community_notifications_post_idx on public.community_notifications (post_id);
create index if not exists community_notifications_comment_idx on public.community_notifications (comment_id);
alter table public.community_notifications enable row level security;
create policy notifications_own_read on public.community_notifications for select to authenticated using ((select auth.jwt()->>'sub') = user_id);
create policy notifications_own_update on public.community_notifications for update to authenticated using ((select auth.jwt()->>'sub') = user_id) with check ((select auth.jwt()->>'sub') = user_id);
create policy notifications_own_delete on public.community_notifications for delete to authenticated using ((select auth.jwt()->>'sub') = user_id);

create unique index if not exists community_notifications_follow_once on public.community_notifications (user_id, actor_id) where kind = 'follow';
create unique index if not exists community_notifications_post_once on public.community_notifications (user_id, actor_id, kind, post_id) where kind in ('like','repost');

-- One notification per (recipient, actor, kind, post). Liking again refreshes it instead of adding another.
create or replace function public.community_notify()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare owner_id text;
begin
  if tg_table_name = 'community_follows' then
    insert into public.community_notifications (user_id, actor_id, kind) values (new.following_id, new.follower_id, 'follow')
    on conflict (user_id, actor_id) where kind = 'follow' do update set created_at = now(), read_at = null;
    return new;
  end if;
  select user_id into owner_id from public.community_posts where id = new.post_id;
  if owner_id is not null and owner_id <> new.user_id then
    if tg_table_name = 'community_likes' then
      insert into public.community_notifications (user_id, actor_id, kind, post_id) values (owner_id, new.user_id, 'like', new.post_id)
      on conflict (user_id, actor_id, kind, post_id) where kind in ('like','repost') do update set created_at = now(), read_at = null;
    elsif tg_table_name = 'community_reposts' then
      insert into public.community_notifications (user_id, actor_id, kind, post_id) values (owner_id, new.user_id, 'repost', new.post_id)
      on conflict (user_id, actor_id, kind, post_id) where kind in ('like','repost') do update set created_at = now(), read_at = null;
    elsif tg_table_name = 'community_comments' then
      insert into public.community_notifications (user_id, actor_id, kind, post_id, comment_id, body) values (owner_id, new.user_id, 'comment', new.post_id, new.id, left(new.text, 140));
    end if;
  end if;
  return new;
end $$;

create or replace trigger community_likes_notify after insert on public.community_likes for each row execute function public.community_notify();
create or replace trigger community_reposts_notify after insert on public.community_reposts for each row execute function public.community_notify();
create or replace trigger community_comments_notify after insert on public.community_comments for each row execute function public.community_notify();
create or replace trigger community_follows_notify after insert on public.community_follows for each row execute function public.community_notify();

-- 6. read models (security_invoker, so table RLS still applies to the caller)
create or replace view public.community_post_cards with (security_invoker = true) as
select p.id, p.user_id, p.caption, p.location, p.media, p.kind, p.created_at,
  pr.username, pr.full_name, pr.avatar_url,
  (select count(*) from public.community_likes l where l.post_id = p.id)::int as like_count,
  (select count(*) from public.community_comments c where c.post_id = p.id)::int as comment_count,
  (select count(*) from public.community_reposts r where r.post_id = p.id)::int as repost_count,
  exists (select 1 from public.community_likes l where l.post_id = p.id and l.user_id = (select auth.jwt()->>'sub')) as liked,
  exists (select 1 from public.community_saves s where s.post_id = p.id and s.user_id = (select auth.jwt()->>'sub')) as saved,
  exists (select 1 from public.community_reposts r where r.post_id = p.id and r.user_id = (select auth.jwt()->>'sub')) as reposted,
  exists (select 1 from public.community_follows f where f.following_id = p.user_id and f.follower_id = (select auth.jwt()->>'sub')) as following_author
from public.community_posts p
join public.community_profiles pr on pr.id = p.user_id
where not exists (select 1 from public.community_blocks b where b.blocker_id = (select auth.jwt()->>'sub') and b.blocked_id = p.user_id);

create or replace view public.community_profile_cards with (security_invoker = true) as
select pr.id, pr.username, pr.full_name, pr.avatar_url, pr.bio, pr.website, pr.created_at,
  (select count(*) from public.community_posts p where p.user_id = pr.id)::int as posts_count,
  (select count(*) from public.community_follows f where f.following_id = pr.id)::int as followers_count,
  (select count(*) from public.community_follows f where f.follower_id = pr.id)::int as following_count,
  exists (select 1 from public.community_follows f where f.following_id = pr.id and f.follower_id = (select auth.jwt()->>'sub')) as is_following,
  exists (select 1 from public.community_follows f where f.follower_id = pr.id and f.following_id = (select auth.jwt()->>'sub')) as follows_me,
  exists (select 1 from public.community_blocks b where b.blocked_id = pr.id and b.blocker_id = (select auth.jwt()->>'sub')) as is_blocked,
  exists (select 1 from public.community_stories s where s.user_id = pr.id and s.expires_at > now()) as has_story
from public.community_profiles pr;

create or replace view public.community_comment_cards with (security_invoker = true) as
select c.id, c.post_id, c.user_id, c.text, c.created_at,
  pr.username, pr.full_name, pr.avatar_url,
  (select count(*) from public.community_comment_likes l where l.comment_id = c.id)::int as like_count,
  exists (select 1 from public.community_comment_likes l where l.comment_id = c.id and l.user_id = (select auth.jwt()->>'sub')) as liked
from public.community_comments c
join public.community_profiles pr on pr.id = c.user_id
where not exists (select 1 from public.community_blocks b where b.blocker_id = (select auth.jwt()->>'sub') and b.blocked_id = c.user_id);

create or replace view public.community_story_cards with (security_invoker = true) as
select s.id, s.user_id, s.item, s.created_at, s.expires_at,
  pr.username, pr.full_name, pr.avatar_url,
  exists (select 1 from public.community_story_views v where v.story_id = s.id and v.viewer_id = (select auth.jwt()->>'sub')) as seen,
  (s.user_id = (select auth.jwt()->>'sub')
    or exists (select 1 from public.community_follows f where f.following_id = s.user_id and f.follower_id = (select auth.jwt()->>'sub'))) as in_tray,
  (select count(*) from public.community_story_views v where v.story_id = s.id)::int as view_count
from public.community_stories s
join public.community_profiles pr on pr.id = s.user_id
where s.expires_at > now()
  and not exists (select 1 from public.community_blocks b where b.blocker_id = (select auth.jwt()->>'sub') and b.blocked_id = s.user_id);

create or replace view public.community_thread_cards with (security_invoker = true) as
select t.id, t.last_message, t.last_message_at, t.created_at,
  o.id as other_id, o.username, o.full_name, o.avatar_url,
  (select count(*) from public.community_messages m
     where m.thread_id = t.id and m.sender_id <> me.sub
       and m.created_at > coalesce((select r.last_read_at from public.community_thread_reads r where r.thread_id = t.id and r.user_id = me.sub), 'epoch'::timestamptz))::int as unread_count,
  exists (select 1 from public.community_messages m where m.thread_id = t.id) as has_messages
from public.community_threads t
cross join lateral (select auth.jwt()->>'sub' as sub) me
join public.community_profiles o on o.id = case when t.user_a = me.sub then t.user_b else t.user_a end;

-- A like, repost or follow that was later undone stops showing, without removing the row.
create or replace view public.community_notification_cards with (security_invoker = true) as
select n.id, n.user_id, n.actor_id, n.kind, n.post_id, n.body, n.created_at, n.read_at,
  a.username, a.full_name, a.avatar_url,
  (select p.media->0 from public.community_posts p where p.id = n.post_id) as post_media,
  exists (select 1 from public.community_follows f where f.following_id = n.actor_id and f.follower_id = n.user_id) as is_following
from public.community_notifications n
join public.community_profiles a on a.id = n.actor_id
where case n.kind
  when 'like' then exists (select 1 from public.community_likes l where l.user_id = n.actor_id and l.post_id = n.post_id)
  when 'repost' then exists (select 1 from public.community_reposts r where r.user_id = n.actor_id and r.post_id = n.post_id)
  when 'follow' then exists (select 1 from public.community_follows f where f.follower_id = n.actor_id and f.following_id = n.user_id)
  else true end;

-- 7. helpers
create or replace function public.community_open_thread(other text)
returns uuid language plpgsql security invoker set search_path to 'public' as $$
declare me text := auth.jwt()->>'sub'; a text; b text; tid uuid;
begin
  if me is null or other is null or me = other then
    raise exception 'A chat needs two different people';
  end if;
  if me < other then a := me; b := other; else a := other; b := me; end if;
  select id into tid from public.community_threads where user_a = a and user_b = b;
  if tid is null then
    insert into public.community_threads (user_a, user_b) values (a, b)
    on conflict (user_a, user_b) do update set user_a = excluded.user_a
    returning id into tid;
  end if;
  return tid;
end $$;

-- People can remove their own profile; every table that references it cascades.
create policy profiles_remove_own on public.community_profiles for delete to authenticated using ((select auth.jwt()->>'sub') = id);

-- 8. privileges: signed-in users only
revoke all on public.community_reposts, public.community_blocks, public.community_reports, public.community_notifications from anon;
revoke all on public.community_post_cards, public.community_profile_cards, public.community_comment_cards, public.community_story_cards, public.community_thread_cards, public.community_notification_cards from anon;
grant select on public.community_post_cards, public.community_profile_cards, public.community_comment_cards, public.community_story_cards, public.community_thread_cards, public.community_notification_cards to authenticated;
revoke all on function public.community_notify() from public, anon, authenticated;
revoke all on function public.community_open_thread(text) from public, anon;
grant execute on function public.community_open_thread(text) to authenticated;

-- 9. live updates for chats and activity
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'community_messages') then
      alter publication supabase_realtime add table public.community_messages;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'community_notifications') then
      alter publication supabase_realtime add table public.community_notifications;
    end if;
  end if;
end $$;

-- 10. read receipts use the database clock
create or replace function public.community_mark_read(thread uuid)
returns void language sql security invoker set search_path to 'public' as $$
  insert into public.community_thread_reads (thread_id, user_id, last_read_at)
  values (thread, auth.jwt()->>'sub', now())
  on conflict (thread_id, user_id) do update set last_read_at = now();
$$;
revoke all on function public.community_mark_read(uuid) from public, anon;
grant execute on function public.community_mark_read(uuid) to authenticated;
