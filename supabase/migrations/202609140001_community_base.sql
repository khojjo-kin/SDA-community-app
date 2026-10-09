-- Community app, base schema: what the project's first seven migrations (202609140001 to 202609140007)
-- left behind, written out as one file so this repository can rebuild the database from nothing.
-- The later files (v2, v3, v4) build on it. People are identified by their Clerk user id, a text id
-- like `user_2abc...`, which arrives as the `sub` of the session token.

create table public.community_profiles (
  id text primary key,
  username text unique not null check (username ~ '^[a-z0-9_]{3,30}$'),
  full_name text not null check (char_length(full_name) between 1 and 80),
  avatar_url text not null default '',
  bio text not null default '' check (char_length(bio) <= 500),
  website text not null default '' check (char_length(website) <= 500),
  created_at timestamptz not null default now()
);

create table public.community_posts (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.community_profiles(id) on delete cascade,
  caption text not null default '' check (char_length(caption) <= 2200),
  location text not null default '' check (char_length(location) <= 200),
  media jsonb not null check (jsonb_typeof(media) = 'array' and jsonb_array_length(media) between 1 and 10),
  created_at timestamptz not null default now()
);

create table public.community_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts(id) on delete cascade,
  user_id text not null references public.community_profiles(id) on delete cascade,
  text text not null check (char_length(btrim(text)) between 1 and 2200),
  created_at timestamptz not null default now()
);

create table public.community_likes (
  user_id text not null references public.community_profiles(id) on delete cascade,
  post_id uuid not null references public.community_posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);

create table public.community_saves (
  user_id text not null references public.community_profiles(id) on delete cascade,
  post_id uuid not null references public.community_posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);

create table public.community_follows (
  follower_id text not null references public.community_profiles(id) on delete cascade,
  following_id text not null references public.community_profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id),
  check (follower_id <> following_id)
);

create table public.community_comment_likes (
  user_id text not null references public.community_profiles(id) on delete cascade,
  comment_id uuid not null references public.community_comments(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, comment_id)
);

create table public.community_threads (
  id uuid primary key default gen_random_uuid(),
  user_a text not null references public.community_profiles(id) on delete cascade,
  user_b text not null references public.community_profiles(id) on delete cascade,
  last_message text not null default '',
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  check (user_a < user_b),
  unique (user_a, user_b)
);

create table public.community_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.community_threads(id) on delete cascade,
  sender_id text not null references public.community_profiles(id) on delete cascade,
  text text not null,
  created_at timestamptz not null default now(),
  media_url text not null default '',
  audio_url text not null default '',
  audio_seconds integer not null default 0 check (audio_seconds between 0 and 600),
  constraint community_messages_text_check
    check (char_length(text) <= 5000 and (char_length(btrim(text)) > 0 or media_url <> '' or audio_url <> ''))
);

create table public.community_thread_reads (
  thread_id uuid not null references public.community_threads(id) on delete cascade,
  user_id text not null references public.community_profiles(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (thread_id, user_id)
);

-- Per-person inbox state: muting, and "delete for me" without removing the other person's copy.
create table public.community_thread_settings (
  thread_id uuid not null references public.community_threads(id) on delete cascade,
  user_id text not null references public.community_profiles(id) on delete cascade,
  archived boolean not null default false,
  muted boolean not null default false,
  hidden_before timestamptz,
  primary key (thread_id, user_id)
);

create table public.community_stories (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.community_profiles(id) on delete cascade,
  item jsonb not null check (jsonb_typeof(item) = 'object' and item ? 'url' and item ? 'type'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours'
);

create table public.community_story_views (
  story_id uuid not null references public.community_stories(id) on delete cascade,
  viewer_id text not null references public.community_profiles(id) on delete cascade,
  viewed_at timestamptz not null default now(),
  primary key (story_id, viewer_id)
);

create index community_posts_created_idx on public.community_posts (created_at desc, id desc);
create index community_posts_user_idx on public.community_posts (user_id);
create index community_comments_post_idx on public.community_comments (post_id, created_at);
create index community_likes_post_idx on public.community_likes (post_id);
create index community_likes_created_idx on public.community_likes (created_at desc);
create index community_saves_post_idx on public.community_saves (post_id);
create index community_follows_target_idx on public.community_follows (following_id);
create index community_follows_created_idx on public.community_follows (created_at desc);
create index community_comment_likes_comment_idx on public.community_comment_likes (comment_id);
create index community_threads_user_a_idx on public.community_threads (user_a, last_message_at desc);
create index community_threads_user_b_idx on public.community_threads (user_b, last_message_at desc);
create index community_messages_thread_idx on public.community_messages (thread_id, created_at);
create index community_stories_active_idx on public.community_stories (expires_at desc, user_id);

-- Row-level security on everything; nothing for people who are not signed in.
alter table public.community_profiles enable row level security;
alter table public.community_posts enable row level security;
alter table public.community_comments enable row level security;
alter table public.community_likes enable row level security;
alter table public.community_saves enable row level security;
alter table public.community_follows enable row level security;
alter table public.community_comment_likes enable row level security;
alter table public.community_threads enable row level security;
alter table public.community_messages enable row level security;
alter table public.community_thread_reads enable row level security;
alter table public.community_thread_settings enable row level security;
alter table public.community_stories enable row level security;
alter table public.community_story_views enable row level security;

revoke all on public.community_profiles, public.community_posts, public.community_comments, public.community_likes,
  public.community_saves, public.community_follows, public.community_comment_likes, public.community_threads,
  public.community_messages, public.community_thread_reads, public.community_thread_settings,
  public.community_stories, public.community_story_views from anon;

grant select, insert, update on public.community_profiles to authenticated;
grant select, insert, delete on public.community_posts, public.community_comments, public.community_likes,
  public.community_saves, public.community_follows, public.community_comment_likes to authenticated;
grant select, insert, update on public.community_threads, public.community_thread_reads, public.community_thread_settings to authenticated;
grant select, insert on public.community_messages, public.community_story_views to authenticated;
grant select, insert, delete on public.community_stories to authenticated;

create function public.community_is_participant(thread uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.community_threads
    where id = thread and (auth.jwt()->>'sub') in (user_a, user_b)
  )
$$;
revoke all on function public.community_is_participant(uuid) from public, anon;
grant execute on function public.community_is_participant(uuid) to authenticated;

create policy profiles_read on public.community_profiles for select to authenticated using (true);
create policy profiles_create on public.community_profiles for insert to authenticated with check ((select auth.jwt()->>'sub') = id);
create policy profiles_update on public.community_profiles for update to authenticated using ((select auth.jwt()->>'sub') = id) with check ((select auth.jwt()->>'sub') = id);

create policy posts_read on public.community_posts for select to authenticated using (true);
create policy posts_create on public.community_posts for insert to authenticated with check ((select auth.jwt()->>'sub') = user_id);
create policy posts_delete on public.community_posts for delete to authenticated using ((select auth.jwt()->>'sub') = user_id);

create policy comments_read on public.community_comments for select to authenticated using (true);
create policy comments_create on public.community_comments for insert to authenticated with check ((select auth.jwt()->>'sub') = user_id);
create policy comments_delete on public.community_comments for delete to authenticated using (
  (select auth.jwt()->>'sub') = user_id or exists (
    select 1 from public.community_posts where id = post_id and user_id = (select auth.jwt()->>'sub')
  )
);

create policy likes_read on public.community_likes for select to authenticated using (true);
create policy likes_create on public.community_likes for insert to authenticated with check ((select auth.jwt()->>'sub') = user_id);
create policy likes_delete on public.community_likes for delete to authenticated using ((select auth.jwt()->>'sub') = user_id);

create policy saves_read on public.community_saves for select to authenticated using ((select auth.jwt()->>'sub') = user_id);
create policy saves_create on public.community_saves for insert to authenticated with check ((select auth.jwt()->>'sub') = user_id);
create policy saves_delete on public.community_saves for delete to authenticated using ((select auth.jwt()->>'sub') = user_id);

create policy follows_read on public.community_follows for select to authenticated using (true);
create policy follows_create on public.community_follows for insert to authenticated with check ((select auth.jwt()->>'sub') = follower_id);
create policy follows_delete on public.community_follows for delete to authenticated using ((select auth.jwt()->>'sub') = follower_id);

create policy comment_likes_read on public.community_comment_likes for select to authenticated using (true);
create policy comment_likes_create on public.community_comment_likes for insert to authenticated with check ((auth.jwt()->>'sub') = user_id);
create policy comment_likes_delete on public.community_comment_likes for delete to authenticated using ((auth.jwt()->>'sub') = user_id);

create policy threads_read on public.community_threads for select to authenticated
  using ((auth.jwt()->>'sub') in (user_a, user_b));
create policy threads_create on public.community_threads for insert to authenticated
  with check ((auth.jwt()->>'sub') in (user_a, user_b));
create policy threads_update on public.community_threads for update to authenticated
  using ((auth.jwt()->>'sub') in (user_a, user_b)) with check ((auth.jwt()->>'sub') in (user_a, user_b));

create policy messages_read on public.community_messages for select to authenticated
  using (public.community_is_participant(thread_id));
create policy messages_create on public.community_messages for insert to authenticated
  with check ((auth.jwt()->>'sub') = sender_id and public.community_is_participant(thread_id));

create policy thread_reads_own on public.community_thread_reads for select to authenticated
  using ((auth.jwt()->>'sub') = user_id);
create policy thread_reads_create on public.community_thread_reads for insert to authenticated
  with check ((auth.jwt()->>'sub') = user_id and public.community_is_participant(thread_id));
create policy thread_reads_update on public.community_thread_reads for update to authenticated
  using ((auth.jwt()->>'sub') = user_id) with check ((auth.jwt()->>'sub') = user_id);

create policy thread_settings_own on public.community_thread_settings for select to authenticated
  using ((auth.jwt()->>'sub') = user_id);
create policy thread_settings_create on public.community_thread_settings for insert to authenticated
  with check ((auth.jwt()->>'sub') = user_id and public.community_is_participant(thread_id));
create policy thread_settings_update on public.community_thread_settings for update to authenticated
  using ((auth.jwt()->>'sub') = user_id) with check ((auth.jwt()->>'sub') = user_id);

create policy stories_read on public.community_stories for select to authenticated
  using (expires_at > now() or (auth.jwt()->>'sub') = user_id);
create policy stories_create on public.community_stories for insert to authenticated
  with check ((auth.jwt()->>'sub') = user_id and expires_at <= now() + interval '24 hours');
create policy stories_delete on public.community_stories for delete to authenticated
  using ((auth.jwt()->>'sub') = user_id);

create policy story_views_read on public.community_story_views for select to authenticated
  using ((auth.jwt()->>'sub') = viewer_id or exists (
    select 1 from public.community_stories where id = story_id and user_id = (auth.jwt()->>'sub')));
create policy story_views_create on public.community_story_views for insert to authenticated
  with check ((auth.jwt()->>'sub') = viewer_id);

-- Keeps the inbox preview in step with the newest message.
create function public.community_touch_thread() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.community_threads
    set last_message = case
          when new.audio_url <> '' then 'Sent a voice message'
          when new.media_url <> '' and btrim(new.text) = '' then 'Sent a photo'
          else left(new.text, 200) end,
        last_message_at = new.created_at
    where id = new.thread_id;
  return new;
end $$;
create trigger community_messages_touch after insert on public.community_messages
  for each row execute function public.community_touch_thread();

-- Photos, videos and voice messages. The bucket is public to read by address; people can only
-- upload, list and delete inside the folder named after their own id.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('community-media', 'community-media', true, 52428800,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/quicktime', 'video/webm',
        'audio/mp4', 'audio/aac', 'audio/mpeg', 'audio/webm', 'audio/ogg', 'audio/wav', 'audio/x-m4a'])
on conflict (id) do nothing;

create policy community_media_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'community-media' and (storage.foldername(name))[1] = (select auth.jwt()->>'sub'));
create policy community_media_delete on storage.objects for delete to authenticated
  using (bucket_id = 'community-media' and (storage.foldername(name))[1] = (select auth.jwt()->>'sub'));
create policy community_media_owner_read on storage.objects for select to authenticated
  using (bucket_id = 'community-media' and (storage.foldername(name))[1] = (select auth.jwt()->>'sub'));
