import * as Crypto from 'expo-crypto';
import { File } from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { MEDIA_BUCKET, supabase } from './supabase';
import { announce, dropPost, patchAuthor, patchPost, putPosts } from './store';
import type { ActivityRow, AdminStats, ArchivedStory, Audience, Call, Church, Comment, ErhaMessage, Faq, Group, GroupMember, Highlight, HighlightItem, Hymn, LiveCard, Media, MemberCard, Message, Notice, PlusRequest, PodItem, Post, Profile, ProfileViewer, ReportCard, SavedReply, Stats, Story, StoryGroup, StoryItem, SupportTicket, Thread, Transaction } from './types';

function ok<T>(res: { data: T | null; error: any }): T {
  if (res.error) throw res.error;
  return res.data as T;
}

/**
 * Gives a request a deadline. A phone on a flaky connection can leave a request hanging with no
 * answer and no error, so anything the app waits on before it can show a screen goes through here:
 * the wait ends, the person sees what went wrong, and they can try again.
 */
export function withTimeout<T>(work: PromiseLike<T>, ms = 15000): Promise<T> {
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

type ProfilePatch = Partial<Pick<Profile, 'username' | 'full_name' | 'bio' | 'website' | 'avatar_url' | 'account_type' | 'category' | 'show_view_counts' | 'story_replies' | 'faq_enabled' | 'pronouns' | 'gender' | 'contact_email' | 'contact_phone' | 'church_id' | 'is_private' | 'read_receipts'>>;

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

/* ---------- private accounts and follow requests ---------- */

/** Asks to follow a private account. The owner accepts or declines from their notifications. */
export async function requestFollow(me: string, userId: string) {
  ok(await supabase.from('community_follow_requests').upsert({ requester_id: me, target_id: userId }, { onConflict: 'requester_id,target_id', ignoreDuplicates: true }));
  announce('profile');
}

/** Withdraws your own request (me = requester), or declines one sent to you (me = target). */
export async function removeFollowRequest(requesterId: string, targetId: string) {
  ok(await supabase.from('community_follow_requests').delete().eq('requester_id', requesterId).eq('target_id', targetId));
  announce('profile');
  announce('notices');
}

export async function acceptFollowRequest(requesterId: string) {
  ok(await supabase.rpc('community_accept_follow_request', { p_requester: requesterId }));
  announce('profile');
  announce('notices');
}

/** People waiting to follow me, newest first. */
export async function fetchFollowRequests(me: string): Promise<Profile[]> {
  const rows: { requester_id: string; created_at: string }[] = ok(await supabase.from('community_follow_requests').select('requester_id, created_at').eq('target_id', me).order('created_at', { ascending: false }).limit(100)) ?? [];
  if (!rows.length) return [];
  const people: Profile[] = ok(await supabase.from('community_profile_cards').select('*').in('id', rows.map((r) => r.requester_id))) ?? [];
  const order = new Map(rows.map((r, i) => [r.requester_id, i]));
  return people.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
}

/** Notes that I looked at someone's profile. Plus members can see who looked at theirs. */
export function recordProfileView(me: string, profileId: string) {
  if (!me || me === profileId) return;
  supabase.from('community_profile_views').upsert({ viewer_id: me, profile_id: profileId, viewed_at: new Date().toISOString() }, { onConflict: 'viewer_id,profile_id' }).then(() => {}, () => {});
}

/** Who looked at my profile, newest first. Empty unless I have Plus (the database refuses otherwise). */
export async function fetchProfileViewers(me: string): Promise<ProfileViewer[]> {
  return ok(await supabase.from('community_profile_viewer_cards').select('*').eq('profile_id', me).order('viewed_at', { ascending: false }).limit(200)) ?? [];
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
/**
 * Deactivates the account: hidden from everyone at once and unable to post, with everything kept
 * for 30 days. Signing in again before then restores it; after that the nightly purge removes it.
 */
export async function deactivateAccount(me: string) {
  ok(await supabase.from('community_profiles').update({ deleted_at: new Date().toISOString() }).eq('id', me));
}

export async function restoreAccount(me: string) {
  ok(await supabase.from('community_profiles').update({ deleted_at: null }).eq('id', me));
  announce('profile');
}

/** When a deactivated account will be gone for good. */
export function purgeDate(deletedAt: string): Date {
  const d = new Date(deletedAt);
  d.setDate(d.getDate() + 30);
  return d;
}

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

export type FeedKind = 'foryou' | 'following' | 'subscribers';

/**
 * The home feed. Following: people I follow, my own posts, and posts in my communities and pages.
 * For you: everyone, newest first, with boosted posts on top of the first page. Subscribers: posts
 * from Community Plus members.
 */
export async function fetchFeed(me: string, before?: string, kind: FeedKind = 'following'): Promise<Post[]> {
  let q = supabase.from('community_post_cards').select('*');
  if (kind === 'following') q = q.or(`following_author.eq.true,user_id.eq.${me},in_my_group.eq.true`);
  else if (kind === 'subscribers') q = q.eq('author_plus', true);
  q = q.order('created_at', { ascending: false }).limit(PAGE);
  if (before) q = q.lt('created_at', before);
  const page = keep(ok(await q));
  if (kind !== 'foryou' || before) return page;
  // Boosted posts lead the first page of For you.
  const boosted = keep(ok(await supabase.from('community_post_cards').select('*').eq('boosted', true).order('boosted_until', { ascending: false }).limit(5)));
  const ids = new Set(boosted.map((p) => p.id));
  return [...boosted, ...page.filter((p) => !ids.has(p.id))];
}

export async function fetchExplore(before?: string, limit = 30): Promise<Post[]> {
  let q = supabase.from('community_post_cards').select('*').order('created_at', { ascending: false }).limit(limit);
  if (before) q = q.lt('created_at', before);
  const page = keep(ok(await q));
  if (before) return page;
  const boosted = keep(ok(await supabase.from('community_post_cards').select('*').eq('boosted', true).order('boosted_until', { ascending: false }).limit(6)));
  const ids = new Set(boosted.map((p) => p.id));
  return [...boosted, ...page.filter((p) => !ids.has(p.id))];
}

/** Plus: puts a post at the top of For you and Explore for `days` days (up to 7). */
export async function boostPost(id: string, days = 1) {
  const until = new Date(Date.now() + Math.min(7, Math.max(1, days)) * 86400e3).toISOString();
  ok(await supabase.from('community_posts').update({ boosted_until: until }).eq('id', id));
  patchPost(id, { boosted: true, boosted_until: until });
  announce('feed');
}

export async function unboostPost(id: string) {
  ok(await supabase.from('community_posts').update({ boosted_until: null }).eq('id', id));
  patchPost(id, { boosted: false, boosted_until: null });
  announce('feed');
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

export async function createPost(me: string, input: { caption: string; media: Media[]; group_id?: string | null; audio_id?: string | null; location?: string }): Promise<void> {
  const kind = input.media[0]?.type === 'video' ? 'reel' : 'post';
  ok(await supabase.from('community_posts').insert({ user_id: me, caption: input.caption.trim().slice(0, 2200), media: input.media, kind, group_id: input.group_id ?? null, audio_id: input.audio_id ?? null, location: (input.location ?? '').trim().slice(0, 120) }));
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

export async function sendMessage(me: string, threadId: string, msg: { text?: string; media_url?: string; post_id?: string; audio_url?: string; audio_seconds?: number; call_url?: string; call_kind?: 'voice' | 'video' }) {
  const text = (msg.text ?? '').trim().slice(0, 5000) || (msg.post_id ? 'Sent a post' : msg.call_kind === 'video' ? 'Video call' : msg.call_kind === 'voice' ? 'Voice call' : '');
  ok(
    await supabase.from('community_messages').insert({
      thread_id: threadId,
      sender_id: me,
      text,
      media_url: msg.media_url ?? '',
      post_id: msg.post_id ?? null,
      audio_url: msg.audio_url ?? '',
      audio_seconds: Math.min(600, Math.max(0, Math.round(msg.audio_seconds ?? 0))),
      call_url: msg.call_url ?? '',
      call_kind: msg.call_kind ?? '',
    }),
  );
  announce('threads');
}

/**
 * Starts a call from a chat: a private room on Jitsi Meet (free, no account, works in the
 * browser sheet on both phones) sent as a message that either person taps to join. The room name
 * is unguessable, so only the two people in the chat have it.
 */
export async function startCall(me: string, threadId: string, kind: 'voice' | 'video'): Promise<string> {
  const token = Crypto.randomUUID().replace(/-/g, '').slice(0, 20);
  const url = `https://meet.jit.si/Community-${threadId.slice(0, 8)}-${token}#config.startWithVideoMuted=${kind === 'voice'}&config.prejoinConfig.enabled=false`;
  await sendMessage(me, threadId, { call_url: url, call_kind: kind });
  return url;
}

/** When the other person last read this chat, or null if never. Live through Realtime on community_thread_reads. */
export async function fetchTheirLastRead(threadId: string, them: string): Promise<string | null> {
  const row: { last_read_at: string } | null = ok(await supabase.from('community_thread_reads').select('last_read_at').eq('thread_id', threadId).eq('user_id', them).maybeSingle());
  return row?.last_read_at ?? null;
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

export async function uploadImage(me: string, uri: string, width?: number, maxWidth = 1600): Promise<Media> {
  // Instagram serves 1080-wide JPEGs; 1600 at 0.9 keeps detail on today's screens without huge files.
  const actions = width && width > maxWidth ? [{ resize: { width: maxWidth } }] : [];
  const out = await ImageManipulator.manipulateAsync(uri, actions, { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG });
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

/* ---------- churches ---------- */

export async function fetchChurches(): Promise<Church[]> {
  return ok(await supabase.from('community_churches').select('*').order('name')) ?? [];
}

export async function fetchChurch(id: string): Promise<Church | null> {
  return ok(await supabase.from('community_churches').select('*').eq('id', id).maybeSingle());
}

export async function addChurch(me: string, church: Omit<Church, 'id' | 'created_by' | 'created_at'>): Promise<Church> {
  return ok(await supabase.from('community_churches').insert({ ...church, created_by: me }).select('*').single());
}

export async function updateChurch(id: string, patch: Partial<Omit<Church, 'id' | 'created_by' | 'created_at'>>) {
  ok(await supabase.from('community_churches').update(patch).eq('id', id));
}

export async function deleteChurch(id: string) {
  ok(await supabase.from('community_churches').delete().eq('id', id));
}

export async function fetchChurchMembers(churchId: string): Promise<Profile[]> {
  return ok(await supabase.from('community_profile_cards').select('*').eq('church_id', churchId).order('full_name')) ?? [];
}

/** Straight-line distance in kilometres. Close enough to sort a list of churches by. */
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/* ---------- hymnal ---------- */

export async function fetchHymns(): Promise<Pick<Hymn, 'number' | 'title' | 'section'>[]> {
  return ok(await supabase.from('community_hymns').select('number,title,section').order('number')) ?? [];
}

export async function fetchHymn(number: number): Promise<Hymn | null> {
  return ok(await supabase.from('community_hymns').select('*').eq('number', number).maybeSingle());
}

export async function saveHymn(me: string, hymn: Hymn) {
  ok(await supabase.from('community_hymns').upsert({ ...hymn, updated_by: me, updated_at: new Date().toISOString() }));
}

export async function deleteHymn(number: number) {
  ok(await supabase.from('community_hymns').delete().eq('number', number));
}

/* ---------- the tick and Community Plus ---------- */

export async function myPlusRequests(me: string): Promise<PlusRequest[]> {
  return ok(await supabase.from('community_plus_requests').select('*').eq('user_id', me).order('created_at', { ascending: false })) ?? [];
}

export async function requestPlus(me: string, kind: 'verify' | 'plus', note: string) {
  ok(await supabase.from('community_plus_requests').insert({ user_id: me, kind, note: note.trim().slice(0, 500) }));
}

/* ---------- admin ---------- */

export async function fetchAdminStats(): Promise<AdminStats> {
  return ok(await supabase.rpc('community_admin_stats'));
}

export async function fetchReports(status: 'open' | 'all' = 'open'): Promise<ReportCard[]> {
  let q = supabase.from('community_report_cards').select('*').order('created_at', { ascending: false }).limit(200);
  if (status === 'open') q = q.eq('status', 'open');
  return ok(await q) ?? [];
}

export async function decideReport(me: string, id: string, status: 'dismissed' | 'actioned') {
  ok(await supabase.from('community_reports').update({ status, decided_by: me, decided_at: new Date().toISOString() }).eq('id', id));
}

export async function fetchMembers(q = ''): Promise<MemberCard[]> {
  let query = supabase.from('community_member_cards').select('*').order('created_at', { ascending: false }).limit(100);
  const needle = q.trim().toLowerCase();
  if (needle) query = query.or(`username.ilike.%${needle}%,full_name.ilike.%${needle}%`);
  return ok(await query) ?? [];
}

export async function fetchMember(id: string): Promise<MemberCard | null> {
  return ok(await supabase.from('community_member_cards').select('*').eq('id', id).maybeSingle());
}

/** What an admin can set on an account. Everything else on a profile stays the account's own. */
export async function adminSetAccount(id: string, patch: { verified?: boolean; plus_until?: string | null; suspended?: boolean; admin_note?: string }) {
  ok(await supabase.from('community_profiles').update(patch).eq('id', id));
  announce('profile');
}

export async function fetchPlusRequests(): Promise<PlusRequest[]> {
  const rows: PlusRequest[] = ok(await supabase.from('community_plus_requests').select('*').eq('status', 'pending').order('created_at')) ?? [];
  if (!rows.length) return [];
  const people = await profilesInOrder([...new Set(rows.map((r) => r.user_id))]);
  return rows.map((r) => {
    const p = people.find((x) => x.id === r.user_id);
    return { ...r, username: p?.username, full_name: p?.full_name, avatar_url: p?.avatar_url };
  });
}

/** Approving grants what was asked for; a Plus approval also gives the tick, for the month. */
export async function decidePlusRequest(me: string, req: PlusRequest, approve: boolean) {
  if (approve) {
    if (req.kind === 'verify') await adminSetAccount(req.user_id, { verified: true });
    else {
      const until = new Date();
      until.setMonth(until.getMonth() + 1);
      await adminSetAccount(req.user_id, { verified: true, plus_until: until.toISOString() });
    }
  }
  ok(await supabase.from('community_plus_requests').update({ status: approve ? 'approved' : 'declined', decided_by: me, decided_at: new Date().toISOString() }).eq('id', req.id));
  // Plus activated: one line in the books, which the admin can correct in Transactions.
  if (approve && req.kind === 'plus') addTransaction(me, { user_id: req.user_id, kind: 'plus', amount_pence: PLUS_PRICE_PENCE, note: 'Community Plus, 1 month' }).catch(() => {});
}

/** What a month of Plus costs, in pence, for the books. Admins can change the amount on each line. */
export const PLUS_PRICE_PENCE = 499;

export async function listAdmins(): Promise<{ user_id: string; role: 'owner' | 'admin'; profile: Profile | null }[]> {
  const rows: { user_id: string; role: 'owner' | 'admin' }[] = ok(await supabase.from('community_admins').select('user_id,role').order('created_at')) ?? [];
  const people = await profilesInOrder(rows.map((r) => r.user_id));
  return rows.map((r) => ({ ...r, profile: people.find((p) => p.id === r.user_id) ?? null }));
}

export async function addAdmin(me: string, userId: string) {
  ok(await supabase.from('community_admins').insert({ user_id: userId, role: 'admin', granted_by: me }));
}

export async function removeAdmin(userId: string) {
  ok(await supabase.from('community_admins').delete().eq('user_id', userId).eq('role', 'admin'));
}

/* ---------- Erha ---------- */

/** Erha's own account: the assistant chats like any other person in Messages. */
export const ERHA_ID = 'user_3KTkRcnk7CCL3EaTDjWtptR4YMO';
/** Pod's account, which shares songs and podcasts. */
export const POD_ID = 'user_3KToGzk4LozAlSNYETyP4KwjzbU';

/**
 * Sends a message to Erha inside the ordinary chat with her account: the function answers in
 * the same thread, so the chat shows up in Messages like any other and moves with its last message.
 */
export async function askErhaInThread(threadId: string, text: string): Promise<{ reply: string; remaining: number | null }> {
  const { data, error } = await withTimeout(supabase.functions.invoke('erha', { body: { text, thread_id: threadId } }), 60000);
  if (error) {
    const ctx = (error as any)?.context;
    try {
      const body = ctx && typeof ctx.json === 'function' ? await ctx.json() : null;
      if (body?.error) throw new Error(body.error);
    } catch (e) {
      if (e instanceof Error && e.message && !/JSON/.test(e.message)) throw e;
    }
    throw error;
  }
  announce('threads');
  return data as { reply: string; remaining: number | null };
}

export async function fetchErhaHistory(me: string): Promise<ErhaMessage[]> {
  return ok(await supabase.from('community_erha_messages').select('*').eq('user_id', me).order('created_at').limit(200)) ?? [];
}

export async function clearErhaHistory(me: string) {
  ok(await supabase.from('community_erha_messages').delete().eq('user_id', me));
}

/** Sends a message to Erha and returns the reply. The conversation is kept on the server. */
export async function askErha(text: string): Promise<{ reply: string; remaining: number | null }> {
  const { data, error } = await withTimeout(supabase.functions.invoke('erha', { body: { text } }), 60000);
  if (error) {
    // The function sends a readable reason in the body when it refuses.
    const ctx = (error as any)?.context;
    try {
      const body = ctx && typeof ctx.json === 'function' ? await ctx.json() : null;
      if (body?.error) throw new Error(body.error);
    } catch (e) {
      if (e instanceof Error && e.message && !/JSON/.test(e.message)) throw e;
    }
    throw error;
  }
  return data as { reply: string; remaining: number | null };
}

/* ---------- communities and pages ---------- */

export async function fetchMyGroups(me: string): Promise<Group[]> {
  const rows: { group_id: string }[] = ok(await supabase.from('community_group_members').select('group_id').eq('user_id', me).eq('status', 'member')) ?? [];
  if (!rows.length) return [];
  return ok(await supabase.from('community_group_cards').select('*').in('id', rows.map((r) => r.group_id)).order('name')) ?? [];
}

export async function fetchGroups(q = '', kind?: 'community' | 'page'): Promise<Group[]> {
  let query = supabase.from('community_group_cards').select('*').order('member_count', { ascending: false }).limit(100);
  if (kind) query = query.eq('kind', kind);
  const needle = q.trim().replace(/[%,().]/g, ' ').trim();
  if (needle) query = query.or(`name.ilike.%${needle}%,handle.ilike.%${needle}%,description.ilike.%${needle}%`);
  return ok(await query) ?? [];
}

export async function fetchGroup(id: string): Promise<Group | null> {
  return ok(await supabase.from('community_group_cards').select('*').eq('id', id).maybeSingle());
}

/** Makes a handle from a name: letters, digits, dots and underscores, 3–30 long. */
export function handleFrom(name: string): string {
  const h = name.toLowerCase().replace(/[^a-z0-9_.]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 30);
  return h.length >= 3 ? h : (h + '___').slice(0, 3);
}

export async function createGroup(input: { kind: 'community' | 'page'; name: string; handle: string; description: string; privacy: 'public' | 'private'; cover_url: string; church_id: string | null }): Promise<string> {
  const id: string = ok(await supabase.rpc('community_create_group', { p_kind: input.kind, p_name: input.name.trim(), p_handle: input.handle.trim().toLowerCase(), p_description: input.description.trim(), p_privacy: input.privacy, p_cover_url: input.cover_url, p_church_id: input.church_id }));
  announce('feed');
  return id;
}

export async function updateGroup(id: string, patch: Partial<Pick<Group, 'name' | 'description' | 'cover_url' | 'privacy' | 'church_id'>>) {
  ok(await supabase.from('community_groups').update(patch).eq('id', id));
}

export async function deleteGroup(id: string) {
  ok(await supabase.from('community_groups').delete().eq('id', id));
  announce('feed');
}

/** Joins a public group at once, or asks to join a private one. */
export async function joinGroup(me: string, group: Pick<Group, 'id' | 'privacy'>) {
  ok(await supabase.from('community_group_members').insert({ group_id: group.id, user_id: me, role: 'member', status: group.privacy === 'private' ? 'pending' : 'member' }));
  announce('feed');
}

export async function leaveGroup(me: string, groupId: string) {
  ok(await supabase.from('community_group_members').delete().eq('group_id', groupId).eq('user_id', me));
  announce('feed');
}

export async function fetchGroupMembers(groupId: string, status: 'member' | 'pending' = 'member'): Promise<GroupMember[]> {
  const rows: Omit<GroupMember, 'profile'>[] = ok(await supabase.from('community_group_members').select('*').eq('group_id', groupId).eq('status', status).order('created_at')) ?? [];
  if (!rows.length) return [];
  const people = await profilesInOrder(rows.map((r) => r.user_id));
  const order = { owner: 0, admin: 1, member: 2 } as const;
  return rows.map((r) => ({ ...r, profile: people.find((p) => p.id === r.user_id) ?? null })).sort((a, b) => order[a.role] - order[b.role]);
}

export async function approveMember(groupId: string, userId: string) {
  ok(await supabase.from('community_group_members').update({ status: 'member' }).eq('group_id', groupId).eq('user_id', userId));
}

export async function setMemberRole(groupId: string, userId: string, role: 'admin' | 'member') {
  ok(await supabase.from('community_group_members').update({ role }).eq('group_id', groupId).eq('user_id', userId));
}

export async function removeMember(groupId: string, userId: string) {
  ok(await supabase.from('community_group_members').delete().eq('group_id', groupId).eq('user_id', userId));
}

export async function fetchGroupPosts(groupId: string, before?: string): Promise<Post[]> {
  let q = supabase.from('community_post_cards').select('*').eq('group_id', groupId).order('created_at', { ascending: false }).limit(PAGE);
  if (before) q = q.lt('created_at', before);
  return keep(ok(await q));
}

/** Whether I may post in this group: any member of a community, owner and admins of a page. */
export function canPostIn(g: Pick<Group, 'kind' | 'my_standing'>): boolean {
  if (!g.my_standing || g.my_standing === 'pending') return false;
  return g.kind === 'community' || g.my_standing === 'owner' || g.my_standing === 'admin';
}

/* ---------- Pod: songs and podcasts ---------- */

export async function fetchPod(kind?: 'song' | 'podcast', q = ''): Promise<PodItem[]> {
  let query = supabase.from('community_pod_cards').select('*').order('created_at', { ascending: false }).limit(200);
  if (kind) query = query.eq('kind', kind);
  const needle = q.trim();
  if (needle) query = query.or(`title.ilike.%${needle.replace(/[%,()]/g, '')}%,artist.ilike.%${needle.replace(/[%,()]/g, '')}%`);
  return ok(await query) ?? [];
}

export async function fetchPodItem(id: string): Promise<PodItem | null> {
  return ok(await supabase.from('community_pod_cards').select('*').eq('id', id).maybeSingle());
}

/** My library: what I saved, newest first. */
export async function fetchPodLibrary(me: string): Promise<PodItem[]> {
  const rows: { item_id: string; created_at: string }[] = ok(await supabase.from('community_pod_saves').select('item_id, created_at').eq('user_id', me).order('created_at', { ascending: false }).limit(300)) ?? [];
  if (!rows.length) return [];
  const items: PodItem[] = ok(await supabase.from('community_pod_cards').select('*').in('id', rows.map((r) => r.item_id))) ?? [];
  const order = new Map(rows.map((r, i) => [r.item_id, i]));
  return items.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
}

export async function fetchPopularPod(limit = 20): Promise<PodItem[]> {
  return ok(await supabase.from('community_pod_cards').select('*').order('plays', { ascending: false }).limit(limit)) ?? [];
}

/** Admins and Plus members add to Pod. The audio file is uploaded first (uploadAudio) and its URL passed here. */
export async function addPodItem(me: string, item: Pick<PodItem, 'kind' | 'title' | 'artist' | 'description' | 'cover_url' | 'audio_url' | 'duration_seconds'>): Promise<PodItem> {
  const row: { id: string } = ok(await supabase.from('community_pod_items').insert({ user_id: me, ...item, title: item.title.trim().slice(0, 160), artist: item.artist.trim().slice(0, 160), description: item.description.trim().slice(0, 2000) }).select('id').single());
  return (await fetchPodItem(row.id))!;
}

export async function updatePodItem(id: string, patch: Partial<Pick<PodItem, 'title' | 'artist' | 'description' | 'cover_url'>>) {
  ok(await supabase.from('community_pod_items').update(patch).eq('id', id));
}

export async function deletePodItem(id: string) {
  ok(await supabase.from('community_pod_items').delete().eq('id', id));
}

export async function setPodSaved(me: string, itemId: string, next: boolean) {
  if (next) ok(await supabase.from('community_pod_saves').upsert({ user_id: me, item_id: itemId }, { onConflict: 'user_id,item_id', ignoreDuplicates: true }));
  else ok(await supabase.from('community_pod_saves').delete().eq('user_id', me).eq('item_id', itemId));
}

/** Counts a listen. Fire and forget. */
export function recordPodPlay(itemId: string) {
  supabase.rpc('community_pod_played', { item: itemId }).then(() => {}, () => {});
}

/* ---------- live ---------- */

export async function fetchLives(): Promise<LiveCard[]> {
  return ok(await supabase.from('community_live_cards').select('*').order('started_at', { ascending: false }).limit(50)) ?? [];
}

export async function fetchLive(id: string): Promise<LiveCard | null> {
  const row: LiveCard | null = ok(await supabase.from('community_live_cards').select('*').eq('id', id).maybeSingle());
  return row;
}

/** Starts a live broadcast and returns its id. Everyone sees it in the story tray with a LIVE badge. */
export async function startLive(me: string, title: string): Promise<string> {
  const row: { id: string } = ok(await supabase.from('community_lives').insert({ user_id: me, title: title.trim().slice(0, 120) }).select('id').single());
  announce('stories');
  return row.id;
}

export async function endLive(id: string) {
  ok(await supabase.from('community_lives').update({ ended_at: new Date().toISOString() }).eq('id', id));
  announce('stories');
}

export async function setLiveViewers(id: string, viewers: number) {
  await supabase.from('community_lives').update({ viewers: Math.max(0, viewers) }).eq('id', id);
}

/* ---------- calls (in the app, over WebRTC) ---------- */

/** Rings the other person. The call row is what their phone sees arrive over Realtime. */
export async function placeCall(me: string, calleeId: string, kind: 'voice' | 'video', threadId?: string | null): Promise<Call> {
  return ok(await supabase.from('community_calls').insert({ caller_id: me, callee_id: calleeId, kind, thread_id: threadId ?? null }).select('*').single());
}

export async function fetchCall(id: string): Promise<Call | null> {
  return ok(await supabase.from('community_calls').select('*').eq('id', id).maybeSingle());
}

export async function setCallStatus(id: string, status: Call['status']) {
  const patch: Partial<Call> = { status };
  if (status === 'accepted') patch.answered_at = new Date().toISOString();
  if (status === 'ended' || status === 'declined' || status === 'missed' || status === 'busy') patch.ended_at = new Date().toISOString();
  ok(await supabase.from('community_calls').update(patch).eq('id', id));
}

/** A call that is still ringing for me (so a phone that was closed can pick up when it reopens). */
export async function fetchRingingCall(me: string): Promise<Call | null> {
  const since = new Date(Date.now() - 45000).toISOString();
  return ok(await supabase.from('community_calls').select('*').eq('callee_id', me).eq('status', 'ringing').gt('created_at', since).order('created_at', { ascending: false }).limit(1).maybeSingle());
}

/** Leaves a note of the call in the chat, like a call log. */
export async function logCallInChat(me: string, threadId: string, kind: 'voice' | 'video', outcome: 'ended' | 'missed' | 'declined', seconds = 0) {
  const label = outcome === 'ended' ? `${kind === 'video' ? 'Video' : 'Voice'} call · ${Math.max(1, Math.round(seconds / 60))} min` : outcome === 'missed' ? `Missed ${kind} call` : `${kind === 'video' ? 'Video' : 'Voice'} call declined`;
  await sendMessage(me, threadId, { text: label, call_kind: kind, call_url: `community://call/${outcome}` });
}

/* ---------- transactions, support and the admin console ---------- */

export async function fetchTransactions(limit = 200): Promise<Transaction[]> {
  return ok(await supabase.from('community_transaction_cards').select('*').order('created_at', { ascending: false }).limit(limit)) ?? [];
}

export async function addTransaction(me: string, t: { user_id?: string | null; kind: Transaction['kind']; amount_pence: number; currency?: string; note?: string }) {
  ok(await supabase.from('community_transactions').insert({ user_id: t.user_id ?? null, kind: t.kind, amount_pence: Math.round(t.amount_pence), currency: (t.currency ?? 'GBP').toUpperCase().slice(0, 3), note: (t.note ?? '').trim().slice(0, 500), created_by: me }));
}

export async function deleteTransaction(id: string) {
  ok(await supabase.from('community_transactions').delete().eq('id', id));
}

export async function fetchAdminActivity(limit = 80): Promise<ActivityRow[]> {
  return ok(await supabase.rpc('community_admin_activity', { p_limit: limit })) ?? [];
}

export async function fetchSupportTickets(all = false): Promise<SupportTicket[]> {
  let q = supabase.from('community_support_cards').select('*').order('created_at', { ascending: false }).limit(200);
  if (!all) q = q.neq('status', 'closed');
  return ok(await q) ?? [];
}

export async function mySupportTickets(me: string): Promise<SupportTicket[]> {
  return ok(await supabase.from('community_support_cards').select('*').eq('user_id', me).order('created_at', { ascending: false }).limit(50)) ?? [];
}

export async function openSupportTicket(me: string, subject: string, body: string) {
  ok(await supabase.from('community_support_tickets').insert({ user_id: me, subject: subject.trim().slice(0, 140), body: body.trim().slice(0, 4000) }));
}

export async function answerSupportTicket(id: string, reply: string, status: SupportTicket['status'] = 'answered') {
  ok(await supabase.from('community_support_tickets').update({ reply: reply.trim().slice(0, 4000), status, updated_at: new Date().toISOString() }).eq('id', id));
}

export async function closeSupportTicket(id: string) {
  ok(await supabase.from('community_support_tickets').update({ status: 'closed', updated_at: new Date().toISOString() }).eq('id', id));
}
