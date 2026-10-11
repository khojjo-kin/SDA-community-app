-- Community app, version 22b: three small tightenings found while reviewing version 22.
--
--   1. The "already being reviewed" check on tick and Plus requests ran before the access rules, so
--      sending a request in someone else's name told you whether they had one waiting. It now only
--      looks at your own requests; anyone else's is refused by the access rules as before.
--   2. Profile visits are only recorded through community_profile_viewed() now. Members can no longer
--      write visit rows directly (that let a visit be dated in the future, to stay at the top of
--      someone's list, and skipped the checks for blocks and your own profile).
--   3. A follow request can't be sent to someone you have blocked or who has blocked you, the same
--      rule plain follows already have.

-- 1 -----------------------------------------------------------------------------------------------

create or replace function public.community_plus_request_once()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- Someone else's request: the access rules refuse it; this check says nothing about theirs.
  if new.user_id is distinct from (auth.jwt()->>'sub') then
    return new;
  end if;
  if new.status = 'pending' and exists (
      select 1 from public.community_plus_requests r
      where r.user_id = new.user_id and r.kind = new.kind and r.status = 'pending') then
    raise exception 'Your request is already being reviewed.';
  end if;
  return new;
end $$;
revoke all on function public.community_plus_request_once() from public, anon, authenticated;

-- 2 -----------------------------------------------------------------------------------------------

revoke insert, update on public.community_profile_views from authenticated;

-- 3 -----------------------------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'community_follow_requests'
                 and policyname = 'follow_requests_not_blocked') then
    execute $p$create policy follow_requests_not_blocked on public.community_follow_requests
      as restrictive for insert to authenticated
      with check (target_id <> all ((select private.community_block_list())::text[]))$p$;
  end if;
end $$;
