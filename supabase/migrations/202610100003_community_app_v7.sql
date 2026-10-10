-- Community app, version 7: Seen, typing and calls in chats.
--
--   1. The two people in a chat can see each other's read marker, and it is live, so "Seen"
--      appears under a message the moment the other person reads it. (Typing needs no table: it
--      goes over a Realtime broadcast channel.)
--   2. A message can carry a call: a room link both people join for a voice or video call.

create policy thread_reads_participants on public.community_thread_reads for select to authenticated
  using (exists (select 1 from public.community_threads t where t.id = thread_id
    and (t.user_a = (select auth.jwt()->>'sub') or t.user_b = (select auth.jwt()->>'sub'))));

alter publication supabase_realtime add table public.community_thread_reads;

alter table public.community_messages
  add column if not exists call_url text not null default '' check (length(call_url) <= 300),
  add column if not exists call_kind text not null default '' check (call_kind in ('', 'voice', 'video'));
