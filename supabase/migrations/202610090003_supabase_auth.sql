-- Sign-in moves from Clerk to Supabase Auth. Nothing else changes: the data rules keep
-- reading auth.jwt()->>'sub', which is now the Supabase user id instead of the Clerk id.
-- (Profiles made under Clerk keep their old text ids; new profiles get Supabase uuids.)

-- Lets a signed-in person remove their own sign-in from the app. The app deletes the
-- profile (and uploaded media) first; this removes the account itself.
create or replace function public.community_delete_me()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Not signed in';
  end if;
  delete from public.community_profiles where id = uid::text;
  delete from auth.users where id = uid;
end;
$$;

revoke all on function public.community_delete_me() from public;
grant execute on function public.community_delete_me() to authenticated;
