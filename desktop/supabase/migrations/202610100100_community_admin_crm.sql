-- Admin CRM: sign-in sessions and approximate locations, security alerts, IP bans, timed bans,
-- an audit trail of admin actions, announcements, and the functions behind the admin console.
-- Everything here is additive: existing tables, views and functions used by the iPhone app keep
-- working unchanged. Every function checks private.community_is_admin() itself.

-- ---------- tables ----------

create table if not exists public.community_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.community_profiles(id) on delete cascade,
  platform text not null default 'other' check (platform in ('ios', 'android', 'mac', 'windows', 'web', 'other')),
  ip text not null default '',
  country text,
  timezone text not null default '' check (length(timezone) <= 64),
  locale text not null default '' check (length(locale) <= 35),
  app_version text not null default '' check (length(app_version) <= 40),
  device text not null default '' check (length(device) <= 120),
  user_agent text not null default '',
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  hits integer not null default 1,
  unique (user_id, platform, ip)
);
create index if not exists community_sessions_user on public.community_sessions (user_id, last_seen desc);
create index if not exists community_sessions_ip on public.community_sessions (ip);
create index if not exists community_sessions_seen on public.community_sessions (last_seen desc);

create table if not exists public.community_security_events (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  severity text not null default 'low' check (severity in ('low', 'medium', 'high')),
  user_id text references public.community_profiles(id) on delete set null,
  ip text not null default '',
  detail text not null default '' check (length(detail) <= 1000),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by text
);
create index if not exists community_security_events_open on public.community_security_events (created_at desc) where resolved_at is null;

create table if not exists public.community_ip_bans (
  ip text primary key check (length(ip) between 3 and 64),
  reason text not null default '' check (length(reason) <= 300),
  created_by text,
  created_at timestamptz not null default now()
);

create table if not exists public.community_bans (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.community_profiles(id) on delete cascade,
  reason text not null default '' check (length(reason) <= 500),
  until timestamptz,
  created_by text,
  created_at timestamptz not null default now(),
  lifted_at timestamptz,
  lifted_by text
);
create index if not exists community_bans_user on public.community_bans (user_id, created_at desc);

create table if not exists public.community_admin_audit (
  id uuid primary key default gen_random_uuid(),
  admin_id text,
  action text not null,
  target_user text,
  target_id text,
  detail text not null default '' check (length(detail) <= 1000),
  created_at timestamptz not null default now()
);
create index if not exists community_admin_audit_at on public.community_admin_audit (created_at desc);
create index if not exists community_admin_audit_target on public.community_admin_audit (target_user, created_at desc);

create table if not exists public.community_announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(title) between 1 and 120),
  body text not null default '' check (length(body) <= 1000),
  level text not null default 'info' check (level in ('info', 'warning', 'success')),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  created_by text,
  created_at timestamptz not null default now()
);

alter table public.community_sessions enable row level security;
alter table public.community_security_events enable row level security;
alter table public.community_ip_bans enable row level security;
alter table public.community_bans enable row level security;
alter table public.community_admin_audit enable row level security;
alter table public.community_announcements enable row level security;

-- Members can see where they themselves are signed in; admins see everyone's. Writes go through
-- community_touch_session only.
create policy sessions_read on public.community_sessions for select to authenticated
  using (user_id = (select auth.jwt()->>'sub') or (select private.community_is_admin()));
create policy security_events_admin on public.community_security_events for select to authenticated
  using ((select private.community_is_admin()));
create policy security_events_resolve on public.community_security_events for update to authenticated
  using ((select private.community_is_admin())) with check ((select private.community_is_admin()));
create policy ip_bans_admin on public.community_ip_bans for all to authenticated
  using ((select private.community_is_admin())) with check ((select private.community_is_admin()));
create policy bans_admin on public.community_bans for select to authenticated
  using ((select private.community_is_admin()));
create policy audit_admin on public.community_admin_audit for select to authenticated
  using ((select private.community_is_admin()));
create policy announcements_read on public.community_announcements for select to authenticated
  using ((starts_at <= now() and (ends_at is null or ends_at > now())) or (select private.community_is_admin()));
create policy announcements_admin on public.community_announcements for all to authenticated
  using ((select private.community_is_admin())) with check ((select private.community_is_admin()));

grant select on public.community_sessions to authenticated;
grant select, update (resolved_at, resolved_by) on public.community_security_events to authenticated;
grant select, insert, delete on public.community_ip_bans to authenticated;
grant select on public.community_bans to authenticated;
grant select on public.community_admin_audit to authenticated;
grant select, insert, update, delete on public.community_announcements to authenticated;

-- ---------- the profile guard ----------
-- The iPhone app's guard (newest version, v22/v23) stays as it is. When an address is blocked, the
-- database suspends the account itself by setting community.trusted, which that guard already
-- honours (the same switch the iPhone app's own trusted functions use).

-- ---------- audit: admin changes made anywhere (iPhone or desktop) are written down ----------

create or replace function private.community_audit(p_action text, p_target text, p_target_id text, p_detail text)
 returns void
 language sql
 security definer
 set search_path to ''
as $$
  insert into public.community_admin_audit (admin_id, action, target_user, target_id, detail)
  values (auth.jwt()->>'sub', p_action, p_target, p_target_id, left(coalesce(p_detail, ''), 1000));
$$;

create or replace function public.community_profile_audit()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare who text := auth.jwt()->>'sub';
begin
  if who is null or who = new.id or coalesce(current_setting('community.audited', true), '') = 'on' then return new; end if;
  if new.verified is distinct from old.verified then
    perform private.community_audit(case when new.verified then 'verify' else 'unverify' end, new.id, null, '');
  end if;
  if new.suspended is distinct from old.suspended then
    perform private.community_audit(case when new.suspended then 'suspend' else 'unsuspend' end, new.id, null, coalesce(new.admin_note, ''));
  end if;
  if new.plus_until is distinct from old.plus_until then
    perform private.community_audit('plus', new.id, null, coalesce('until ' || to_char(new.plus_until, 'YYYY-MM-DD'), 'removed'));
  end if;
  if new.deleted_at is distinct from old.deleted_at then
    perform private.community_audit(case when new.deleted_at is null then 'restore' else 'close' end, new.id, null, '');
  end if;
  return new;
end $function$;

drop trigger if exists community_profiles_audit on public.community_profiles;
create trigger community_profiles_audit after update on public.community_profiles
  for each row execute function public.community_profile_audit();

-- ---------- sessions: called by the apps when they open ----------

create or replace function public.community_touch_session(p_platform text default 'other', p_version text default '',
  p_device text default '', p_timezone text default '', p_locale text default '')
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  me text := auth.jwt()->>'sub';
  h jsonb;
  v_ip text := '';
  v_country text;
  v_ua text := '';
  v_platform text := case when p_platform in ('ios', 'android', 'mac', 'windows', 'web') then p_platform else 'other' end;
  banned boolean := false;
  known_countries integer;
begin
  if me is null or not exists (select 1 from public.community_profiles where id = me) then
    return jsonb_build_object('ok', false);
  end if;
  begin
    h := nullif(current_setting('request.headers', true), '')::jsonb;
  exception when others then h := null;
  end;
  if h is not null then
    v_ip := left(trim(split_part(coalesce(h->>'cf-connecting-ip', h->>'x-real-ip', h->>'x-forwarded-for', ''), ',', 1)), 64);
    v_country := nullif(upper(left(coalesce(h->>'cf-ipcountry', ''), 2)), '');
    if v_country in ('XX', 'T1') then v_country := null; end if;
    v_ua := left(coalesce(h->>'user-agent', ''), 400);
  end if;

  select count(distinct country) into known_countries from public.community_sessions where user_id = me and country is not null;
  if v_country is not null and known_countries > 0
     and not exists (select 1 from public.community_sessions where user_id = me and country = v_country) then
    insert into public.community_security_events (kind, severity, user_id, ip, detail)
    values ('new_country', 'medium', me, v_ip, 'First sign-in from ' || v_country || ' on ' || v_platform);
  end if;

  insert into public.community_sessions as s (user_id, platform, ip, country, timezone, locale, app_version, device, user_agent)
  values (me, v_platform, v_ip, v_country, left(coalesce(p_timezone, ''), 64), left(coalesce(p_locale, ''), 35),
          left(coalesce(p_version, ''), 40), left(coalesce(p_device, ''), 120), v_ua)
  on conflict (user_id, platform, ip) do update set
    last_seen = now(), hits = s.hits + 1, country = coalesce(excluded.country, s.country),
    timezone = excluded.timezone, locale = excluded.locale, app_version = excluded.app_version,
    device = excluded.device, user_agent = excluded.user_agent;

  if (select count(distinct ip) from public.community_sessions where user_id = me and last_seen > now() - interval '1 day') >= 6
     and not exists (select 1 from public.community_security_events where user_id = me and kind = 'many_addresses' and created_at > now() - interval '1 day') then
    insert into public.community_security_events (kind, severity, user_id, ip, detail)
    values ('many_addresses', 'medium', me, v_ip, 'Signed in from 6 or more addresses in a day');
  end if;

  if v_ip <> '' then
    begin
      select exists (select 1 from public.community_ip_bans b
                     where b.ip = v_ip or (position('/' in b.ip) > 0 and v_ip::inet <<= b.ip::cidr)) into banned;
    exception when others then
      select exists (select 1 from public.community_ip_bans b where b.ip = v_ip) into banned;
    end;
  end if;
  if banned then
    perform set_config('community.trusted', 'on', true);
    update public.community_profiles set suspended = true,
      admin_note = left('Suspended automatically: signed in from a blocked address. ' || coalesce(admin_note, ''), 500)
      where id = me and not suspended;
    perform set_config('community.trusted', 'off', true);
    insert into public.community_security_events (kind, severity, user_id, ip, detail)
    values ('blocked_address', 'high', me, v_ip, 'Sign-in from a blocked address; the account was suspended');
  end if;

  return jsonb_build_object('ok', true, 'blocked', banned);
end $function$;

-- ---------- actions on an account ----------

create or replace function public.community_admin_act(p_user text, p_action text, p_reason text default '', p_days integer default null)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  me text := auth.jwt()->>'sub';
  target_role text;
  reason text := left(trim(coalesce(p_reason, '')), 500);
  n integer := 0;
begin
  if not private.community_is_admin() then raise exception 'Admins only'; end if;
  if not exists (select 1 from public.community_profiles where id = p_user) then raise exception 'That account no longer exists'; end if;
  select role into target_role from public.community_admins where user_id = p_user;
  if target_role = 'owner' then raise exception 'The owner''s account cannot be changed here'; end if;
  if target_role = 'admin' and not private.community_is_owner() then raise exception 'Only the owner can act on another admin'; end if;
  if p_user = me and p_action in ('suspend', 'close', 'purge', 'wipe') then raise exception 'You cannot do that to your own account'; end if;

  perform set_config('community.audited', 'on', true);
  case p_action
    when 'suspend' then
      update public.community_profiles set suspended = true,
        admin_note = case when reason <> '' then reason else admin_note end where id = p_user;
      update public.community_bans set lifted_at = now(), lifted_by = me where user_id = p_user and lifted_at is null;
      insert into public.community_bans (user_id, reason, until, created_by)
      values (p_user, reason, case when p_days is not null and p_days > 0 then now() + make_interval(days => least(p_days, 3650)) end, me);
    when 'unsuspend' then
      update public.community_profiles set suspended = false where id = p_user;
      update public.community_bans set lifted_at = now(), lifted_by = me where user_id = p_user and lifted_at is null;
    when 'close' then
      update public.community_profiles set deleted_at = now(),
        admin_note = case when reason <> '' then reason else admin_note end where id = p_user;
    when 'restore' then
      update public.community_profiles set deleted_at = null where id = p_user;
    when 'purge' then
      if not private.community_is_owner() then raise exception 'Only the owner can delete an account straight away'; end if;
      insert into public.community_purge_queue (user_id) values (p_user) on conflict (user_id) do nothing;
      perform private.community_audit('purge', p_user, null, reason);
      delete from public.community_profiles where id = p_user;
      return jsonb_build_object('ok', true, 'deleted', true);
    when 'verify' then update public.community_profiles set verified = true where id = p_user;
    when 'unverify' then update public.community_profiles set verified = false where id = p_user;
    when 'plus' then
      update public.community_profiles set verified = true,
        plus_until = greatest(coalesce(plus_until, now()), now()) + make_interval(days => greatest(1, least(coalesce(p_days, 30), 3650)))
        where id = p_user;
    when 'unplus' then update public.community_profiles set plus_until = null where id = p_user;
    when 'note' then update public.community_profiles set admin_note = reason where id = p_user;
    when 'wipe' then
      delete from public.community_posts where user_id = p_user; get diagnostics n = row_count;
      delete from public.community_stories where user_id = p_user;
      delete from public.community_comments where user_id = p_user;
    when 'end_live' then
      update public.community_lives set ended_at = now() where user_id = p_user and ended_at is null;
    else raise exception 'Unknown action';
  end case;
  perform private.community_audit(p_action, p_user, null,
    concat_ws(' · ', nullif(reason, ''), case when p_days is not null then p_days || ' days' end, case when p_action = 'wipe' then n || ' posts removed' end));
  perform set_config('community.audited', '', true);
  return jsonb_build_object('ok', true);
end $function$;

-- Timed suspensions end on their own.
create or replace function private.community_lift_expired_bans()
 returns integer
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare n integer;
begin
  with ended as (
    update public.community_bans set lifted_at = now(), lifted_by = 'system'
    where lifted_at is null and until is not null and until < now()
    returning user_id)
  update public.community_profiles p set suspended = false from ended where p.id = ended.user_id;
  get diagnostics n = row_count;
  return n;
end $function$;

select cron.schedule('community-lift-bans', '*/10 * * * *', $$select private.community_lift_expired_bans()$$);

-- ---------- the people list ----------

create or replace function public.community_admin_people(p_q text default '', p_filter text default 'all',
  p_sort text default 'newest', p_limit integer default 50, p_offset integer default 0)
 returns jsonb
 language plpgsql
 stable
 security definer
 set search_path to ''
as $function$
declare needle text := lower(trim(coalesce(p_q, ''))); result jsonb;
begin
  if not private.community_is_admin() then raise exception 'Admins only'; end if;
  with base as (
    select p.id, p.username, p.full_name, p.avatar_url, p.created_at, p.verified,
      (p.plus_until is not null and p.plus_until > now()) as plus, p.plus_until, p.suspended, p.deleted_at,
      p.admin_note, p.contact_email, p.contact_phone, p.account_type, p.is_private,
      (select a.role from public.community_admins a where a.user_id = p.id) as admin_role,
      (select c.name from public.community_churches c where c.id = p.church_id) as church_name,
      coalesce(private.community_is_minor(p.id), false) as minor,
      (select max(s.last_seen) from public.community_sessions s where s.user_id = p.id) as last_seen,
      (select s.country from public.community_sessions s where s.user_id = p.id and s.country is not null order by s.last_seen desc limit 1) as country,
      (select s.platform from public.community_sessions s where s.user_id = p.id order by s.last_seen desc limit 1) as platform,
      (select count(*) from public.community_posts x where x.user_id = p.id)::integer as posts,
      (select count(*) from public.community_follows f where f.following_id = p.id)::integer as followers,
      (select count(*) from public.community_follows f where f.follower_id = p.id)::integer as following,
      (select count(*) from public.community_messages m where m.sender_id = p.id)::integer as messages,
      (select count(*) from public.community_reports r where r.reported_user = p.id or r.reported_post_owner = p.id)::integer as reports,
      (select coalesce(sum(t.amount_pence), 0) from public.community_transactions t where t.user_id = p.id and t.status = 'succeeded' and t.kind <> 'refund')::integer as spent_pence,
      (select count(*) from public.community_security_events e where e.user_id = p.id and e.resolved_at is null)::integer as alerts
    from public.community_profiles p
    where needle = '' or p.username ilike '%' || needle || '%' or p.full_name ilike '%' || needle || '%'
      or p.id = trim(p_q) or p.contact_email ilike '%' || needle || '%' or p.contact_phone ilike '%' || needle || '%'
      or exists (select 1 from public.community_sessions s where s.user_id = p.id and s.ip = trim(p_q))
  ), filtered as (
    select * from base where case coalesce(p_filter, 'all')
      when 'active' then last_seen > now() - interval '7 days'
      when 'new' then created_at > now() - interval '7 days'
      when 'suspended' then suspended
      when 'closed' then deleted_at is not null
      when 'verified' then verified
      when 'plus' then plus
      when 'admins' then admin_role is not null
      when 'reported' then reports > 0
      when 'alerts' then alerts > 0
      when 'minors' then minor
      when 'paying' then spent_pence > 0
      when 'dormant' then coalesce(last_seen, created_at) < now() - interval '30 days'
      else true end
  )
  select jsonb_build_object(
    'total', (select count(*) from filtered),
    'rows', coalesce((select jsonb_agg(to_jsonb(r)) from (
      select * from filtered order by
        case when p_sort = 'name' then username end asc,
        case when p_sort = 'oldest' then created_at end asc,
        case when p_sort = 'active' then coalesce(last_seen, 'epoch'::timestamptz) end desc,
        case when p_sort = 'followers' then followers end desc,
        case when p_sort = 'posts' then posts end desc,
        case when p_sort = 'reports' then reports end desc,
        case when p_sort = 'spent' then spent_pence end desc,
        created_at desc
      limit greatest(1, least(coalesce(p_limit, 50), 500)) offset greatest(0, coalesce(p_offset, 0))) r), '[]'::jsonb)
  ) into result;
  return result;
end $function$;

-- ---------- one person, everything ----------

create or replace function public.community_admin_user(p_user text)
 returns jsonb
 language plpgsql
 stable
 security definer
 set search_path to ''
as $function$
declare result jsonb;
begin
  if not private.community_is_admin() then raise exception 'Admins only'; end if;
  select jsonb_build_object(
    'profile', to_jsonb(p) || jsonb_build_object(
        'plus', p.plus_until is not null and p.plus_until > now(),
        'admin_role', (select a.role from public.community_admins a where a.user_id = p.id),
        'church_name', (select c.name from public.community_churches c where c.id = p.church_id),
        'minor', coalesce(private.community_is_minor(p.id), false)),
    'counts', jsonb_build_object(
        'posts', (select count(*) from public.community_posts x where x.user_id = p.id and x.kind <> 'reel'),
        'reels', (select count(*) from public.community_posts x where x.user_id = p.id and x.kind = 'reel'),
        'stories', (select count(*) from public.community_stories x where x.user_id = p.id),
        'comments', (select count(*) from public.community_comments x where x.user_id = p.id),
        'likes_given', (select count(*) from public.community_likes x where x.user_id = p.id),
        'likes_received', (select count(*) from public.community_likes l join public.community_posts x on x.id = l.post_id where x.user_id = p.id),
        'followers', (select count(*) from public.community_follows f where f.following_id = p.id),
        'following', (select count(*) from public.community_follows f where f.follower_id = p.id),
        'messages', (select count(*) from public.community_messages m where m.sender_id = p.id),
        'chats', (select count(*) from public.community_threads t where t.user_a = p.id or t.user_b = p.id),
        'calls', (select count(*) from public.community_calls c where c.caller_id = p.id or c.callee_id = p.id),
        'lives', (select count(*) from public.community_lives l where l.user_id = p.id),
        'groups', (select count(*) from public.community_group_members g where g.user_id = p.id and g.status <> 'pending'),
        'blocks_made', (select count(*) from public.community_blocks b where b.blocker_id = p.id),
        'blocked_by', (select count(*) from public.community_blocks b where b.blocked_id = p.id),
        'reports_made', (select count(*) from public.community_reports r where r.reporter_id = p.id),
        'reports_against', (select count(*) from public.community_reports r where r.reported_user = p.id or r.reported_post_owner = p.id),
        'profile_views', (select count(*) from public.community_profile_views v where v.profile_id = p.id)),
    'sessions', coalesce((select jsonb_agg(to_jsonb(s) order by s.last_seen desc) from public.community_sessions s where s.user_id = p.id), '[]'::jsonb),
    'transactions', coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc) from (select * from public.community_transactions t where t.user_id = p.id order by created_at desc limit 100) t), '[]'::jsonb),
    'donations', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'amount_pence', d.amount_pence, 'currency', d.currency, 'status', d.status, 'created_at', d.created_at, 'fundraiser', f.title) order by d.created_at desc)
        from public.community_donations d left join public.community_fundraisers f on f.id = d.fundraiser_id where d.donor_id = p.id), '[]'::jsonb),
    'promotions', coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from public.community_promotions x where x.user_id = p.id), '[]'::jsonb),
    'fundraisers', coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from public.community_fundraiser_cards x where x.user_id = p.id), '[]'::jsonb),
    'billing', (select to_jsonb(b) - 'stripe_customer_id' - 'stripe_subscription_id' - 'stripe_account_id' from public.community_billing b where b.user_id = p.id),
    'bans', coalesce((select jsonb_agg(to_jsonb(b) order by b.created_at desc) from public.community_bans b where b.user_id = p.id), '[]'::jsonb),
    'alerts', coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at desc) from (select * from public.community_security_events e where e.user_id = p.id order by created_at desc limit 50) e), '[]'::jsonb),
    'audit', coalesce((select jsonb_agg(jsonb_build_object('at', a.created_at, 'action', a.action, 'detail', a.detail,
        'admin', (select x.username from public.community_profiles x where x.id = a.admin_id)) order by a.created_at desc)
        from (select * from public.community_admin_audit a where a.target_user = p.id order by created_at desc limit 100) a), '[]'::jsonb),
    'reports', coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at desc) from (select * from public.community_report_cards r
        where r.reported_user = p.id or r.reported_post_owner = p.id or r.reporter_id = p.id order by created_at desc limit 50) r), '[]'::jsonb),
    'support', coalesce((select jsonb_agg(to_jsonb(s) order by s.created_at desc) from public.community_support_tickets s where s.user_id = p.id), '[]'::jsonb),
    'requests', coalesce((select jsonb_agg(to_jsonb(q) order by q.created_at desc) from public.community_plus_requests q where q.user_id = p.id), '[]'::jsonb),
    'groups', coalesce((select jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name, 'kind', g.kind, 'role', m.role, 'status', m.status))
        from public.community_group_members m join public.community_groups g on g.id = m.group_id where m.user_id = p.id), '[]'::jsonb),
    'recent_posts', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'kind', x.kind, 'caption', x.caption, 'media', x.media->0, 'created_at', x.created_at,
        'likes', (select count(*) from public.community_likes l where l.post_id = x.id),
        'comments', (select count(*) from public.community_comments c where c.post_id = x.id)) order by x.created_at desc)
        from (select * from public.community_posts x where x.user_id = p.id order by created_at desc limit 24) x), '[]'::jsonb),
    'timeline', coalesce((select jsonb_agg(t order by at desc) from (
        select x.created_at as at, jsonb_build_object('at', x.created_at, 'kind', case when x.kind = 'reel' then 'reel' else 'post' end, 'detail', left(x.caption, 80)) as t from public.community_posts x where x.user_id = p.id
        union all select c.created_at as at, jsonb_build_object('at', c.created_at, 'kind', 'comment', 'detail', left(c.text, 80)) from public.community_comments c where c.user_id = p.id
        union all select s.created_at as at, jsonb_build_object('at', s.created_at, 'kind', 'story', 'detail', '') from public.community_stories s where s.user_id = p.id
        union all select f.created_at as at, jsonb_build_object('at', f.created_at, 'kind', 'follow', 'detail', (select x.username from public.community_profiles x where x.id = f.following_id)) from public.community_follows f where f.follower_id = p.id
        union all select l.started_at as at, jsonb_build_object('at', l.started_at, 'kind', 'live', 'detail', l.title) from public.community_lives l where l.user_id = p.id
        union all select c.created_at as at, jsonb_build_object('at', c.created_at, 'kind', 'call', 'detail', c.kind || ' · ' || c.status) from public.community_calls c where c.caller_id = p.id
        union all select t.created_at as at, jsonb_build_object('at', t.created_at, 'kind', 'payment', 'detail', t.kind || ' ' || t.currency || ' ' || to_char(t.amount_pence / 100.0, 'FM999990.00')) from public.community_transactions t where t.user_id = p.id
        union all select s.first_seen as at, jsonb_build_object('at', s.first_seen, 'kind', 'sign_in', 'detail', s.platform || coalesce(' · ' || s.country, '')) from public.community_sessions s where s.user_id = p.id
        order by 1 desc limit 150) x), '[]'::jsonb),
    'activity_days', coalesce((select jsonb_agg(jsonb_build_object('d', to_char(d, 'YYYY-MM-DD'),
        'n', (select count(*) from public.community_posts x where x.user_id = p.id and x.created_at >= d and x.created_at < d + interval '1 day')
           + (select count(*) from public.community_comments x where x.user_id = p.id and x.created_at >= d and x.created_at < d + interval '1 day')
           + (select count(*) from public.community_messages x where x.sender_id = p.id and x.created_at >= d and x.created_at < d + interval '1 day')
           + (select count(*) from public.community_likes x where x.user_id = p.id and x.created_at >= d and x.created_at < d + interval '1 day')) order by d)
        from generate_series(date_trunc('day', now()) - interval '29 days', date_trunc('day', now()), interval '1 day') d), '[]'::jsonb),
    'shared_addresses', coalesce((select jsonb_agg(distinct jsonb_build_object('id', o.id, 'username', o.username, 'ip', s2.ip))
        from public.community_sessions s1
        join public.community_sessions s2 on s2.ip = s1.ip and s2.user_id <> s1.user_id and s1.ip <> ''
        join public.community_profiles o on o.id = s2.user_id
        where s1.user_id = p.id), '[]'::jsonb)
  ) into result
  from public.community_profiles p where p.id = p_user;
  if result is null then raise exception 'That account no longer exists'; end if;
  return result;
end $function$;

-- ---------- search across everything ----------

create or replace function public.community_admin_search(p_q text)
 returns jsonb
 language plpgsql
 stable
 security definer
 set search_path to ''
as $function$
declare raw text := trim(coalesce(p_q, '')); needle text := '%' || replace(replace(lower(trim(coalesce(p_q, ''))), '%', ''), '_', '\_') || '%';
begin
  if not private.community_is_admin() then raise exception 'Admins only'; end if;
  if length(raw) < 2 then return '{}'::jsonb; end if;
  return jsonb_build_object(
    'people', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'username', p.username, 'full_name', p.full_name, 'avatar_url', p.avatar_url,
        'verified', p.verified, 'suspended', p.suspended, 'closed', p.deleted_at is not null, 'email', p.contact_email, 'phone', p.contact_phone))
      from (select * from public.community_profiles p where p.username ilike needle or p.full_name ilike needle or p.id = raw
            or p.contact_email ilike needle or p.contact_phone ilike needle or p.admin_note ilike needle limit 25) p), '[]'::jsonb),
    'addresses', coalesce((select jsonb_agg(jsonb_build_object('ip', s.ip, 'country', s.country, 'platform', s.platform, 'last_seen', s.last_seen,
        'user_id', s.user_id, 'username', (select x.username from public.community_profiles x where x.id = s.user_id)))
      from (select * from public.community_sessions s where s.ip ilike needle or s.device ilike needle order by last_seen desc limit 25) s), '[]'::jsonb),
    'posts', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'kind', x.kind, 'caption', left(x.caption, 140), 'media', x.media->0, 'created_at', x.created_at,
        'user_id', x.user_id, 'username', (select u.username from public.community_profiles u where u.id = x.user_id)))
      from (select * from public.community_posts x where x.caption ilike needle or x.location ilike needle or x.id::text = raw order by created_at desc limit 25) x), '[]'::jsonb),
    'comments', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'post_id', c.post_id, 'text', left(c.text, 140), 'created_at', c.created_at,
        'user_id', c.user_id, 'username', (select u.username from public.community_profiles u where u.id = c.user_id)))
      from (select * from public.community_comments c where c.text ilike needle order by created_at desc limit 25) c), '[]'::jsonb),
    'groups', coalesce((select jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name, 'kind', g.kind, 'handle', g.handle))
      from (select * from public.community_groups g where g.name ilike needle or g.handle ilike needle limit 15) g), '[]'::jsonb),
    'churches', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'city', c.city, 'country', c.country, 'status', c.status))
      from (select * from public.community_churches c where c.name ilike needle or c.city ilike needle or c.country ilike needle limit 15) c), '[]'::jsonb),
    'transactions', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'kind', t.kind, 'amount_pence', t.amount_pence, 'currency', t.currency, 'status', t.status,
        'created_at', t.created_at, 'user_id', t.user_id, 'username', (select u.username from public.community_profiles u where u.id = t.user_id)))
      from (select * from public.community_transactions t where t.id::text = raw or t.note ilike needle or t.stripe_invoice_id = raw
            or t.stripe_payment_intent_id = raw order by created_at desc limit 25) t), '[]'::jsonb),
    'tickets', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'subject', s.subject, 'status', s.status, 'created_at', s.created_at,
        'user_id', s.user_id, 'username', (select u.username from public.community_profiles u where u.id = s.user_id)))
      from (select * from public.community_support_tickets s where s.subject ilike needle or s.body ilike needle order by created_at desc limit 15) s), '[]'::jsonb),
    'fundraisers', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'title', f.title, 'status', f.status, 'user_id', f.user_id))
      from (select * from public.community_fundraisers f where f.title ilike needle or f.description ilike needle limit 15) f), '[]'::jsonb)
  );
end $function$;

-- ---------- analytics ----------

create or replace function public.community_admin_analytics(p_days integer default 30)
 returns jsonb
 language plpgsql
 stable
 security definer
 set search_path to ''
as $function$
declare days integer := greatest(7, least(coalesce(p_days, 30), 365)); since timestamptz;
begin
  if not private.community_is_admin() then raise exception 'Admins only'; end if;
  since := date_trunc('day', now()) - make_interval(days => days - 1);
  return jsonb_build_object(
    'days', days,
    'series', (select coalesce(jsonb_agg(jsonb_build_object(
        'd', to_char(d, 'YYYY-MM-DD'),
        'signups', (select count(*) from public.community_profiles x where x.created_at >= d and x.created_at < d + interval '1 day'),
        'posts', (select count(*) from public.community_posts x where x.created_at >= d and x.created_at < d + interval '1 day'),
        'stories', (select count(*) from public.community_stories x where x.created_at >= d and x.created_at < d + interval '1 day'),
        'comments', (select count(*) from public.community_comments x where x.created_at >= d and x.created_at < d + interval '1 day'),
        'likes', (select count(*) from public.community_likes x where x.created_at >= d and x.created_at < d + interval '1 day'),
        'messages', (select count(*) from public.community_messages x where x.created_at >= d and x.created_at < d + interval '1 day'),
        'calls', (select count(*) from public.community_calls x where x.created_at >= d and x.created_at < d + interval '1 day'),
        'active', (select count(distinct u) from (
            select x.user_id as u from public.community_sessions x where x.last_seen >= d and x.first_seen < d + interval '1 day'
            union select x.user_id from public.community_posts x where x.created_at >= d and x.created_at < d + interval '1 day'
            union select x.sender_id from public.community_messages x where x.created_at >= d and x.created_at < d + interval '1 day'
            union select x.user_id from public.community_likes x where x.created_at >= d and x.created_at < d + interval '1 day'
            union select x.user_id from public.community_comments x where x.created_at >= d and x.created_at < d + interval '1 day') a),
        'revenue_pence', (select coalesce(sum(case when x.kind = 'refund' then -x.amount_pence else x.amount_pence end), 0) from public.community_transactions x
            where x.status = 'succeeded' and x.created_at >= d and x.created_at < d + interval '1 day'),
        'reports', (select count(*) from public.community_reports x where x.created_at >= d and x.created_at < d + interval '1 day')
      ) order by d), '[]'::jsonb) from generate_series(since, date_trunc('day', now()), interval '1 day') d),
    'totals', jsonb_build_object(
        'members', (select count(*) from public.community_profiles),
        'dau', (select count(distinct user_id) from public.community_sessions where last_seen > now() - interval '1 day'),
        'wau', (select count(distinct user_id) from public.community_sessions where last_seen > now() - interval '7 days'),
        'mau', (select count(distinct user_id) from public.community_sessions where last_seen > now() - interval '30 days'),
        'online', (select count(distinct user_id) from public.community_sessions where last_seen > now() - interval '10 minutes'),
        'revenue_pence', (select coalesce(sum(case when kind = 'refund' then -amount_pence else amount_pence end), 0) from public.community_transactions where status = 'succeeded' and created_at >= since),
        'donations_pence', (select coalesce(sum(amount_pence), 0) from public.community_donations where status = 'succeeded' and created_at >= since),
        'boosts_pence', (select coalesce(sum(amount_pence), 0) from public.community_promotions where status in ('active', 'ended') and created_at >= since),
        'subscribers', (select count(*) from public.community_billing where status in ('active', 'trialing')),
        'retention_pct', (select case when count(*) = 0 then 0 else round(100.0 * count(*) filter (where exists (
            select 1 from public.community_sessions s where s.user_id = p.id and s.last_seen > p.created_at + interval '7 days')) / count(*)) end
          from public.community_profiles p where p.created_at < now() - interval '7 days')),
    'platforms', (select coalesce(jsonb_agg(jsonb_build_object('label', platform, 'value', n) order by n desc), '[]'::jsonb)
        from (select platform, count(distinct user_id) n from public.community_sessions where last_seen >= since group by 1) x),
    'countries', (select coalesce(jsonb_agg(jsonb_build_object('label', country, 'value', n) order by n desc), '[]'::jsonb)
        from (select coalesce(country, '??') country, count(distinct user_id) n from public.community_sessions where last_seen >= since group by 1 order by 2 desc limit 20) x),
    'timezones', (select coalesce(jsonb_agg(jsonb_build_object('label', timezone, 'value', n) order by n desc), '[]'::jsonb)
        from (select nullif(timezone, '') timezone, count(distinct user_id) n from public.community_sessions where last_seen >= since and timezone <> '' group by 1 order by 2 desc limit 12) x),
    'content', jsonb_build_array(
        jsonb_build_object('label', 'Posts', 'value', (select count(*) from public.community_posts where kind <> 'reel' and created_at >= since)),
        jsonb_build_object('label', 'Reels', 'value', (select count(*) from public.community_posts where kind = 'reel' and created_at >= since)),
        jsonb_build_object('label', 'Stories', 'value', (select count(*) from public.community_stories where created_at >= since)),
        jsonb_build_object('label', 'Comments', 'value', (select count(*) from public.community_comments where created_at >= since)),
        jsonb_build_object('label', 'Messages', 'value', (select count(*) from public.community_messages where created_at >= since))),
    'accounts', jsonb_build_array(
        jsonb_build_object('label', 'Personal', 'value', (select count(*) from public.community_profiles where account_type = 'personal' and deleted_at is null)),
        jsonb_build_object('label', 'Creator', 'value', (select count(*) from public.community_profiles where account_type = 'creator' and deleted_at is null)),
        jsonb_build_object('label', 'Private', 'value', (select count(*) from public.community_profiles where is_private and deleted_at is null)),
        jsonb_build_object('label', 'Verified', 'value', (select count(*) from public.community_profiles where verified)),
        jsonb_build_object('label', 'Plus', 'value', (select count(*) from public.community_profiles where plus_until > now())),
        jsonb_build_object('label', 'Suspended', 'value', (select count(*) from public.community_profiles where suspended)),
        jsonb_build_object('label', 'Closing', 'value', (select count(*) from public.community_profiles where deleted_at is not null))),
    'revenue_kinds', (select coalesce(jsonb_agg(jsonb_build_object('label', kind, 'value', n)), '[]'::jsonb)
        from (select kind, sum(amount_pence) n from public.community_transactions where status = 'succeeded' and created_at >= since group by 1) x),
    'hours', (select coalesce(jsonb_agg(jsonb_build_object('label', h, 'value', n) order by h), '[]'::jsonb)
        from (select extract(hour from created_at at time zone 'Europe/London')::integer h, count(*) n from (
          select created_at from public.community_messages where created_at >= since
          union all select created_at from public.community_posts where created_at >= since
          union all select created_at from public.community_comments where created_at >= since) a group by 1) x),
    'top_creators', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from (
        select p.id, p.username, p.full_name, p.avatar_url, p.verified,
          (select count(*) from public.community_posts x where x.user_id = p.id and x.created_at >= since) posts,
          (select count(*) from public.community_likes l join public.community_posts x on x.id = l.post_id where x.user_id = p.id and l.created_at >= since) likes,
          (select count(*) from public.community_follows f where f.following_id = p.id) followers
        from public.community_profiles p where p.deleted_at is null order by 7 desc, 6 desc limit 10) x),
    'top_posts', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from (
        select x.id, x.kind, x.media->0 media, left(x.caption, 80) caption, x.created_at,
          (select u.username from public.community_profiles u where u.id = x.user_id) username,
          (select count(*) from public.community_likes l where l.post_id = x.id) likes,
          (select count(*) from public.community_comments c where c.post_id = x.id) comments,
          (select count(*) from public.community_post_views v where v.post_id = x.id) views
        from public.community_posts x where x.created_at >= since order by 7 desc, 8 desc limit 10) x),
    'churches', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from (
        select c.id, c.name, c.city, (select count(*) from public.community_profiles p where p.church_id = c.id) members
        from public.community_churches c where c.status = 'approved' order by 4 desc limit 10) x)
  );
end $function$;

-- ---------- security centre ----------

create or replace function public.community_admin_security()
 returns jsonb
 language plpgsql
 stable
 security definer
 set search_path to ''
as $function$
begin
  if not private.community_is_admin() then raise exception 'Admins only'; end if;
  return jsonb_build_object(
    'events', coalesce((select jsonb_agg(to_jsonb(e) || jsonb_build_object('username', (select u.username from public.community_profiles u where u.id = e.user_id)) order by e.created_at desc)
        from (select * from public.community_security_events order by resolved_at nulls first, created_at desc limit 200) e), '[]'::jsonb),
    'open_by_severity', (select jsonb_build_object(
        'high', count(*) filter (where severity = 'high'), 'medium', count(*) filter (where severity = 'medium'), 'low', count(*) filter (where severity = 'low'))
        from public.community_security_events where resolved_at is null),
    -- Behaviour worth a look, worked out live from the last day of activity.
    'flags', coalesce((select jsonb_agg(f) from (
        select jsonb_build_object('kind', 'message_burst', 'user_id', m.sender_id, 'count', count(*), 'detail', count(*) || ' messages in the last hour') f
          from public.community_messages m where m.created_at > now() - interval '1 hour' group by m.sender_id having count(*) >= 120
        union all
        select jsonb_build_object('kind', 'follow_burst', 'user_id', f.follower_id, 'count', count(*), 'detail', count(*) || ' follows in the last hour')
          from public.community_follows f where f.created_at > now() - interval '1 hour' group by f.follower_id having count(*) >= 60
        union all
        select jsonb_build_object('kind', 'comment_burst', 'user_id', c.user_id, 'count', count(*), 'detail', count(*) || ' comments in the last hour')
          from public.community_comments c where c.created_at > now() - interval '1 hour' group by c.user_id having count(*) >= 60
        union all
        select jsonb_build_object('kind', 'heavily_reported', 'user_id', u, 'count', count(*), 'detail', count(*) || ' reports in the last week')
          from (select coalesce(r.reported_user, r.reported_post_owner) u from public.community_reports r where r.created_at > now() - interval '7 days') r
          where u is not null group by u having count(*) >= 3
        union all
        select jsonb_build_object('kind', 'widely_blocked', 'user_id', b.blocked_id, 'count', count(*), 'detail', 'Blocked by ' || count(*) || ' people')
          from public.community_blocks b group by b.blocked_id having count(*) >= 3
        union all
        select jsonb_build_object('kind', 'new_and_busy', 'user_id', p.id, 'count', (select count(*) from public.community_messages m where m.sender_id = p.id),
            'detail', 'Joined in the last day and already sent many messages')
          from public.community_profiles p where p.created_at > now() - interval '1 day'
            and (select count(*) from public.community_messages m where m.sender_id = p.id) >= 50
      ) x), '[]'::jsonb),
    'shared_addresses', coalesce((select jsonb_agg(jsonb_build_object('ip', ip, 'accounts', n, 'usernames', names) order by n desc) from (
        select s.ip, count(distinct s.user_id) n, jsonb_agg(distinct (select u.username from public.community_profiles u where u.id = s.user_id)) names
        from public.community_sessions s where s.ip <> '' group by s.ip having count(distinct s.user_id) >= 3 order by 2 desc limit 30) x), '[]'::jsonb),
    'ip_bans', coalesce((select jsonb_agg(to_jsonb(b) order by b.created_at desc) from public.community_ip_bans b), '[]'::jsonb),
    'suspended', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'username', p.username, 'note', p.admin_note,
        'until', (select b.until from public.community_bans b where b.user_id = p.id and b.lifted_at is null order by b.created_at desc limit 1)))
        from public.community_profiles p where p.suspended), '[]'::jsonb),
    'admins', coalesce((select jsonb_agg(jsonb_build_object('id', a.user_id, 'role', a.role, 'username', p.username,
        'last_seen', (select max(s.last_seen) from public.community_sessions s where s.user_id = a.user_id),
        'actions_week', (select count(*) from public.community_admin_audit x where x.admin_id = a.user_id and x.created_at > now() - interval '7 days')))
        from public.community_admins a left join public.community_profiles p on p.id = a.user_id), '[]'::jsonb),
    -- Every table should have row-level security switched on; this lists any that don't.
    'tables', coalesce((select jsonb_agg(jsonb_build_object('name', c.relname, 'rls', c.relrowsecurity,
        'policies', (select count(*) from pg_catalog.pg_policies pp where pp.schemaname = 'public' and pp.tablename = c.relname)) order by c.relrowsecurity, c.relname)
        from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r'), '[]'::jsonb),
    'blocked_words', (select count(*) from public.community_blocked_words),
    'minors', (select count(*) from public.community_private_details d where d.birth_date > (current_date - interval '14 years')::date),
    'sensitive_posts', (select count(*) from public.community_posts where sensitive)
  );
end $function$;

-- ---------- money ----------

create or replace function public.community_admin_money(p_days integer default 30)
 returns jsonb
 language plpgsql
 stable
 security definer
 set search_path to ''
as $function$
declare since timestamptz := date_trunc('day', now()) - make_interval(days => greatest(7, least(coalesce(p_days, 30), 365)) - 1);
begin
  if not private.community_is_admin() then raise exception 'Admins only'; end if;
  return jsonb_build_object(
    'donations', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'amount_pence', d.amount_pence, 'currency', d.currency, 'status', d.status,
        'anonymous', d.anonymous, 'message', d.message, 'created_at', d.created_at, 'fundraiser', f.title, 'fundraiser_id', f.id,
        'donor_id', d.donor_id, 'donor', (select u.username from public.community_profiles u where u.id = d.donor_id)) order by d.created_at desc)
        from (select * from public.community_donations order by created_at desc limit 200) d left join public.community_fundraisers f on f.id = d.fundraiser_id), '[]'::jsonb),
    'fundraisers', coalesce((select jsonb_agg(to_jsonb(f) order by f.created_at desc) from public.community_fundraiser_cards f), '[]'::jsonb),
    'promotions', coalesce((select jsonb_agg(to_jsonb(x) || jsonb_build_object('username', (select u.username from public.community_profiles u where u.id = x.user_id),
        'caption', (select left(p.caption, 80) from public.community_posts p where p.id = x.post_id)) order by x.created_at desc)
        from (select * from public.community_promotions order by created_at desc limit 200) x), '[]'::jsonb),
    'subscriptions', coalesce((select jsonb_agg(jsonb_build_object('user_id', b.user_id, 'username', (select u.username from public.community_profiles u where u.id = b.user_id),
        'status', b.status, 'current_period_end', b.current_period_end, 'cancel_at_period_end', b.cancel_at_period_end, 'payouts_enabled', b.payouts_enabled) order by b.updated_at desc)
        from public.community_billing b where b.status is not null or b.stripe_account_id is not null), '[]'::jsonb),
    'by_status', (select coalesce(jsonb_agg(jsonb_build_object('label', status, 'value', n)), '[]'::jsonb)
        from (select status, count(*) n from public.community_transactions where created_at >= since group by 1) x),
    'by_method', (select coalesce(jsonb_agg(jsonb_build_object('label', coalesce(nullif(method, ''), provider), 'value', n)), '[]'::jsonb)
        from (select method, provider, sum(amount_pence) n from public.community_transactions where status = 'succeeded' and created_at >= since group by 1, 2) x),
    'top_payers', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from (
        select t.user_id, (select u.username from public.community_profiles u where u.id = t.user_id) username, sum(t.amount_pence) total, count(*) payments
        from public.community_transactions t where t.status = 'succeeded' and t.kind <> 'refund' and t.user_id is not null group by 1 order by 3 desc limit 10) x),
    'failed', (select count(*) from public.community_transactions where status = 'failed' and created_at >= since),
    'refunded_pence', (select coalesce(sum(amount_pence), 0) from public.community_transactions where (status = 'refunded' or kind = 'refund') and created_at >= since)
  );
end $function$;

-- ---------- system health ----------

create or replace function public.community_admin_system()
 returns jsonb
 language plpgsql
 stable
 security definer
 set search_path to ''
as $function$
begin
  if not private.community_is_admin() then raise exception 'Admins only'; end if;
  return jsonb_build_object(
    'database_bytes', pg_catalog.pg_database_size(current_database()),
    'tables', coalesce((select jsonb_agg(jsonb_build_object('name', c.relname, 'rows', greatest(c.reltuples, 0)::bigint,
        'bytes', pg_catalog.pg_total_relation_size(c.oid)) order by pg_catalog.pg_total_relation_size(c.oid) desc)
        from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'community%'), '[]'::jsonb),
    'storage', coalesce((select jsonb_agg(jsonb_build_object('bucket', bucket_id, 'files', n, 'bytes', b)) from (
        select o.bucket_id, count(*) n, coalesce(sum((o.metadata->>'size')::bigint), 0) b from storage.objects o group by 1) x), '[]'::jsonb),
    'jobs', coalesce((select jsonb_agg(jsonb_build_object('name', j.jobname, 'schedule', j.schedule, 'active', j.active,
        'last_run', (select max(d.start_time) from cron.job_run_details d where d.jobid = j.jobid),
        'last_status', (select d.status from cron.job_run_details d where d.jobid = j.jobid order by d.start_time desc limit 1),
        'failures_day', (select count(*) from cron.job_run_details d where d.jobid = j.jobid and d.status = 'failed' and d.start_time > now() - interval '1 day')))
        from cron.job j where j.jobname like 'community%'), '[]'::jsonb),
    'purge_queue', (select count(*) from public.community_purge_queue where files_removed_at is null),
    'connections', (select count(*) from pg_catalog.pg_stat_activity),
    'now', now()
  );
end $function$;

revoke all on function public.community_touch_session(text, text, text, text, text) from public, anon;
revoke all on function public.community_admin_act(text, text, text, integer) from public, anon;
revoke all on function public.community_admin_people(text, text, text, integer, integer) from public, anon;
revoke all on function public.community_admin_user(text) from public, anon;
revoke all on function public.community_admin_search(text) from public, anon;
revoke all on function public.community_admin_analytics(integer) from public, anon;
revoke all on function public.community_admin_security() from public, anon;
revoke all on function public.community_admin_money(integer) from public, anon;
revoke all on function public.community_admin_system() from public, anon;
grant execute on function public.community_touch_session(text, text, text, text, text) to authenticated;
grant execute on function public.community_admin_act(text, text, text, integer) to authenticated;
grant execute on function public.community_admin_people(text, text, text, integer, integer) to authenticated;
grant execute on function public.community_admin_user(text) to authenticated;
grant execute on function public.community_admin_search(text) to authenticated;
grant execute on function public.community_admin_analytics(integer) to authenticated;
grant execute on function public.community_admin_security() to authenticated;
grant execute on function public.community_admin_money(integer) to authenticated;
grant execute on function public.community_admin_system() to authenticated;
revoke all on function public.community_profile_audit() from public, anon, authenticated;
