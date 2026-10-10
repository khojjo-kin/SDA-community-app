// Small reads and writes for posts that the shared data code (src/lib/api.ts) doesn't have yet.
//
// Changing a post after it is shared (caption, location, alt text, hiding the like count, turning
// commenting off): the database lets authors update their own posts (policy posts_update_own,
// database v9) and checks the new values the same way as a new post (v20's extras guard), so this
// writes the same table with the same rules as the iPhone app would.
import { useEffect, useState } from 'react';
import { fetchExplore, fetchGroupPosts, fetchReels, fetchStoryTray, fetchUserPosts, getProfile } from 'shared/api';
import { listen, patchPost } from 'shared/store';
import { supabase } from 'shared/supabase';
import type { Media, Post, Profile, StoryGroup } from 'shared/types';
import { nav } from '../lib/router';

/** A photo or video with its alt text (kept in the post's media list, read by screen readers). */
export type AltMedia = Media & { alt?: string };

export const altOf = (m?: Media): string => ((m as AltMedia | undefined)?.alt ?? '').trim();

export type PostEdit = { caption?: string; location?: string; media?: AltMedia[]; hide_likes?: boolean; comments_off?: boolean };

/** Saves changes to one of my posts and shows them at once on every card. */
export async function updatePost(id: string, edit: PostEdit) {
  const row: Record<string, unknown> = { ...edit };
  if (edit.caption !== undefined) row.caption = edit.caption.trim().slice(0, 2200);
  if (edit.location !== undefined) row.location = edit.location.trim().slice(0, 120);
  const { error } = await supabase.from('community_posts').update(row).eq('id', id);
  if (error) throw error;
  patchPost(id, row as Partial<Post>);
}

/* ---------- authors, looked up once ---------- */

const people = new Map<string, Promise<Profile | null>>();
// Subscribing, following and the like change these, so forget them whenever a profile changes.
listen('profile', () => people.clear());

export function profileOnce(id: string): Promise<Profile | null> {
  let p = people.get(id);
  if (!p) {
    p = getProfile(id).catch(() => null);
    people.set(id, p);
  }
  return p;
}

/**
 * Whether I may see a post kept for the author's subscribers: true for everyone else's posts, my own
 * posts and creators I subscribe to; false otherwise; null while finding out. (The database only sends
 * such posts to subscribers, so this mostly confirms it; the locked card covers anything else.)
 */
export function useCanSee(post: Pick<Post, 'audience' | 'user_id'> | undefined, me: string): boolean | null {
  const limited = !!post && post.audience === 'subscribers' && post.user_id !== me;
  const [ok, setOk] = useState<boolean | null>(limited ? null : true);
  useEffect(() => {
    if (!limited || !post) {
      setOk(true);
      return;
    }
    let alive = true;
    setOk(null);
    profileOnce(post.user_id).then((p) => alive && setOk(!!p?.subscribed));
    const off = listen('profile', () => profileOnce(post.user_id).then((p) => alive && setOk(!!p?.subscribed)));
    return () => {
      alive = false;
      off();
    };
  }, [limited, post?.user_id]);
  return limited ? ok : true;
}

/* ---------- story rings on post headers ---------- */

let tray: Promise<StoryGroup[]> | null = null;
let trayAt = 0;
const trayListeners = new Set<() => void>();
listen('stories', () => {
  tray = null;
  trayListeners.forEach((l) => l());
});

/** The author's stories, if they have any right now: the ring round their picture opens them. */
export function useStoryGroup(me: string, userId: string): StoryGroup | null {
  const [group, setGroup] = useState<StoryGroup | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const l = () => setTick((t) => t + 1);
    trayListeners.add(l);
    return () => {
      trayListeners.delete(l);
    };
  }, []);
  useEffect(() => {
    let alive = true;
    // One look at the tray serves every card on the screen; it is read again after a minute.
    if (!tray || Date.now() - trayAt > 60e3) {
      trayAt = Date.now();
      tray = fetchStoryTray(me).catch(() => []);
    }
    tray.then((list) => alive && setGroup(list.find((g) => g.user_id === userId && g.stories.length > 0) ?? null));
    return () => {
      alive = false;
    };
  }, [me, userId, tick]);
  return group;
}

/** The ring for an author with stories: green for unseen, blue for close friends, grey once seen. */
export const ringOf = (g: StoryGroup | null): 'new' | 'seen' | 'close' | null => (!g ? null : g.seen ? 'seen' : g.close ? 'close' : 'new');

/* ---------- Your feed: the member's topics and sensitive filter ---------- */

/*
 * The iPhone keeps these beside its "Your feed" settings screen (app/(app)/clips-settings.tsx), which
 * the desktop can't import, so the same rules are written out here. For you and Shorts rank by the
 * topics; Explore keeps to the sensitive filter only, as on the iPhone.
 */

/** What a member has said they want from their feeds. */
export type FeedTaste = { more: string[]; less: string[]; lessSensitive: boolean };

export function tasteOf(p: Profile | null | undefined): FeedTaste {
  return { more: p?.interests_more ?? [], less: p?.interests_less ?? [], lessSensitive: p?.sensitive_filter === 'less' };
}

/** A short string that changes only when the choices do, so a feed knows when to load again. */
export const tasteKey = (t: FeedTaste) => JSON.stringify([t.more, t.less, t.lessSensitive]);

// Spaces and punctuation split words; an apostrophe stays inside one ("children's"). A hashtag is a word too.
const SPLIT = /[\s!-&(-\/:-@\[-`{-~¡«»¿‐-―“”…]+/;

function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .split(SPLIT)
    .map((w) => w.replace(/^'+|'+$/g, ''))
    .filter(Boolean);
}

// "Hymn" and "hymns" count as the same word, so a member doesn't have to guess which one people write.
const same = (a: string, b: string) => a === b || a === b + 's' || b === a + 's';

/** True when the caption has every word of one of the topics, side by side and in order. */
function mentions(caption: string[], topics: string[][]): boolean {
  return topics.some((t) => {
    for (let i = 0; i + t.length <= caption.length; i++) {
      if (t.every((w, j) => same(caption[i + j], w))) return true;
    }
    return false;
  });
}

/**
 * Applies the member's choices to one loaded page of posts. Sensitive posts go when they asked for
 * less of them. With `rank` (For you and Shorts), posts about a "less" topic go too, and posts about a
 * "more" topic move to the top of the page. The member's own posts are never left out, and Sponsored
 * posts the server put first stay first.
 */
export function tuneFeed(posts: Post[], me: string, taste: FeedTaste, rank: boolean): Post[] {
  const more = rank ? taste.more.map(words).filter((t) => t.length) : [];
  const less = rank ? taste.less.map(words).filter((t) => t.length) : [];
  if (!taste.lessSensitive && !more.length && !less.length) return posts;
  const said = new Map<string, string[]>();
  const wordsOf = (p: Post) => {
    let w = said.get(p.id);
    if (!w) said.set(p.id, (w = words(p.caption ?? '')));
    return w;
  };
  const kept = posts.filter((p) => {
    if (p.user_id === me) return true;
    if (taste.lessSensitive && p.sensitive) return false;
    return !(less.length && mentions(wordsOf(p), less));
  });
  if (!more.length) return kept;
  let lead = 0;
  while (lead < kept.length && kept[lead].boosted) lead++;
  const rest = kept.slice(lead);
  const wanted = rest.filter((p) => mentions(wordsOf(p), more));
  if (!wanted.length || wanted.length === rest.length) return kept;
  return [...kept.slice(0, lead), ...wanted, ...rest.filter((p) => !wanted.includes(p))];
}

/* ---------- opening a post from a grid ---------- */

/*
 * As the iPhone's src/lib/grid-open.ts: a photo opens the post dialog, which steps through the grid's
 * posts with its arrows; a Short opens the Shorts player at that Short, with the grid's other Shorts
 * above and below it. `source` says where more of the same come from once the grid's own list runs out.
 */

/** Where a grid's posts come from, so the Shorts player can fetch more of the same. */
export type GridSource =
  | { from: 'user'; userId: string }
  | { from: 'explore' }
  | { from: 'group'; groupId: string }
  /** A fixed list (saved, likes, reposts, tagged): nothing more to fetch. */
  | { from: 'list' };

export const LIST_SOURCE: GridSource = { from: 'list' };

/** A Short opens the Shorts player; anything else opens the post dialog. */
export const isShort = (p: Pick<Post, 'kind'>) => p.kind === 'reel';

/** Whether a grid shows this post to me at all (members under 14 never see sensitive posts). */
export const showsInGrid = (p: Post, me: Pick<Profile, 'id' | 'restricted'>) => !(p.sensitive && p.user_id !== me.id && me.restricted);

/** The ids the post dialog steps through: every post the grid shows, in its order. */
export const gridIds = (posts: Post[], me: Pick<Profile, 'id' | 'restricted'>) => posts.filter((p) => showsInGrid(p, me)).map((p) => p.id);

export type OpenedShorts = { start: string; ids: string[]; source: GridSource };
// The grid a Short was opened from, read back by the Shorts player for that Short (the address only
// carries the Short's id). Opening a Short from a link or after a reload finds nothing here.
let openedShorts: OpenedShorts | null = null;

/** Opens the Shorts player at `post`, with the grid's other Shorts round it. */
export function openShortsFrom(post: Post, grid: Post[], source: GridSource = LIST_SOURCE, me?: Pick<Profile, 'id' | 'restricted'>) {
  const shorts = grid.filter((p) => isShort(p) && (!me || showsInGrid(p, me))).map((p) => p.id);
  if (!shorts.includes(post.id)) shorts.unshift(post.id);
  openedShorts = { start: post.id, ids: shorts, source };
  nav('/shorts/' + post.id);
}

/** The grid that opened the Short `start`, if it was opened from one. */
export function recallShorts(start: string): OpenedShorts | null {
  return openedShorts && openedShorts.start === start ? openedShorts : null;
}

/**
 * The page after `before` (a created_at) from the same place, as the server sent it: the caller keeps
 * only Shorts when `shorts`, and treats an empty page as the end.
 */
export async function fetchMoreLike(source: GridSource, before: string, shorts: boolean): Promise<Post[]> {
  switch (source.from) {
    case 'user':
      return fetchUserPosts(source.userId, before, shorts);
    case 'explore':
      return shorts ? fetchReels(false, before) : fetchExplore(before, 18);
    case 'group':
      return fetchGroupPosts(source.groupId, before);
    default:
      return [];
  }
}

/* ---------- links ---------- */

/** The address of a post in this app, for Copy link. */
export const postLink = (id: string) => location.href.split('#')[0] + '#/p/' + id;

export async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    // older ways below
  }
  const area = document.createElement('textarea');
  area.value = text;
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();
  document.execCommand('copy');
  area.remove();
}
