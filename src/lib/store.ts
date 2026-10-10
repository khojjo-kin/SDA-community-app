import { useSyncExternalStore } from 'react';
import type { Post } from './types';

// One shared copy of every loaded post, so a like on one screen shows on all of them.
const posts = new Map<string, Post>();
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function putPosts(list: Post[]) {
  if (!list.length) return;
  for (const p of list) posts.set(p.id, p);
  emit();
}

export function patchPost(id: string, patch: Partial<Post>) {
  const cur = posts.get(id);
  if (!cur) return;
  posts.set(id, { ...cur, ...patch });
  emit();
}

export function patchAuthor(userId: string, patch: Partial<Post>) {
  let changed = false;
  posts.forEach((p, id) => {
    if (p.user_id === userId) {
      posts.set(id, { ...p, ...patch });
      changed = true;
    }
  });
  if (changed) emit();
}

export function dropPost(id: string) {
  if (posts.delete(id)) emit();
}

/** Forgets every post: likes, saves and reposts are the viewer's own, so another account starts afresh. */
export function clearPosts() {
  if (!posts.size) return;
  posts.clear();
  emit();
}

export function getPostNow(id: string): Post | undefined {
  return posts.get(id);
}

/**
 * One post, kept up to date. Every change replaces the post's object (never edits it in place), so the
 * snapshot is the object itself: a card draws again only when its own post changed, not when any post
 * anywhere did (a page loading, a like on another card).
 */
export function usePost(id: string): Post | undefined {
  return useSyncExternalStore(subscribe, () => posts.get(id));
}

// A tiny signal other screens can listen to when something they show has changed.
const topics = new Map<string, Set<() => void>>();

export function announce(topic: 'feed' | 'profile' | 'stories' | 'threads' | 'notices') {
  topics.get(topic)?.forEach((l) => l());
}

export function listen(topic: 'feed' | 'profile' | 'stories' | 'threads' | 'notices', fn: () => void) {
  if (!topics.has(topic)) topics.set(topic, new Set());
  topics.get(topic)!.add(fn);
  return () => {
    topics.get(topic)?.delete(fn);
  };
}
