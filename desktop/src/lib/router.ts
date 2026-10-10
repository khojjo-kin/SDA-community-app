// Paths live after the "#", like #/explore or #/u/grace.mensah, so the app works from a file,
// a local server inside the Mac app, or any web host.
import { useSyncExternalStore } from 'react';

const listeners = new Set<() => void>();
const read = () => {
  const h = location.hash;
  return h.startsWith('#/') ? decodeURI(h.slice(1)) : '/';
};
let current = read();
window.addEventListener('hashchange', () => {
  current = read();
  listeners.forEach((l) => l());
});

export function useRoute(): string {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
  );
}

export function nav(path: string, replace = false) {
  if (path === current) return;
  if (replace) {
    history.replaceState(null, '', '#' + encodeURI(path));
    current = path;
    listeners.forEach((l) => l());
  } else location.hash = encodeURI(path);
}

export function back(fallback = '/') {
  if (history.length > 1) history.back();
  else nav(fallback);
}

/** Splits "/u/grace/saved" into ["u", "grace", "saved"]. */
export const parts = (path: string) => path.split('?')[0].split('/').filter(Boolean);
