import { useCallback, useRef, useSyncExternalStore } from 'react';
import type { ViewabilityConfigCallbackPairs, ViewToken } from 'react-native';
import { useFocusEffect } from 'expo-router';

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

/** The ids among a list's viewable rows (every list here is a list of post ids). */
const idsOf = (items: ViewToken[]) => items.filter((v) => v.isViewable && typeof v.item === 'string').map((v) => v.item as string);

/**
 * The viewability callbacks for a list of post ids whose videos play by themselves, for Home, a
 * grid's posts feed and a post's page. The post at least 60% in view plays, only while the screen
 * is the one showing. A playing post that slips under that line keeps playing until another takes
 * its place or it leaves the screen, so a slow scroll never stops a video and starts it again.
 * `onSeen` hears each post once half of it has been on screen for half a second.
 *
 * Pass the result to the list's `viewabilityConfigCallbackPairs`; it never changes.
 */
export function useFeedAutoplay(onSeen?: (id: string) => void): ViewabilityConfigCallbackPairs {
  const seen = useRef(onSeen);
  seen.current = onSeen;
  const state = useRef({ playing: null as string | null, strong: [] as string[], onScreen: new Set<string>(), focused: false }).current;
  const pairs = useRef<ViewabilityConfigCallbackPairs | null>(null);
  if (!pairs.current) {
    const decide = () => {
      const now = state.playing;
      const next = now && state.strong.includes(now) ? now : state.strong.length ? state.strong[0] : now && state.onScreen.has(now) ? now : null;
      state.playing = next;
      if (state.focused) setActivePost(next);
    };
    pairs.current = [
      { viewabilityConfig: { itemVisiblePercentThreshold: 60 }, onViewableItemsChanged: ({ viewableItems }) => { state.strong = idsOf(viewableItems); decide(); } },
      // Any part on screen: only rows crossing the screen are looked at, so 0 means "still showing".
      { viewabilityConfig: { itemVisiblePercentThreshold: 0 }, onViewableItemsChanged: ({ viewableItems }) => { state.onScreen = new Set(idsOf(viewableItems)); decide(); } },
      ...(onSeen ? [{ viewabilityConfig: { itemVisiblePercentThreshold: 50, minimumViewTime: 500 }, onViewableItemsChanged: ({ viewableItems }: { viewableItems: ViewToken[] }) => { idsOf(viewableItems).forEach((id) => seen.current?.(id)); } }] : []),
    ];
  }
  // Back on this screen, its own post in view plays again; leaving it stops that one, unless the
  // next screen has already chosen its own.
  useFocusEffect(
    useCallback(() => {
      state.focused = true;
      setActivePost(state.playing);
      return () => {
        state.focused = false;
        if (getActivePost() === state.playing) setActivePost(null);
      };
    }, [state]),
  );
  return pairs.current;
}
