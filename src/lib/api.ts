import { File } from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { MEDIA_BUCKET, supabase } from './supabase';
import { announce, dropPost, patchAuthor, patchPost, putPosts } from './store';
import type { Comment, Media, Message, Notice, Post, Profile, Story, StoryGroup, Thread } from './types';

function ok<T>(res: { data: T | null; error: any }): T {
  if (res.error) throw res.error;
  return res.data as T;
}

const PAGE = 12;

/* ---------- profiles ---------- */

export async function getProfile(id: string): Promise<Profile | null> {
  return ok(await supabase.from('community_profile_cards').select('*').eq('id', id).maybeSingle());
}

export async function createProfile(row: { id: string; username: string; full_name: string; avatar_url?: string }) {
  ok(await supabase.from('community_profiles').insert({ avatar_url: '', ...row }));
}

export async function updateProfile(id: string, patch: Partial<Pick<Profile, 'username' | 'full_name' | 'bio' | 'website' | 'avatar_url'>>) {
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
  const ids = rows.map((r) => r[col]);
  if (!ids.length) return [];
  const people: Profile[] = ok(await supabase.from('community_profile_cards').select('*').in('id', ids)) ?? [];
  return ids.map((id) => people.find((p) => p.id === id)).filter(Boolean) as Profile[];
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
    ok(await supabase.from('community_blocks').upsert({ blocker_id: me, blocked_id: userId }, { onConflict: 'blocker_id,blocked_id', ignoreDuplicates: true }));
    await supabase.from('community_follows').delete().eq('follower_id', me).eq('following_id', userId);
  } else {
    ok(await supabase.from('community_blocks').delete().eq('blocker_id', me).eq('blocked_id', userId));
  }
  announce('feed');
  announce('profile');
}

export async function report(me: string, target: { postId?: string; userId?: string }, reason: string) {
  ok(await supabase.from('community_reports').insert({ reporter_id: me, post_id: target.postId ?? null, target_user_id: target.userId ?? null, reason }));
}

/** Removes the profile row; every table that references it cascades. */
export async function deleteAccount(me: string) {
  // Uploaded photos and videos live in a public bucket, so remove them first.
  for (let round = 0; round < 50; round++) {
    const { data, error } = await supabase.storage.from(MEDIA_BUCKET).list(me, { limit: 1000 });
    if (error || !data?.length) break;
    const res = await supabase.storage.from(MEDIA_BUCKET).remove(data.map((f) => `${me}/${f.name}`));
    if (res.error) break;
  }
  ok(await supabase.from('community_profiles').delete().eq('id', me));
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

/* ---------- comments ---------- */

export async function fetchComments(postId: string): Promise<Comment[]> {
  return ok(await supabase.from('community_comment_cards').select('*').eq('post_id', postId).order('created_at', { ascending: true }).limit(300)) ?? [];
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
      g = { user_id: s.user_id, username: s.username, avatar_url: s.avatar_url, seen: true, stories: [] };
      map.set(s.user_id, g);
    }
    g.stories.push(s);
    if (!s.seen && s.user_id !== me) g.seen = false;
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

export async function addStory(me: string, item: Media) {
  ok(await supabase.from('community_stories').insert({ user_id: me, item }));
  announce('stories');
}

export async function deleteStory(id: string) {
  ok(await supabase.from('community_stories').delete().eq('id', id));
  announce('stories');
}

export async function markStorySeen(me: string, storyId: string) {
  await supabase.from('community_story_views').upsert({ story_id: storyId, viewer_id: me }, { onConflict: 'story_id,viewer_id', ignoreDuplicates: true });
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

export async function fetchMessages(threadId: string): Promise<Message[]> {
  const rows: Message[] = ok(await supabase.from('community_messages').select('*').eq('thread_id', threadId).order('created_at', { ascending: false }).limit(200)) ?? [];
  const postIds = [...new Set(rows.map((m) => m.post_id).filter(Boolean))] as string[];
  if (postIds.length) keep(ok(await supabase.from('community_post_cards').select('*').in('id', postIds)));
  return rows.reverse();
}

export async function sendMessage(me: string, threadId: string, msg: { text?: string; media_url?: string; post_id?: string }) {
  const text = (msg.text ?? '').trim().slice(0, 5000) || (msg.post_id ? 'Sent a post' : '');
  ok(await supabase.from('community_messages').insert({ thread_id: threadId, sender_id: me, text, media_url: msg.media_url ?? '', post_id: msg.post_id ?? null }));
  announce('threads');
}

export async function markThreadRead(me: string, threadId: string) {
  await supabase.rpc('community_mark_read', { thread: threadId });
  announce('threads');
}

export async function sharePost(me: string, postId: string, userIds: string[], note: string) {
  for (const uid of userIds) {
    const tid = await openThread(uid);
    await sendMessage(me, tid, { post_id: postId });
    if (note.trim()) await sendMessage(me, tid, { text: note });
  }
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
  try {
    const bytes = await new File(uri).bytes();
    if (bytes.byteLength > 0) return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  } catch {
    // fall through to fetch
  }
  const res = await fetch(uri);
  return await res.arrayBuffer();
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

/* ---------- people pickers ---------- */

export async function listBlocked(me: string): Promise<Profile[]> {
  const rows: any[] = ok(await supabase.from('community_blocks').select('blocked_id').eq('blocker_id', me).order('created_at', { ascending: false })) ?? [];
  const ids = rows.map((r) => r.blocked_id);
  if (!ids.length) return [];
  return ok(await supabase.from('community_profile_cards').select('*').in('id', ids)) ?? [];
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
