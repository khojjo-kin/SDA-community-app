// Dark or White, as in the iPhone app (Settings → Appearance there; More → Switch appearance here).
// Kept on this computer. Photos, video, stories, Shorts, calls and live stay dark in both.
import { useSyncExternalStore } from 'react';

export type Appearance = 'dark' | 'white';
const KEY = 'community.appearance';
const listeners = new Set<() => void>();

function read(): Appearance {
  try {
    return localStorage.getItem(KEY) === 'white' ? 'white' : 'dark';
  } catch {
    return 'dark';
  }
}

let current: Appearance = read();

export function applyAppearance(a: Appearance = current) {
  current = a;
  document.documentElement.dataset.theme = a;
  document.querySelector('meta[name="color-scheme"]')?.setAttribute('content', a === 'white' ? 'light' : 'dark');
}

export function setAppearance(a: Appearance) {
  try {
    localStorage.setItem(KEY, a);
  } catch {
    // Private window: it lasts until the app closes.
  }
  applyAppearance(a);
  listeners.forEach((l) => l());
}

export function useAppearance(): Appearance {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
  );
}
