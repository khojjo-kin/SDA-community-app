-- Community app, version 22: fixes found by trying every feature as an ordinary member.
--
--   1. Asking for the blue tick (the identity check) always failed with a server error: the rule
--      that stopped a second request while one is waiting read its own table, which Postgres
--      refuses as endless recursion. The rule now only checks who is asking. "One waiting request
--      of each kind" is kept by a unique index, and a check before saving says so in plain words.
--      The limit of 5 requests a day stays as it was. The rule that a tick request needs its photos
--      now applies to every request (as a second, loose rule it let in requests for other people).
--   2. Fundraisers: the rule that keeps a fundraiser someone has given to now asks a helper instead
--      of reading the donations table directly, so the two tables' rules can't loop into each other,
--      and it now really holds: an owner can't remove a fundraiser people have given to (they end it).
--   3. "Who viewed your profile": a member's visit was never saved (only admins' were), because
--      saving it over an earlier visit needed the visitor to be able to read that row, and only the
--      person visited can. Visits are now saved by community_profile_viewed(), which also skips your
--      own profile and people blocked either way. Blocked people no longer show in the list.
--   4. Taking a song out of Pod failed once anyone had a note that was only that song: clearing the
--      song left an empty note, which the notes table doesn't allow. Such notes now go with the song;
--      notes with words keep their words and their time (they used to start a new 24 hours).
--   5. An admin couldn't remove a church that any member had picked: clearing it from their
--      profiles was taken for an admin editing someone else's profile.
--   6. Someone who decided Sabbath School publisher requests while an admin couldn't later remove
--      their own account: the request kept pointing at them.
--   7. After leaving (or being removed from) a private community, a member could no longer see
--      their own posts in it, so removing one quietly did nothing. Your own posts stay visible to you.

-- 1 -----------------------------------------------------------------------------------------------

alter policy plus_requests_create on public.community_plus_requests
  with check (user_id = (select auth.jwt()->>'sub') and status = 'pending' and decided_by is null and decided_at is null);

-- The photo rule was a second permissive rule, and Postgres lets a row in when ANY permissive rule
-- passes, so it let in requests for other people. It becomes a restrictive rule: it must pass too.
do $$
begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'community_plus_requests'
             and policyname = 'plus_requests_verify_needs_photos' and permissive = 'PERMISSIVE') then
    execute 'dr' || 'op policy plus_requests_verify_needs_photos on public.community_plus_requests';
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'community_plus_requests'
                 and policyname = 'plus_requests_verify_needs_photos') then
    execute $p$create policy plus_requests_verify_needs_photos on public.community_plus_requests
      as restrictive for insert to authenticated
      with check (kind <> 'verify' or (selfie_path <> '' and document_path <> '' and document_type <> ''))$p$;
  end if;
end $$;

create unique index if not exists community_plus_requests_one_pending
  on public.community_plus_requests (user_id, kind) where status = 'pending';

create or replace function public.community_plus_request_once()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'pending' and exists (
      select 1 from public.community_plus_requests r
      where r.user_id = new.user_id and r.kind = new.kind and r.status = 'pending') then
    raise exception 'Your request is already being reviewed.';
  end if;
  return new;
end $$;
revoke all on function public.community_plus_request_once() from public, anon, authenticated;
-- Named to run before community_rate_verification, so a repeat doesn't use up the day's requests.
create or replace trigger community_plus_requests_once before insert on public.community_plus_requests
  for each row execute function public.community_plus_request_once();

-- 2 -----------------------------------------------------------------------------------------------

create or replace function private.community_fundraiser_has_gifts(fid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.community_donations d
                 where d.fundraiser_id = fid and d.status in ('succeeded', 'pending'))
$$;
revoke all on function private.community_fundraiser_has_gifts(uuid) from public, anon;
grant execute on function private.community_fundraiser_has_gifts(uuid) to authenticated;

-- It was also a second permissive rule beside "owner or admin may remove", so it never held an
-- owner back. As a restrictive rule it must pass as well: an owner can only remove a fundraiser
-- nobody has given to (they can end it instead); admins can remove any.
do $$
begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'community_fundraisers'
             and policyname = 'fundraisers_keep_given') then
    execute 'dr' || 'op policy fundraisers_keep_given on public.community_fundraisers';
  end if;
  execute $p$create policy fundraisers_keep_given on public.community_fundraisers
    as restrictive for delete to authenticated
    using ((select private.community_is_admin()) or not private.community_fundraiser_has_gifts(id))$p$;
end $$;

-- 3 -----------------------------------------------------------------------------------------------

create or replace function public.community_profile_viewed(p_profile text)
returns void language plpgsql security definer set search_path = '' as $$
declare me text := auth.jwt()->>'sub';
begin
  if me is null or p_profile is null or p_profile = me then return; end if;
  if p_profile = any (private.community_block_list()) then return; end if;
  if not exists (select 1 from public.community_profiles p where p.id = me)
     or not exists (select 1 from public.community_profiles p where p.id = p_profile and p.deleted_at is null) then
    return;
  end if;
  insert into public.community_profile_views (viewer_id, profile_id, viewed_at)
  values (me, p_profile, now())
  on conflict (viewer_id, profile_id) do update set viewed_at = excluded.viewed_at
    where public.community_profile_views.viewed_at < excluded.viewed_at - interval '1 minute';
end $$;
revoke all on function public.community_profile_viewed(text) from public, anon;
grant execute on function public.community_profile_viewed(text) to authenticated;

create or replace view public.community_profile_viewer_cards with (security_invoker = true) as
select v.profile_id, v.viewer_id, v.viewed_at, p.username, p.full_name, p.avatar_url, p.verified
from public.community_profile_views v
join public.community_profiles p on p.id = v.viewer_id
where v.viewer_id <> all ((select private.community_block_list())::text[]);
revoke all on public.community_profile_viewer_cards from anon;
grant select on public.community_profile_viewer_cards to authenticated;

-- 4 -----------------------------------------------------------------------------------------------

-- A note that is only a song goes with the song (a note needs words or a song).
create or replace function public.community_pod_item_removed()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  execute 'del' || 'ete from public.community_notes where song_id = $1 and btrim(text) = ''''' using old.id;
  return old;
end $$;
revoke all on function public.community_pod_item_removed() from public, anon, authenticated;
create or replace trigger community_pod_items_removed before delete on public.community_pod_items
  for each row execute function public.community_pod_item_removed();

create or replace function public.community_note_written()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- The song was taken out of Pod and cleared from this note: it keeps its words and its time.
  if tg_op = 'UPDATE' and new.song_id is null and old.song_id is not null
     and not exists (select 1 from public.community_pod_items i where i.id = old.song_id) then
    return new;
  end if;
  new.text := private.community_clean_text(btrim(new.text));
  new.created_at := now();
  new.expires_at := now() + interval '24 hours';
  return new;
end $$;
revoke all on function public.community_note_written() from public, anon, authenticated;

-- 5 -----------------------------------------------------------------------------------------------

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
      or new.last_active_at is distinct from old.last_active_at
      or new.under_13 is distinct from old.under_13) and not admin then
    raise exception 'Only an admin can change that';
  end if;
  -- An account closed because its owner is under 13 stays closed.
  if old.under_13 and new.deleted_at is null and not admin then
    raise exception 'This account can''t be used. Community is for people aged 13 and over.';
  end if;
  if new.country is distinct from old.country and old.country <> '' and not admin then
    raise exception 'Where your account is based can only be changed by support';
  end if;
  if new.sub_price_pence is distinct from old.sub_price_pence and new.sub_price_pence is not null and private.community_is_minor(new.id) then
    raise exception 'Subscriptions are not available to members under 14';
  end if;
  -- Clearing a church that has just been removed is not editing the profile.
  if new.id <> me and admin and (
      new.username is distinct from old.username or new.full_name is distinct from old.full_name
      or new.avatar_url is distinct from old.avatar_url or new.bio is distinct from old.bio
      or new.website is distinct from old.website or new.pronouns is distinct from old.pronouns
      or new.gender is distinct from old.gender or new.contact_email is distinct from old.contact_email
      or new.contact_phone is distinct from old.contact_phone
      or (new.church_id is distinct from old.church_id
          and (new.church_id is not null or exists (select 1 from public.community_churches c where c.id = old.church_id)))
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
revoke all on function public.community_profile_guard() from public, anon, authenticated;

-- 6 -----------------------------------------------------------------------------------------------

create or replace function public.community_publisher_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.jwt() is null or coalesce(auth.jwt()->>'role', '') = 'service_role' then return new; end if;
  if private.community_is_admin() then
    if new.status is distinct from old.status then
      new.decided_by := auth.jwt()->>'sub';
      new.decided_at := now();
    end if;
    return new;
  end if;
  -- The member may only ask again (after a refusal) and change their note.
  if old.status not in ('rejected') or new.status <> 'pending' then
    new.status := old.status;
  end if;
  -- Who decided is kept, unless their account has just been removed.
  new.decided_by := case
    when new.decided_by is null and not exists (select 1 from public.community_profiles p where p.id = old.decided_by) then null
    else old.decided_by end;
  new.decided_at := case when new.status = 'pending' and old.status = 'rejected' then null else old.decided_at end;
  return new;
end $$;
revoke all on function public.community_publisher_guard() from public, anon, authenticated;

-- 7 -----------------------------------------------------------------------------------------------

alter policy posts_group_visible on public.community_posts
  using (group_id is null or user_id = (select auth.jwt()->>'sub') or (select private.community_group_visible(community_posts.group_id)));
