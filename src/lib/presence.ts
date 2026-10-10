import { useEffect } from 'react';
import { AppState } from 'react-native';
import { touchPresence } from './api';

/**
 * Keeps "Active now" true while the app is open: tells the server every minute, and straight away
 * when the app comes back to the front. Nothing is sent while it is in the background, so the green
 * dot goes out a few minutes after the member leaves.
 */
export function usePresence(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      touchPresence();
      if (!timer) timer = setInterval(touchPresence, 60e3);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    if (AppState.currentState === 'active' || AppState.currentState === 'unknown') start();
    const sub = AppState.addEventListener('change', (s) => (s === 'active' ? start() : stop()));
    return () => {
      sub.remove();
      stop();
    };
  }, [enabled]);
}
