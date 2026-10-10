import { useSyncExternalStore } from 'react';
import * as SecureStore from 'expo-secure-store';
import type { ThemeName } from './theme';

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
  /** The app's colours: Dark, White or Green (src/lib/theme.ts). */
  theme: ThemeName;
};

const KEY = 'community.prefs';
const DEFAULTS: Prefs = { frontCamera: false, toolsSide: 'right', reelsMuted: false, chatWallpaper: '', appFont: '', theme: 'dark' };

let current: Prefs = DEFAULTS;
let loaded = false;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

/** Reads saved choices once, when the app starts. */
export async function loadPrefs() {
  try {
    const raw = await SecureStore.getItemAsync(KEY);
    if (raw) current = { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    // Keep the defaults if nothing can be read.
  }
  loaded = true;
  emit();
}

/** True once the saved choices have been read (or found missing), so the first screen draws in the right theme. */
export function usePrefsLoaded(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    () => loaded,
  );
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

/**
 * Just the theme. A string, so a component using this draws again only when the theme itself changes,
 * not on every other choice (the root layout uses it: redrawing there redraws the whole app).
 */
export function usePrefTheme(): ThemeName {
  return useSyncExternalStore(subscribeTheme, () => current.theme);
}

// Kept outside the hook so the root layout doesn't unsubscribe and subscribe again on every draw.
function subscribeTheme(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
