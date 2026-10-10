-- Community app, version 11.
--
--   1. Discover people: suggestions ranked by mutual follows, with a way to dismiss one.
--   2. Chat streaks: consecutive days on which both people in a chat wrote; anyone can turn them off.
--   3. Churches are approved by an admin before anyone else sees them.
--   4. Members under 14: a private birth date, private accounts, no sensitive posts, messages and
--      calls only from people they follow, no live broadcasts.
--   5. Offensive words are masked in comments and captions as they are saved.
--   6. The tick needs a selfie and an identity document, kept in a private bucket and deleted once
--      an admin has decided.
--   7. Ads: boosts are paid for, and every promotion is recorded.
--   8. Fundraisers on profiles, paid out to the member's own Stripe account.
--   9. Plus styling: the ring colour and the theme of a member's profile.
--  10. The 30-day purge no longer deletes storage rows from SQL (Supabase now refuses that); files
--      are removed afterwards by the maintenance function through the Storage API.

-- ---------------------------------------------------------------------------------------------
-- 4 (first, the others use it). age
-- ---------------------------------------------------------------------------------------------

create table if not exists public.community_private_details (
  user_id text primary key references public.community_profiles(id) on delete cascade,
  birth_date date check (birth_date > date '1900-01-01' and birth_date <= current_date),
  updated_at timestamptz not null default now()
);
alter table public.community_private_details enable row level security;
grant select, insert, update on public.community_private_details to authenticated;
create policy private_details_own_read on public.community_private_details for select to authenticated
  using (user_id = (select auth.jwt()->>'sub') or (select private.community_is_admin()));
create policy private_details_own_add on public.community_private_details for insert to authenticated
  with check (user_id = (select auth.jwt()->>'sub'));
create policy private_details_own_edit on public.community_private_details for update to authenticated
  using (user_id = (select auth.jwt()->>'sub') or (select private.community_is_admin()));

-- Under 14 by the birth date given. No birth date yet counts as not restricted; the app asks for it.
create or replace function private.community_is_minor(uid text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select d.birth_date > (current_date - interval '14 years')::date from public.community_private_details d where d.user_id = uid), false)
$$;
revoke all on function private.community_is_minor(text) from public, anon;
grant execute on function private.community_is_minor(text) to authenticated;

-- A birth date, once given, is changed only by an admin; giving one under 14 makes the account private.
create or replace function public.community_birth_date_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and old.birth_date is not null and new.birth_date is distinct from old.birth_date
     and not private.community_is_admin() and coalesce(auth.jwt()->>'role', '') <> 'service_role' and auth.jwt() is not null then
    raise exception 'Your birth date can only be changed by contacting support';
  end if;
  new.updated_at := now();
  return new;
end $$;
revoke all on function public.community_birth_date_guard() from public, anon, authenticated;
create or replace trigger community_private_details_guard before insert or update on public.community_private_details
  for each row execute function public.community_birth_date_guard();

create or replace function public.community_birth_date_applied()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.birth_date is not null and new.birth_date > (current_date - interval '14 years')::date then
    update public.community_profiles set is_private = true where id = new.user_id and not is_private;
  end if;
  return new;
end $$;
revoke all on function public.community_birth_date_applied() from public, anon, authenticated;
create or replace trigger community_private_details_applied after insert or update on public.community_private_details
  for each row execute function public.community_birth_date_applied();

-- Sensitive posts: marked by their author (or an admin) and never shown to members under 14.
alter table public.community_posts add column if not exists sensitive boolean not null default false;
create policy posts_hidden_from_minors on public.community_posts as restrictive for select to authenticated
  using (not sensitive or user_id = (select auth.jwt()->>'sub') or not (select private.community_is_minor((select auth.jwt()->>'sub'))));

-- Messages to a member under 14 only from people they follow (and they only write to people they follow).
create or replace function private.community_message_allowed(thread uuid, sender text)
returns boolean language sql stable security definer set search_path = '' as $$
  with t as (select case when user_a = sender then user_b else user_a end as other from public.community_threads where id = thread)
  select coalesce((
    select (not private.community_is_minor(t.other) or exists (select 1 from public.community_follows f where f.follower_id = t.other and f.following_id = sender))
       and (not private.community_is_minor(sender) or exists (select 1 from public.community_follows f where f.follower_id = sender and f.following_id = t.other))
    from t), true)
$$;
revoke all on function private.community_message_allowed(uuid, text) from public, anon;
grant execute on function private.community_message_allowed(uuid, text) to authenticated;
create policy messages_minor_safe on public.community_messages as restrictive for insert to authenticated
  with check ((select private.community_message_allowed(thread_id, sender_id)));

create policy calls_minor_safe on public.community_calls as restrictive for insert to authenticated
  with check (
    (not private.community_is_minor(callee_id) or exists (select 1 from public.community_follows f where f.follower_id = callee_id and f.following_id = caller_id))
    and (not private.community_is_minor(caller_id) or exists (select 1 from public.community_follows f where f.follower_id = caller_id and f.following_id = callee_id)));

create policy lives_not_minors on public.community_lives as restrictive for insert to authenticated
  with check (not (select private.community_is_minor((select auth.jwt()->>'sub'))));

-- ---------------------------------------------------------------------------------------------
-- 1. discover people
-- ---------------------------------------------------------------------------------------------

create table if not exists public.community_suggestion_dismissals (
  user_id text not null references public.community_profiles(id) on delete cascade,
  target_id text not null references public.community_profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, target_id)
);
alter table public.community_suggestion_dismissals enable row level security;
grant select, insert, delete on public.community_suggestion_dismissals to authenticated;
create policy dismissals_own on public.community_suggestion_dismissals for all to authenticated
  using (user_id = (select auth.jwt()->>'sub')) with check (user_id = (select auth.jwt()->>'sub'));

create or replace function public.community_suggested_people(p_limit integer default 30)
returns table (id text, username text, full_name text, avatar_url text, verified boolean, mutual_count integer, mutual_avatars text[], mutual_names text[], follows_me boolean)
language sql stable security definer set search_path = '' as $$
  with me as (select (auth.jwt()->>'sub') as id),
  following as (select f.following_id as id from public.community_follows f, me where f.follower_id = me.id),
  adult as (select not private.community_is_minor((select id from me)) as yes)
  select p.id, p.username, p.full_name, p.avatar_url, p.verified,
    (select count(*) from public.community_follows f where f.following_id = p.id and f.follower_id in (select id from following))::integer,
    array(select pr.avatar_url from public.community_follows f join public.community_profiles pr on pr.id = f.follower_id
          where f.following_id = p.id and f.follower_id in (select id from following) order by f.created_at desc limit 2),
    array(select pr.username from public.community_follows f join public.community_profiles pr on pr.id = f.follower_id
          where f.following_id = p.id and f.follower_id in (select id from following) order by f.created_at desc limit 2),
    exists (select 1 from public.community_follows f, me where f.follower_id = p.id and f.following_id = me.id)
  from public.community_profiles p, me
  where p.id <> me.id and p.deleted_at is null and not p.suspended
    and p.id not in (select id from following)
    and p.id not in (select d.target_id from public.community_suggestion_dismissals d where d.user_id = me.id)
    and not exists (select 1 from public.community_follow_requests r where r.requester_id = me.id and r.target_id = p.id)
    and p.id <> all (private.community_block_list())
    -- Adults are never shown members under 14.
    and (not (select yes from adult) or not private.community_is_minor(p.id))
  order by 9 desc, 6 desc, p.verified desc, p.created_at desc
  limit greatest(1, least(p_limit, 100))
$$;
revoke all on function public.community_suggested_people(integer) from public, anon;
grant execute on function public.community_suggested_people(integer) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 2. streaks
-- ---------------------------------------------------------------------------------------------

alter table public.community_profiles add column if not exists streaks_enabled boolean not null default true;
create index if not exists community_messages_thread_created_idx on public.community_messages (thread_id, created_at desc);

-- Consecutive days, up to today or yesterday, on which both people wrote at least once.
create or replace function private.community_thread_streak(thread uuid)
returns integer language sql stable security definer set search_path = '' as $$
  with both_days as (
    select (m.created_at at time zone 'UTC')::date as d
    from public.community_messages m
    where m.thread_id = thread and m.created_at > now() - interval '120 days'
    group by 1 having count(distinct m.sender_id) >= 2
  ), ranked as (select d, row_number() over (order by d desc) as rn from both_days)
  select case when (select max(d) from both_days) < (now() at time zone 'UTC')::date - 1 then 0
    else coalesce((select count(*)::integer from ranked where d + (rn - 1)::integer = (select max(d) from both_days)), 0) end
$$;
revoke all on function private.community_thread_streak(uuid) from public, anon;
grant execute on function private.community_thread_streak(uuid) to authenticated;

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
  o.verified,
  case when o.streaks_enabled and coalesce((select p.streaks_enabled from public.community_profiles p where p.id = me.sub), true)
    then private.community_thread_streak(t.id) else 0 end as streak
from public.community_threads t
cross join lateral (select auth.jwt()->>'sub' as sub) me
join public.community_profiles o on o.id = case when t.user_a = me.sub then t.user_b else t.user_a end
left join public.community_thread_settings st on st.thread_id = t.id and st.user_id = me.sub
where o.id <> all ((select private.community_block_list())::text[]);

-- ---------------------------------------------------------------------------------------------
-- 3. churches wait for an admin
-- ---------------------------------------------------------------------------------------------

alter table public.community_churches
  add column if not exists status text not null default 'approved' check (status in ('pending', 'approved', 'rejected')),
  add column if not exists reviewed_by text,
  add column if not exists reviewed_at timestamptz;

create or replace function public.community_church_submitted()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- Anyone may suggest a church; only an admin's goes straight in.
  if not private.community_is_admin() then new.status := 'pending'; end if;
  return new;
end $$;
revoke all on function public.community_church_submitted() from public, anon, authenticated;
create or replace trigger community_churches_submitted before insert on public.community_churches
  for each row execute function public.community_church_submitted();

create policy churches_approved_only on public.community_churches as restrictive for select to authenticated
  using (status = 'approved' or created_by = (select auth.jwt()->>'sub') or (select private.community_is_admin()));

-- ---------------------------------------------------------------------------------------------
-- 5. offensive words
-- ---------------------------------------------------------------------------------------------

create table if not exists public.community_blocked_words (
  word text primary key check (word ~ '^[a-z0-9]{2,30}$'),
  created_at timestamptz not null default now()
);
alter table public.community_blocked_words enable row level security;
grant select, insert, delete on public.community_blocked_words to authenticated;
create policy blocked_words_admin on public.community_blocked_words for all to authenticated
  using ((select private.community_is_admin())) with check ((select private.community_is_admin()));

-- A starting list that admins extend in the app. Words the King James Bible itself uses (ass, whore,
-- damnation, piss) are left out so that quoted Scripture is never masked.
insert into public.community_blocked_words (word) values
  ('fuck'), ('fucking'), ('fucker'), ('motherfucker'), ('fck'), ('fuk'), ('shit'), ('shitty'), ('bullshit'), ('sh1t'),
  ('bitch'), ('b1tch'), ('bastard'), ('asshole'), ('arsehole'), ('a55hole'), ('dick'), ('dickhead'), ('cock'),
  ('cunt'), ('pussy'), ('wanker'), ('twat'), ('slut'), ('bollocks'), ('goddamn'), ('retard'),
  ('nigger'), ('nigga'), ('faggot'), ('fag'), ('chink'), ('spic'), ('kike'), ('paki'), ('tranny'), ('dyke'),
  ('coon'), ('wetback'), ('gook'), ('porn'), ('nude'), ('nudes')
on conflict (word) do nothing;

-- Each blocked word, with a plural or verb ending, becomes asterisks of the same length.
create or replace function private.community_clean_text(input text)
returns text language plpgsql stable security definer set search_path = '' as $$
declare out text := input; w text; m text;
begin
  if input is null or input = '' then return input; end if;
  for w in select word from public.community_blocked_words loop
    for m in select (regexp_matches(out, '\m(' || w || '(s|es|ed|ing)?)\M', 'gi'))[1] loop
      out := regexp_replace(out, '\m' || m || '\M', repeat('*', length(m)), 'gi');
    end loop;
  end loop;
  return out;
end $$;
revoke all on function private.community_clean_text(text) from public, anon;
grant execute on function private.community_clean_text(text) to authenticated;

create or replace function public.community_clean_comment()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.text := private.community_clean_text(new.text);
  return new;
end $$;
revoke all on function public.community_clean_comment() from public, anon, authenticated;
create or replace trigger community_comments_clean before insert or update of text on public.community_comments
  for each row execute function public.community_clean_comment();

create or replace function public.community_clean_caption()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.caption := private.community_clean_text(new.caption);
  return new;
end $$;
revoke all on function public.community_clean_caption() from public, anon, authenticated;
create or replace trigger community_posts_clean before insert or update of caption on public.community_posts
  for each row execute function public.community_clean_caption();

-- ---------------------------------------------------------------------------------------------
-- 6. identity checks for the tick
-- ---------------------------------------------------------------------------------------------

alter table public.community_plus_requests
  add column if not exists selfie_path text not null default '' check (length(selfie_path) <= 300),
  add column if not exists document_path text not null default '' check (length(document_path) <= 300),
  add column if not exists document_type text not null default '' check (document_type in ('', 'passport', 'driving_licence', 'national_id', 'other')),
  add column if not exists legal_name text not null default '' check (length(legal_name) <= 120);

-- A request for the tick must come with both photos.
create policy plus_requests_verify_needs_photos on public.community_plus_requests as restrictive for insert to authenticated
  with check (kind <> 'verify' or (selfie_path <> '' and document_path <> '' and document_type <> ''));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('community-verification', 'community-verification', false, 10485760, array['image/jpeg', 'image/png', 'image/heic', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;

create policy verification_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'community-verification' and (storage.foldername(name))[1] = (select auth.jwt()->>'sub'));
create policy verification_read on storage.objects for select to authenticated
  using (bucket_id = 'community-verification' and ((storage.foldername(name))[1] = (select auth.jwt()->>'sub') or (select private.community_is_admin())));
create policy verification_remove on storage.objects for delete to authenticated
  using (bucket_id = 'community-verification' and ((storage.foldername(name))[1] = (select auth.jwt()->>'sub') or (select private.community_is_admin())));

-- ---------------------------------------------------------------------------------------------
-- 7. ads
-- ---------------------------------------------------------------------------------------------

alter table public.community_transactions drop constraint if exists community_transactions_kind_check;
alter table public.community_transactions add constraint community_transactions_kind_check
  check (kind in ('plus', 'donation', 'refund', 'other', 'ad'));

create table if not exists public.community_promotions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references public.community_posts(id) on delete set null,
  user_id text not null references public.community_profiles(id) on delete cascade,
  days integer not null check (days between 1 and 30),
  amount_pence integer not null check (amount_pence >= 0),
  currency text not null default 'GBP',
  status text not null default 'pending' check (status in ('pending', 'active', 'ended', 'failed', 'refunded')),
  payment_intent_id text unique,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.community_promotions enable row level security;
grant select on public.community_promotions to authenticated;
create policy promotions_own_read on public.community_promotions for select to authenticated
  using (user_id = (select auth.jwt()->>'sub') or (select private.community_is_admin()));

-- ---------------------------------------------------------------------------------------------
-- 8. fundraisers
-- ---------------------------------------------------------------------------------------------

alter table public.community_billing
  add column if not exists stripe_account_id text unique,
  add column if not exists charges_enabled boolean not null default false,
  add column if not exists payouts_enabled boolean not null default false,
  add column if not exists details_submitted boolean not null default false;
-- A member may have a payout account before ever paying for anything.
alter table public.community_billing alter column stripe_customer_id drop not null;

create table if not exists public.community_fundraisers (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.community_profiles(id) on delete cascade,
  title text not null check (length(title) between 3 and 80),
  description text not null default '' check (length(description) <= 2000),
  goal_pence integer not null check (goal_pence between 100 and 100000000),
  currency text not null default 'GBP',
  cover_url text not null default '' check (length(cover_url) <= 500),
  ends_at timestamptz,
  status text not null default 'active' check (status in ('active', 'closed')),
  created_at timestamptz not null default now()
);
alter table public.community_fundraisers enable row level security;
create index if not exists community_fundraisers_user_idx on public.community_fundraisers (user_id, created_at desc);
grant select, insert, update, delete on public.community_fundraisers to authenticated;
create policy fundraisers_read on public.community_fundraisers for select to authenticated using (true);
create policy fundraisers_add on public.community_fundraisers for insert to authenticated
  with check (user_id = (select auth.jwt()->>'sub') and not (select private.community_suspended()) and not (select private.community_is_minor((select auth.jwt()->>'sub'))));
create policy fundraisers_edit on public.community_fundraisers for update to authenticated
  using (user_id = (select auth.jwt()->>'sub') or (select private.community_is_admin()));
create policy fundraisers_remove on public.community_fundraisers for delete to authenticated
  using (user_id = (select auth.jwt()->>'sub') or (select private.community_is_admin()));

create table if not exists public.community_donations (
  id uuid primary key default gen_random_uuid(),
  fundraiser_id uuid not null references public.community_fundraisers(id) on delete cascade,
  donor_id text references public.community_profiles(id) on delete set null,
  amount_pence integer not null check (amount_pence > 0),
  currency text not null default 'GBP',
  message text not null default '' check (length(message) <= 300),
  anonymous boolean not null default false,
  payment_intent_id text unique,
  status text not null default 'pending' check (status in ('pending', 'succeeded', 'failed', 'refunded')),
  created_at timestamptz not null default now()
);
alter table public.community_donations enable row level security;
create index if not exists community_donations_fundraiser_idx on public.community_donations (fundraiser_id, created_at desc);
grant select on public.community_donations to authenticated;
create policy donations_read on public.community_donations for select to authenticated
  using (donor_id = (select auth.jwt()->>'sub')
    or exists (select 1 from public.community_fundraisers f where f.id = fundraiser_id and f.user_id = (select auth.jwt()->>'sub'))
    or (select private.community_is_admin()));

create or replace function private.community_fundraiser_totals(fid uuid)
returns table (raised integer, donors integer) language sql stable security definer set search_path = '' as $$
  select coalesce(sum(amount_pence), 0)::integer, count(distinct coalesce(donor_id, id::text))::integer
  from public.community_donations where fundraiser_id = fid and status = 'succeeded'
$$;
revoke all on function private.community_fundraiser_totals(uuid) from public, anon;
grant execute on function private.community_fundraiser_totals(uuid) to authenticated;

create or replace view public.community_fundraiser_cards with (security_invoker = true) as
select f.id, f.user_id, f.title, f.description, f.goal_pence, f.currency, f.cover_url, f.ends_at, f.status, f.created_at,
  p.username, p.full_name, p.avatar_url, p.verified,
  (select t.raised from private.community_fundraiser_totals(f.id) t) as raised_pence,
  (select t.donors from private.community_fundraiser_totals(f.id) t) as donor_count,
  coalesce((select b.charges_enabled from public.community_billing b where b.user_id = f.user_id), false) as accepting
from public.community_fundraisers f
join public.community_profiles p on p.id = f.user_id
where p.id <> all ((select private.community_block_list())::text[]);
revoke all on public.community_fundraiser_cards from anon;
grant select on public.community_fundraiser_cards to authenticated;

-- Recent supporters, without the names of those who gave anonymously.
create or replace function public.community_fundraiser_supporters(fid uuid, p_limit integer default 30)
returns table (id uuid, amount_pence integer, currency text, message text, created_at timestamptz, username text, full_name text, avatar_url text)
language sql stable security definer set search_path = '' as $$
  select d.id, d.amount_pence, d.currency, d.message, d.created_at,
    case when d.anonymous then null else p.username end,
    case when d.anonymous then 'Anonymous' else p.full_name end,
    case when d.anonymous then null else p.avatar_url end
  from public.community_donations d
  left join public.community_profiles p on p.id = d.donor_id
  where d.fundraiser_id = fid and d.status = 'succeeded'
  order by d.created_at desc
  limit greatest(1, least(p_limit, 100))
$$;
revoke all on function public.community_fundraiser_supporters(uuid, integer) from public, anon;
grant execute on function public.community_fundraiser_supporters(uuid, integer) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 9. Plus styling, and the rules on what members may change themselves
-- ---------------------------------------------------------------------------------------------

alter table public.community_profiles
  add column if not exists ring_color text not null default '' check (length(ring_color) <= 20),
  add column if not exists profile_theme text not null default '' check (length(profile_theme) <= 20);

create or replace function public.community_plus_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare server boolean := auth.jwt() is null or coalesce(auth.jwt()->>'role', '') = 'service_role';
begin
  if server then return new; end if;
  if tg_table_name = 'community_posts' then
    -- Boosts are bought (the payments function sets them); admins may also set or clear one.
    if new.boosted_until is distinct from old.boosted_until and not private.community_is_admin() then
      raise exception 'Boosts are bought from the post''s menu';
    end if;
  elsif tg_table_name = 'community_profiles' then
    if new.read_receipts = false and old.read_receipts = true and not private.community_is_plus() and not private.community_is_admin() then
      raise exception 'Turning off read receipts is part of Community Plus';
    end if;
    if ((new.ring_color <> '' and new.ring_color is distinct from old.ring_color) or (new.profile_theme <> '' and new.profile_theme is distinct from old.profile_theme))
       and not private.community_is_plus() and not private.community_is_admin() then
      raise exception 'Profile styling is part of Community Plus';
    end if;
    if new.is_private = false and old.is_private = true and private.community_is_minor(new.id) then
      raise exception 'Accounts of members under 14 stay private';
    end if;
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------------------------
-- the views the app reads
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
  (select count(*) from public.community_profile_views v where v.profile_id = pr.id and v.viewed_at > now() - interval '7 days')::integer as views_week,
  pr.streaks_enabled,
  pr.ring_color,
  pr.profile_theme,
  -- Only ever about yourself: whether the under-14 rules apply, and whether the app still needs a birth date.
  case when pr.id = (select auth.jwt()->>'sub') then private.community_is_minor(pr.id) end as restricted,
  case when pr.id = (select auth.jwt()->>'sub') then not exists (select 1 from public.community_private_details d where d.user_id = pr.id and d.birth_date is not null) end as needs_birth_date,
  (select f.id from public.community_fundraisers f where f.user_id = pr.id and f.status = 'active' and (f.ends_at is null or f.ends_at > now()) order by f.created_at desc limit 1) as fundraiser_id
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
  (select i.audio_url from public.community_pod_items i where i.id = p.audio_id) as audio_url,
  p.sensitive
from public.community_posts p
join public.community_profiles pr on pr.id = p.user_id
where not exists (select 1 from public.community_blocks b where b.blocker_id = (select auth.jwt()->>'sub') and b.blocked_id = p.user_id);

-- Admins see what is waiting for them.
create or replace function public.community_admin_queue()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.community_is_admin() then raise exception 'Admins only'; end if;
  return jsonb_build_object(
    'churches_pending', (select count(*) from public.community_churches where status = 'pending'),
    'verifications_pending', (select count(*) from public.community_plus_requests where status = 'pending' and kind = 'verify'),
    'ads_active', (select count(*) from public.community_promotions where status = 'active' and ends_at > now()),
    'fundraisers_active', (select count(*) from public.community_fundraisers where status = 'active'));
end $$;
revoke all on function public.community_admin_queue() from public, anon;
grant execute on function public.community_admin_queue() to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 10. the 30-day purge, without touching storage from SQL
-- ---------------------------------------------------------------------------------------------

create table if not exists public.community_purge_queue (
  user_id text primary key,
  purged_at timestamptz not null default now(),
  files_removed_at timestamptz
);
alter table public.community_purge_queue enable row level security;
revoke all on public.community_purge_queue from anon, authenticated;

create or replace function private.community_purge_deleted_accounts()
returns integer language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  insert into public.community_purge_queue (user_id)
    select id from public.community_profiles where deleted_at < now() - interval '30 days'
  on conflict (user_id) do nothing;
  delete from public.community_profiles where deleted_at < now() - interval '30 days';
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function private.community_purge_deleted_accounts() from public, anon, authenticated;

-- The maintenance function removes the files of purged accounts; pg_net calls it after the purge.
create extension if not exists pg_net;
insert into public.community_secrets (key, value) values ('maintenance_key', encode(extensions.gen_random_bytes(24), 'hex')) on conflict (key) do nothing;
select cron.schedule('community-remove-purged-files', '45 3 * * *', $cron$
  select net.http_post(
    url := 'https://eapouujcyzooyfapoyyt.supabase.co/functions/v1/maintenance',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-maintenance-key', (select value from public.community_secrets where key = 'maintenance_key')),
    body := '{"task":"purged-files"}'::jsonb)
$cron$);
