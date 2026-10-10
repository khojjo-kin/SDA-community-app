-- Community app, version 10: payments through Stripe, and ticks everywhere.
--
--   1. Server code (the payments functions, run with the service role) may set the tick and Plus;
--      before, only a signed-in admin could, so a payment could not switch Plus on by itself.
--   2. The owner's accounts carry the verified tick.
--   3. Notifications say whether the person in them is verified, for the tick next to their name.
--   4. Billing: each member's Stripe customer and subscription, payment details on transactions,
--      and a private store for the webhook signing secret the functions register for themselves.

-- ---------------------------------------------------------------------------------------------
-- 1. the profile guard lets the server through
-- ---------------------------------------------------------------------------------------------

create or replace function public.community_profile_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare me text := auth.jwt()->>'sub'; admin boolean := private.community_is_admin();
begin
  -- The payments functions (service role) and maintenance run from the database itself (no request
  -- at all) may change anything; people signed in to the app are held to the rules below.
  if auth.jwt() is null or coalesce(auth.jwt()->>'role', '') = 'service_role' then
    return new;
  end if;
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

-- ---------------------------------------------------------------------------------------------
-- 2. the owner's accounts are verified
-- ---------------------------------------------------------------------------------------------

update public.community_profiles set verified = true
where id in (select user_id from public.community_admins where role = 'owner');

-- ---------------------------------------------------------------------------------------------
-- 3. the tick in notifications
-- ---------------------------------------------------------------------------------------------

create or replace view public.community_notification_cards with (security_invoker = true) as
select n.id, n.user_id, n.actor_id, n.kind, n.post_id, n.body, n.created_at, n.read_at,
  a.username, a.full_name, a.avatar_url,
  (select p.media -> 0 from public.community_posts p where p.id = n.post_id) as post_media,
  exists (select 1 from public.community_follows f where f.following_id = n.actor_id and f.follower_id = n.user_id) as is_following,
  a.verified
from public.community_notifications n
join public.community_profiles a on a.id = n.actor_id
where n.actor_id <> all ((select private.community_block_list())::text[])
  and case n.kind
    when 'like' then exists (select 1 from public.community_likes l where l.user_id = n.actor_id and l.post_id = n.post_id)
    when 'repost' then exists (select 1 from public.community_reposts r where r.user_id = n.actor_id and r.post_id = n.post_id)
    when 'follow' then exists (select 1 from public.community_follows f where f.follower_id = n.actor_id and f.following_id = n.user_id)
    else true
  end;

-- ---------------------------------------------------------------------------------------------
-- 4. billing
-- ---------------------------------------------------------------------------------------------

-- One row per member who has started paying. Written only by the payments functions.
create table if not exists public.community_billing (
  user_id text primary key references public.community_profiles(id) on delete cascade,
  stripe_customer_id text not null unique,
  stripe_subscription_id text,
  status text not null default 'none',
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.community_billing enable row level security;
grant select on public.community_billing to authenticated;
create policy billing_own_read on public.community_billing for select to authenticated
  using (user_id = (select auth.jwt()->>'sub') or (select private.community_is_admin()));

-- Payment details on the books. A Stripe invoice is recorded once, however many times it is seen.
alter table public.community_transactions
  add column if not exists provider text not null default 'manual' check (provider in ('manual', 'stripe')),
  add column if not exists status text not null default 'succeeded' check (status in ('succeeded', 'refunded', 'failed')),
  add column if not exists method text not null default '' check (length(method) <= 60),
  add column if not exists stripe_invoice_id text,
  add column if not exists stripe_payment_intent_id text;
-- A full unique index (not a partial one) so upserts can name it; rows without an invoice are all
-- null, and nulls never clash.
create unique index if not exists community_transactions_stripe_invoice_key on public.community_transactions (stripe_invoice_id);

create or replace view public.community_transaction_cards with (security_invoker = true) as
select t.id, t.user_id, t.kind, t.amount_pence, t.currency, t.note, t.created_by, t.created_at,
  p.username, p.full_name, p.avatar_url,
  (select a.username from public.community_profiles a where a.id = t.created_by) as created_by_username,
  t.provider, t.status, t.method, t.stripe_invoice_id
from public.community_transactions t
left join public.community_profiles p on p.id = t.user_id;
revoke all on public.community_transaction_cards from anon;
grant select on public.community_transaction_cards to authenticated;

-- Values only the server reads (the webhook signing secret). No policies: the app cannot see it.
create table if not exists public.community_secrets (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);
alter table public.community_secrets enable row level security;
revoke all on public.community_secrets from anon, authenticated;
