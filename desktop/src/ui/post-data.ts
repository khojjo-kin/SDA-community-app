// Small reads and writes for posts that the shared data code (src/lib/api.ts) doesn't have yet.
//
// Changing a post after it is shared (caption, location, alt text, hiding the like count, turning
// commenting off): the database lets authors update their own posts (policy posts_update_own,
// database v9) and checks the new values the same way as a new post (v20's extras guard), so this
// writes the same table with the same rules as the iPhone app would.
import { useEffect, useState } from 'react';
import { fetchStoryTray, getProfile } from 'shared/api';
import { listen, patchPost } from 'shared/store';
import { supabase } from 'shared/supabase';
import type { Media, Post, Profile, StoryGroup } from 'shared/types';

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
