-- Community v3: creator accounts, close friends, highlights, post views, saved replies,
-- frequently asked questions, chat settings and dashboard numbers.
-- Applied to the SDA project on 9 Oct 2026 as four migrations (community_v3_*). Everything here is additive.

-- ---------------------------------------------------------------------------
-- 1. Creator accounts and a few per-account choices
-- ---------------------------------------------------------------------------
alter table public.community_profiles add column if not exists account_type text not null default 'personal';
alter table public.community_profiles add column if not exists category text not null default '';
alter table public.community_profiles add column if not exists show_view_counts boolean not null default true;
alter table public.community_profiles add column if not exists story_replies text not null default 'everyone';
alter table public.community_profiles add column if not exists faq_enabled boolean not null default false;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'community_profiles_account_type_check') then
    alter table public.community_profiles add constraint community_profiles_account_type_check check (account_type in ('personal','creator'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'community_profiles_category_check') then
    alter table public.community_profiles add constraint community_profiles_category_check check (char_length(category) <= 40);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'community_profiles_story_replies_check') then
    alter table public.community_profiles add constraint community_profiles_story_replies_check check (story_replies in ('everyone','following','off'));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Close friends: the owner manages the list; a friend can see that they are on it
--    (that is how the green ring works)
-- ---------------------------------------------------------------------------
create table if not exists public.community_close_friends (
  user_id text not null references public.community_profiles(id) on delete cascade,
  friend_id text not null references public.community_profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, friend_id),
  check (user_id <> friend_id)
);
create index if not exists community_close_friends_friend_idx on public.community_close_friends (friend_id);
alter table public.community_close_friends enable row level security;
create policy close_friends_read on public.community_close_friends for select to authenticated using ((select auth.jwt()->>'sub') in (user_id, friend_id));
create policy close_friends_create on public.community_close_friends for insert to authenticated with check ((select auth.jwt()->>'sub') = user_id);
create policy close_friends_remove on public.community_close_friends for delete to authenticated using ((select auth.jwt()->>'sub') = user_id);

-- Stories can be shared with everyone or with close friends only
alter table public.community_stories add column if not exists audience text not null default 'everyone';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'community_stories_audience_check') then
    alter table public.community_stories add constraint community_stories_audience_check check (audience in ('everyone','close_friends'));
  end if;
end $$;
create policy stories_audience on public.community_stories as restrictive for select to authenticated
  using (audience = 'everyone'
    or user_id = (select auth.jwt()->>'sub')
    or exists (select 1 from public.community_close_friends cf where cf.user_id = community_stories.user_id and cf.friend_id = (select auth.jwt()->>'sub')));

-- ---------------------------------------------------------------------------
-- 3. Highlights keep their own copy of each story, because stories expire
-- ---------------------------------------------------------------------------
create table if not exists public.community_highlights (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.community_profiles(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 30),
  cover_url text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists community_highlights_user_idx on public.community_highlights (user_id, created_at);
alter table public.community_highlights enable row level security;
create policy highlights_read on public.community_highlights for select to authenticated using (true);
create policy highlights_create on public.community_highlights for insert to authenticated with check ((select auth.jwt()->>'sub') = user_id);
create policy highlights_update on public.community_highlights for update to authenticated using ((select auth.jwt()->>'sub') = user_id) with check ((select auth.jwt()->>'sub') = user_id);
create policy highlights_remove on public.community_highlights for delete to authenticated using ((select auth.jwt()->>'sub') = user_id);

create table if not exists public.community_highlight_items (
  id uuid primary key default gen_random_uuid(),
  highlight_id uuid not null references public.community_highlights(id) on delete cascade,
  user_id text not null references public.community_profiles(id) on delete cascade,
  item jsonb not null check (jsonb_typeof(item) = 'object' and item ? 'url' and item ? 'type'),
  created_at timestamptz not null default now()
);
create index if not exists community_highlight_items_highlight_idx on public.community_highlight_items (highlight_id, created_at);
create index if not exists community_highlight_items_user_idx on public.community_highlight_items (user_id);
alter table public.community_highlight_items enable row level security;
create policy highlight_items_read on public.community_highlight_items for select to authenticated using (true);
create policy highlight_items_create on public.community_highlight_items for insert to authenticated
  with check ((select auth.jwt()->>'sub') = user_id and exists (select 1 from public.community_highlights h where h.id = highlight_id and h.user_id = (select auth.jwt()->>'sub')));
create policy highlight_items_remove on public.community_highlight_items for delete to authenticated using ((select auth.jwt()->>'sub') = user_id);

revoke all on public.community_close_friends, public.community_highlights, public.community_highlight_items from anon;

-- ---------------------------------------------------------------------------
-- 4. Post views, saved replies and frequently asked questions
-- ---------------------------------------------------------------------------
-- Who has seen which post (one row per person per post). Private: only the viewer and the post's owner can read rows.
create table if not exists public.community_post_views (
  post_id uuid not null references public.community_posts(id) on delete cascade,
  viewer_id text not null references public.community_profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, viewer_id)
);
create index if not exists community_post_views_created_idx on public.community_post_views (created_at);
create index if not exists community_post_views_viewer_idx on public.community_post_views (viewer_id);
alter table public.community_post_views enable row level security;

create policy post_views_create on public.community_post_views for insert to authenticated
  with check ((select auth.jwt()->>'sub') = viewer_id);
create policy post_views_read on public.community_post_views for select to authenticated
  using (
    (select auth.jwt()->>'sub') = viewer_id
    or exists (select 1 from public.community_posts p where p.id = community_post_views.post_id and p.user_id = (select auth.jwt()->>'sub'))
  );

-- Saved replies: short messages a person keeps to reuse in chats. Private to their owner.
create table if not exists public.community_saved_replies (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.community_profiles(id) on delete cascade,
  shortcut text not null default '' check (char_length(shortcut) <= 30),
  body text not null check (char_length(btrim(body)) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index if not exists community_saved_replies_user_idx on public.community_saved_replies (user_id, created_at);
alter table public.community_saved_replies enable row level security;

create policy saved_replies_read on public.community_saved_replies for select to authenticated
  using ((select auth.jwt()->>'sub') = user_id);
create policy saved_replies_create on public.community_saved_replies for insert to authenticated
  with check ((select auth.jwt()->>'sub') = user_id);
create policy saved_replies_update on public.community_saved_replies for update to authenticated
  using ((select auth.jwt()->>'sub') = user_id) with check ((select auth.jwt()->>'sub') = user_id);
create policy saved_replies_remove on public.community_saved_replies for delete to authenticated
  using ((select auth.jwt()->>'sub') = user_id);

-- Frequently asked questions shown at the top of a chat with a creator. Anyone signed in can read them.
create table if not exists public.community_faqs (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.community_profiles(id) on delete cascade,
  question text not null check (char_length(btrim(question)) between 1 and 120),
  answer text not null default '' check (char_length(answer) <= 1000),
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists community_faqs_user_idx on public.community_faqs (user_id, position, created_at);
alter table public.community_faqs enable row level security;

create policy faqs_read on public.community_faqs for select to authenticated using (true);
create policy faqs_create on public.community_faqs for insert to authenticated
  with check ((select auth.jwt()->>'sub') = user_id);
create policy faqs_update on public.community_faqs for update to authenticated
  using ((select auth.jwt()->>'sub') = user_id) with check ((select auth.jwt()->>'sub') = user_id);
create policy faqs_remove on public.community_faqs for delete to authenticated
  using ((select auth.jwt()->>'sub') = user_id);

revoke all on public.community_post_views, public.community_saved_replies, public.community_faqs from anon;

-- ---------------------------------------------------------------------------
-- 5. Functions
-- ---------------------------------------------------------------------------
-- How many other people have seen a post. Shown to everyone unless the owner turned view counts off.
create or replace function public.community_post_view_count(post uuid)
returns integer
language sql stable security definer
set search_path = public
as $$
  select case
    when p.user_id = (auth.jwt()->>'sub') or pr.show_view_counts then
      (select count(*)::integer from public.community_post_views v where v.post_id = p.id and v.viewer_id <> p.user_id)
    else null end
  from public.community_posts p
  join public.community_profiles pr on pr.id = p.user_id
  where p.id = post
$$;

-- Hides everything in a chat up to now, for the caller only. New messages bring the chat back.
create or replace function public.community_hide_thread(thread uuid)
returns void
language sql
set search_path = public
as $$
  insert into public.community_thread_settings (thread_id, user_id, hidden_before)
  values (thread, auth.jwt()->>'sub', now())
  on conflict (thread_id, user_id) do update set hidden_before = now();
$$;

-- Asks one of a creator's frequently asked questions: sends the question as the caller,
-- then the creator's saved answer as an automatic reply.
create or replace function public.community_ask_faq(faq uuid)
returns uuid
language plpgsql security definer
set search_path = public
as $$
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
  select q.user_id, q.question, q.answer, pr.faq_enabled into f
    from public.community_faqs q
    join public.community_profiles pr on pr.id = q.user_id
    where q.id = faq;
  if not found or not f.faq_enabled then
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
    insert into public.community_threads (user_a, user_b) values (a, b)
    on conflict (user_a, user_b) do update set user_a = excluded.user_a
    returning id into tid;
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

-- Numbers for the caller's dashboard between two moments.
create or replace function public.community_stats(from_ts timestamptz, to_ts timestamptz)
returns jsonb
language sql stable
set search_path = public
as $$
  with me as (select auth.jwt()->>'sub' as id),
  my_posts as (
    select p.id, p.kind, p.media, p.created_at
    from public.community_posts p cross join me
    where p.user_id = me.id
  ),
  pv as (
    select v.post_id, v.viewer_id, v.created_at as at
    from public.community_post_views v
    join my_posts mp on mp.id = v.post_id
    cross join me
    where v.viewer_id <> me.id and v.created_at >= from_ts and v.created_at < to_ts
  ),
  sv as (
    select v.story_id, v.viewer_id, v.viewed_at as at
    from public.community_story_views v
    join public.community_stories s on s.id = v.story_id
    cross join me
    where s.user_id = me.id and v.viewer_id <> me.id and v.viewed_at >= from_ts and v.viewed_at < to_ts
  ),
  fl as (
    select f.created_at as at
    from public.community_follows f cross join me
    where f.following_id = me.id and f.created_at >= from_ts and f.created_at < to_ts
  ),
  days as (
    select d as day
    from generate_series(
      greatest(date_trunc('day', from_ts), date_trunc('day', to_ts) - interval '92 days'),
      date_trunc('day', to_ts - interval '1 microsecond'),
      interval '1 day') as d
  )
  select jsonb_build_object(
    'views', (select count(*) from pv) + (select count(*) from sv),
    'post_views', (select count(*) from pv),
    'story_views', (select count(*) from sv),
    'accounts', (select count(*) from (select viewer_id from pv union select viewer_id from sv) u),
    'new_followers', (select count(*) from fl),
    'followers', (select count(*) from public.community_follows f cross join me where f.following_id = me.id),
    'posts', (select count(*) from my_posts where kind = 'post' and created_at >= from_ts and created_at < to_ts),
    'reels', (select count(*) from my_posts where kind = 'reel' and created_at >= from_ts and created_at < to_ts),
    'stories', (select count(*) from public.community_stories s cross join me where s.user_id = me.id and s.created_at >= from_ts and s.created_at < to_ts),
    'likes', (select count(*) from public.community_likes l join my_posts mp on mp.id = l.post_id cross join me where l.user_id <> me.id and l.created_at >= from_ts and l.created_at < to_ts),
    'comments', (select count(*) from public.community_comments c join my_posts mp on mp.id = c.post_id cross join me where c.user_id <> me.id and c.created_at >= from_ts and c.created_at < to_ts),
    'reposts', (select count(*) from public.community_reposts r join my_posts mp on mp.id = r.post_id cross join me where r.user_id <> me.id and r.created_at >= from_ts and r.created_at < to_ts),
    'days', (select coalesce(jsonb_agg(jsonb_build_object(
                'd', to_char(days.day, 'YYYY-MM-DD'),
                'views', (select count(*) from pv where pv.at >= days.day and pv.at < days.day + interval '1 day')
                       + (select count(*) from sv where sv.at >= days.day and sv.at < days.day + interval '1 day'),
                'followers', (select count(*) from fl where fl.at >= days.day and fl.at < days.day + interval '1 day')
              ) order by days.day), '[]'::jsonb) from days),
    'top', (select coalesce(jsonb_agg(to_jsonb(t) order by t.views desc, t.created_at desc), '[]'::jsonb)
            from (
              select mp.id, mp.kind, mp.media->0 as media, mp.created_at,
                     (select count(*) from pv where pv.post_id = mp.id) as views,
                     (select count(*) from public.community_likes l where l.post_id = mp.id) as likes,
                     (select count(*) from public.community_comments c where c.post_id = mp.id) as comments
              from my_posts mp
              order by 5 desc, mp.created_at desc
              limit 6
            ) t)
  )
$$;

revoke all on function public.community_post_view_count(uuid) from public, anon;
revoke all on function public.community_hide_thread(uuid) from public, anon;
revoke all on function public.community_ask_faq(uuid) from public, anon;
revoke all on function public.community_stats(timestamptz, timestamptz) from public, anon;
grant execute on function public.community_post_view_count(uuid) to authenticated;
grant execute on function public.community_hide_thread(uuid) to authenticated;
grant execute on function public.community_ask_faq(uuid) to authenticated;
grant execute on function public.community_stats(timestamptz, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Read models, replaced in place. Existing columns keep their order; new ones are added at the end.
-- ---------------------------------------------------------------------------
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
  public.community_post_view_count(p.id) as view_count
from public.community_posts p
join public.community_profiles pr on pr.id = p.user_id
where not exists (select 1 from public.community_blocks b where b.blocker_id = (select auth.jwt()->>'sub') and b.blocked_id = p.user_id);

create or replace view public.community_profile_cards with (security_invoker = true) as
select pr.id, pr.username, pr.full_name, pr.avatar_url, pr.bio, pr.website, pr.created_at,
  (select count(*) from public.community_posts p where p.user_id = pr.id)::integer as posts_count,
  (select count(*) from public.community_follows f where f.following_id = pr.id)::integer as followers_count,
  (select count(*) from public.community_follows f where f.follower_id = pr.id)::integer as following_count,
  exists (select 1 from public.community_follows f where f.following_id = pr.id and f.follower_id = (select auth.jwt()->>'sub')) as is_following,
  exists (select 1 from public.community_follows f where f.follower_id = pr.id and f.following_id = (select auth.jwt()->>'sub')) as follows_me,
  exists (select 1 from public.community_blocks b where b.blocked_id = pr.id and b.blocker_id = (select auth.jwt()->>'sub')) as is_blocked,
  exists (select 1 from public.community_stories s where s.user_id = pr.id and s.expires_at > now()) as has_story,
  pr.account_type, pr.category, pr.show_view_counts, pr.story_replies, pr.faq_enabled,
  exists (select 1 from public.community_close_friends cf where cf.user_id = (select auth.jwt()->>'sub') and cf.friend_id = pr.id) as is_close_friend
from public.community_profiles pr;

create or replace view public.community_story_cards with (security_invoker = true) as
select s.id, s.user_id, s.item, s.created_at, s.expires_at, pr.username, pr.full_name, pr.avatar_url,
  exists (select 1 from public.community_story_views v where v.story_id = s.id and v.viewer_id = (select auth.jwt()->>'sub')) as seen,
  (s.user_id = (select auth.jwt()->>'sub') or exists (select 1 from public.community_follows f where f.following_id = s.user_id and f.follower_id = (select auth.jwt()->>'sub'))) as in_tray,
  (select count(*) from public.community_story_views v where v.story_id = s.id)::integer as view_count,
  s.audience, pr.story_replies,
  exists (select 1 from public.community_follows f where f.follower_id = s.user_id and f.following_id = (select auth.jwt()->>'sub')) as follows_viewer
from public.community_stories s
join public.community_profiles pr on pr.id = s.user_id
where s.expires_at > now()
  and not exists (select 1 from public.community_blocks b where b.blocker_id = (select auth.jwt()->>'sub') and b.blocked_id = s.user_id);

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
left join public.community_thread_settings st on st.thread_id = t.id and st.user_id = me.sub;

revoke all on public.community_post_cards, public.community_profile_cards, public.community_story_cards, public.community_thread_cards from anon;
grant select on public.community_post_cards, public.community_profile_cards, public.community_story_cards, public.community_thread_cards to authenticated;
