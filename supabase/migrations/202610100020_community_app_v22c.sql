-- Community app, version 22c: a live whose phone stopped (the app closed, the battery died, no signal)
-- no longer shows as live for hours.
--
-- The broadcaster's phone now says "still here" every 30 seconds while live (community_live_beat).
-- A live that has said so before but not for 3 minutes is treated as over: it leaves the story tray
-- and people watching see that it has ended. Lives from older versions of the app, which never say
-- so, keep the old rule (shown until ended, for at most 12 hours).

alter table public.community_lives add column if not exists seen_at timestamptz;

create or replace function public.community_live_beat(p_live uuid)
returns void language sql security definer set search_path = '' as $$
  update public.community_lives set seen_at = now()
  where id = p_live and user_id = (auth.jwt()->>'sub') and ended_at is null
$$;
revoke all on function public.community_live_beat(uuid) from public, anon;
grant execute on function public.community_live_beat(uuid) to authenticated;

create or replace view public.community_live_cards with (security_invoker = true) as
select l.id, l.user_id, l.title, l.started_at, l.ended_at, l.viewers, p.username, p.full_name, p.avatar_url, p.verified,
  (exists (select 1 from public.community_follows f where f.following_id = l.user_id and f.follower_id = (select auth.jwt()->>'sub'))) as following,
  l.audience, l.fundraiser_id
from public.community_lives l
join public.community_profiles p on p.id = l.user_id
where l.ended_at is null
  and l.started_at > now() - interval '12 hours'
  and (l.seen_at is null or l.seen_at > now() - interval '3 minutes')
  and p.id <> all ((select private.community_block_list())::text[]);
revoke all on public.community_live_cards from anon;
grant select on public.community_live_cards to authenticated;
