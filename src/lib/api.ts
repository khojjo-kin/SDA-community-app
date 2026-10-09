import { File } from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { MEDIA_BUCKET, supabase } from './supabase';
import { announce, dropPost, patchAuthor, patchPost, putPosts } from './store';
import type { ArchivedStory, Audience, Comment, Faq, Highlight, HighlightItem, Media, Message, Notice, Post, Profile, SavedReply, Stats, Story, StoryGroup, StoryItem, Thread } from './types';

function ok<T>(res: { data: T | null; error: any }): T {
  if (res.error) throw res.error;
  return res.data as T;
}

/**
 * Gives a request a deadline. A phone on a flaky connection can leave a request hanging with no
 * answer and no error, so anything the app waits on before it can show a screen goes through here:
 * the wait ends, the person sees what went wrong, and they can try again.
 */
export function withTimeout<T>(work: Promise<T>, ms = 15000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('The server did not answer. Check your internet connection and try again.')), ms);
    const done = (fn: (v: any) => void) => (v: any) => {
      clearTimeout(timer);
      fn(v);
    };
    work.then(done(resolve), done(reject));
  });
}

const PAGE = 12;

/* ---------- profiles ---------- */

// The whole app waits on this one before it can show anything, so it gets a deadline.
export async function getProfile(id: string): Promise<Profile | null> {
  return ok(await withTimeout(supabase.from('community_profile_cards').select('*').eq('id', id).maybeSingle()));
}

export async function createProfile(row: { id: string; username: string; full_name: string; avatar_url?: string }) {
  ok(await supabase.from('community_profiles').insert({ avatar_url: '', ...row }));
}

type ProfilePatch = Partial<Pick<Profile, 'username' | 'full_name' | 'bio' | 'website' | 'avatar_url' | 'account_type' | 'category' | 'show_view_counts' | 'story_replies' | 'faq_enabled'>>;

export async function updateProfile(id: string, patch: ProfilePatch) {
  ok(await supabase.from('community_profiles').update(patch).eq('id', id));
  if (patch.username || patch.avatar_url !== undefined || patch.full_name) {
    const p: any = {};
    if (patch.username) p.username = patch.username;
    if (patch.full_name) p.full_name = patch.full_name;
    if (patch.avatar_url !== undefined) p.avatar_url = patch.avatar_url;
    patchAuthor(id, p);
  }
  announce('profile');
}

async function profilesInOrder(ids: string[]): Promise<Profile[]> {
  if (!ids.length) return [];
  const people: Profile[] = ok(await supabase.from('community_profile_cards').select('*').in('id', ids)) ?? [];
  return ids.map((id) => people.find((p) => p.id === id)).filter(Boolean) as Profile[];
}

export async function searchProfiles(q: string): Promise<Profile[]> {
  const clean = q.trim().toLowerCase().replace(/[,()"\\%*:]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 30);
  let query = supabase.from('community_profile_cards').select('*').limit(30);
  if (clean) query = query.or(`username.ilike.%${clean}%,full_name.ilike.%${clean}%`);
  else query = query.order('followers_count', { ascending: false });
  return ok(await query) ?? [];
}

export async function listPeople(userId: string, which: 'followers' | 'following'): Promise<Profile[]> {
  const col = which === 'followers' ? 'follower_id' : 'following_id';
  const key = which === 'followers' ? 'following_id' : 'follower_id';
  const rows: any[] = ok(await supabase.from('community_follows').select(col).eq(key, userId).order('created_at', { ascending: false }).limit(200)) ?? [];
  return profilesInOrder(rows.map((r) => r[col]));
}

/** People who started following you since a date, newest first. */
export async function listNewFollowers(me: string, since: Date): Promise<Profile[]> {
  const rows: any[] = ok(await supabase.from('community_follows').select('follower_id').eq('following_id', me).gte('created_at', since.toISOString()).order('created_at', { ascending: false }).limit(100)) ?? [];
  return profilesInOrder(rows.map((r) => r.follower_id));
}

export async function setFollow(me: string, userId: string, next: boolean) {
  patchAuthor(userId, { following_author: next });
  try {
    if (next) ok(await supabase.from('community_follows').upsert({ follower_id: me, following_id: userId }, { onConflict: 'follower_id,following_id', ignoreDuplicates: true }));
    else ok(await supabase.from('community_follows').delete().eq('follower_id', me).eq('following_id', userId));
  } catch (e) {
    patchAuthor(userId, { following_author: !next });
    throw e;
  }
  announce('profile');
  announce('stories');
}

export async function setBlock(me: string, userId: string, next: boolean) {
  if (next) {
    // Follows in both directions and your close friends entry go first: once the block exists, those rows are hidden.
    await supabase.from('community_follows').delete().eq('follower_id', me).eq('following_id', userId);
    await supabase.from('community_follows').delete().eq('follower_id', userId).eq('following_id', me);
    await supabase.from('community_close_friends').delete().eq('user_id', me).eq('friend_id', userId);
    ok(await supabase.from('community_blocks').upsert({ blocker_id: me, blocked_id: userId }, { onConflict: 'blocker_id,blocked_id', ignoreDuplicates: true }));
    patchAuthor(userId, { following_author: false });
  } else {
    ok(await supabase.from('community_blocks').delete().eq('blocker_id', me).eq('blocked_id', userId));
  }
  announce('feed');
  announce('profile');
  announce('stories');
  announce('threads');
  announce('notices');
}

export async function report(me: string, target: { postId?: string; userId?: string }, reason: string) {
  ok(await supabase.from('community_reports').insert({ reporter_id: me, post_id: target.postId ?? null, target_user_id: target.userId ?? null, reason }));
}

/** Removes the profile row; every table that references it cascades. */
export async function deleteAccount(me: string) {
  // Uploaded photos, videos and voice messages live in a public bucket, so remove them first.
  for (let round = 0; round < 50; round++) {
    const { data, error } = await supabase.storage.from(MEDIA_BUCKET).list(me, { limit: 1000 });
    if (error) throw error;
    if (!data?.length) break;
    const res = await supabase.storage.from(MEDIA_BUCKET).remove(data.map((f) => `${me}/${f.name}`));
    if (res.error) throw res.error;
    if (!res.data?.length) throw new Error('Your photos and videos could not be removed. Try again.');
  }
  ok(await supabase.from('community_profiles').delete().eq('id', me));
}

/* ---------- close friends ---------- */

export async function listCloseFriends(me: string): Promise<Profile[]> {
  const rows: any[] = ok(await supabase.from('community_close_friends').select('friend_id').eq('user_id', me).order('created_at', { ascending: false }).limit(500)) ?? [];
  return profilesInOrder(rows.map((r) => r.friend_id));
}

export async function countCloseFriends(me: string): Promise<number> {
  const res = await supabase.from('community_close_friends').select('friend_id', { count: 'exact', head: true }).eq('user_id', me);
  if (res.error) throw res.error;
  return res.count ?? 0;
}

export async function setCloseFriend(me: string, userId: string, next: boolean) {
  if (next) ok(await supabase.from('community_close_friends').upsert({ user_id: me, friend_id: userId }, { onConflict: 'user_id,friend_id', ignoreDuplicates: true }));
  else ok(await supabase.from('community_close_friends').delete().eq('user_id', me).eq('friend_id', userId));
}

/* ---------- posts ---------- */

function keep(list: Post[] | null): Post[] {
  const out = list ?? [];
  putPosts(out);
  return out;
}

export async function fetchFeed(me: string, before?: string): Promise<Post[]> {
  let q = supabase.from('community_post_cards').select('*').or(`following_author.eq.true,user_id.eq.${me}`).order('created_at', { ascending: false }).limit(PAGE);
  if (before) q = q.lt('created_at', before);
  return keep(ok(await q));
}

export async function fetchExplore(before?: string, limit = 30): Promise<Post[]> {
  let q = supabase.from('community_post_cards').select('*').order('created_at', { ascending: false }).limit(limit);
  if (before) q = q.lt('created_at', before);
  return keep(ok(await q));
}

export async function fetchReels(onlyFollowing: boolean, before?: string): Promise<Post[]> {
  let q = supabase.from('community_post_cards').select('*').eq('kind', 'reel').order('created_at', { ascending: false }).limit(10);
  if (onlyFollowing) q = q.eq('following_author', true);
  if (before) q = q.lt('created_at', before);
  return keep(ok(await q));
}

export async function fetchUserPosts(userId: string): Promise<Post[]> {
  return keep(ok(await supabase.from('community_post_cards').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(90)));
}

export async function fetchPost(id: string): Promise<Post | null> {
  const p: Post | null = ok(await supabase.from('community_post_cards').select('*').eq('id', id).maybeSingle());
  if (p) putPosts([p]);
  return p;
}

/** The most liked posts from other people in the last few weeks. */
export async function fetchTopPosts(me: string, days = 30): Promise<Post[]> {
  const since = new Date(Date.now() - days * 86400e3).toISOString();
  return keep(ok(await supabase.from('community_post_cards').select('*').gte('created_at', since).neq('user_id', me).order('like_count', { ascending: false }).order('created_at', { ascending: false }).limit(30)));
}

async function fetchVia(table: 'community_saves' | 'community_likes' | 'community_reposts', userId: string): Promise<Post[]> {
  const rows: any[] = ok(await supabase.from(table).select('post_id').eq('user_id', userId).order('created_at', { ascending: false }).limit(90)) ?? [];
  const ids: string[] = rows.map((r) => r.post_id);
  if (!ids.length) return [];
  const posts = keep(ok(await supabase.from('community_post_cards').select('*').in('id', ids)));
  return ids.map((id) => posts.find((p) => p.id === id)).filter(Boolean) as Post[];
}
export const fetchSaved = (me: string) => fetchVia('community_saves', me);
export const fetchLiked = (me: string) => fetchVia('community_likes', me);
export const fetchReposts = (userId: string) => fetchVia('community_reposts', userId);

export async function createPost(me: string, input: { caption: string; media: Media[] }): Promise<void> {
  const kind = input.media[0]?.type === 'video' ? 'reel' : 'post';
  ok(await supabase.from('community_posts').insert({ user_id: me, caption: input.caption.trim().slice(0, 2200), media: input.media, kind }));
  announce('feed');
  announce('profile');
}

export async function deletePost(id: string) {
  ok(await supabase.from('community_posts').delete().eq('id', id));
  dropPost(id);
  announce('feed');
  announce('profile');
}

type Flag = 'liked' | 'saved' | 'reposted';
const FLAG: Record<Flag, { table: string; count?: 'like_count' | 'repost_count' }> = {
  liked: { table: 'community_likes', count: 'like_count' },
  saved: { table: 'community_saves' },
  reposted: { table: 'community_reposts', count: 'repost_count' },
};

export async function setFlag(me: string, post: Post, flag: Flag, next: boolean) {
  if (post[flag] === next) return;
  const { table, count } = FLAG[flag];
  const patch: Partial<Post> = { [flag]: next } as Partial<Post>;
  if (count) (patch as any)[count] = Math.max(0, post[count] + (next ? 1 : -1));
  patchPost(post.id, patch);
  try {
    if (next) ok(await supabase.from(table).upsert({ user_id: me, post_id: post.id }, { onConflict: 'user_id,post_id', ignoreDuplicates: true }));
    else ok(await supabase.from(table).delete().eq('user_id', me).eq('post_id', post.id));
  } catch (e) {
    const back: Partial<Post> = { [flag]: post[flag] } as Partial<Post>;
    if (count) (back as any)[count] = post[count];
    patchPost(post.id, back);
    throw e;
  }
  if (flag === 'reposted') announce('profile');
}

const viewed = new Set<string>();

/** Notes that you have seen someone's post. There is one row per person per post, so seeing it again costs nothing. */
export function recordView(me: string, post: Pick<Post, 'id' | 'user_id'>) {
  const key = `${me}:${post.id}`;
  if (!me || post.user_id === me || viewed.has(key)) return;
  viewed.add(key);
  supabase
    .from('community_post_views')
    .upsert({ post_id: post.id, viewer_id: me }, { onConflict: 'post_id,viewer_id', ignoreDuplicates: true })
    .then(
      (res) => {
        if (res.error) viewed.delete(key);
      },
      () => {
        viewed.delete(key);
      },
    );
}

/* ---------- comments ---------- */

export async function fetchComments(postId: string): Promise<Comment[]> {
  return ok(await supabase.from('community_comment_cards').select('*').eq('post_id', postId).order('created_at', { ascending: true }).limit(300)) ?? [];
}

/** Comments you have written, newest first. Their posts are loaded too, for the thumbnails. */
export async function fetchMyComments(me: string): Promise<Comment[]> {
  const rows: Comment[] = ok(await supabase.from('community_comment_cards').select('*').eq('user_id', me).order('created_at', { ascending: false }).limit(100)) ?? [];
  const ids = [...new Set(rows.map((c) => c.post_id))];
  if (ids.length) keep(ok(await supabase.from('community_post_cards').select('*').in('id', ids)));
  return rows;
}

export async function addComment(me: string, post: Post, text: string) {
  ok(await supabase.from('community_comments').insert({ post_id: post.id, user_id: me, text: text.trim().slice(0, 2200) }));
  patchPost(post.id, { comment_count: post.comment_count + 1 });
}

export async function deleteComment(post: Post, commentId: string) {
  ok(await supabase.from('community_comments').delete().eq('id', commentId));
  patchPost(post.id, { comment_count: Math.max(0, post.comment_count - 1) });
}

export async function setCommentLike(me: string, commentId: string, next: boolean) {
  if (next) ok(await supabase.from('community_comment_likes').upsert({ user_id: me, comment_id: commentId }, { onConflict: 'user_id,comment_id', ignoreDuplicates: true }));
  else ok(await supabase.from('community_comment_likes').delete().eq('user_id', me).eq('comment_id', commentId));
}

/* ---------- stories ---------- */

function group(stories: Story[], me: string): StoryGroup[] {
  const map = new Map<string, StoryGroup>();
  for (const s of stories) {
    let g = map.get(s.user_id);
    if (!g) {
      g = { user_id: s.user_id, username: s.username, avatar_url: s.avatar_url, seen: true, close: false, stories: [] };
      map.set(s.user_id, g);
    }
    g.stories.push(s);
    if (!s.seen && s.user_id !== me) g.seen = false;
    if (s.audience === 'close_friends') g.close = true;
  }
  const all = [...map.values()];
  const mine = all.filter((g) => g.user_id === me);
  const rest = all.filter((g) => g.user_id !== me).sort((a, b) => Number(a.seen) - Number(b.seen));
  return [...mine, ...rest];
}

export async function fetchStoryTray(me: string): Promise<StoryGroup[]> {
  const rows: Story[] = ok(await supabase.from('community_story_cards').select('*').eq('in_tray', true).order('created_at', { ascending: true }).limit(300)) ?? [];
  return group(rows, me);
}

export async function fetchUserStories(userId: string, me: string): Promise<StoryGroup[]> {
  const rows: Story[] = ok(await supabase.from('community_story_cards').select('*').eq('user_id', userId).order('created_at', { ascending: true })) ?? [];
  return group(rows, me);
}

export async function addStory(me: string, item: StoryItem, audience: Audience = 'everyone') {
  ok(await supabase.from('community_stories').insert({ user_id: me, item, audience }));
  announce('stories');
  announce('profile');
}

export async function deleteStory(id: string) {
  ok(await supabase.from('community_stories').delete().eq('id', id));
  announce('stories');
  announce('profile');
}

export async function markStorySeen(me: string, storyId: string) {
  await supabase.from('community_story_views').upsert({ story_id: storyId, viewer_id: me }, { onConflict: 'story_id,viewer_id', ignoreDuplicates: true });
}

/** Everyone who has seen one of your stories, most recent first. */
export async function fetchStoryViewers(storyId: string): Promise<Profile[]> {
  const rows: any[] = ok(await supabase.from('community_story_views').select('viewer_id').eq('story_id', storyId).order('viewed_at', { ascending: false }).limit(300)) ?? [];
  return profilesInOrder(rows.map((r) => r.viewer_id));
}

/** Every story you have shared, including the ones that have expired. Only you can read these. */
export async function fetchArchive(me: string): Promise<ArchivedStory[]> {
  return ok(await supabase.from('community_stories').select('id,user_id,item,created_at,expires_at,audience').eq('user_id', me).order('created_at', { ascending: false }).limit(300)) ?? [];
}

/** The picture that stands for a story in grids and highlight covers. */
export function coverOf(item: StoryItem): string {
  if (item.type === 'video') return item.poster ?? '';
  if (item.type === 'collage') return item.urls?.[0] ?? '';
  return item.url;
}

/* ---------- highlights ---------- */

export async function fetchHighlights(userId: string): Promise<Highlight[]> {
  return ok(await supabase.from('community_highlights').select('*').eq('user_id', userId).order('created_at', { ascending: true }).limit(60)) ?? [];
}

export async function fetchHighlight(id: string): Promise<{ highlight: Highlight; items: HighlightItem[] } | null> {
  const highlight: Highlight | null = ok(await supabase.from('community_highlights').select('*').eq('id', id).maybeSingle());
  if (!highlight) return null;
  const items: HighlightItem[] = ok(await supabase.from('community_highlight_items').select('*').eq('highlight_id', id).order('created_at', { ascending: true }).limit(100)) ?? [];
  return { highlight, items };
}

export async function createHighlight(me: string, title: string, items: StoryItem[]): Promise<string> {
  const row: Highlight = ok(await supabase.from('community_highlights').insert({ user_id: me, title: title.trim().slice(0, 30), cover_url: items.map(coverOf).find(Boolean) ?? '' }).select().single());
  // One at a time, so they keep the order they were chosen in.
  for (const item of items) ok(await supabase.from('community_highlight_items').insert({ highlight_id: row.id, user_id: me, item }));
  announce('profile');
  return row.id;
}

export async function addToHighlight(me: string, highlightId: string, item: StoryItem) {
  ok(await supabase.from('community_highlight_items').insert({ highlight_id: highlightId, user_id: me, item }));
  const cover = coverOf(item);
  if (cover) await supabase.from('community_highlights').update({ cover_url: cover }).eq('id', highlightId).eq('cover_url', '');
  announce('profile');
}

export async function removeHighlightItem(id: string) {
  ok(await supabase.from('community_highlight_items').delete().eq('id', id));
  announce('profile');
}

export async function setHighlightCover(id: string, coverUrl: string) {
  ok(await supabase.from('community_highlights').update({ cover_url: coverUrl }).eq('id', id));
  announce('profile');
}

export async function renameHighlight(id: string, title: string) {
  ok(await supabase.from('community_highlights').update({ title: title.trim().slice(0, 30) }).eq('id', id));
  announce('profile');
}

export async function deleteHighlight(id: string) {
  ok(await supabase.from('community_highlights').delete().eq('id', id));
  announce('profile');
}

/* ---------- messages ---------- */

export async function fetchThreads(): Promise<Thread[]> {
  return ok(await supabase.from('community_thread_cards').select('*').order('last_message_at', { ascending: false }).limit(100)) ?? [];
}

export async function fetchThread(id: string): Promise<Thread | null> {
  return ok(await supabase.from('community_thread_cards').select('*').eq('id', id).maybeSingle());
}

export async function openThread(otherId: string): Promise<string> {
  return ok(await supabase.rpc('community_open_thread', { other: otherId }));
}

/** Messages in a chat, oldest first. Anything from before you deleted the chat is left out. */
export async function fetchMessages(threadId: string, hiddenBefore?: string | null): Promise<Message[]> {
  let q = supabase.from('community_messages').select('*').eq('thread_id', threadId).order('created_at', { ascending: false }).limit(200);
  if (hiddenBefore) q = q.gt('created_at', hiddenBefore);
  const rows: Message[] = ok(await q) ?? [];
  const postIds = [...new Set(rows.map((m) => m.post_id).filter(Boolean))] as string[];
  if (postIds.length) keep(ok(await supabase.from('community_post_cards').select('*').in('id', postIds)));
  return rows.reverse();
}

export async function sendMessage(me: string, threadId: string, msg: { text?: string; media_url?: string; post_id?: string; audio_url?: string; audio_seconds?: number }) {
  const text = (msg.text ?? '').trim().slice(0, 5000) || (msg.post_id ? 'Sent a post' : '');
  ok(
    await supabase.from('community_messages').insert({
      thread_id: threadId,
      sender_id: me,
      text,
      media_url: msg.media_url ?? '',
      post_id: msg.post_id ?? null,
      audio_url: msg.audio_url ?? '',
      audio_seconds: Math.min(600, Math.max(0, Math.round(msg.audio_seconds ?? 0))),
    }),
  );
  announce('threads');
}

export async function markThreadRead(me: string, threadId: string) {
  await supabase.rpc('community_mark_read', { thread: threadId });
  announce('threads');
}

/** Muted chats stop showing the unread dot on the Messages tab. */
export async function setThreadMuted(me: string, threadId: string, muted: boolean) {
  ok(await supabase.from('community_thread_settings').upsert({ thread_id: threadId, user_id: me, muted }, { onConflict: 'thread_id,user_id' }));
  announce('threads');
}

/** Clears the chat for you only. The other person keeps their copy, and a new message brings the chat back. */
export async function hideThread(threadId: string) {
  ok(await supabase.rpc('community_hide_thread', { thread: threadId }));
  announce('threads');
}

export async function sharePost(me: string, postId: string, userIds: string[], note: string) {
  for (const uid of userIds) {
    const tid = await openThread(uid);
    await sendMessage(me, tid, { post_id: postId });
    if (note.trim()) await sendMessage(me, tid, { text: note });
  }
}

/** Sends photos and an optional note to several people, one chat each. */
export async function sendToPeople(me: string, userIds: string[], content: { media?: string[]; text?: string }) {
  for (const uid of userIds) {
    const tid = await openThread(uid);
    for (const url of content.media ?? []) await sendMessage(me, tid, { media_url: url });
    if (content.text?.trim()) await sendMessage(me, tid, { text: content.text });
  }
}

/* ---------- saved replies and frequently asked questions ---------- */

export async function fetchSavedReplies(me: string): Promise<SavedReply[]> {
  return ok(await supabase.from('community_saved_replies').select('*').eq('user_id', me).order('created_at', { ascending: true }).limit(50)) ?? [];
}

export async function saveReply(me: string, reply: { id?: string; shortcut: string; body: string }) {
  const row = { shortcut: reply.shortcut.trim().slice(0, 30), body: reply.body.trim().slice(0, 1000) };
  if (reply.id) ok(await supabase.from('community_saved_replies').update(row).eq('id', reply.id));
  else ok(await supabase.from('community_saved_replies').insert({ user_id: me, ...row }));
}

export async function deleteSavedReply(id: string) {
  ok(await supabase.from('community_saved_replies').delete().eq('id', id));
}

export async function fetchFaqs(userId: string): Promise<Faq[]> {
  return ok(await supabase.from('community_faqs').select('*').eq('user_id', userId).order('position', { ascending: true }).order('created_at', { ascending: true }).limit(8)) ?? [];
}

export async function saveFaq(me: string, faq: { id?: string; question: string; answer: string; position?: number }) {
  const row = { question: faq.question.trim().slice(0, 120), answer: faq.answer.trim().slice(0, 1000) };
  if (faq.id) ok(await supabase.from('community_faqs').update(row).eq('id', faq.id));
  else ok(await supabase.from('community_faqs').insert({ user_id: me, position: faq.position ?? 0, ...row }));
}

export async function deleteFaq(id: string) {
  ok(await supabase.from('community_faqs').delete().eq('id', id));
}

/** Sends a creator's question as your message; their saved answer arrives as the reply. Returns the chat. */
export async function askFaq(faqId: string): Promise<string> {
  const tid: string = ok(await supabase.rpc('community_ask_faq', { faq: faqId }));
  announce('threads');
  return tid;
}

/* ---------- dashboard ---------- */

export async function fetchStats(from: Date, to: Date): Promise<Stats> {
  return ok(await supabase.rpc('community_stats', { from_ts: from.toISOString(), to_ts: to.toISOString() }));
}

/* ---------- notifications ---------- */

export async function fetchNotices(): Promise<Notice[]> {
  return ok(await supabase.from('community_notification_cards').select('*').order('created_at', { ascending: false }).limit(80)) ?? [];
}

export async function countUnreadNotices(): Promise<number> {
  const res = await supabase.from('community_notification_cards').select('id', { count: 'exact', head: true }).is('read_at', null);
  if (res.error) throw res.error;
  return res.count ?? 0;
}

export async function markNoticesRead(me: string) {
  await supabase.from('community_notifications').update({ read_at: new Date().toISOString() }).eq('user_id', me).is('read_at', null);
  announce('notices');
}

/* ---------- uploads ---------- */

async function readBytes(uri: string): Promise<ArrayBuffer> {
  let first: unknown = null;
  try {
    const bytes = await new File(uri).bytes();
    if (bytes.byteLength > 0) return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  } catch (e) {
    first = e;
  }
  try {
    const res = await fetch(uri);
    const buf = await res.arrayBuffer();
    if (buf.byteLength > 0) return buf;
  } catch {
    // the first error says more than "Network request failed"
  }
  throw first instanceof Error ? new Error('That file could not be read from this phone. Choose it again.') : new Error('That file is empty or could not be read. Choose it again.');
}

/** The size of a file on the phone in bytes, or 0 when it cannot be read. */
export function fileSize(uri: string): number {
  try {
    return new File(uri).size ?? 0;
  } catch {
    return 0;
  }
}

async function put(me: string, uri: string, ext: string, contentType: string): Promise<string> {
  const path = `${me}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const body = await readBytes(uri);
  ok(await supabase.storage.from(MEDIA_BUCKET).upload(path, body, { contentType, upsert: false }));
  return supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path).data.publicUrl;
}

export async function uploadImage(me: string, uri: string, width?: number, maxWidth = 1440): Promise<Media> {
  const actions = width && width > maxWidth ? [{ resize: { width: maxWidth } }] : [];
  const out = await ImageManipulator.manipulateAsync(uri, actions, { compress: 0.82, format: ImageManipulator.SaveFormat.JPEG });
  const url = await put(me, out.uri, 'jpg', 'image/jpeg');
  return { url, type: 'image', w: out.width, h: out.height };
}

export async function uploadVideo(me: string, uri: string, w?: number, h?: number): Promise<Media> {
  let poster: string | undefined;
  try {
    const thumb = await VideoThumbnails.getThumbnailAsync(uri, { time: 300, quality: 0.7 });
    poster = await put(me, thumb.uri, 'jpg', 'image/jpeg');
  } catch {
    poster = undefined;
  }
  const lower = uri.toLowerCase();
  const isMov = lower.endsWith('.mov');
  const url = await put(me, uri, isMov ? 'mov' : 'mp4', isMov ? 'video/quicktime' : 'video/mp4');
  return { url, type: 'video', w, h, poster };
}

/** Uploads a recorded voice message and returns its address. */
export async function uploadAudio(me: string, uri: string): Promise<string> {
  return put(me, uri, 'm4a', 'audio/mp4');
}

/* ---------- people pickers ---------- */

export async function listBlocked(me: string): Promise<Profile[]> {
  const rows: any[] = ok(await supabase.from('community_blocks').select('blocked_id').eq('blocker_id', me).order('created_at', { ascending: false })) ?? [];
  return profilesInOrder(rows.map((r) => r.blocked_id));
}

/** People you are likely to message: recent chats first, then people you follow. */
export async function peopleToMessage(me: string): Promise<Profile[]> {
  const [threads, following] = await Promise.all([fetchThreads(), listPeople(me, 'following')]);
  const recentIds = threads.map((t) => t.other_id);
  const missing = recentIds.filter((id) => !following.some((p) => p.id === id));
  const extra: Profile[] = missing.length ? ok(await supabase.from('community_profile_cards').select('*').in('id', missing)) ?? [] : [];
  const all = [...extra, ...following];
  const ordered = [...recentIds.map((id) => all.find((p) => p.id === id)).filter(Boolean), ...following.filter((p) => !recentIds.includes(p.id))] as Profile[];
  return ordered.filter((p) => !p.is_blocked);
}
