-- Community app, version 5: the church edition.
--
--   1. Profiles gain pronouns, gender, contact details, a home church, the verified tick and
--      Community Plus. The tick, Plus and suspension can only be set by an admin.
--   2. Admins: the app's owner and the people the owner appoints. They see reports, verify and
--      suspend accounts, remove content, and keep the hymnal and the list of churches.
--   3. Requests for the tick or for Plus, which admins approve.
--   4. Churches, with members.
--   5. The hymnal.
--   6. Erha, the assistant: the record of each person's conversation.

-- ---------------------------------------------------------------------------------------------
-- 1. admins and the helpers that check for them
-- ---------------------------------------------------------------------------------------------

create table if not exists public.community_admins (
  user_id text primary key check (user_id like 'user\_%'),
  role text not null default 'admin' check (role in ('owner', 'admin')),
  granted_by text,
  created_at timestamptz not null default now()
);
alter table public.community_admins enable row level security;

create or replace function private.community_is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.community_admins a where a.user_id = (auth.jwt()->>'sub'))
$$;
revoke all on function private.community_is_admin() from public, anon;
grant execute on function private.community_is_admin() to authenticated;

create or replace function private.community_is_owner()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.community_admins a where a.user_id = (auth.jwt()->>'sub') and a.role = 'owner')
$$;
revoke all on function private.community_is_owner() from public, anon;
grant execute on function private.community_is_owner() to authenticated;

-- Everyone can see who the admins are; only the owner changes the list, and never removes an owner.
create policy admins_read on public.community_admins for select to authenticated using (true);
create policy admins_owner_add on public.community_admins for insert to authenticated
  with check ((select private.community_is_owner()) and role = 'admin');
create policy admins_owner_remove on public.community_admins for delete to authenticated
  using ((select private.community_is_owner()) and role = 'admin');

-- The app's owner. Both of the owner's sign-ins.
insert into public.community_admins (user_id, role) values
  ('user_3KTbacVdeEQX5AP2Dy1aNfbjgMA', 'owner'),
  ('user_3JKYM0No4TxTQB0kt9VLAIvN0If', 'owner')
on conflict (user_id) do update set role = 'owner';

-- ---------------------------------------------------------------------------------------------
-- 2. churches
-- ---------------------------------------------------------------------------------------------

create table if not exists public.community_churches (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 2 and 120),
  address text not null default '' check (length(address) <= 300),
  city text not null default '' check (length(city) <= 80),
  country text not null default '' check (length(country) <= 80),
  lat double precision check (lat between -90 and 90),
  lng double precision check (lng between -180 and 180),
  website text not null default '' check (length(website) <= 300),
  service_times text not null default '' check (length(service_times) <= 300),
  created_by text,
  created_at timestamptz not null default now()
);
alter table public.community_churches enable row level security;
create policy churches_read on public.community_churches for select to authenticated using (true);
create policy churches_add on public.community_churches for insert to authenticated
  with check (created_by = (select auth.jwt()->>'sub'));
create policy churches_admin_edit on public.community_churches for update to authenticated
  using ((select private.community_is_admin()));
create policy churches_admin_remove on public.community_churches for delete to authenticated
  using ((select private.community_is_admin()));
create index if not exists community_churches_name_idx on public.community_churches (lower(name));

-- ---------------------------------------------------------------------------------------------
-- 3. profiles
-- ---------------------------------------------------------------------------------------------

alter table public.community_profiles
  add column if not exists pronouns text not null default '' check (length(pronouns) <= 40),
  add column if not exists gender text not null default '' check (length(gender) <= 40),
  add column if not exists contact_email text not null default '' check (length(contact_email) <= 200),
  add column if not exists contact_phone text not null default '' check (length(contact_phone) <= 40),
  add column if not exists church_id uuid references public.community_churches(id) on delete set null,
  add column if not exists verified boolean not null default false,
  add column if not exists plus_until timestamptz,
  add column if not exists suspended boolean not null default false,
  add column if not exists admin_note text not null default '' check (length(admin_note) <= 500);
create index if not exists community_profiles_church_idx on public.community_profiles (church_id);

-- The tick, Plus, suspension and the admin's note are an admin's to set. Everything else stays the
-- account's own. Admins may change those four columns on any profile and nothing else on others'.
create or replace function public.community_profile_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare me text := auth.jwt()->>'sub'; admin boolean := private.community_is_admin();
begin
  if (new.verified is distinct from old.verified
      or new.plus_until is distinct from old.plus_until
      or new.suspended is distinct from old.suspended
      or new.admin_note is distinct from old.admin_note) and not admin then
    raise exception 'Only an admin can change that';
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
  return new;
end $$;
revoke all on function public.community_profile_guard() from public, anon, authenticated;
drop trigger if exists community_profiles_guard on public.community_profiles;
create trigger community_profiles_guard before update on public.community_profiles
  for each row execute function public.community_profile_guard();

-- Admins can update any profile (the trigger above limits what to).
create policy profiles_admin_update on public.community_profiles for update to authenticated
  using ((select private.community_is_admin()));

-- A suspended account can read but not post, comment, share a story or send a message.
create or replace function private.community_suspended()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select p.suspended from public.community_profiles p where p.id = (auth.jwt()->>'sub')), false)
$$;
revoke all on function private.community_suspended() from public, anon;
grant execute on function private.community_suspended() to authenticated;

create policy posts_not_suspended on public.community_posts as restrictive for insert to authenticated
  with check (not (select private.community_suspended()));
create policy comments_not_suspended on public.community_comments as restrictive for insert to authenticated
  with check (not (select private.community_suspended()));
create policy stories_not_suspended on public.community_stories as restrictive for insert to authenticated
  with check (not (select private.community_suspended()));
create policy messages_not_suspended on public.community_messages as restrictive for insert to authenticated
  with check (not (select private.community_suspended()));

-- Admins can remove anyone's post, comment or story.
create policy posts_admin_delete on public.community_posts for delete to authenticated
  using ((select private.community_is_admin()));
create policy comments_admin_delete on public.community_comments for delete to authenticated
  using ((select private.community_is_admin()));
create policy stories_admin_delete on public.community_stories for delete to authenticated
  using ((select private.community_is_admin()));

-- The profile card carries the new fields.
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
  (select a.role from public.community_admins a where a.user_id = pr.id) as admin_role
from public.community_profiles pr;
revoke all on public.community_profile_cards from anon;
grant select on public.community_profile_cards to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 4. requests for the tick or for Plus
-- ---------------------------------------------------------------------------------------------

create table if not exists public.community_plus_requests (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  kind text not null check (kind in ('verify', 'plus')),
  note text not null default '' check (length(note) <= 500),
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  decided_by text,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.community_plus_requests enable row level security;
create index if not exists community_plus_requests_user_idx on public.community_plus_requests (user_id, created_at desc);
create index if not exists community_plus_requests_open_idx on public.community_plus_requests (created_at desc) where status = 'pending';
create policy plus_requests_read on public.community_plus_requests for select to authenticated
  using (user_id = (select auth.jwt()->>'sub') or (select private.community_is_admin()));
create policy plus_requests_create on public.community_plus_requests for insert to authenticated
  with check (user_id = (select auth.jwt()->>'sub') and status = 'pending'
    and not exists (select 1 from public.community_plus_requests r where r.user_id = community_plus_requests.user_id and r.kind = community_plus_requests.kind and r.status = 'pending'));
create policy plus_requests_admin_decide on public.community_plus_requests for update to authenticated
  using ((select private.community_is_admin()));

-- ---------------------------------------------------------------------------------------------
-- 5. reports: admins read and close them
-- ---------------------------------------------------------------------------------------------

alter table public.community_reports
  add column if not exists status text not null default 'open' check (status in ('open', 'dismissed', 'actioned')),
  add column if not exists decided_by text,
  add column if not exists decided_at timestamptz;
create index if not exists community_reports_open_idx on public.community_reports (created_at desc) where status = 'open';
create policy reports_admin_read on public.community_reports for select to authenticated
  using ((select private.community_is_admin()));
create policy reports_admin_decide on public.community_reports for update to authenticated
  using ((select private.community_is_admin()));

-- What admins see about a report: who reported whom, and about what.
create or replace view public.community_report_cards with (security_invoker = true) as
select r.id, r.reporter_id, r.reason, r.created_at, r.status, r.decided_by, r.decided_at,
  r.reported_user, r.reported_post, r.reported_post_owner,
  rp.username as reporter_username,
  tp.username as reported_username, tp.full_name as reported_full_name, tp.avatar_url as reported_avatar_url,
  (select p.caption from public.community_posts p where p.id = r.reported_post) as post_caption,
  (select p.media->0 from public.community_posts p where p.id = r.reported_post) as post_media,
  exists (select 1 from public.community_posts p where p.id = r.reported_post) as post_exists
from public.community_reports r
left join public.community_profiles rp on rp.id = r.reporter_id
left join public.community_profiles tp on tp.id = coalesce(r.reported_user, r.reported_post_owner);
revoke all on public.community_report_cards from anon;
grant select on public.community_report_cards to authenticated;

-- Numbers for the admin overview. Only admins get anything back.
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
    'hymns', (select count(*) from public.community_hymns));
end $$;
revoke all on function public.community_admin_stats() from public, anon;
grant execute on function public.community_admin_stats() to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 6. the hymnal
-- ---------------------------------------------------------------------------------------------

create table if not exists public.community_hymns (
  number integer primary key check (number between 1 and 999),
  title text not null check (length(title) between 1 and 160),
  section text not null default '' check (length(section) <= 80),
  lyrics text not null check (length(lyrics) <= 20000),
  author text not null default '' check (length(author) <= 160),
  updated_by text,
  updated_at timestamptz not null default now()
);
alter table public.community_hymns enable row level security;
create policy hymns_read on public.community_hymns for select to authenticated using (true);
create policy hymns_admin_write on public.community_hymns for insert to authenticated
  with check ((select private.community_is_admin()));
create policy hymns_admin_edit on public.community_hymns for update to authenticated
  using ((select private.community_is_admin()));
create policy hymns_admin_remove on public.community_hymns for delete to authenticated
  using ((select private.community_is_admin()));

-- ---------------------------------------------------------------------------------------------
-- 7. Erha: each person's conversation with the assistant. Written only by the assistant's
--    function (service role); people read their own and can clear it.
-- ---------------------------------------------------------------------------------------------

create table if not exists public.community_erha_messages (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (length(content) <= 20000),
  created_at timestamptz not null default now()
);
alter table public.community_erha_messages enable row level security;
create index if not exists community_erha_messages_user_idx on public.community_erha_messages (user_id, created_at);
create policy erha_read_own on public.community_erha_messages for select to authenticated
  using (user_id = (select auth.jwt()->>'sub'));
create policy erha_clear_own on public.community_erha_messages for delete to authenticated
  using (user_id = (select auth.jwt()->>'sub'));

-- ---------------------------------------------------------------------------------------------
-- 8. the admin's view of members
-- ---------------------------------------------------------------------------------------------

create or replace view public.community_member_cards with (security_invoker = true) as
select pr.id, pr.username, pr.full_name, pr.avatar_url, pr.created_at, pr.verified,
  (pr.plus_until is not null and pr.plus_until > now()) as plus, pr.plus_until, pr.suspended, pr.admin_note,
  (select a.role from public.community_admins a where a.user_id = pr.id) as admin_role,
  (select c.name from public.community_churches c where c.id = pr.church_id) as church_name,
  (select count(*) from public.community_posts p where p.user_id = pr.id)::integer as posts_count,
  (select count(*) from public.community_reports r where r.reported_user = pr.id or r.reported_post_owner = pr.id)::integer as reports_count
from public.community_profiles pr
where (select private.community_is_admin());
revoke all on public.community_member_cards from anon;
grant select on public.community_member_cards to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 9. the tick travels with posts, comments and chats
-- ---------------------------------------------------------------------------------------------

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
  pr.verified
from public.community_posts p
join public.community_profiles pr on pr.id = p.user_id
where not exists (select 1 from public.community_blocks b where b.blocker_id = (select auth.jwt()->>'sub') and b.blocked_id = p.user_id);

create or replace view public.community_comment_cards with (security_invoker = true) as
select c.id, c.post_id, c.user_id, c.text, c.created_at, pr.username, pr.full_name, pr.avatar_url,
  (select count(*) from public.community_comment_likes l where l.comment_id = c.id)::integer as like_count,
  exists (select 1 from public.community_comment_likes l where l.comment_id = c.id and l.user_id = (select auth.jwt()->>'sub')) as liked,
  pr.verified
from public.community_comments c
join public.community_profiles pr on pr.id = c.user_id
where not exists (select 1 from public.community_blocks b where b.blocker_id = (select auth.jwt()->>'sub') and b.blocked_id = c.user_id);

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
  o.verified
from public.community_threads t
cross join lateral (select auth.jwt()->>'sub' as sub) me
join public.community_profiles o on o.id = case when t.user_a = me.sub then t.user_b else t.user_a end
left join public.community_thread_settings st on st.thread_id = t.id and st.user_id = me.sub
where o.id <> all ((select private.community_block_list())::text[]);
