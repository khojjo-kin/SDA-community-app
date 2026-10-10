-- Community app, version 12: ads that end.
--
--   1. An admin who stops an ad early marks it ended (not just the post's boost), so the counts agree.
--   2. Ads whose paid days have run out are marked ended every half hour.

create policy promotions_admin_end on public.community_promotions for update to authenticated
  using ((select private.community_is_admin())) with check ((select private.community_is_admin()));
grant update (status, ends_at) on public.community_promotions to authenticated;

select cron.schedule('community-end-ads', '*/30 * * * *',
  $$update public.community_promotions set status = 'ended' where status = 'active' and ends_at < now()$$);
