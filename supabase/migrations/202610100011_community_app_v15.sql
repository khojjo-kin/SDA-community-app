-- Community app, version 15: fixes from review of version 14.
--
--   1. Deleting a post that was shared in a chat works again (the view-once guard let the chat's
--      link to the post be cleared), and opening a view-once message only ever removes the
--      sender's own file.
--   2. A new profile can't be created with the tick, Plus or other fields only the server sets.
--      An admin taking a tick away also clears a hidden one.
--   3. Private profile columns (when someone was last online, a hidden tick, how a tick was earned,
--      admin notes, feed interests, the creator's Stripe price) can no longer be read straight from
--      the profiles table; the views give them out only to whom they belong.
--   4. Support messages from members can't pose as the team.

-- 1 -----------------------------------------------------------------------------------------------

create or replace function public.community_message_opened()
returns trigger language plpgsql security definer set search_path = '' as $$
declare file_path text;
begin
  if auth.jwt() is null or coalesce(auth.jwt()->>'role', '') = 'service_role' then return new; end if;
  -- The one other change allowed: a shared post was deleted, and the message's link to it is cleared.
  if (to_jsonb(new) - 'opened_at' - 'post_id') is distinct from (to_jsonb(old) - 'opened_at' - 'post_id')
     or (new.post_id is distinct from old.post_id and new.post_id is not null) then
    raise exception 'Messages cannot be changed';
  end if;
  if old.opened_at is null and new.opened_at is not null then
    if not old.view_once then raise exception 'Messages cannot be changed'; end if;
    new.opened_at := now();
    file_path := substring(old.media_url from '/object/public/community-media/(.*)$');
    -- Only the sender's own upload is removed, never a file someone else pointed at.
    if file_path is not null and file_path like old.sender_id || '/%' then
      insert into public.community_media_trash as t (path, remove_after) values (file_path, now() + interval '2 minutes') on conflict (path) do nothing;
    end if;
    new.media_url := '';
  elsif new.opened_at is distinct from old.opened_at then
    raise exception 'Messages cannot be changed';
  end if;
  return new;
end $$;

-- 2 -----------------------------------------------------------------------------------------------

create or replace function public.community_profile_created()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.jwt() is null or coalesce(auth.jwt()->>'role', '') = 'service_role' then return new; end if;
  new.verified := false;
  new.plus_until := null;
  new.suspended := false;
  new.admin_note := '';
  new.verified_via := '';
  new.tick_hidden := false;
  new.hide_connections := false;
  new.sub_price_id := null;
  new.last_active_at := null;
  new.deleted_at := null;
  return new;
end $$;
revoke all on function public.community_profile_created() from public, anon, authenticated;
create or replace trigger community_profiles_created before insert on public.community_profiles
  for each row execute function public.community_profile_created();

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
  -- A tick taken away by an admin can't come back by "showing" a hidden one.
  if admin and old.verified and not new.verified then
    new.tick_hidden := false;
    new.verified_via := '';
  end if;
  if new.sub_price_pence is distinct from old.sub_price_pence then new.sub_price_id := null; end if;
  return new;
end $$;

-- 3 -----------------------------------------------------------------------------------------------

-- Everything in a profile row is readable except these. (A column added later must be added to the
-- grant below to be readable from the app.)
do $$
declare cols text;
begin
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into cols
  from information_schema.columns
  where table_schema = 'public' and table_name = 'community_profiles'
    and column_name not in ('last_active_at', 'tick_hidden', 'verified_via', 'admin_note', 'sub_price_id', 'interests_more', 'interests_less');
  execute 'revoke select on public.community_profiles from authenticated';
  execute 'grant select (' || cols || ') on public.community_profiles to authenticated';
end $$;

create or replace function private.community_own_private(uid text,
  out tick_hidden boolean, out interests_more text[], out interests_less text[])
language sql stable security definer set search_path = '' as $$
  select p.tick_hidden, p.interests_more, p.interests_less
  from public.community_profiles p where p.id = uid and uid = (auth.jwt()->>'sub')
$$;
revoke all on function private.community_own_private(text) from public, anon;
grant execute on function private.community_own_private(text) to authenticated;

-- How a tick was earned is shown only while it is showing (or to its owner).
create or replace function private.community_verified_via(uid text)
returns text language sql stable security definer set search_path = '' as $$
  select case when p.verified or p.id = (auth.jwt()->>'sub') then p.verified_via else '' end
  from public.community_profiles p where p.id = uid
$$;
revoke all on function private.community_verified_via(text) from public, anon;
grant execute on function private.community_verified_via(text) to authenticated;

create or replace function private.community_admin_note(uid text)
returns text language sql stable security definer set search_path = '' as $$
  select case when private.community_is_admin() then p.admin_note else '' end
  from public.community_profiles p where p.id = uid
$$;
revoke all on function private.community_admin_note(text) from public, anon;
grant execute on function private.community_admin_note(text) to authenticated;

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
  exists (select 1 from public.community_follow_alerts a where a.user_id = (select auth.jwt()->>'sub') and a.target_id = pr.id and (a.posts or a.stories or a.clips or a.live)) as alerts_on
from public.community_profiles pr;

create or replace view public.community_member_cards with (security_invoker = true) as
select pr.id, pr.username, pr.full_name, pr.avatar_url, pr.created_at, pr.verified,
  (pr.plus_until is not null and pr.plus_until > now()) as plus,
  pr.plus_until,
  pr.suspended,
  private.community_admin_note(pr.id) as admin_note,
  (select a.role from public.community_admins a where a.user_id = pr.id) as admin_role,
  (select c.name from public.community_churches c where c.id = pr.church_id) as church_name,
  (select count(*) from public.community_posts p where p.user_id = pr.id)::integer as posts_count,
  (select count(*) from public.community_reports r where r.reported_user = pr.id or r.reported_post_owner = pr.id)::integer as reports_count
from public.community_profiles pr
where (select private.community_is_admin());

-- 4 -----------------------------------------------------------------------------------------------

create or replace function public.community_support_written()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.created_at := now();
  if new.role = 'agent' then
    new.agent_name := coalesce(nullif((select coalesce(nullif(p.full_name, ''), p.username) from public.community_profiles p where p.id = new.sender_id), ''), 'Support');
    update public.community_support_chats set agent_id = new.sender_id, agent_name = new.agent_name,
      ai_paused_until = now() + interval '30 minutes', updated_at = now(), status = 'open' where id = new.chat_id;
  else
    new.agent_name := '';
    update public.community_support_chats set updated_at = now(), status = 'open' where id = new.chat_id;
  end if;
  return new;
end $$;
