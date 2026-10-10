import { useEffect } from 'react';
import { AppState } from 'react-native';
import * as Location from 'expo-location';
import { amSharingLocation, moveSharedLocation } from './api';

/** How often your place is sent while you share and the app is open. */
const SHARE_EVERY_MS = 2 * 60e3;

/*
 * Kept outside the hook so the map screen can tell it about changes: when the last place went (the
 * map sends one itself when sharing is turned on), the update on its way, and who to tell.
 */
let lastSent = 0;
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();

/**
 * The map turned sharing on or off (or sent a place itself, with `sentNow`): the updater checks again
 * now rather than the next time the app comes to the front.
 */
export function liveLocationChanged(sentNow = false) {
  if (sentNow) lastSent = Date.now();
  listeners.forEach((l) => l());
}

/** The server refuses to store a place for this account (members under 14 can't share). */
function refusal(e: unknown): boolean {
  const err = e as { code?: string; message?: string } | null;
  return String(err?.code ?? '') === '42501' || /row-level security/i.test(String(err?.message ?? ''));
}

/**
 * Keeps a member's live location fresh while they share it: every couple of minutes, wherever they
 * are in the app, as long as it is open in front of them. It only uses location access the member has
 * already given (it never asks, and never asks for background location), stops when the app goes to
 * the background, and stops when sharing is turned off. An update only ever moves a place that is
 * already there, so one that lands after sharing was turned off can't switch it back on.
 */
export function useLiveLocation(me: string, enabled: boolean) {
  useEffect(() => {
    if (!enabled || !me) return;
    let timer: ReturnType<typeof setInterval> | null = null;
    let ended = false;
    // Refused once: not tried again until the app restarts or a different account signs in.
    let refused = false;
    let foreground = AppState.currentState === 'active' || AppState.currentState === 'unknown';
    // Moved on by every start and stop, so a check that answers late can't start updates that should be off.
    let gen = 0;

    const stopTimer = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };

    const send = async () => {
      if (ended || refused || !foreground || inflight) return;
      const work = (async () => {
        const perm = await Location.getForegroundPermissionsAsync();
        // Access was turned off in the phone's settings: nothing is sent, and nothing is asked.
        if (!perm.granted) return;
        const spot = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (ended || !foreground) return;
        const still = await moveSharedLocation(me, { lat: spot.coords.latitude, lng: spot.coords.longitude, accuracy: spot.coords.accuracy });
        if (still) lastSent = Date.now();
        // No place to move: sharing was turned off (on another phone, say). Stop until it is turned on again.
        else stopTimer();
      })();
      inflight = work;
      try {
        await work;
      } catch (e) {
        if (refusal(e)) {
          refused = true;
          stopTimer();
        }
        // Anything else (no signal, no fix) is fine: the next update comes in two minutes.
      } finally {
        inflight = null;
      }
    };

    const start = async () => {
      const mine = ++gen;
      stopTimer();
      if (ended || refused || !foreground) return;
      let sharing = false;
      try {
        sharing = await amSharingLocation(me);
      } catch {
        // Not reachable now: checked again the next time the app comes to the front.
        return;
      }
      if (mine !== gen || ended || !foreground || !sharing) return;
      // An update now if the last one is over a minute old, then every two minutes.
      if (Date.now() - lastSent > 60e3) send();
      timer = setInterval(send, SHARE_EVERY_MS);
    };

    if (foreground) start();
    const sub = AppState.addEventListener('change', (s) => {
      const next = s === 'active';
      if (next === foreground) return;
      foreground = next;
      if (next) start();
      else {
        gen++;
        stopTimer();
      }
    });
    const changed = () => { start(); };
    listeners.add(changed);
    return () => {
      ended = true;
      gen++;
      stopTimer();
      sub.remove();
      listeners.delete(changed);
    };
  }, [me, enabled]);
}
