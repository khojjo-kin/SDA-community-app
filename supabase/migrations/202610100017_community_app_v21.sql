-- Community app, version 21: Sabbath School publishers, and highlights and notes in the Bible.
--
--   1. A member can ask to publish in Sabbath School; an admin approves or turns the request down.
--      Approved publishers (and admins) post studies, lesson helps, announcements and resources
--      that everyone reads in the Sabbath School section.
--   2. Each member's own Bible highlights (a colour) and notes on verses, private to them.

-- 1 -----------------------------------------------------------------------------------------------

create table if not exists public.community_publishers (
  user_id text primary key references public.community_profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'revoked')),
  note text not null default '' check (char_length(note) <= 1000),
  decided_by text references public.community_profiles(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.community_publishers enable row level security;
grant select, insert, update on public.community_publishers to authenticated;
create policy publishers_read on public.community_publishers for select to authenticated
  using (user_id = (select auth.jwt()->>'sub') or (select private.community_is_admin()) or status = 'approved');
create policy publishers_ask on public.community_publishers for insert to authenticated
  with check (user_id = (select auth.jwt()->>'sub') and status = 'pending' and decided_by is null and decided_at is null
    and not (select private.community_is_minor((select auth.jwt()->>'sub'))));
-- Asking again after a refusal sets it back to pending; only admins decide.
create policy publishers_update on public.community_publishers for update to authenticated
  using (user_id = (select auth.jwt()->>'sub') or (select private.community_is_admin()))
  with check (user_id = (select auth.jwt()->>'sub') or (select private.community_is_admin()));

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
  new.decided_by := old.decided_by;
  new.decided_at := case when new.status = 'pending' and old.status = 'rejected' then null else old.decided_at end;
  return new;
end $$;
revoke all on function public.community_publisher_guard() from public, anon, authenticated;
create or replace trigger community_publishers_guard before update on public.community_publishers
  for each row execute function public.community_publisher_guard();
create or replace trigger community_rate_publishers before insert on public.community_publishers
  for each row execute function public.community_rate_limited('publisher_requests', '3', '86400');

create or replace function private.community_is_publisher(uid text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.community_publishers p where p.user_id = uid and p.status = 'approved')
    or exists (select 1 from public.community_admins a where a.user_id = uid)
$$;
revoke all on function private.community_is_publisher(text) from public, anon;
grant execute on function private.community_is_publisher(text) to authenticated;

create table if not exists public.community_sabbath_posts (
  id uuid primary key default gen_random_uuid(),
  author_id text not null references public.community_profiles(id) on delete cascade,
  kind text not null default 'study' check (kind in ('study', 'lesson', 'announcement', 'resource')),
  title text not null check (char_length(btrim(title)) between 1 and 140),
  body text not null default '' check (char_length(body) <= 10000),
  lesson_ref text not null default '' check (char_length(lesson_ref) <= 80),
  media jsonb not null default '[]'::jsonb check (jsonb_typeof(media) = 'array' and jsonb_array_length(media) <= 6),
  link text not null default '' check (char_length(link) <= 500 and (link = '' or link ~* '^https://')),
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists community_sabbath_posts_idx on public.community_sabbath_posts (pinned desc, created_at desc);
alter table public.community_sabbath_posts enable row level security;
grant select, insert, update, delete on public.community_sabbath_posts to authenticated;
create policy sabbath_posts_read on public.community_sabbath_posts for select to authenticated
  using (author_id <> all ((select private.community_block_list())::text[]));
create policy sabbath_posts_write on public.community_sabbath_posts for insert to authenticated
  with check (author_id = (select auth.jwt()->>'sub') and (select private.community_is_publisher((select auth.jwt()->>'sub')))
    and not (select private.community_suspended()));
create policy sabbath_posts_edit on public.community_sabbath_posts for update to authenticated
  using ((author_id = (select auth.jwt()->>'sub') and (select private.community_is_publisher((select auth.jwt()->>'sub')))) or (select private.community_is_admin()))
  with check ((author_id = (select auth.jwt()->>'sub') and (select private.community_is_publisher((select auth.jwt()->>'sub')))) or (select private.community_is_admin()));
create policy sabbath_posts_remove on public.community_sabbath_posts for delete to authenticated
  using (author_id = (select auth.jwt()->>'sub') or (select private.community_is_admin()));

-- Only admins pin; text is cleaned of blocked words like everything else members write.
create or replace function public.community_sabbath_post_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.jwt() is not null and coalesce(auth.jwt()->>'role', '') <> 'service_role' and not private.community_is_admin() then
    new.pinned := case when tg_op = 'UPDATE' then old.pinned else false end;
  end if;
  if tg_op = 'UPDATE' then new.created_at := old.created_at; new.author_id := old.author_id; end if;
  new.updated_at := now();
  return new;
end $$;
revoke all on function public.community_sabbath_post_guard() from public, anon, authenticated;
create or replace trigger community_sabbath_posts_guard before insert or update on public.community_sabbath_posts
  for each row execute function public.community_sabbath_post_guard();
create or replace trigger community_rate_sabbath_posts before insert on public.community_sabbath_posts
  for each row execute function public.community_rate_limited('sabbath_posts', '20', '86400');

create or replace view public.community_sabbath_post_cards with (security_invoker = true) as
select s.*, p.username, p.full_name, p.avatar_url, p.verified,
  (s.author_id = (select auth.jwt()->>'sub')) as mine
from public.community_sabbath_posts s
join public.community_profiles p on p.id = s.author_id;
revoke all on public.community_sabbath_post_cards from anon;
grant select on public.community_sabbath_post_cards to authenticated;

-- 2 -----------------------------------------------------------------------------------------------

create table if not exists public.community_bible_marks (
  user_id text not null references public.community_profiles(id) on delete cascade,
  translation text not null default '' check (char_length(translation) <= 20),
  book text not null check (char_length(book) between 1 and 40),
  chapter smallint not null check (chapter between 1 and 150),
  verse smallint not null check (verse between 1 and 200),
  color text not null default '' check (color in ('', 'yellow', 'green', 'blue', 'pink', 'purple')),
  note text not null default '' check (char_length(note) <= 2000),
  updated_at timestamptz not null default now(),
  primary key (user_id, book, chapter, verse),
  check (color <> '' or char_length(btrim(note)) > 0)
);
create index if not exists community_bible_marks_recent_idx on public.community_bible_marks (user_id, updated_at desc);
alter table public.community_bible_marks enable row level security;
grant select, insert, update, delete on public.community_bible_marks to authenticated;
create policy bible_marks_own on public.community_bible_marks for all to authenticated
  using (user_id = (select auth.jwt()->>'sub'))
  with check (user_id = (select auth.jwt()->>'sub'));
create or replace trigger community_rate_bible_marks before insert on public.community_bible_marks
  for each row execute function public.community_rate_limited('bible_marks', '500', '3600');
