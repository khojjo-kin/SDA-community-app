-- Community app, version 6: deleting an account the way people expect.
--
-- Choosing "Delete account" does not destroy anything on the spot. The account is deactivated:
-- hidden from everyone at once (profile, posts, comments, stories, chats), unable to post, and
-- marked with the moment it happened. Signing in during the next 30 days restores it exactly as
-- it was. After 30 days a nightly job removes the account and everything it shared, for good.

alter table public.community_profiles add column if not exists deleted_at timestamptz;
create index if not exists community_profiles_deleted_idx on public.community_profiles (deleted_at) where deleted_at is not null;

-- Hidden from everyone but itself and admins. Every card view joins profiles with
-- security_invoker, so the account's posts, comments, stories and chats vanish with it.
create policy profiles_hide_deactivated on public.community_profiles as restrictive for select to authenticated
  using (deleted_at is null or id = (select auth.jwt()->>'sub') or (select private.community_is_admin()));

-- A deactivated account cannot post, comment, share a story or message, same as a suspended one.
create or replace function private.community_suspended()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select p.suspended or p.deleted_at is not null from public.community_profiles p where p.id = (auth.jwt()->>'sub')), false)
$$;

-- The profile card says when the account was deactivated, so the app can offer to restore it.
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
  pr.deleted_at
from public.community_profiles pr;
revoke all on public.community_profile_cards from anon;
grant select on public.community_profile_cards to authenticated;

-- The nightly purge. Uploaded files go first (their rows; the files are unreachable once the rows
-- are gone), then the profile, which takes posts, comments, stories, chats, follows and the rest
-- with it through the foreign keys.
create or replace function private.community_purge_deleted_accounts()
returns integer language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  delete from storage.objects o using public.community_profiles p
    where p.deleted_at < now() - interval '30 days' and o.bucket_id = 'community-media' and o.name like p.id || '/%';
  delete from public.community_profiles where deleted_at < now() - interval '30 days';
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function private.community_purge_deleted_accounts() from public, anon, authenticated;

create extension if not exists pg_cron;
select cron.schedule('community-purge-deleted-accounts', '15 3 * * *', $$select private.community_purge_deleted_accounts()$$);
