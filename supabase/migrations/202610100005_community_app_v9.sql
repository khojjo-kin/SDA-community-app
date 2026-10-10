-- Community app, version 9: private accounts, Plus perks, Pod, live and in-app calls, support and
-- the admin console.
--
--   1. Private accounts: a private profile's posts and stories are seen by its followers only, and
--      following one sends a request the owner accepts or declines.
--   2. Plus perks that need the server: who viewed your profile, read receipts off, boosting a post.
--   3. Pod: songs and podcasts anyone listens to; admins and Plus members add them.
--   4. Live broadcasts and calls between two people, signalled over Realtime; the rows here say who
--      is live and who is calling whom, so the other phone can ring.
--   5. Transactions and support tickets, for the admin console. Erha gets the tick.

-- ---------------------------------------------------------------------------------------------
-- 1. private accounts and follow requests
-- ---------------------------------------------------------------------------------------------

alter table public.community_profiles
  add column if not exists is_private boolean not null default false,
  add column if not exists read_receipts boolean not null default true;

create table if not exists public.community_follow_requests (
  requester_id text not null references public.community_profiles(id) on delete cascade,
  target_id text not null references public.community_profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (requester_id, target_id),
  check (requester_id <> target_id)
);
alter table public.community_follow_requests enable row level security;
create index if not exists community_follow_requests_target_idx on public.community_follow_requests (target_id, created_at desc);
grant select, insert, delete on public.community_follow_requests to authenticated;

create policy follow_requests_read on public.community_follow_requests for select to authenticated
  using (requester_id = (select auth.jwt()->>'sub') or target_id = (select auth.jwt()->>'sub'));
-- You can only ask to follow a private account you do not already follow.
create policy follow_requests_create on public.community_follow_requests for insert to authenticated
  with check (requester_id = (select auth.jwt()->>'sub')
    and exists (select 1 from public.community_profiles p where p.id = target_id and p.is_private)
    and not exists (select 1 from public.community_follows f where f.follower_id = requester_id and f.following_id = target_id));
-- Either side can withdraw or decline.
create policy follow_requests_remove on public.community_follow_requests for delete to authenticated
  using (requester_id = (select auth.jwt()->>'sub') or target_id = (select auth.jwt()->>'sub'));

-- Following a private account directly is refused: it goes through a request.
create policy follows_private_needs_request on public.community_follows as restrictive for insert to authenticated
  with check (not exists (select 1 from public.community_profiles p where p.id = following_id and p.is_private));

-- Accepting a request makes the follow (this runs as the owner, so the rule above does not apply).
create or replace function public.community_accept_follow_request(p_requester text)
returns void language plpgsql security definer set search_path = '' as $$
declare me text := auth.jwt()->>'sub';
begin
  if me is null then raise exception 'Sign in first'; end if;
  if not exists (select 1 from public.community_follow_requests r where r.requester_id = p_requester and r.target_id = me) then
    raise exception 'There is no request from that account';
  end if;
  insert into public.community_follows (follower_id, following_id) values (p_requester, me) on conflict do nothing;
  delete from public.community_follow_requests where requester_id = p_requester and target_id = me;
  insert into public.community_notifications (user_id, actor_id, kind) values (p_requester, me, 'accept')
    on conflict (user_id, actor_id) where kind = 'accept' do update set created_at = now(), read_at = null;
end $$;
revoke all on function public.community_accept_follow_request(text) from public, anon;
grant execute on function public.community_accept_follow_request(text) to authenticated;

-- Follow requests and accepted requests show in notifications.
alter table public.community_notifications drop constraint if exists community_notifications_kind_check;
alter table public.community_notifications add constraint community_notifications_kind_check
  check (kind in ('like','comment','follow','repost','request','accept'));
create unique index if not exists community_notifications_request_once on public.community_notifications (user_id, actor_id) where kind = 'request';
create unique index if not exists community_notifications_accept_once on public.community_notifications (user_id, actor_id) where kind = 'accept';

create or replace function public.community_notify_request()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.community_notifications (user_id, actor_id, kind) values (new.target_id, new.requester_id, 'request')
    on conflict (user_id, actor_id) where kind = 'request' do update set created_at = now(), read_at = null;
  return new;
end $$;
revoke all on function public.community_notify_request() from public, anon, authenticated;
create or replace trigger community_follow_requests_notify after insert on public.community_follow_requests
  for each row execute function public.community_notify_request();

-- A withdrawn or declined request takes its notification with it.
create or replace function public.community_unnotify_request()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  delete from public.community_notifications where user_id = old.target_id and actor_id = old.requester_id and kind = 'request';
  return old;
end $$;
revoke all on function public.community_unnotify_request() from public, anon, authenticated;
create or replace trigger community_follow_requests_unnotify after delete on public.community_follow_requests
  for each row execute function public.community_unnotify_request();

-- Who may see what a private account shares: the account itself, its followers, and admins.
create or replace function private.community_can_see(author text)
returns boolean language sql stable security definer set search_path = '' as $$
  select author = (auth.jwt()->>'sub')
    or not coalesce((select p.is_private from public.community_profiles p where p.id = author), false)
    or exists (select 1 from public.community_follows f where f.following_id = author and f.follower_id = (auth.jwt()->>'sub'))
    or (select private.community_is_admin())
$$;
revoke all on function private.community_can_see(text) from public, anon;
grant execute on function private.community_can_see(text) to authenticated;

create policy posts_private_author on public.community_posts as restrictive for select to authenticated
  using ((select private.community_can_see(user_id)));
create policy stories_private_author on public.community_stories as restrictive for select to authenticated
  using ((select private.community_can_see(user_id)));

-- ---------------------------------------------------------------------------------------------
-- 2. Plus perks: profile viewers, read receipts off, boosting
-- ---------------------------------------------------------------------------------------------

create or replace function private.community_is_plus()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select p.plus_until > now() from public.community_profiles p where p.id = (auth.jwt()->>'sub')), false)
$$;
revoke all on function private.community_is_plus() from public, anon;
grant execute on function private.community_is_plus() to authenticated;

create table if not exists public.community_profile_views (
  viewer_id text not null references public.community_profiles(id) on delete cascade,
  profile_id text not null references public.community_profiles(id) on delete cascade,
  viewed_at timestamptz not null default now(),
  primary key (viewer_id, profile_id),
  check (viewer_id <> profile_id)
);
alter table public.community_profile_views enable row level security;
create index if not exists community_profile_views_profile_idx on public.community_profile_views (profile_id, viewed_at desc);
grant select, insert, update on public.community_profile_views to authenticated;
create policy profile_views_record on public.community_profile_views for insert to authenticated
  with check (viewer_id = (select auth.jwt()->>'sub'));
create policy profile_views_refresh on public.community_profile_views for update to authenticated
  using (viewer_id = (select auth.jwt()->>'sub'));
-- Plus members see who viewed their profile. Admins see any.
create policy profile_views_plus_read on public.community_profile_views for select to authenticated
  using ((profile_id = (select auth.jwt()->>'sub') and (select private.community_is_plus())) or (select private.community_is_admin()));

create or replace view public.community_profile_viewer_cards with (security_invoker = true) as
select v.profile_id, v.viewer_id, v.viewed_at, p.username, p.full_name, p.avatar_url, p.verified
from public.community_profile_views v
join public.community_profiles p on p.id = v.viewer_id;
revoke all on public.community_profile_viewer_cards from anon;
grant select on public.community_profile_viewer_cards to authenticated;

-- Read receipts off: the other person no longer sees your read marker (so no "Seen").
alter policy thread_reads_participants on public.community_thread_reads
  using (user_id = (select auth.jwt()->>'sub')
    or (exists (select 1 from public.community_threads t where t.id = thread_id
          and (t.user_a = (select auth.jwt()->>'sub') or t.user_b = (select auth.jwt()->>'sub')))
        and coalesce((select p.read_receipts from public.community_profiles p where p.id = user_id), true)));

-- Boosting: a Plus member's post sits at the top of For you and Explore for a day.
alter table public.community_posts add column if not exists boosted_until timestamptz;
create index if not exists community_posts_boosted_idx on public.community_posts (boosted_until desc) where boosted_until is not null;
create policy posts_update_own on public.community_posts for update to authenticated
  using (user_id = (select auth.jwt()->>'sub')) with check (user_id = (select auth.jwt()->>'sub'));

-- Only Plus members boost, and only read receipts and privacy can be changed by Plus rules below.
create or replace function public.community_plus_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'community_posts' then
    if new.boosted_until is distinct from old.boosted_until and new.boosted_until is not null and not private.community_is_plus() then
      raise exception 'Boosting is part of Community Plus';
    end if;
    if new.boosted_until is distinct from old.boosted_until and new.boosted_until > now() + interval '7 days' then
      raise exception 'A boost lasts up to 7 days';
    end if;
  elsif tg_table_name = 'community_profiles' then
    if new.read_receipts = false and old.read_receipts = true and not private.community_is_plus() and not private.community_is_admin() then
      raise exception 'Turning off read receipts is part of Community Plus';
    end if;
  end if;
  return new;
end $$;
revoke all on function public.community_plus_guard() from public, anon, authenticated;
create or replace trigger community_posts_plus_guard before update on public.community_posts
  for each row execute function public.community_plus_guard();
create or replace trigger community_profiles_plus_guard before update on public.community_profiles
  for each row execute function public.community_plus_guard();

-- ---------------------------------------------------------------------------------------------
-- 3. Pod: songs and podcasts
-- ---------------------------------------------------------------------------------------------

create table if not exists public.community_pod_items (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.community_profiles(id) on delete cascade,
  kind text not null check (kind in ('song', 'podcast')),
  title text not null check (length(title) between 1 and 160),
  artist text not null default '' check (length(artist) <= 160),
  description text not null default '' check (length(description) <= 2000),
  cover_url text not null default '' check (length(cover_url) <= 500),
  audio_url text not null check (length(audio_url) between 1 and 500),
  duration_seconds integer not null default 0 check (duration_seconds >= 0),
  plays integer not null default 0,
  created_at timestamptz not null default now()
);
alter table public.community_pod_items enable row level security;
create index if not exists community_pod_items_created_idx on public.community_pod_items (created_at desc);
create index if not exists community_pod_items_kind_idx on public.community_pod_items (kind, created_at desc);
grant select, insert, update, delete on public.community_pod_items to authenticated;
create policy pod_read on public.community_pod_items for select to authenticated using (true);
create policy pod_add on public.community_pod_items for insert to authenticated
  with check (user_id = (select auth.jwt()->>'sub') and ((select private.community_is_plus()) or (select private.community_is_admin())));
create policy pod_edit on public.community_pod_items for update to authenticated
  using (user_id = (select auth.jwt()->>'sub') or (select private.community_is_admin()));
create policy pod_remove on public.community_pod_items for delete to authenticated
  using (user_id = (select auth.jwt()->>'sub') or (select private.community_is_admin()));

create table if not exists public.community_pod_saves (
  user_id text not null references public.community_profiles(id) on delete cascade,
  item_id uuid not null references public.community_pod_items(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, item_id)
);
alter table public.community_pod_saves enable row level security;
grant select, insert, delete on public.community_pod_saves to authenticated;
create policy pod_saves_own on public.community_pod_saves for select to authenticated using (user_id = (select auth.jwt()->>'sub'));
create policy pod_saves_add on public.community_pod_saves for insert to authenticated with check (user_id = (select auth.jwt()->>'sub'));
create policy pod_saves_remove on public.community_pod_saves for delete to authenticated using (user_id = (select auth.jwt()->>'sub'));

-- A play counts once per listen; anyone signed in can count one.
create or replace function public.community_pod_played(item uuid)
returns void language sql security definer set search_path = '' as $$
  update public.community_pod_items set plays = plays + 1 where id = item;
$$;
revoke all on function public.community_pod_played(uuid) from public, anon;
grant execute on function public.community_pod_played(uuid) to authenticated;

create or replace view public.community_pod_cards with (security_invoker = true) as
select i.id, i.user_id, i.kind, i.title, i.artist, i.description, i.cover_url, i.audio_url, i.duration_seconds, i.plays, i.created_at,
  p.username, p.full_name, p.avatar_url,
  exists (select 1 from public.community_pod_saves s where s.item_id = i.id and s.user_id = (select auth.jwt()->>'sub')) as saved
from public.community_pod_items i
join public.community_profiles p on p.id = i.user_id;
revoke all on public.community_pod_cards from anon;
grant select on public.community_pod_cards to authenticated;

-- A post can carry a song from Pod.
alter table public.community_posts add column if not exists audio_id uuid references public.community_pod_items(id) on delete set null;

-- ---------------------------------------------------------------------------------------------
-- 4. live and calls
-- ---------------------------------------------------------------------------------------------

create table if not exists public.community_lives (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.community_profiles(id) on delete cascade,
  title text not null default '' check (length(title) <= 120),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  viewers integer not null default 0
);
alter table public.community_lives enable row level security;
create index if not exists community_lives_open_idx on public.community_lives (started_at desc) where ended_at is null;
grant select, insert, update on public.community_lives to authenticated;
create policy lives_read on public.community_lives for select to authenticated using (true);
create policy lives_start on public.community_lives for insert to authenticated
  with check (user_id = (select auth.jwt()->>'sub') and not (select private.community_suspended()));
create policy lives_update on public.community_lives for update to authenticated
  using (user_id = (select auth.jwt()->>'sub') or (select private.community_is_admin()));

create or replace view public.community_live_cards with (security_invoker = true) as
select l.id, l.user_id, l.title, l.started_at, l.ended_at, l.viewers, p.username, p.full_name, p.avatar_url, p.verified,
  exists (select 1 from public.community_follows f where f.following_id = l.user_id and f.follower_id = (select auth.jwt()->>'sub')) as following
from public.community_lives l
join public.community_profiles p on p.id = l.user_id
where l.ended_at is null and l.started_at > now() - interval '12 hours'
  and p.id <> all ((select private.community_block_list())::text[]);
revoke all on public.community_live_cards from anon;
grant select on public.community_live_cards to authenticated;

-- A live that was never ended (the app was closed) is tidied away after a while.
create or replace function private.community_end_stale_lives()
returns void language sql security definer set search_path = '' as $$
  update public.community_lives set ended_at = now() where ended_at is null and started_at < now() - interval '6 hours';
$$;
select cron.schedule('community-end-stale-lives', '*/30 * * * *', $$select private.community_end_stale_lives()$$);

create table if not exists public.community_calls (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid references public.community_threads(id) on delete set null,
  caller_id text not null references public.community_profiles(id) on delete cascade,
  callee_id text not null references public.community_profiles(id) on delete cascade,
  kind text not null check (kind in ('voice', 'video')),
  status text not null default 'ringing' check (status in ('ringing', 'accepted', 'declined', 'missed', 'ended', 'busy')),
  created_at timestamptz not null default now(),
  answered_at timestamptz,
  ended_at timestamptz,
  check (caller_id <> callee_id)
);
alter table public.community_calls enable row level security;
create index if not exists community_calls_callee_idx on public.community_calls (callee_id, created_at desc);
create index if not exists community_calls_caller_idx on public.community_calls (caller_id, created_at desc);
grant select, insert, update on public.community_calls to authenticated;
create policy calls_participants_read on public.community_calls for select to authenticated
  using (caller_id = (select auth.jwt()->>'sub') or callee_id = (select auth.jwt()->>'sub'));
create policy calls_start on public.community_calls for insert to authenticated
  with check (caller_id = (select auth.jwt()->>'sub') and not (select private.community_suspended())
    and callee_id <> all ((select private.community_block_list())::text[]));
create policy calls_participants_update on public.community_calls for update to authenticated
  using (caller_id = (select auth.jwt()->>'sub') or callee_id = (select auth.jwt()->>'sub'));

alter publication supabase_realtime add table public.community_calls;
alter publication supabase_realtime add table public.community_lives;

-- ---------------------------------------------------------------------------------------------
-- 5. transactions, support, activity, Erha
-- ---------------------------------------------------------------------------------------------

create table if not exists public.community_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id text references public.community_profiles(id) on delete set null,
  kind text not null check (kind in ('plus', 'donation', 'refund', 'other')),
  amount_pence integer not null default 0,
  currency text not null default 'GBP' check (length(currency) = 3),
  note text not null default '' check (length(note) <= 500),
  created_by text references public.community_profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.community_transactions enable row level security;
create index if not exists community_transactions_created_idx on public.community_transactions (created_at desc);
grant select, insert, delete on public.community_transactions to authenticated;
create policy transactions_read on public.community_transactions for select to authenticated
  using (user_id = (select auth.jwt()->>'sub') or (select private.community_is_admin()));
create policy transactions_admin_add on public.community_transactions for insert to authenticated
  with check ((select private.community_is_admin()) and created_by = (select auth.jwt()->>'sub'));
create policy transactions_owner_remove on public.community_transactions for delete to authenticated
  using ((select private.community_is_owner()));

create or replace view public.community_transaction_cards with (security_invoker = true) as
select t.id, t.user_id, t.kind, t.amount_pence, t.currency, t.note, t.created_by, t.created_at,
  p.username, p.full_name, p.avatar_url,
  (select a.username from public.community_profiles a where a.id = t.created_by) as created_by_username
from public.community_transactions t
left join public.community_profiles p on p.id = t.user_id;
revoke all on public.community_transaction_cards from anon;
grant select on public.community_transaction_cards to authenticated;

create table if not exists public.community_support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.community_profiles(id) on delete cascade,
  subject text not null check (length(subject) between 1 and 140),
  body text not null check (length(body) between 1 and 4000),
  status text not null default 'open' check (status in ('open', 'answered', 'closed')),
  reply text not null default '' check (length(reply) <= 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.community_support_tickets enable row level security;
create index if not exists community_support_tickets_user_idx on public.community_support_tickets (user_id, created_at desc);
create index if not exists community_support_tickets_open_idx on public.community_support_tickets (status, created_at desc);
grant select, insert, update on public.community_support_tickets to authenticated;
create policy support_read on public.community_support_tickets for select to authenticated
  using (user_id = (select auth.jwt()->>'sub') or (select private.community_is_admin()));
create policy support_open on public.community_support_tickets for insert to authenticated
  with check (user_id = (select auth.jwt()->>'sub'));
create policy support_update on public.community_support_tickets for update to authenticated
  using (user_id = (select auth.jwt()->>'sub') or (select private.community_is_admin()));

create or replace view public.community_support_cards with (security_invoker = true) as
select t.id, t.user_id, t.subject, t.body, t.status, t.reply, t.created_at, t.updated_at, p.username, p.full_name, p.avatar_url
from public.community_support_tickets t
join public.community_profiles p on p.id = t.user_id;
revoke all on public.community_support_cards from anon;
grant select on public.community_support_cards to authenticated;

-- What happened lately, for the admin console: newest first, across the app.
create or replace function public.community_admin_activity(p_limit integer default 80)
returns table (at timestamptz, kind text, user_id text, username text, detail text)
language sql stable security definer set search_path = '' as $$
  select * from (
    select p.created_at as at, 'joined'::text as kind, p.id as user_id, p.username, p.full_name as detail from public.community_profiles p
    union all
    select po.created_at, case when po.kind = 'reel' then 'reel' else 'post' end, po.user_id, pr.username, left(po.caption, 80)
      from public.community_posts po join public.community_profiles pr on pr.id = po.user_id
    union all
    select l.started_at, 'live', l.user_id, pr.username, l.title from public.community_lives l join public.community_profiles pr on pr.id = l.user_id
    union all
    select r.created_at, 'report', r.reporter_id, pr.username, r.reason from public.community_reports r join public.community_profiles pr on pr.id = r.reporter_id
    union all
    select t.created_at, 'transaction', t.user_id, pr.username, t.kind || ' ' || t.currency || ' ' || (t.amount_pence / 100.0)::text
      from public.community_transactions t left join public.community_profiles pr on pr.id = t.user_id
    union all
    select s.created_at, 'support', s.user_id, pr.username, s.subject from public.community_support_tickets s join public.community_profiles pr on pr.id = s.user_id
    union all
    select q.created_at, 'plus_request', q.user_id, pr.username, q.kind from public.community_plus_requests q join public.community_profiles pr on pr.id = q.user_id
    union all
    select g.created_at, 'group', g.created_by, pr.username, g.name from public.community_groups g join public.community_profiles pr on pr.id = g.created_by
  ) x
  where (select private.community_is_admin())
  order by at desc
  limit greatest(1, least(p_limit, 300));
$$;
revoke all on function public.community_admin_activity(integer) from public, anon;
grant execute on function public.community_admin_activity(integer) to authenticated;

-- More numbers for the console.
create or replace function public.community_admin_stats()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.community_is_admin() then raise exception 'Admins only'; end if;
  return jsonb_build_object(
    'members', (select count(*) from public.community_profiles),
    'members_week', (select count(*) from public.community_profiles where created_at > now() - interval '7 days'),
    'posts', (select count(*) from public.community_posts),
    'posts_week', (select count(*) from public.community_posts where created_at > now() - interval '7 days'),
    'stories_live', (select count(*) from public.community_stories where expires_at > now()),
    'messages_week', (select count(*) from public.community_messages where created_at > now() - interval '7 days'),
    'reports_open', (select count(*) from public.community_reports where status = 'open'),
    'requests_open', (select count(*) from public.community_plus_requests where status = 'pending'),
    'verified', (select count(*) from public.community_profiles where verified),
    'plus', (select count(*) from public.community_profiles where plus_until > now()),
    'suspended', (select count(*) from public.community_profiles where suspended),
    'churches', (select count(*) from public.community_churches),
    'hymns', (select count(*) from public.community_hymns),
    'lives_now', (select count(*) from public.community_lives where ended_at is null and started_at > now() - interval '12 hours'),
    'pod_items', (select count(*) from public.community_pod_items),
    'support_open', (select count(*) from public.community_support_tickets where status = 'open'),
    'groups', (select count(*) from public.community_groups),
    'income_pence', (select coalesce(sum(amount_pence), 0) from public.community_transactions where kind in ('plus', 'donation', 'other')),
    'income_month_pence', (select coalesce(sum(amount_pence), 0) from public.community_transactions where kind in ('plus', 'donation', 'other') and created_at > date_trunc('month', now())),
    'deactivated', (select count(*) from public.community_profiles where deleted_at is not null));
end $$;

-- Erha, the assistant, is a verified account; so is Pod, the music and podcast account.
update public.community_profiles set verified = true where username in ('erha', 'pod');

-- ---------------------------------------------------------------------------------------------
-- 6. the views the app reads, with the new columns
-- ---------------------------------------------------------------------------------------------

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
  (select count(*) from public.community_profile_views v where v.profile_id = pr.id and v.viewed_at > now() - interval '7 days')::integer as views_week
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
  (select i.audio_url from public.community_pod_items i where i.id = p.audio_id) as audio_url
from public.community_posts p
join public.community_profiles pr on pr.id = p.user_id
where not exists (select 1 from public.community_blocks b where b.blocker_id = (select auth.jwt()->>'sub') and b.blocked_id = p.user_id);
