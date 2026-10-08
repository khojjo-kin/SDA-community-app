import { useSyncExternalStore } from 'react';
import type { Post } from './types';

// One shared copy of every loaded post, so a like on one screen shows on all of them.
const posts = new Map<string, Post>();
const listeners = new Set<() => void>();
let version = 0;

function emit() {
  version++;
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

export function getPostNow(id: string): Post | undefined {
  return posts.get(id);
}

export function usePost(id: string): Post | undefined {
  useSyncExternalStore(subscribe, () => version);
  return posts.get(id);
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
