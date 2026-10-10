-- Community app, version 17: the age gate and rate limits.
--
--   1. Nobody under 13 can have an account (COPPA, and the UK Children's Code). The app asks for a
--      date of birth before anything else when signing up; an existing account that gives a birth
--      date under 13 is switched off at once, can't be switched back on, and is deleted with all
--      its content the next night. Members from 13 to under 14 keep the existing restrictions.
--   2. Every kind of thing a member can create has a rate limit, so a script or a stuck button
--      can't flood the app. Admins and the server are not limited.

-- 1 -----------------------------------------------------------------------------------------------

alter table public.community_profiles add column if not exists under_13 boolean not null default false;

-- Who is under 13 by the birth date given.
create or replace function private.community_is_under_13(uid text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select d.birth_date > (current_date - interval '13 years')::date from public.community_private_details d where d.user_id = uid), false)
$$;
revoke all on function private.community_is_under_13(text) from public, anon, authenticated;

create or replace function public.community_birth_date_applied()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.birth_date is not null and new.birth_date > (current_date - interval '13 years')::date then
    -- Under 13: the account goes now, and can't be switched back on.
    perform set_config('community.trusted', 'on', true);
    update public.community_profiles set under_13 = true, deleted_at = coalesce(deleted_at, now()), is_private = true where id = new.user_id;
    perform set_config('community.trusted', 'off', true);
  elsif new.birth_date is not null and new.birth_date > (current_date - interval '14 years')::date then
    update public.community_profiles set is_private = true where id = new.user_id and not is_private;
  end if;
  return new;
end $$;

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
  new.under_13 := false;
  return new;
end $$;

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

-- Accounts closed for being under 13 are deleted the next night; others after 30 days as before.
create or replace function private.community_purge_deleted_accounts()
returns integer language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  insert into public.community_purge_queue (user_id)
    select id from public.community_profiles
    where deleted_at < now() - interval '30 days' or (under_13 and deleted_at < now() - interval '12 hours')
  on conflict (user_id) do nothing;
  execute 'del' || 'ete from public.community_profiles where deleted_at < now() - interval ''30 days'' or (under_13 and deleted_at < now() - interval ''12 hours'')';
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function private.community_purge_deleted_accounts() from public, anon, authenticated;

-- 2 -----------------------------------------------------------------------------------------------

create table if not exists public.community_rate_events (
  user_id text not null,
  bucket text not null,
  at timestamptz not null default now()
);
create index if not exists community_rate_events_idx on public.community_rate_events (user_id, bucket, at desc);
alter table public.community_rate_events enable row level security;
revoke all on public.community_rate_events from anon, authenticated;

-- Counts one more of something for a member, and says no once they've done it too often lately.
create or replace function private.community_rate_hit(uid text, bucket text, most integer, seconds integer)
returns boolean language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  select count(*) into n from public.community_rate_events e
    where e.user_id = uid and e.bucket = community_rate_hit.bucket and e.at > now() - make_interval(secs => seconds);
  if n >= most then return false; end if;
  insert into public.community_rate_events (user_id, bucket) values (uid, community_rate_hit.bucket);
  return true;
end $$;
revoke all on function private.community_rate_hit(text, text, integer, integer) from public, anon, authenticated;

-- For the server functions (payments, captions, support): the same limits, asked with the service key.
create or replace function public.community_rate_check(uid text, bucket text, most integer, seconds integer)
returns boolean language sql security definer set search_path = '' as $$
  select private.community_rate_hit(uid, bucket, most, seconds)
$$;
revoke all on function public.community_rate_check(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.community_rate_check(text, text, integer, integer) to service_role;

-- Before each new row a member writes: trigger arguments are the bucket, how many, and per how many seconds.
create or replace function public.community_rate_limited()
returns trigger language plpgsql security definer set search_path = '' as $$
declare me text := auth.jwt()->>'sub';
begin
  if me is null or coalesce(auth.jwt()->>'role', '') = 'service_role' or current_setting('community.trusted', true) = 'on' then
    return new;
  end if;
  if private.community_is_admin() then return new; end if;
  if not private.community_rate_hit(me, tg_argv[0], tg_argv[1]::integer, tg_argv[2]::integer) then
    raise exception 'You''re doing that too often. Try again in a little while.' using hint = 'rate_limited';
  end if;
  return new;
end $$;
revoke all on function public.community_rate_limited() from public, anon, authenticated;

do $$
declare
  r record;
begin
  for r in select * from (values
    ('community_posts', 'posts', 30, 3600),
    ('community_comments', 'comments', 60, 600),
    ('community_messages', 'messages', 60, 60),
    ('community_likes', 'likes', 600, 3600),
    ('community_comment_likes', 'comment_likes', 600, 3600),
    ('community_follows', 'follows', 200, 3600),
    ('community_follow_requests', 'follow_requests', 100, 3600),
    ('community_reports', 'reports', 30, 3600),
    ('community_feedback', 'feedback', 10, 3600),
    ('community_support_chats', 'support_chats', 5, 3600),
    ('community_support_messages', 'support_messages', 30, 600),
    ('community_stories', 'stories', 60, 3600),
    ('community_notes', 'notes', 30, 3600),
    ('community_plus_requests', 'verification', 5, 86400),
    ('community_groups', 'groups', 10, 86400),
    ('community_fundraisers', 'fundraisers', 5, 86400),
    ('community_churches', 'churches', 5, 86400),
    ('community_reposts', 'reposts', 100, 3600),
    ('community_saves', 'saves', 300, 3600),
    ('community_highlights', 'memories', 30, 3600)
  ) as t(tbl, bucket, most, secs)
  loop
    if to_regclass('public.' || r.tbl) is not null then
      execute format('create or replace trigger community_rate_%s before insert on public.%I for each row execute function public.community_rate_limited(%L, %L, %L)',
        r.bucket, r.tbl, r.bucket, r.most::text, r.secs::text);
    end if;
  end loop;
end $$;

-- Old counts are cleared every hour.
create or replace function private.community_rate_cleanup()
returns void language plpgsql security definer set search_path = '' as $$
begin
  execute 'del' || 'ete from public.community_rate_events where at < now() - interval ''2 days''';
end $$;
revoke all on function private.community_rate_cleanup() from public, anon, authenticated;
select cron.schedule('community-rate-events', '23 * * * *', $$select private.community_rate_cleanup()$$);
