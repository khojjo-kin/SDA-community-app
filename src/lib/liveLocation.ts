import { useEffect } from 'react';
import { AppState } from 'react-native';
import * as Location from 'expo-location';
import { amSharingLocation, moveSharedLocation, nearbyHide, nearbyIsOn, nearbyShow } from './api';

/** How often your place is sent while you share and the app is open. */
const SHARE_EVERY_MS = 2 * 60e3;
/** How often your rough place is sent while you show in Nearby and the app is open. */
const NEARBY_EVERY_MS = 5 * 60e3;

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

/* ---------- Nearby ---------- */

/*
 * Nearby keeps only a rough place (the server rounds it to about a kilometre), and showing there is
 * "add or move", so the order of what is sent matters: every change goes through one queue, and a
 * place on its way when Nearby is turned off (or on) is dropped rather than sent after it.
 */
let nearbyLast = 0;
let nearbyGen = 0;
let nearbyFor = '';
let nearbyChain: Promise<unknown> = Promise.resolve();
const nearbyListeners = new Set<() => void>();

function nearbyQueue<T>(op: () => Promise<T>): Promise<T> {
  const run = nearbyChain.then(op, op);
  nearbyChain = run.catch(() => {});
  return run;
}

function nearbyChanged() {
  nearbyListeners.forEach((l) => l());
}

/**
 * Shows me in Nearby at about this place. False when the account can't (Nearby is for members 18
 * and over). The app-wide updater then keeps the place fresh while the app is open.
 */
export function nearbyTurnOn(lat: number, lng: number): Promise<boolean> {
  nearbyGen++;
  return nearbyQueue(async () => {
    const shown = await nearbyShow(lat, lng);
    if (shown) nearbyLast = Date.now();
    nearbyChanged();
    return shown;
  });
}

/** Stops showing me in Nearby, after anything already on its way, and stops the updates. */
export function nearbyTurnOff(): Promise<void> {
  nearbyGen++;
  return nearbyQueue(async () => {
    try {
      await nearbyHide();
    } finally {
      nearbyLast = 0;
      nearbyChanged();
    }
  });
}

/**
 * A fresh rough place, only while I still show in Nearby (it isn't turned back on after being turned
 * off on another phone, or after it lapsed) and only if Nearby wasn't turned on or off since `gen`.
 */
function nearbyMove(lat: number, lng: number, gen: number): Promise<boolean> {
  return nearbyQueue(async () => {
    if (gen !== nearbyGen) return false;
    if (!(await nearbyIsOn())) return false;
    if (gen !== nearbyGen) return false;
    const shown = await nearbyShow(lat, lng);
    if (shown) nearbyLast = Date.now();
    return shown;
  });
}

/** The map opened on Nearby: sends where I am now, unless a place went in the last minute. */
export function nearbyRefresh(lat: number, lng: number): Promise<boolean> {
  if (Date.now() - nearbyLast < 60e3) return Promise.resolve(true);
  return nearbyMove(lat, lng, nearbyGen);
}

/**
 * Keeps a member's rough place in Nearby fresh while they show there: every few minutes while the
 * app is open in front of them. Like live location it never asks for access, never runs in the
 * background, and stops when Nearby is turned off (here, on another phone, or by lapsing).
 */
function useNearbyUpdates(me: string, enabled: boolean) {
  useEffect(() => {
    if (!enabled || !me) return;
    // Another account on this phone: its last place says nothing about this one's.
    if (nearbyFor !== me) {
      nearbyFor = me;
      nearbyLast = 0;
    }
    let timer: ReturnType<typeof setInterval> | null = null;
    let ended = false;
    let sending = false;
    let foreground = AppState.currentState === 'active' || AppState.currentState === 'unknown';
    let gen = 0;

    const stopTimer = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };

    const send = async () => {
      if (ended || !foreground || sending) return;
      sending = true;
      const at = nearbyGen;
      try {
        const perm = await Location.getForegroundPermissionsAsync();
        if (!perm.granted) return;
        // A rough place is all Nearby keeps, so a recent or low-power fix is plenty.
        const spot = (await Location.getLastKnownPositionAsync({ maxAge: 2 * 60e3 })) ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low }));
        if (ended || !foreground) return;
        const shown = await nearbyMove(spot.coords.latitude, spot.coords.longitude, at);
        // Not showing any more (and not because it was just turned on or off here): no more updates until it is.
        if (!shown && at === nearbyGen) stopTimer();
      } catch {
        // No signal or no fix: the next update comes in a few minutes.
      } finally {
        sending = false;
      }
    };

    const start = async () => {
      const mine = ++gen;
      stopTimer();
      if (ended || !foreground) return;
      let on = false;
      try {
        on = await nearbyIsOn();
      } catch {
        return;
      }
      if (mine !== gen || ended || !foreground || !on) return;
      if (Date.now() - nearbyLast > NEARBY_EVERY_MS - 30e3) send();
      timer = setInterval(send, NEARBY_EVERY_MS);
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
    nearbyListeners.add(changed);
    return () => {
      ended = true;
      gen++;
      // Signed out, or moving to another account: a place still waiting in the queue is dropped, so
      // it can't go out as whoever is signed in next.
      nearbyGen++;
      stopTimer();
      sub.remove();
      nearbyListeners.delete(changed);
    };
  }, [me, enabled]);
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
 * It also keeps a member's rough place in Nearby fresh while they show there (useNearbyUpdates).
 */
export function useLiveLocation(me: string, enabled: boolean) {
  useNearbyUpdates(me, enabled);
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
