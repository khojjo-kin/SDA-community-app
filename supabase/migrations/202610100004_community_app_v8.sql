-- Community app, version 8: communities and pages.
--
-- A community is a group anyone can join and post in (private ones take requests). A page is
-- run by its owner and admins, who are the only ones who post; everyone else follows it. Posts
-- made in a group show in that group and in the home feed of its members; a private
-- community's posts are seen by its members only.

create table if not exists public.community_groups (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('community', 'page')),
  name text not null check (length(name) between 2 and 80),
  handle text not null unique check (handle ~ '^[a-z0-9_.]{3,30}$'),
  description text not null default '' check (length(description) <= 1000),
  cover_url text not null default '' check (length(cover_url) <= 500),
  privacy text not null default 'public' check (privacy in ('public', 'private')),
  church_id uuid references public.community_churches(id) on delete set null,
  created_by text not null,
  created_at timestamptz not null default now()
);
alter table public.community_groups enable row level security;
create index if not exists community_groups_name_idx on public.community_groups (lower(name));

create table if not exists public.community_group_members (
  group_id uuid not null references public.community_groups(id) on delete cascade,
  user_id text not null references public.community_profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  status text not null default 'member' check (status in ('member', 'pending')),
  created_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
alter table public.community_group_members enable row level security;
create index if not exists community_group_members_user_idx on public.community_group_members (user_id);

alter table public.community_posts add column if not exists group_id uuid references public.community_groups(id) on delete cascade;
create index if not exists community_posts_group_idx on public.community_posts (group_id, created_at desc) where group_id is not null;

-- My standing in a group: 'owner', 'admin', 'member', 'pending', or null.
create or replace function private.community_group_standing(gid uuid)
returns text language sql stable security definer set search_path = '' as $$
  select case when m.status = 'pending' then 'pending' else m.role end
  from public.community_group_members m where m.group_id = gid and m.user_id = (auth.jwt()->>'sub')
$$;
revoke all on function private.community_group_standing(uuid) from public, anon;
grant execute on function private.community_group_standing(uuid) to authenticated;

create or replace function private.community_group_can_manage(gid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select private.community_group_standing(gid)) in ('owner', 'admin'), false) or (select private.community_is_admin())
$$;
revoke all on function private.community_group_can_manage(uuid) from public, anon;
grant execute on function private.community_group_can_manage(uuid) to authenticated;

-- Who may see a group's posts: everyone for a public group or a page, members for a private one.
create or replace function private.community_group_visible(gid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select g.privacy = 'public' from public.community_groups g where g.id = gid), false)
    or coalesce((select private.community_group_standing(gid)) in ('owner', 'admin', 'member'), false)
    or (select private.community_is_admin())
$$;
revoke all on function private.community_group_visible(uuid) from public, anon;
grant execute on function private.community_group_visible(uuid) to authenticated;

-- Who may post in a group: any member of a community, only owner and admins of a page.
create or replace function private.community_group_can_post(gid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select case (select g.kind from public.community_groups g where g.id = gid)
    when 'page' then coalesce((select private.community_group_standing(gid)) in ('owner', 'admin'), false)
    else coalesce((select private.community_group_standing(gid)) in ('owner', 'admin', 'member'), false) end
$$;
revoke all on function private.community_group_can_post(uuid) from public, anon;
grant execute on function private.community_group_can_post(uuid) to authenticated;

-- Creating a group makes its creator the owner in the same step.
create or replace function public.community_create_group(p_kind text, p_name text, p_handle text, p_description text, p_privacy text, p_cover_url text, p_church_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare me text := auth.jwt()->>'sub'; gid uuid;
begin
  if me is null then raise exception 'Sign in first'; end if;
  if (select private.community_suspended()) then raise exception 'This account cannot create groups'; end if;
  insert into public.community_groups (kind, name, handle, description, privacy, cover_url, church_id, created_by)
    values (p_kind, p_name, lower(p_handle), coalesce(p_description, ''), case when p_kind = 'page' then 'public' else coalesce(p_privacy, 'public') end, coalesce(p_cover_url, ''), p_church_id, me)
    returning id into gid;
  insert into public.community_group_members (group_id, user_id, role, status) values (gid, me, 'owner', 'member');
  return gid;
end $$;
revoke all on function public.community_create_group(text, text, text, text, text, text, uuid) from public, anon;
grant execute on function public.community_create_group(text, text, text, text, text, text, uuid) to authenticated;

-- Groups: anyone signed in can see them; owner and admins change them; the owner (or an app admin) removes them.
create policy groups_read on public.community_groups for select to authenticated using (true);
create policy groups_manage on public.community_groups for update to authenticated using ((select private.community_group_can_manage(id)));
create policy groups_remove on public.community_groups for delete to authenticated
  using ((select private.community_group_standing(id)) = 'owner' or (select private.community_is_admin()));

-- Members: joining is your own row, as a member of a public group or a pending request to a private one.
create policy group_members_read on public.community_group_members for select to authenticated using (true);
create policy group_members_join on public.community_group_members for insert to authenticated
  with check (user_id = (select auth.jwt()->>'sub') and role = 'member'
    and status = (select case when g.privacy = 'private' then 'pending' else 'member' end from public.community_groups g where g.id = group_id));
create policy group_members_manage on public.community_group_members for update to authenticated
  using ((select private.community_group_can_manage(group_id)) and role <> 'owner');
create policy group_members_leave on public.community_group_members for delete to authenticated
  using (role <> 'owner' and (user_id = (select auth.jwt()->>'sub') or (select private.community_group_can_manage(group_id))));

-- Posting into a group needs the right to post there.
create policy posts_in_group on public.community_posts as restrictive for insert to authenticated
  with check (group_id is null or (select private.community_group_can_post(group_id)));
-- A private community's posts stay inside it.
create policy posts_group_visible on public.community_posts as restrictive for select to authenticated
  using (group_id is null or (select private.community_group_visible(group_id)));

create or replace view public.community_group_cards with (security_invoker = true) as
select g.id, g.kind, g.name, g.handle, g.description, g.cover_url, g.privacy, g.church_id, g.created_by, g.created_at,
  (select c.name from public.community_churches c where c.id = g.church_id) as church_name,
  (select count(*) from public.community_group_members m where m.group_id = g.id and m.status = 'member')::integer as member_count,
  (select count(*) from public.community_group_members m where m.group_id = g.id and m.status = 'pending')::integer as pending_count,
  (select count(*) from public.community_posts p where p.group_id = g.id)::integer as posts_count,
  (select private.community_group_standing(g.id)) as my_standing
from public.community_groups g;
revoke all on public.community_group_cards from anon;
grant select on public.community_group_cards to authenticated;

-- Posts say which group they are in, and whether that group is one of mine (for the home feed).
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
  (p.group_id is not null and exists (select 1 from public.community_group_members m where m.group_id = p.group_id and m.user_id = (select auth.jwt()->>'sub') and m.status = 'member')) as in_my_group
from public.community_posts p
join public.community_profiles pr on pr.id = p.user_id
where not exists (select 1 from public.community_blocks b where b.blocker_id = (select auth.jwt()->>'sub') and b.blocked_id = p.user_id);
