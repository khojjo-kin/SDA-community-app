import { useSyncExternalStore } from 'react';
import * as SecureStore from 'expo-secure-store';

/** Small choices that stay on this phone. */
export type Prefs = {
  /** Open the camera on the front (selfie) lens. */
  frontCamera: boolean;
  /** Which side of the story editor the tools sit on. */
  toolsSide: 'left' | 'right';
  /** Start reels with the sound off. */
  reelsMuted: boolean;
  /** Plus: the look behind every chat. '' is the plain dark background; see src/lib/wallpapers.ts for the others. */
  chatWallpaper: string;
  /** Plus: the app's text face. '' is the system font; see src/lib/fonts.ts for the others. */
  appFont: string;
};

const KEY = 'community.prefs';
const DEFAULTS: Prefs = { frontCamera: false, toolsSide: 'right', reelsMuted: false, chatWallpaper: '', appFont: '' };

let current: Prefs = DEFAULTS;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

/** Reads saved choices once, when the app starts. */
export async function loadPrefs() {
  try {
    const raw = await SecureStore.getItemAsync(KEY);
    if (raw) {
      current = { ...DEFAULTS, ...JSON.parse(raw) };
      emit();
    }
  } catch {
    // Keep the defaults if nothing can be read.
  }
}

export function getPrefs(): Prefs {
  return current;
}

export function setPrefs(patch: Partial<Prefs>) {
  current = { ...current, ...patch };
  emit();
  SecureStore.setItemAsync(KEY, JSON.stringify(current)).catch(() => {});
}

export function usePrefs(): Prefs {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    () => current,
  );
}
