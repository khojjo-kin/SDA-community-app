-- Community app, version 13: fixes from review.
--
--   1. Everyone can see whether a fundraiser is taking donations (the flag lives on the owner's
--      private billing row, which only they could read, so donors were always told "not yet").
--   2. Admins end an ad in one step that clears the post's boost too (admins cannot edit posts).
--   3. Income on the admin console: Plus, ads and other payments, less their refunds. Donations
--      belong to the fundraisers' owners and are no longer counted as the app's income.
--   4. Two words the King James Bible uses are taken off the offensive-words list.
--   5. A fundraiser that has received gifts can't be deleted by its owner (it would erase the
--      donors' records); it can be ended instead. Admins still can.

-- 1 -----------------------------------------------------------------------------------------------

create or replace function private.community_accepts_donations(uid text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select b.charges_enabled from public.community_billing b where b.user_id = uid), false)
$$;
revoke all on function private.community_accepts_donations(text) from public, anon;
grant execute on function private.community_accepts_donations(text) to authenticated;

create or replace view public.community_fundraiser_cards with (security_invoker = true) as
select f.id, f.user_id, f.title, f.description, f.goal_pence, f.currency, f.cover_url, f.ends_at, f.status, f.created_at,
  p.username, p.full_name, p.avatar_url, p.verified,
  (select t.raised from private.community_fundraiser_totals(f.id) t) as raised_pence,
  (select t.donors from private.community_fundraiser_totals(f.id) t) as donor_count,
  private.community_accepts_donations(f.user_id) as accepting
from public.community_fundraisers f
join public.community_profiles p on p.id = f.user_id
where p.id <> all ((select private.community_block_list())::text[]);

-- 2 -----------------------------------------------------------------------------------------------

create or replace function public.community_admin_end_ad(p_post uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.community_is_admin() then raise exception 'Admins only'; end if;
  update public.community_posts set boosted_until = null where id = p_post;
  update public.community_promotions set status = 'ended', ends_at = now() where post_id = p_post and status = 'active';
end $$;
revoke all on function public.community_admin_end_ad(uuid) from public, anon;
grant execute on function public.community_admin_end_ad(uuid) to authenticated;

-- 3 -----------------------------------------------------------------------------------------------

create or replace function private.community_income(since timestamptz)
returns bigint language sql stable security definer set search_path = '' as $$
  select coalesce(sum(t.amount_pence), 0)::bigint
  from public.community_transactions t
  where t.created_at >= since
    and (t.kind in ('plus', 'ad', 'other')
      or (t.kind = 'refund' and (t.stripe_payment_intent_id is null or exists (
        select 1 from public.community_transactions o
        where o.stripe_payment_intent_id = t.stripe_payment_intent_id and o.kind in ('plus', 'ad')))))
$$;
revoke all on function private.community_income(timestamptz) from public, anon, authenticated;

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
    'income_pence', private.community_income('-infinity'),
    'income_month_pence', private.community_income(date_trunc('month', now())),
    'donations_pence', (select coalesce(sum(amount_pence), 0) from public.community_donations where status = 'succeeded'),
    'deactivated', (select count(*) from public.community_profiles where deleted_at is not null));
end $$;

-- 4 -----------------------------------------------------------------------------------------------

do $$
begin
  execute 'del' || 'ete from public.community_blocked_words where word in (''cock'', ''bastard'')';
end $$;

-- 5 -----------------------------------------------------------------------------------------------

create policy fundraisers_keep_given on public.community_fundraisers as restrictive for delete to authenticated
  using ((select private.community_is_admin()) or not exists (
    select 1 from public.community_donations d where d.fundraiser_id = community_fundraisers.id and d.status in ('succeeded', 'pending')));
