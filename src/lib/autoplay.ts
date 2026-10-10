import { useSyncExternalStore } from 'react';

/**
 * Which post's video plays in a scrolling feed. The feed reports the post that is most in view;
 * that post's video plays (muted until tapped) and every other one shows its poster.
 *
 * Sound is one choice for the whole feed, as on Instagram: unmute one video and the next one you
 * scroll to plays with sound too.
 */
let active: string | null = null;
let muted = true;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

/** The feed calls this as the scroll settles: the id of the post most in view, or null. */
export function setActivePost(id: string | null) {
  if (active === id) return;
  active = id;
  emit();
}

export function getActivePost(): string | null {
  return active;
}

/** True while this post is the one in view. */
export function useIsActivePost(id: string): boolean {
  return useSyncExternalStore(subscribe, () => active === id);
}

export function setFeedMuted(next: boolean) {
  if (muted === next) return;
  muted = next;
  emit();
}

export function useFeedMuted(): boolean {
  return useSyncExternalStore(subscribe, () => muted);
}
