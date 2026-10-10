import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { File } from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { MEDIA_BUCKET, supabase } from './supabase';
import { announce, dropPost, patchAuthor, patchPost, putPosts } from './store';
import { FriendlyError } from './theme';
import { t } from './i18n';
import type { ActivityRow, AdminQueue, AdminStats, BillingStatus, CaptionLine, CreatorSub, DocumentType, Feedback, FollowAlerts, FriendLocation, Fundraiser, Note, StoryViewer, SupportChat, SupportMessage, OneOffPayment, PaymentsConfig, PayoutStatus, Promotion, SavedCard, SuggestedPerson, Supporter, ArchivedStory, Audience, Call, Church, Comment, ErhaMessage, Faq, Group, GroupMember, Highlight, HighlightItem, Hymn, LiveCard, LiveComment, Media, MemberCard, Message, Notice, PlusRequest, PodItem, Post, Profile, ProfileViewer, ReportCard, SavedReply, Stats, Story, StoryGroup, StoryItem, SupportTicket, Thread, Transaction } from './types';
import type { LiveAudience, LiveSchedule, PostPoll } from './types';
import type { BibleMark, BibleMarkColor, Publisher, SabbathPost, SabbathPostKind } from './types';

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

/**
 * Records, with the time, my consent to Community using information that may show my religious
 * beliefs. Only once my profile exists; asking again changes nothing (the first time stands).
 */
export async function recordConsent() {
  ok(await supabase.rpc('community_record_consent'));
}

type ProfilePatch = Partial<Pick<Profile, 'username' | 'full_name' | 'bio' | 'website' | 'avatar_url' | 'account_type' | 'category' | 'show_view_counts' | 'story_replies' | 'faq_enabled' | 'pronouns' | 'gender' | 'contact_email' | 'contact_phone' | 'church_id' | 'is_private' | 'read_receipts' | 'streaks_enabled' | 'ring_color' | 'profile_theme' | 'show_activity' | 'country' | 'sub_price_pence' | 'sensitive_filter'> & { interests_more: string[]; interests_less: string[] }>;

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

/** The profiles behind a list of account ids, in that order; accounts I can't see are left out. */
export async function profilesInOrder(ids: string[]): Promise<Profile[]> {
  if (!ids.length) return [];
  const people: Profile[] = ok(await supabase.from('community_profile_cards').select('*').in('id', ids)) ?? [];
  return ids.map((id) => people.find((p) => p.id === id)).filter(Boolean) as Profile[];
}

/**
 * Typed search words made safe to put inside a filter list (.or): commas, brackets, quotes and the
 * like would otherwise end the filter and let the words add filters of their own.
 */
function searchWords(q: string): string {
  return q.trim().toLowerCase().replace(/[,()"\\%*:]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 30);
}

export async function searchProfiles(q: string): Promise<Profile[]> {
  const clean = searchWords(q);
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

/* ---------- presence, the tick, and where an account is based ---------- */

/** Online within this long counts as "Active now". */
export const ONLINE_MS = 3 * 60e3;

export function isOnline(activeAt: string | null | undefined, now = Date.now()): boolean {
  return !!activeAt && now - new Date(activeAt).getTime() < ONLINE_MS;
}

/** "Active now", "Active 5m ago", "Active yesterday"… or '' when unknown. */
export function activeLabel(activeAt: string | null | undefined, now = Date.now()): string {
  if (!activeAt) return '';
  const d = now - new Date(activeAt).getTime();
  if (d < ONLINE_MS) return 'Active now';
  if (d < 3600e3) return `Active ${Math.round(d / 60e3)}m ago`;
  if (d < 86400e3) return `Active ${Math.round(d / 3600e3)}h ago`;
  if (d < 2 * 86400e3) return 'Active yesterday';
  return '';
}

/** Tells the server I'm here. Called every minute while the app is open; cheap and quiet. */
export function touchPresence() {
  supabase.rpc('community_touch').then(() => {}, () => {});
}

/** Plus: hide or show your tick. Showing it again works with or without Plus. */
export async function setTickHidden(hidden: boolean) {
  ok(await supabase.rpc('community_set_tick_hidden', { hidden }));
  announce('profile');
}

/* ---------- discover people ---------- */

/** People you might know: followed by people you follow, people who follow you, then the newest verified accounts. */
export async function fetchSuggestedPeople(limit = 30): Promise<SuggestedPerson[]> {
  const rows: SuggestedPerson[] = ok(await supabase.rpc('community_suggested_people', { p_limit: limit })) ?? [];
  return rows.map((r) => ({ ...r, mutual_avatars: (r.mutual_avatars ?? []).filter(Boolean), mutual_names: r.mutual_names ?? [] }));
}

/** Stops suggesting someone (the X on a suggestion card). */
export async function dismissSuggestion(me: string, userId: string) {
  ok(await supabase.from('community_suggestion_dismissals').upsert({ user_id: me, target_id: userId }, { onConflict: 'user_id,target_id', ignoreDuplicates: true }));
}

/* ---------- age ---------- */

/** Your birth date as YYYY-MM-DD, or null if you have not given it. Only you (and admins) can read it. */
export async function fetchBirthDate(me: string): Promise<string | null> {
  const row: { birth_date: string | null } | null = ok(await supabase.from('community_private_details').select('birth_date').eq('user_id', me).maybeSingle());
  return row?.birth_date ?? null;
}

/**
 * Saves your birth date (YYYY-MM-DD). Once given it can only be changed by support. Under 14, the
 * account becomes private and the under-14 rules apply.
 */
export async function setBirthDate(me: string, isoDate: string) {
  ok(await supabase.from('community_private_details').upsert({ user_id: me, birth_date: isoDate }, { onConflict: 'user_id' }));
  announce('profile');
}

/** Whole years between a YYYY-MM-DD birth date and today. */
export function ageFrom(isoDate: string, now = new Date()): number {
  const [y, m, d] = isoDate.split('-').map(Number);
  let age = now.getFullYear() - y;
  if (now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d)) age -= 1;
  return age;
}

/** The age below which the restricted experience applies. */
export const MINOR_AGE = 14;

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

/* ---------- notes (the short lines above the inbox) ---------- */

/** Notes from mutual followers and close friends, mine first, newest first. */
export async function fetchNotes(): Promise<Note[]> {
  const raw: Note[] = ok(await supabase.from('community_note_cards').select('*').order('created_at', { ascending: false }).limit(100)) ?? [];
  // Cards from before songs, places and colours came in lack those fields.
  const rows = raw.map((n) => ({ ...n, text: n.text ?? '', song_id: n.song_id ?? null, song_title: n.song_title ?? null, song_artist: n.song_artist ?? null, song_url: n.song_url ?? null, song_cover: n.song_cover ?? null, place: n.place ?? '', color: n.color ?? '' }));
  return [...rows.filter((n) => n.mine), ...rows.filter((n) => !n.mine)];
}

/**
 * Writes (or replaces) my note for the next 24 hours: up to 60 characters, a song from Pod, a place
 * (up to 80 characters) and a bubble colour. Words or a song are needed; a song can stand alone.
 */
export async function saveNote(me: string, text: string, audience: Note['audience'] = 'mutuals', extra: { song_id?: string | null; place?: string; color?: string } = {}) {
  const t = text.replace(/\s+/g, ' ').trim().slice(0, 60);
  const song_id = extra.song_id || null;
  if (!t && !song_id) throw new Error('Write something first.');
  const place = (extra.place ?? '').replace(/\s+/g, ' ').trim().slice(0, 80);
  const color = (extra.color ?? '').trim().slice(0, 20);
  ok(await supabase.from('community_notes').upsert({ user_id: me, text: t, audience, song_id, place, color }, { onConflict: 'user_id' }));
}

export async function deleteNote(me: string) {
  ok(await supabase.from('community_notes').delete().eq('user_id', me));
}

/* ---------- notifications from people you follow ---------- */

export async function fetchFollowAlerts(me: string, targetId: string): Promise<FollowAlerts> {
  const row: FollowAlerts | null = ok(await supabase.from('community_follow_alerts').select('posts, stories, clips, live').eq('user_id', me).eq('target_id', targetId).maybeSingle());
  return row ?? { posts: false, stories: false, clips: false, live: false };
}

export async function setFollowAlerts(me: string, targetId: string, alerts: FollowAlerts) {
  ok(await supabase.from('community_follow_alerts').upsert({ user_id: me, target_id: targetId, ...alerts }, { onConflict: 'user_id,target_id' }));
  announce('profile');
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
  // Posts kept to the author's profile (Plus) stay off every feed.
  let q = supabase.from('community_post_cards').select('*').eq('profile_only', false);
  if (kind === 'following') q = q.or(`following_author.eq.true,user_id.eq.${me},in_my_group.eq.true`);
  else if (kind === 'subscribers') q = q.eq('author_plus', true);
  q = q.order('created_at', { ascending: false }).limit(PAGE);
  if (before) q = q.lt('created_at', before);
  const page = keep(ok(await q));
  if (kind !== 'foryou' || before) return page;
  // Sponsored posts lead the first page of For you: a few of them, taken in turn, so every paid ad is seen.
  const boosted = await someSponsored(5);
  const ids = new Set(boosted.map((p) => p.id));
  return [...boosted, ...page.filter((p) => !ids.has(p.id))];
}

export async function fetchExplore(before?: string, limit = 30): Promise<Post[]> {
  let q = supabase.from('community_post_cards').select('*').eq('profile_only', false).order('created_at', { ascending: false }).limit(limit);
  if (before) q = q.lt('created_at', before);
  const page = keep(ok(await q));
  if (before) return page;
  const boosted = await someSponsored(6);
  const ids = new Set(boosted.map((p) => p.id));
  return [...boosted, ...page.filter((p) => !ids.has(p.id))];
}

/** Up to `n` of the posts being promoted right now, picked at random each time from all of them. */
async function someSponsored(n: number): Promise<Post[]> {
  const all: Post[] = ok(await supabase.from('community_post_cards').select('*').eq('boosted', true).eq('profile_only', false).limit(60)) ?? [];
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [all[i], all[j]] = [all[j], all[i]];
  }
  return keep(all.slice(0, n));
}

/* ---------- ads: paid promotion of a post ---------- */

/**
 * Starts paying to promote one of your posts for `days` days (1 to 30). Confirm the returned client
 * secret with a card or Apple Pay (see src/lib/payments.ts), then call settlePayment: the post is
 * then shown as Sponsored at the top of For you and Explore until the days run out.
 */
export async function promotePost(postId: string, days: number): Promise<OneOffPayment & { day_pence: number }> {
  return payments('promote', { post_id: postId, days });
}

/** After paying for an ad or a donation: the server reads the payment back from Stripe and settles it. */
export async function settlePayment(paymentIntentId: string): Promise<{ status: string; settled: boolean }> {
  const r = await payments<{ status: string; settled: boolean }>('settle', { payment_intent_id: paymentIntentId });
  announce('feed');
  announce('profile');
  return r;
}

/** My ads, newest first, with their posts. */
export async function myPromotions(me: string): Promise<Promotion[]> {
  const rows: Promotion[] = ok(await supabase.from('community_promotions').select('*').eq('user_id', me).neq('status', 'pending').order('created_at', { ascending: false }).limit(100)) ?? [];
  return withPosts(rows);
}

/** Admins: every ad that has been paid for, newest first. */
export async function fetchAllPromotions(): Promise<Promotion[]> {
  const rows: Promotion[] = ok(await supabase.from('community_promotions').select('*').neq('status', 'pending').order('created_at', { ascending: false }).limit(200)) ?? [];
  return withPosts(rows);
}

async function withPosts(rows: Promotion[]): Promise<Promotion[]> {
  const ids = [...new Set(rows.map((r) => r.post_id).filter(Boolean))] as string[];
  const posts: Post[] = ids.length ? keep(ok(await supabase.from('community_post_cards').select('*').in('id', ids))) : [];
  return rows.map((r) => ({ ...r, post: posts.find((p) => p.id === r.post_id) ?? null }));
}

/** Admins only: stops an ad early (the database refuses anyone else). The ad's record is marked ended too. */
export async function adminEndBoost(postId: string) {
  ok(await supabase.rpc('community_admin_end_ad', { p_post: postId }));
  patchPost(postId, { boosted: false, boosted_until: null });
  announce('feed');
}

export async function fetchReels(onlyFollowing: boolean, before?: string): Promise<Post[]> {
  let q = supabase.from('community_post_cards').select('*').eq('kind', 'reel').eq('profile_only', false).order('created_at', { ascending: false }).limit(10);
  if (onlyFollowing) q = q.eq('following_author', true);
  if (before) q = q.lt('created_at', before);
  return keep(ok(await q));
}

/** Someone's posts, newest first. With `before`, the next page after that time (opened from their grid); `shortsOnly` keeps to Shorts. */
export async function fetchUserPosts(userId: string, before?: string, shortsOnly?: boolean): Promise<Post[]> {
  let q = supabase.from('community_post_cards').select('*').eq('user_id', userId);
  if (shortsOnly) q = q.eq('kind', 'reel');
  if (before) q = q.lt('created_at', before);
  return keep(ok(await q.order('created_at', { ascending: false }).limit(before ? 18 : 90)));
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

/** What a new post can carry besides its media (version 20 added everything from tagged_ids on). */
export type NewPostInput = {
  caption: string;
  media: Media[];
  group_id?: string | null;
  audio_id?: string | null;
  location?: string;
  sensitive?: boolean;
  audience?: 'everyone' | 'subscribers';
  /** 'post' keeps a single video out of Shorts; left out, a single video is a short. */
  kind?: 'post' | 'reel';
  tagged_ids?: string[];
  ai_label?: boolean;
  /** Plus only: the server refuses it otherwise. */
  profile_only?: boolean;
  hide_likes?: boolean;
  comments_off?: boolean;
  prompt?: string;
  poll?: PostPoll | null;
};

/** Shares a post and returns its id. */
export async function createPost(me: string, input: NewPostInput): Promise<string> {
  // A single video is a reel unless asked otherwise; anything else (photos, or a carousel with a video in it) is a post.
  const single = input.media.length === 1 && input.media[0]?.type === 'video';
  const kind = single && input.kind !== 'post' ? 'reel' : 'post';
  const options = (input.poll?.options ?? []).map((o) => o.trim().slice(0, 80)).filter(Boolean).slice(0, 4);
  const question = (input.poll?.question ?? '').trim().slice(0, 140);
  const poll = options.length >= 2 ? (question ? { question, options } : { options }) : null;
  const row: { id: string } = ok(
    await supabase
      .from('community_posts')
      .insert({
        user_id: me,
        caption: input.caption.trim().slice(0, 2200),
        media: input.media,
        kind,
        group_id: input.group_id ?? null,
        audio_id: input.audio_id ?? null,
        location: (input.location ?? '').trim().slice(0, 120),
        sensitive: !!input.sensitive,
        audience: input.audience ?? 'everyone',
        tagged_ids: [...new Set(input.tagged_ids ?? [])].filter((id) => id !== me).slice(0, 20),
        ai_label: !!input.ai_label,
        profile_only: !!input.profile_only,
        hide_likes: !!input.hide_likes,
        comments_off: !!input.comments_off,
        prompt: (input.prompt ?? '').trim().slice(0, 200),
        poll,
      })
      .select('id')
      .single(),
  );
  // Clips get captions made from their audio in the background (only when the service is set up).
  if (kind === 'reel') requestCaptions(row.id);
  announce('feed');
  announce('profile');
  return row.id;
}

/**
 * Votes in a post's poll, moves my vote to another option, or (null) takes it back. The card
 * changes at once and goes back if the server says no.
 */
export async function votePoll(me: string, post: Post, option: number | null) {
  const before = { my_vote: post.my_vote ?? null, poll_counts: post.poll_counts ?? null };
  const counts = [...(post.poll_counts ?? (post.poll?.options ?? []).map(() => 0))];
  if (typeof before.my_vote === 'number' && counts[before.my_vote] !== undefined) counts[before.my_vote] = Math.max(0, counts[before.my_vote] - 1);
  if (option !== null && counts[option] !== undefined) counts[option] += 1;
  patchPost(post.id, { my_vote: option, poll_counts: counts });
  try {
    if (option === null) ok(await supabase.from('community_poll_votes').delete().eq('post_id', post.id).eq('user_id', me));
    else ok(await supabase.from('community_poll_votes').upsert({ post_id: post.id, user_id: me, option }, { onConflict: 'post_id,user_id' }));
  } catch (e) {
    patchPost(post.id, before);
    throw e;
  }
}

/** Asks the server to make captions for a clip. Fire and forget: the post shows them once ready. */
export function requestCaptions(postId: string) {
  supabase.functions.invoke('captions', { body: { action: 'make', post_id: postId } }).then(() => {}, () => {});
}

/** A clip's captions in another language (translated once, then kept), or null when unavailable. */
export async function translateCaptions(postId: string, lang: string): Promise<CaptionLine[] | null> {
  const { data, error } = await withTimeout(supabase.functions.invoke('captions', { body: { action: 'translate', post_id: postId, lang } }), 30000);
  if (error) return null;
  return (data as { captions: CaptionLine[] | null })?.captions ?? null;
}

/** Marks a post as sensitive (or not): sensitive posts are never shown to members under 14. */
export async function setPostSensitive(id: string, sensitive: boolean) {
  ok(await supabase.from('community_posts').update({ sensitive }).eq('id', id));
  patchPost(id, { sensitive });
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

/*
 * Stories watched on this phone. The server already knows which of other people's stories I have
 * seen, but only once its write lands, so the rings drop straight away from this list instead. My
 * own stories are never recorded as views, so the ones I have watched are kept here (and on the
 * phone, so the ring stays grey after a restart).
 */
const seenHere = new Set<string>();
const OWN_SEEN_KEY = 'community.ownStoriesSeen';
let ownSeenLoaded: Promise<void> | null = null;
let seenAnnounce: ReturnType<typeof setTimeout> | null = null;

function loadOwnSeen() {
  if (!ownSeenLoaded) {
    ownSeenLoaded = AsyncStorage.getItem(OWN_SEEN_KEY)
      .then((raw) => { for (const id of raw ? (JSON.parse(raw) as string[]) : []) seenHere.add(id); })
      .catch(() => {});
  }
  return ownSeenLoaded;
}

/** Notes on this phone that a story was watched, and tells the tray and profiles (once, shortly after). */
export function noteStorySeen(storyId: string, own: boolean) {
  if (seenHere.has(storyId)) return;
  seenHere.add(storyId);
  if (own) {
    loadOwnSeen().then(() => {
      AsyncStorage.getItem(OWN_SEEN_KEY)
        .then((raw) => {
          // Only the latest few are kept: stories are gone after a day anyway.
          const ids = [...new Set([...(raw ? (JSON.parse(raw) as string[]) : []), storyId])].slice(-200);
          return AsyncStorage.setItem(OWN_SEEN_KEY, JSON.stringify(ids));
        })
        .catch(() => {});
    });
  }
  if (seenAnnounce) clearTimeout(seenAnnounce);
  seenAnnounce = setTimeout(() => { seenAnnounce = null; announce('stories'); }, 400);
}

/** Another account is now in use: the stories it has watched are its own (its own stories' are read again from the phone). */
export function forgetSeenStories() {
  seenHere.clear();
  ownSeenLoaded = null;
}

/** Whether every story in a list has been watched (from the server or on this phone). */
export function allStoriesSeen(stories: Story[], me: string) {
  return stories.every((s) => (s.user_id === me ? seenHere.has(s.id) : s.seen || seenHere.has(s.id)));
}

function group(stories: Story[], me: string): StoryGroup[] {
  const map = new Map<string, StoryGroup>();
  for (const s of stories) {
    let g = map.get(s.user_id);
    if (!g) {
      g = { user_id: s.user_id, username: s.username, avatar_url: s.avatar_url, seen: true, close: false, stories: [] };
      map.set(s.user_id, g);
    }
    g.stories.push(s);
    if (s.user_id === me ? !seenHere.has(s.id) : !s.seen && !seenHere.has(s.id)) g.seen = false;
    if (s.audience === 'close_friends') g.close = true;
  }
  const all = [...map.values()];
  const mine = all.filter((g) => g.user_id === me);
  // Unseen first; among those, Plus members' stories lead (a Plus perk), then the order they arrived in.
  const plus = new Set(stories.filter((s) => s.author_plus).map((s) => s.user_id));
  const rest = all.filter((g) => g.user_id !== me).sort((a, b) => Number(a.seen) - Number(b.seen) || Number(plus.has(b.user_id)) - Number(plus.has(a.user_id)));
  return [...mine, ...rest];
}

export async function fetchStoryTray(me: string): Promise<StoryGroup[]> {
  await loadOwnSeen();
  const rows: Story[] = ok(await supabase.from('community_story_cards').select('*').eq('in_tray', true).order('created_at', { ascending: true }).limit(300)) ?? [];
  return group(rows, me);
}

export async function fetchUserStories(userId: string, me: string): Promise<StoryGroup[]> {
  await loadOwnSeen();
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

/**
 * Notes that I watched a story; watching it again counts as a rewatch (shown to Plus owners).
 * `quiet` (a Plus preview) records nothing at all.
 */
export async function markStorySeen(me: string, storyId: string, quiet = false) {
  if (quiet) return;
  const res = await supabase.from('community_story_views').upsert({ story_id: storyId, viewer_id: me }, { onConflict: 'story_id,viewer_id', ignoreDuplicates: true }).select('story_id');
  // Nothing new was written: I had seen it before, so this is a rewatch.
  if (!res.error && !(res.data ?? []).length) await supabase.rpc('community_story_rewatch', { p_story: storyId });
}

/** Who watched a story, newest first, with how many times and when (Plus shows these). */
export async function fetchStoryViewersDetailed(storyId: string): Promise<StoryViewer[]> {
  const rows: { viewer_id: string; viewed_at: string; last_viewed_at: string; view_count: number }[] = ok(await supabase.from('community_story_views').select('viewer_id, viewed_at, last_viewed_at, view_count').eq('story_id', storyId).order('last_viewed_at', { ascending: false }).limit(300)) ?? [];
  const people = await profilesInOrder(rows.map((r) => r.viewer_id));
  return rows.map((r) => ({ ...r, profile: people.find((p) => p.id === r.viewer_id) ?? null }));
}

/** Plus: the people whose story views I'm told about. */
export async function fetchStoryWatchList(me: string): Promise<Profile[]> {
  const rows: { target_id: string }[] = ok(await supabase.from('community_story_watch').select('target_id').eq('user_id', me).order('created_at', { ascending: false })) ?? [];
  return profilesInOrder(rows.map((r) => r.target_id));
}

export async function setStoryWatch(me: string, targetId: string, on: boolean) {
  if (on) ok(await supabase.from('community_story_watch').upsert({ user_id: me, target_id: targetId }, { onConflict: 'user_id,target_id', ignoreDuplicates: true }));
  else ok(await supabase.from('community_story_watch').delete().eq('user_id', me).eq('target_id', targetId));
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

export async function sendMessage(me: string, threadId: string, msg: { text?: string; media_url?: string; post_id?: string; audio_url?: string; audio_seconds?: number; call_url?: string; call_kind?: 'voice' | 'video'; view_once?: boolean }) {
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
      view_once: !!msg.view_once && !!msg.media_url,
    }),
  );
  announce('threads');
}

/**
 * Opens a view-once photo sent to me. The message never carries the photo's address: the server
 * hands it over here, this one time, marks the photo opened, and deletes the file a few minutes
 * later. Null if it was already opened (on another phone, say).
 */
export async function openViewOnce(messageId: string): Promise<string | null> {
  const url: string | null = ok(await supabase.rpc('community_open_view_once', { message: messageId }));
  announce('threads');
  return url || null;
}

/** Tells the other person (a Plus member) that I took a screenshot of our chat. */
export async function sendScreenshotNotice(me: string, threadId: string) {
  ok(await supabase.from('community_messages').insert({ thread_id: threadId, sender_id: me, text: 'took a screenshot of the chat', system: 'screenshot' }));
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

type ChurchInput = Omit<Church, 'id' | 'created_by' | 'created_at' | 'status' | 'reviewed_by' | 'reviewed_at'>;

/** Suggests a church. A member's suggestion waits for an admin (status 'pending'); an admin's goes straight in. */
export async function addChurch(me: string, church: ChurchInput): Promise<Church> {
  return ok(await supabase.from('community_churches').insert({ ...church, created_by: me }).select('*').single());
}

/** Admins: churches waiting to be approved, oldest first. */
export async function fetchPendingChurches(): Promise<(Church & { submitted_by: Profile | null })[]> {
  const rows: Church[] = ok(await supabase.from('community_churches').select('*').eq('status', 'pending').order('created_at', { ascending: true }).limit(200)) ?? [];
  const people = await profilesInOrder([...new Set(rows.map((r) => r.created_by).filter(Boolean))] as string[]);
  return rows.map((r) => ({ ...r, submitted_by: people.find((p) => p.id === r.created_by) ?? null }));
}

export async function decideChurch(me: string, id: string, approve: boolean) {
  ok(await supabase.from('community_churches').update({ status: approve ? 'approved' : 'rejected', reviewed_by: me, reviewed_at: new Date().toISOString() }).eq('id', id));
}

export async function updateChurch(id: string, patch: Partial<ChurchInput>) {
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

/** Private bucket for identity checks: only the member and admins can open these files. */
export const VERIFICATION_BUCKET = 'community-verification';

/**
 * Uploads a photo for the identity check (a selfie or a document) to the private bucket and returns
 * its path there (not a public address). Photos are re-encoded as JPEG, which also drops their location data.
 */
export async function uploadVerificationPhoto(me: string, uri: string, which: 'selfie' | 'document', width?: number): Promise<string> {
  const actions = width && width > 2000 ? [{ resize: { width: 2000 } }] : [];
  const out = await ImageManipulator.manipulateAsync(uri, actions, { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG });
  const path = `${me}/verify-${which}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  ok(await supabase.storage.from(VERIFICATION_BUCKET).upload(path, await readBytes(out.uri), { contentType: 'image/jpeg', upsert: false }));
  return path;
}

/**
 * Asks for the blue tick with an identity check. Both photos must be uploaded first. `path` is
 * 'notable' (the free application, with the details below) or 'plus' (verified with Plus).
 */
export async function requestVerification(me: string, input: { selfie_path: string; document_path: string; document_type: DocumentType; legal_name: string; note?: string; path?: 'notable' | 'plus'; category?: string; country?: string; audience?: string; known_as?: string; links?: string[] }) {
  ok(
    await supabase.from('community_plus_requests').insert({
      user_id: me,
      kind: 'verify',
      note: (input.note ?? '').trim().slice(0, 500),
      selfie_path: input.selfie_path,
      document_path: input.document_path,
      document_type: input.document_type,
      legal_name: input.legal_name.trim().slice(0, 120),
      path: input.path ?? 'notable',
      category: (input.category ?? '').trim().slice(0, 60),
      country: (input.country ?? '').trim().slice(0, 60),
      audience: (input.audience ?? '').trim().slice(0, 500),
      known_as: (input.known_as ?? '').trim().slice(0, 200),
      links: (input.links ?? []).map((l) => l.trim()).filter(Boolean).slice(0, 5),
    }),
  );
}

/** Admins: a short-lived address to look at an identity photo. */
export async function verificationFileUrl(path: string): Promise<string> {
  const res = await supabase.storage.from(VERIFICATION_BUCKET).createSignedUrl(path, 600);
  if (res.error) throw res.error;
  return res.data.signedUrl;
}

/* ---------- admin ---------- */

export async function fetchAdminStats(): Promise<AdminStats> {
  return ok(await supabase.rpc('community_admin_stats'));
}

/** What is waiting for the admins: churches to approve, identity checks, running ads and fundraisers. */
export async function fetchAdminQueue(): Promise<AdminQueue> {
  return ok(await supabase.rpc('community_admin_queue'));
}

/* Offensive words: masked with asterisks in comments and captions by the database as they are written. */

export async function fetchBlockedWords(): Promise<string[]> {
  const rows: { word: string }[] = ok(await supabase.from('community_blocked_words').select('word').order('word').limit(2000)) ?? [];
  return rows.map((r) => r.word);
}

/** Lowercase letters and digits, 2 to 30 long; anything else is refused by the database. */
export async function addBlockedWord(word: string) {
  const w = word.trim().toLowerCase();
  if (!/^[a-z0-9]{2,30}$/.test(w)) throw new Error('Use one word of 2 to 30 letters or digits, no spaces.');
  ok(await supabase.from('community_blocked_words').upsert({ word: w }, { onConflict: 'word', ignoreDuplicates: true }));
}

export async function removeBlockedWord(word: string) {
  ok(await supabase.from('community_blocked_words').delete().eq('word', word));
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
  const needle = searchWords(q);
  if (needle) query = query.or(`username.ilike.%${needle}%,full_name.ilike.%${needle}%`);
  return ok(await query) ?? [];
}

export async function fetchMember(id: string): Promise<MemberCard | null> {
  return ok(await supabase.from('community_member_cards').select('*').eq('id', id).maybeSingle());
}

/** What an admin can set on an account. Everything else on a profile stays the account's own. */
export async function adminSetAccount(id: string, patch: { verified?: boolean; plus_until?: string | null; suspended?: boolean; admin_note?: string; verified_via?: '' | 'notable' | 'plus' | 'admin'; hide_connections?: boolean; tick_hidden?: boolean }) {
  ok(await supabase.from('community_profiles').update(patch).eq('id', id));
  announce('profile');
}

export async function fetchPlusRequests(kind?: PlusRequest['kind']): Promise<PlusRequest[]> {
  let q = supabase.from('community_plus_requests').select('*').eq('status', 'pending').order('created_at');
  if (kind) q = q.eq('kind', kind);
  const rows: PlusRequest[] = ok(await q) ?? [];
  if (!rows.length) return [];
  const people = await profilesInOrder([...new Set(rows.map((r) => r.user_id))]);
  return rows.map((r) => {
    const p = people.find((x) => x.id === r.user_id);
    return { ...r, username: p?.username, full_name: p?.full_name, avatar_url: p?.avatar_url };
  });
}

/**
 * Approving grants what was asked for: the tick for an identity check, a month of Plus for a Plus
 * request (Plus never brings the tick with it). The identity photos are deleted once decided.
 */
export async function decidePlusRequest(me: string, req: PlusRequest, approve: boolean) {
  if (approve) {
    if (req.kind === 'verify') await adminSetAccount(req.user_id, { verified: true, tick_hidden: false, verified_via: req.path === 'plus' ? 'plus' : 'notable' });
    else {
      const until = new Date();
      until.setMonth(until.getMonth() + 1);
      await adminSetAccount(req.user_id, { plus_until: until.toISOString() });
    }
  }
  ok(await supabase.from('community_plus_requests').update({ status: approve ? 'approved' : 'declined', decided_by: me, decided_at: new Date().toISOString() }).eq('id', req.id));
  const files = [req.selfie_path, req.document_path].filter(Boolean);
  if (files.length) await supabase.storage.from(VERIFICATION_BUCKET).remove(files).catch(() => null);
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
      if (typeof body?.error === 'string' && body.error) throw new FriendlyError(body.error);
    } catch (e) {
      if (e instanceof FriendlyError) throw e;
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
      if (typeof body?.error === 'string' && body.error) throw new FriendlyError(body.error);
    } catch (e) {
      if (e instanceof FriendlyError) throw e;
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

/** What the owner of a Pod item may change. The database refuses an update that names any other column (the play count, the owner). */
const POD_EDITABLE = ['kind', 'title', 'artist', 'description', 'cover_url', 'audio_url', 'duration_seconds'] as const;

export async function updatePodItem(id: string, patch: Partial<Pick<PodItem, (typeof POD_EDITABLE)[number]>>) {
  // Copied field by field, so a whole PodItem passed in by mistake can't carry plays or user_id along.
  const row: Record<string, unknown> = {};
  for (const key of POD_EDITABLE) if (patch[key] !== undefined) row[key] = patch[key];
  if (!Object.keys(row).length) return;
  ok(await supabase.from('community_pod_items').update(row).eq('id', id));
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

/**
 * Starts a live broadcast and returns its id. Everyone sees it in the story tray with a LIVE badge.
 * `audience` decides who may watch ('practice' is only me); `fundraiserId` puts a Donate chip on it.
 */
export async function startLive(me: string, title: string, opts: { audience?: LiveAudience; fundraiserId?: string | null } = {}): Promise<string> {
  const row: { id: string } = ok(await supabase.from('community_lives').insert({ user_id: me, title: title.trim().slice(0, 120), audience: opts.audience ?? 'followers', fundraiser_id: opts.fundraiserId ?? null }).select('id').single());
  announce('stories');
  return row.id;
}

/* Lives planned ahead: shown on the profile, and people who ask are reminded when it starts. */

/** Someone's lives still to come (or started within the last half hour), soonest first. */
export async function fetchLiveSchedules(userId: string): Promise<LiveSchedule[]> {
  const since = new Date(Date.now() - 30 * 60e3).toISOString();
  return ok(await supabase.from('community_live_schedules').select('*').eq('user_id', userId).gte('starts_at', since).order('starts_at', { ascending: true }).limit(20)) ?? [];
}

export async function scheduleLive(me: string, title: string, startsAt: Date): Promise<LiveSchedule> {
  return ok(await supabase.from('community_live_schedules').insert({ user_id: me, title: title.trim().slice(0, 120), starts_at: startsAt.toISOString() }).select('*').single());
}

export async function updateLiveSchedule(id: string, title: string, startsAt: Date) {
  ok(await supabase.from('community_live_schedules').update({ title: title.trim().slice(0, 120), starts_at: startsAt.toISOString() }).eq('id', id));
}

export async function cancelLiveSchedule(id: string) {
  ok(await supabase.from('community_live_schedules').delete().eq('id', id));
}

export async function hasLiveReminder(me: string, scheduleId: string): Promise<boolean> {
  const rows: unknown[] = ok(await supabase.from('community_live_reminders').select('schedule_id').eq('schedule_id', scheduleId).eq('user_id', me).limit(1)) ?? [];
  return rows.length > 0;
}

export async function setLiveReminder(me: string, scheduleId: string, on: boolean) {
  if (on) ok(await supabase.from('community_live_reminders').upsert({ schedule_id: scheduleId, user_id: me }, { onConflict: 'schedule_id,user_id', ignoreDuplicates: true }));
  else ok(await supabase.from('community_live_reminders').delete().eq('schedule_id', scheduleId).eq('user_id', me));
}

export async function endLive(id: string) {
  ok(await supabase.from('community_lives').update({ ended_at: new Date().toISOString() }).eq('id', id));
  announce('stories');
}

export async function setLiveViewers(id: string, viewers: number) {
  await supabase.from('community_lives').update({ viewers: Math.max(0, viewers) }).eq('id', id);
}

/*
 * Live comments are rows, not channel messages, so the database decides who wrote each one (and who
 * may comment at all). Only the commenter's id is in a row: the name shown comes from their profile.
 */

const LIVE_COMMENT_COLUMNS = 'id, live_id, user_id, text, created_at';

/** The latest comments on a live, oldest first. */
export async function fetchLiveComments(liveId: string, limit = 20): Promise<LiveComment[]> {
  const rows: LiveComment[] = ok(await supabase.from('community_live_comments').select(LIVE_COMMENT_COLUMNS).eq('live_id', liveId).order('created_at', { ascending: false }).limit(limit)) ?? [];
  return rows.reverse();
}

/** Comments under my own name only. The database also turns away a live that has ended, and more than 20 a minute. */
export async function addLiveComment(me: string, liveId: string, text: string): Promise<LiveComment> {
  return ok(await supabase.from('community_live_comments').insert({ live_id: liveId, user_id: me, text: text.trim().slice(0, 300) }).select(LIVE_COMMENT_COLUMNS).single());
}

/** My own comment, or any comment on my live. */
export async function deleteLiveComment(id: string) {
  ok(await supabase.from('community_live_comments').delete().eq('id', id));
}

/** Whether a comment is still there, so a viewer's word that they removed theirs can be checked before it is passed on. */
export async function liveCommentExists(id: string): Promise<boolean> {
  const row: { id: string } | null = ok(await supabase.from('community_live_comments').select('id').eq('id', id).maybeSingle());
  return !!row;
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
  // The only columns a member may change on a call; the database refuses an update naming any other.
  const patch: Partial<Pick<Call, 'status' | 'answered_at' | 'ended_at'>> = { status };
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

/* ---------- payments (Stripe, through the payments function) ---------- */

/** Calls the payments function and turns its refusals into readable errors. */
async function payments<T>(action: string, extra: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await withTimeout(supabase.functions.invoke('payments', { body: { action, ...extra } }), 30000);
  if (error) {
    const ctx = (error as any)?.context;
    let message = '';
    try {
      const body = ctx && typeof ctx.json === 'function' ? await ctx.json() : null;
      message = typeof body?.error === 'string' ? body.error : '';
    } catch {
      // Not JSON: fall back to the generic error below.
    }
    // The function's own reason is written for members, so errText shows it as it is.
    throw new FriendlyError(message || 'The payment service could not be reached. Check your connection and try again.');
  }
  return data as T;
}

export const fetchPaymentsConfig = () => payments<PaymentsConfig>('config');
export const fetchBillingStatus = () => payments<BillingStatus>('status');
export const fetchSavedCards = () => payments<{ cards: SavedCard[] }>('cards').then((r) => r.cards ?? []);
/** A SetupIntent client secret: confirm it with the card the member typed and the card is saved. */
export const startAddCard = () => payments<{ client_secret: string }>('add_card').then((r) => r.client_secret);
export const removeSavedCard = (id: string) => payments<{ cards: SavedCard[] }>('remove_card', { payment_method_id: id }).then((r) => r.cards ?? []);
export const setDefaultCard = (id: string) => payments<{ cards: SavedCard[] }>('default_card', { payment_method_id: id }).then((r) => r.cards ?? []);

/**
 * Starts the monthly Plus subscription (or picks up one left half-way, or a failed renewal). Returns
 * the first payment's client secret to confirm with a card or Apple Pay, or `already: true` when
 * nothing is left to pay.
 */
export const startSubscription = (savedCardId?: string | null, plan: 'monthly' | 'yearly' = 'monthly') =>
  payments<{ already?: boolean; subscription_id: string; client_secret?: string; intent?: 'payment' | 'setup'; trial_days?: number; status?: string; amount?: number; currency?: string; plan_changed?: boolean }>('subscribe', { plan, ...(savedCardId ? { payment_method_id: savedCardId } : {}) });

/** Reads the subscription back from Stripe after paying and switches Plus on. */
export async function syncSubscription(): Promise<BillingStatus & { plus: boolean }> {
  const r = await payments<BillingStatus & { plus: boolean }>('sync');
  announce('profile');
  return r;
}

export const cancelSubscription = () => payments<BillingStatus>('cancel');
export const resumeSubscription = () => payments<BillingStatus>('resume');

/** My payments, newest first (the database only returns my own). */
export async function myTransactions(me: string): Promise<Transaction[]> {
  return ok(await supabase.from('community_transaction_cards').select('*').eq('user_id', me).order('created_at', { ascending: false }).limit(50)) ?? [];
}

/* ---------- fundraisers ---------- */

export async function fetchFundraiser(id: string): Promise<Fundraiser | null> {
  return ok(await supabase.from('community_fundraiser_cards').select('*').eq('id', id).maybeSingle());
}

/** A member's fundraisers, running ones first, newest first. */
export async function fetchUserFundraisers(userId: string): Promise<Fundraiser[]> {
  const rows: Fundraiser[] = ok(await supabase.from('community_fundraiser_cards').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(50)) ?? [];
  return rows.sort((a, b) => Number(b.status === 'active') - Number(a.status === 'active'));
}

/** Admins: every fundraiser, newest first. */
export async function fetchAllFundraisers(): Promise<Fundraiser[]> {
  return ok(await supabase.from('community_fundraiser_cards').select('*').order('created_at', { ascending: false }).limit(200)) ?? [];
}

export type FundraiserInput = { title: string; description: string; goal_pence: number; cover_url?: string; ends_at?: string | null; currency?: string };

/** Starts a fundraiser on your profile. Members under 14 cannot. Donations need a payout account (startPayoutsOnboarding). */
export async function createFundraiser(me: string, input: FundraiserInput): Promise<string> {
  const row: { id: string } = ok(
    await supabase
      .from('community_fundraisers')
      .insert({ user_id: me, title: input.title.trim().slice(0, 80), description: input.description.trim().slice(0, 2000), goal_pence: Math.round(input.goal_pence), cover_url: input.cover_url ?? '', ends_at: input.ends_at ?? null, currency: (input.currency ?? 'GBP').toUpperCase() })
      .select('id')
      .single(),
  );
  announce('profile');
  return row.id;
}

export async function updateFundraiser(id: string, patch: Partial<FundraiserInput> & { status?: 'active' | 'closed' }) {
  const clean: Record<string, unknown> = { ...patch };
  if (typeof patch.title === 'string') clean.title = patch.title.trim().slice(0, 80);
  if (typeof patch.description === 'string') clean.description = patch.description.trim().slice(0, 2000);
  if (typeof patch.goal_pence === 'number') clean.goal_pence = Math.round(patch.goal_pence);
  ok(await supabase.from('community_fundraisers').update(clean).eq('id', id));
  announce('profile');
}

export const closeFundraiser = (id: string) => updateFundraiser(id, { status: 'closed' });

export async function deleteFundraiser(id: string) {
  ok(await supabase.from('community_fundraisers').delete().eq('id', id));
  announce('profile');
}

/**
 * Asks Stripe whether a fundraiser's owner can take gifts now (their payout setup may have finished
 * since they last looked) and returns the up-to-date answer.
 */
export async function refreshFundraiserReady(fundraiserId: string): Promise<boolean> {
  const r = await payments<{ accepting: boolean }>('fundraiser_ready', { fundraiser_id: fundraiserId });
  return !!r.accepting;
}

/** Recent gifts, newest first. Anonymous givers are not named. */
export async function fetchSupporters(fundraiserId: string, limit = 30): Promise<Supporter[]> {
  return ok(await supabase.rpc('community_fundraiser_supporters', { fid: fundraiserId, p_limit: limit })) ?? [];
}

/**
 * Starts a donation (£1 to £10,000): the whole amount goes to the fundraiser's owner, the app takes
 * nothing. Confirm the client secret with a card or Apple Pay, then call settlePayment.
 */
export async function startDonation(fundraiserId: string, amountPence: number, message = '', anonymous = false): Promise<OneOffPayment> {
  return payments('donate', { fundraiser_id: fundraiserId, amount_pence: Math.round(amountPence), message, anonymous });
}

/* Payouts: each fundraiser's owner receives donations into their own Stripe account. */

export const fetchPayouts = () => payments<PayoutStatus>('payouts');

/** The address of Stripe's form for setting up (or finishing) a payout account. Open it in the in-app browser; it returns to community://payouts. */
export const startPayoutsOnboarding = (country?: string) => payments<{ url: string }>('payouts_onboard', country ? { country } : {}).then((r) => r.url);

/** The address of the member's Stripe Express dashboard (payouts, bank details, tax forms). */
export const openPayoutsDashboard = () => payments<{ url: string }>('payouts_dashboard').then((r) => r.url);

/* ---------- subscriptions to creators ---------- */

/** Starts subscribing to a creator. Confirm the client secret (card or Apple Pay), then syncCreatorSubscription. */
export const startCreatorSubscription = (creatorId: string) =>
  payments<{ already?: boolean; subscription_id: string; client_secret?: string; intent?: 'payment'; amount?: number; currency?: string; status?: string }>('creator_subscribe', { creator_id: creatorId });

export async function syncCreatorSubscription(creatorId: string) {
  const r = await payments<{ status: string; cancel_at_period_end?: boolean; current_period_end?: string | null }>('creator_sync', { creator_id: creatorId });
  announce('profile');
  announce('feed');
  return r;
}

/**
 * After paying: reads the subscription back until Stripe has it on ('active' or 'trialing'). A payment
 * that has only just gone through can leave it 'incomplete' (or 'past_due', for a renewal paid late)
 * for a few seconds. `known` is a status already read, so it isn't asked for twice. True once it's on.
 */
export async function syncCreatorSubscriptionUntilOn(creatorId: string, known: string | null = null): Promise<boolean> {
  const on = (s: string | null) => s === 'active' || s === 'trialing';
  let status = known;
  for (let i = 0; i < 4 && !on(status); i++) {
    // Already asked and not on yet: give Stripe a moment before asking again.
    if (status !== null) await new Promise<void>((resolve) => setTimeout(resolve, 1500));
    status = (await syncCreatorSubscription(creatorId).catch(() => null))?.status ?? 'unknown';
  }
  return on(status);
}

/** Stops renewing at the end of the paid month (or, with resume, carries on after all). */
export async function cancelCreatorSubscription(creatorId: string, resume = false) {
  const r = await payments<{ status: string; cancel_at_period_end: boolean }>('creator_cancel', { creator_id: creatorId, resume });
  announce('profile');
  return r;
}

/** The creators I subscribe to, newest first. */
export async function mySubscriptions(me: string): Promise<CreatorSub[]> {
  const rows: CreatorSub[] = ok(await supabase.from('community_creator_subs').select('*').eq('subscriber_id', me).in('status', ['active', 'trialing', 'past_due']).order('created_at', { ascending: false })) ?? [];
  const people = await profilesInOrder(rows.map((r) => r.creator_id));
  return rows.map((r) => ({ ...r, profile: people.find((p) => p.id === r.creator_id) ?? null }));
}

/** People who subscribe to me, newest first. */
export async function mySubscribers(me: string): Promise<CreatorSub[]> {
  const rows: CreatorSub[] = ok(await supabase.from('community_creator_subs').select('*').eq('creator_id', me).in('status', ['active', 'trialing', 'past_due']).order('created_at', { ascending: false })) ?? [];
  const people = await profilesInOrder(rows.map((r) => r.subscriber_id));
  return rows.map((r) => ({ ...r, profile: people.find((p) => p.id === r.subscriber_id) ?? null }));
}

/* ---------- live support and feedback ---------- */

/**
 * My latest support chat, open or closed (the team's last answers stay readable, and writing again
 * reopens it), or null if I've never written to support.
 */
export async function findSupportChat(me: string): Promise<SupportChat | null> {
  return ok(await supabase.from('community_support_chats').select('*').eq('user_id', me).order('updated_at', { ascending: false }).limit(1).maybeSingle());
}

/** Starts my support chat, for my first message (just opening Support doesn't make one). */
export async function startSupportChat(me: string): Promise<SupportChat> {
  return (await findSupportChat(me)) ?? ok(await supabase.from('community_support_chats').insert({ user_id: me }).select('*').single());
}

export async function fetchSupportMessages(chatId: string): Promise<SupportMessage[]> {
  return ok(await supabase.from('community_support_messages').select('*').eq('chat_id', chatId).order('created_at', { ascending: true }).limit(500)) ?? [];
}

/** Sends my message, then asks the assistant to answer (it stays quiet while a person from the team is answering). */
export async function sendSupportMessage(me: string, chatId: string, text: string): Promise<{ answered_by: 'ai' | 'agent' | 'none' | 'busy' }> {
  ok(await supabase.from('community_support_messages').insert({ chat_id: chatId, sender_id: me, role: 'member', text: text.trim().slice(0, 4000) }));
  const { data, error } = await withTimeout(supabase.functions.invoke('support', { body: { chat_id: chatId } }), 90000);
  if (error) return { answered_by: 'none' };
  return (data as { answered_by: 'ai' | 'agent' | 'none' | 'busy' }) ?? { answered_by: 'none' };
}

/** Admins: support chats, most recent first, with who they're from. */
export async function fetchSupportChats(status: 'open' | 'all' = 'open'): Promise<SupportChat[]> {
  let q = supabase.from('community_support_chats').select('*').order('updated_at', { ascending: false }).limit(200);
  if (status === 'open') q = q.eq('status', 'open');
  const rows: SupportChat[] = ok(await q) ?? [];
  const people = await profilesInOrder([...new Set(rows.map((r) => r.user_id))]);
  return rows.map((r) => ({ ...r, profile: people.find((p) => p.id === r.user_id) ?? null }));
}

/** Admins: answer in a support chat under your own name (the assistant steps back for half an hour). */
export async function sendAgentReply(me: string, chatId: string, text: string) {
  ok(await supabase.from('community_support_messages').insert({ chat_id: chatId, sender_id: me, role: 'agent', text: text.trim().slice(0, 4000) }));
}

export async function closeSupportChat(chatId: string) {
  ok(await supabase.from('community_support_chats').update({ status: 'closed', updated_at: new Date().toISOString() }).eq('id', chatId));
}

/** A review, an idea or a problem, from Help or the occasional "How can we improve?" prompt. */
export async function sendFeedback(me: string, f: { kind: Feedback['kind']; rating?: number | null; text?: string; app_version?: string; platform?: string }) {
  ok(await supabase.from('community_feedback').insert({ user_id: me, kind: f.kind, rating: f.rating ?? null, text: (f.text ?? '').trim().slice(0, 2000), app_version: (f.app_version ?? '').slice(0, 40), platform: (f.platform ?? '').slice(0, 20) }));
}

/** Admins: everything members have sent, newest first. */
export async function fetchFeedback(): Promise<Feedback[]> {
  return ok(await supabase.from('community_feedback_cards').select('*').order('created_at', { ascending: false }).limit(300)) ?? [];
}

/* ---------- live location ---------- */

/** Shares (or updates) where I am with mutual followers or close friends. Members under 14 can't. */
export async function shareLocation(me: string, loc: { lat: number; lng: number; accuracy?: number | null; audience: FriendLocation['audience'] }) {
  // The time is set by the server's clock, not the phone's.
  ok(await supabase.from('community_locations').upsert({ user_id: me, lat: loc.lat, lng: loc.lng, accuracy: loc.accuracy ?? null, audience: loc.audience }, { onConflict: 'user_id' }));
}

export async function stopSharingLocation(me: string) {
  ok(await supabase.from('community_locations').delete().eq('user_id', me));
}

/** Whether I'm sharing where I am (my place is on the server, however old). */
export async function amSharingLocation(me: string): Promise<boolean> {
  return !!ok(await supabase.from('community_locations').select('user_id').eq('user_id', me).maybeSingle());
}

/**
 * Moves my shared place, only if I'm still sharing. It never adds a place, so an update that lands
 * after sharing was turned off changes nothing. False when there was no place to move.
 */
export async function moveSharedLocation(me: string, loc: { lat: number; lng: number; accuracy?: number | null }): Promise<boolean> {
  const rows: { user_id: string }[] | null = ok(await supabase.from('community_locations').update({ lat: loc.lat, lng: loc.lng, accuracy: loc.accuracy ?? null }).eq('user_id', me).select('user_id'));
  return !!rows?.length;
}

/** Friends sharing where they are (updated in the last day), and me if I'm sharing. */
export async function fetchFriendLocations(): Promise<FriendLocation[]> {
  return ok(await supabase.from('community_friend_locations').select('*').order('updated_at', { ascending: false }).limit(300)) ?? [];
}

/* ---------- v21: Sabbath School publishers ---------- */

/** Studies, lesson helps, announcements and resources from the publishers: pinned first, then newest. */
export async function fetchSabbathPosts(offset = 0, limit = 20): Promise<SabbathPost[]> {
  return ok(await withTimeout(supabase.from('community_sabbath_post_cards').select('*').order('pinned', { ascending: false }).order('created_at', { ascending: false }).range(offset, offset + limit - 1))) ?? [];
}

export async function fetchSabbathPost(id: string): Promise<SabbathPost | null> {
  return ok(await withTimeout(supabase.from('community_sabbath_post_cards').select('*').eq('id', id).maybeSingle()));
}

export type SabbathPostInput = { kind: SabbathPostKind; title: string; body: string; lesson_ref: string; media: Media[]; link: string };

export async function createSabbathPost(me: string, input: SabbathPostInput): Promise<string> {
  const row: { id: string } = ok(await supabase.from('community_sabbath_posts').insert({ ...input, author_id: me }).select('id').single());
  return row.id;
}

/** `pinned` is for admins; the server keeps it as it was for anyone else. */
export async function updateSabbathPost(id: string, patch: Partial<SabbathPostInput> & { pinned?: boolean }) {
  const rows: { id: string }[] = ok(await supabase.from('community_sabbath_posts').update(patch).eq('id', id).select('id'));
  // Nothing changed: the post is gone, or publishing was turned off while it was being edited.
  if (!rows.length) throw new FriendlyError(t('ssPub.onlyPublishers'));
}

export async function deleteSabbathPost(id: string) {
  ok(await supabase.from('community_sabbath_posts').delete().eq('id', id));
}

/** My request to publish, or null if I've never asked. */
export async function fetchMyPublisher(me: string): Promise<Publisher | null> {
  return ok(await withTimeout(supabase.from('community_publishers').select('*').eq('user_id', me).maybeSingle()));
}

/** Asks to publish. `again` after a refusal sets the request back to pending with the new note. */
export async function requestPublisher(me: string, note: string, again = false) {
  const text = note.trim().slice(0, 1000);
  if (again) ok(await supabase.from('community_publishers').update({ status: 'pending', note: text }).eq('user_id', me));
  else ok(await supabase.from('community_publishers').insert({ user_id: me, note: text }));
}

/** Admins: requests waiting and approved publishers, oldest first, with who they are. */
export async function fetchPublishers(): Promise<Publisher[]> {
  const rows: Publisher[] = ok(await supabase.from('community_publishers').select('*').in('status', ['pending', 'approved']).order('created_at', { ascending: true }).limit(500)) ?? [];
  const people = await profilesInOrder(rows.map((r) => r.user_id));
  return rows.map((r) => ({ ...r, profile: people.find((p) => p.id === r.user_id) ?? null }));
}

export async function countPendingPublishers(): Promise<number> {
  const { count: n, error } = await supabase.from('community_publishers').select('user_id', { count: 'exact', head: true }).eq('status', 'pending');
  if (error) throw error;
  return n ?? 0;
}

/** Admins: approve, decline or revoke. The server records who decided and when. */
export async function decidePublisher(userId: string, status: 'approved' | 'rejected' | 'revoked') {
  ok(await supabase.from('community_publishers').update({ status }).eq('user_id', userId));
}

/* ---------- v21: Bible highlights and notes ---------- */

const MARKS = 'community_bible_marks';

/** My highlights and notes, newest first; with `at`, only that chapter's. */
export async function fetchBibleMarks(me: string, at?: { book: string; chapter: number }): Promise<BibleMark[]> {
  let q = supabase.from(MARKS).select('*').eq('user_id', me);
  if (at) q = q.eq('book', at.book).eq('chapter', at.chapter);
  return ok(await withTimeout(q.order('updated_at', { ascending: false }).limit(at ? 200 : 1000))) ?? [];
}

/** Colours verses, or with '' takes their colour off. Notes stay; a verse left with neither is removed. */
export async function setBibleColor(me: string, translation: string, book: string, chapter: number, verses: number[], color: BibleMarkColor) {
  if (!verses.length) return;
  const updated_at = new Date().toISOString();
  if (color) {
    // Only the columns sent are updated on a verse already marked, so its note is kept.
    ok(await supabase.from(MARKS).upsert(verses.map((verse) => ({ user_id: me, translation, book, chapter, verse, color, updated_at })), { onConflict: 'user_id,book,chapter,verse' }));
    return;
  }
  ok(await supabase.from(MARKS).delete().eq('user_id', me).eq('book', book).eq('chapter', chapter).in('verse', verses).eq('note', ''));
  ok(await supabase.from(MARKS).update({ color: '', updated_at }).eq('user_id', me).eq('book', book).eq('chapter', chapter).in('verse', verses));
}

/** Writes my note on a verse. An empty note takes it off (and removes the mark if it has no colour). */
export async function setBibleNote(me: string, translation: string, book: string, chapter: number, verse: number, note: string) {
  const text = note.trim().slice(0, 2000);
  const updated_at = new Date().toISOString();
  if (text) {
    ok(await supabase.from(MARKS).upsert({ user_id: me, translation, book, chapter, verse, note: text, updated_at }, { onConflict: 'user_id,book,chapter,verse' }));
    return;
  }
  ok(await supabase.from(MARKS).delete().eq('user_id', me).eq('book', book).eq('chapter', chapter).eq('verse', verse).eq('color', ''));
  ok(await supabase.from(MARKS).update({ note: '', updated_at }).eq('user_id', me).eq('book', book).eq('chapter', chapter).eq('verse', verse));
}
