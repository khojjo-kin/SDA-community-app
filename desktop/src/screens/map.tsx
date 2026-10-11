// The map (/map), from the iPhone app (app/(app)/map.tsx), in four layers chosen at the top of the
// list beside it (/map?layer=nearby, churches or events opens on that one):
//
// Friends: people who share where they are with you, as faces on the map with a list beside it, and
// sharing your own place. Sharing is always a choice (off until turned on here), seen only by mutual
// followers or your close friends, never open to members under 14, and the server stops showing a
// place 24 hours after its last update. While you share, your place is sent again every couple of
// minutes whenever Community is open on this computer (useLiveLocation below, kept running on every
// page by the Messages button in the corner).
//
// Nearby: adults (18 and over) who chose to show there, at a rough place (rounded by the server to
// about a kilometre, never exact). You only see others while you show yourself; while you do, your
// rough place is sent again every few minutes while Community is open, and it lapses after a day.
//
// Churches and Events: approved churches and upcoming events that have a place on the map.
//
// The map is drawn without a map library: OpenStreetMap's tiles placed with the Web Mercator sums,
// dragged to pan, scrolled (or pinched) to zoom. If the tiles can't load (offline), the pins and the
// list still show, over a plain grid. MapCanvas and MiniMap are also used by the event screens.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { amSharingLocation, distanceKm, fetchChurches, fetchFriendLocations, fetchMapEvents, fetchNearbyPeople, moveSharedLocation, nearbyHide, nearbyIsOn, nearbyShow, openThread, shareLocation, stopSharingLocation } from 'shared/api';
import { errText, fmt } from 'shared/theme';
import type { Church, EventCard, FriendLocation, NearbyPerson } from 'shared/types';
import { t, tn } from '../lib/i18n';
import { useMe } from '../lib/me';
import { nav, useRoute } from '../lib/router';
import { shortAgo } from '../ui/chat-bits';
import { Avatar, Icon, Link, Modal, Spinner, Verified, toast } from '../ui/kit';
import { placeOf } from './church-parts';
import { DateBlock, dayHeading, eventState, kmText, stateWords, timeOf } from './event-parts';
import '../styles/map.css';

/* ---------- keeping your shared place fresh (the iPhone's src/lib/liveLocation.ts) ---------- */

/** How often your place is sent while you share and Community is open in front of you. */
const SHARE_EVERY_MS = 2 * 60e3;
/** How often your rough place is sent while you show in Nearby and Community is open. */
const NEARBY_EVERY_MS = 5 * 60e3;

// Kept outside the hook so the map can tell it about changes: when the last place went, the update on
// its way, and who to tell.
let lastSent = 0;
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();

/** Sharing was turned on or off here (or a place just sent, `sentNow`): the updater checks again now. */
function liveLocationChanged(sentNow = false) {
  if (sentNow) lastSent = Date.now();
  listeners.forEach((l) => l());
}

/** The server refuses to store a place for this account (members under 14 can't share). */
function refusal(e: unknown): boolean {
  const err = e as { code?: string; message?: string } | null;
  return String(err?.code ?? '') === '42501' || /row-level security/i.test(String(err?.message ?? ''));
}

/** Whether location access is already allowed. Never asks. */
async function locationAllowed(): Promise<boolean> {
  try {
    const p = await navigator.permissions?.query({ name: 'geolocation' as PermissionName });
    return p?.state === 'granted';
  } catch {
    return false;
  }
}

/** 'granted', 'denied' or 'prompt' (asking would show the browser's question), as far as this computer says. */
async function locationState(): Promise<PermissionState | 'unknown'> {
  try {
    return (await navigator.permissions?.query({ name: 'geolocation' as PermissionName }))?.state ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

/** Where this computer is (asking for access the first time). */
function whereAmI(maxAge = 60e3): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject({ code: 2, message: "This computer can't find its location." });
    navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: false, timeout: 20000, maximumAge: maxAge });
  });
}

/** Puts a location problem into words. */
function placeProblem(e: unknown): string {
  const code = (e as { code?: unknown } | null)?.code;
  if (code === 1) return t('d.messages.locationDenied');
  if (code === 2) return t('d.messages.locationNotFound');
  if (code === 3) return t('d.messages.locationSlow');
  return errText(e);
}

/* ---------- Nearby's own updates (the iPhone's nearbyTurnOn, nearbyTurnOff and useNearbyUpdates) ---------- */

// Showing in Nearby is "add or move", so the order of what is sent matters: every change goes through
// one queue, and a place on its way when Nearby is turned off (or on) is dropped rather than sent after it.
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

/** Shows me in Nearby at about this place. False when the account can't (Nearby is for members 18 and over). */
function nearbyTurnOn(lat: number, lng: number): Promise<boolean> {
  nearbyGen++;
  return nearbyQueue(async () => {
    const shown = await nearbyShow(lat, lng);
    if (shown) nearbyLast = Date.now();
    nearbyListeners.forEach((l) => l());
    return shown;
  });
}

/** Stops showing me in Nearby, after anything already on its way, and stops the updates. */
function nearbyTurnOff(): Promise<void> {
  nearbyGen++;
  return nearbyQueue(async () => {
    try {
      await nearbyHide();
    } finally {
      nearbyLast = 0;
      nearbyListeners.forEach((l) => l());
    }
  });
}

/** A fresh rough place, only while I still show in Nearby and only if it wasn't turned on or off since `gen`. */
function nearbyMove(lat: number, lng: number, gen: number): Promise<boolean> {
  return nearbyQueue(async () => {
    if (gen !== nearbyGen || !(await nearbyIsOn()) || gen !== nearbyGen) return false;
    const shown = await nearbyShow(lat, lng);
    if (shown) nearbyLast = Date.now();
    return shown;
  });
}

/** The map opened on Nearby: sends where I am now, unless a place went in the last minute. */
function nearbyRefresh(lat: number, lng: number): Promise<boolean> {
  if (Date.now() - nearbyLast < 60e3) return Promise.resolve(true);
  return nearbyMove(lat, lng, nearbyGen);
}

/** Keeps the rough place in Nearby fresh while you show there: every few minutes while Community is in front of you. */
function useNearbyUpdates(me: string, enabled: boolean) {
  useEffect(() => {
    if (!enabled || !me) return;
    // Another account on this computer: its last place says nothing about this one's.
    if (nearbyFor !== me) {
      nearbyFor = me;
      nearbyLast = 0;
    }
    let timer: ReturnType<typeof setInterval> | null = null;
    let ended = false;
    let sending = false;
    let gen = 0;
    const front = () => !document.hidden;
    const stopTimer = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    const send = async () => {
      if (ended || !front() || sending) return;
      sending = true;
      const at = nearbyGen;
      try {
        if (!(await locationAllowed())) return;
        const spot = await whereAmI(2 * 60e3);
        if (ended || !front()) return;
        const shown = await nearbyMove(spot.coords.latitude, spot.coords.longitude, at);
        // Not showing any more (and not because it was just turned on or off here): no more updates until it is.
        if (!shown && at === nearbyGen) stopTimer();
      } catch {
        // No fix or no connection: the next update comes in a few minutes.
      } finally {
        sending = false;
      }
    };
    const start = async () => {
      const mine = ++gen;
      stopTimer();
      if (ended || !front()) return;
      let on = false;
      try {
        on = await nearbyIsOn();
      } catch {
        return;
      }
      if (mine !== gen || ended || !front() || !on) return;
      if (Date.now() - nearbyLast > NEARBY_EVERY_MS - 30e3) send();
      timer = setInterval(send, NEARBY_EVERY_MS);
    };
    const visibility = () => {
      if (front()) start();
      else {
        gen++;
        stopTimer();
      }
    };
    const changed = () => void start();
    if (front()) start();
    document.addEventListener('visibilitychange', visibility);
    nearbyListeners.add(changed);
    return () => {
      ended = true;
      gen++;
      // Signed out, or another account: a place still waiting in the queue is dropped.
      nearbyGen++;
      stopTimer();
      document.removeEventListener('visibilitychange', visibility);
      nearbyListeners.delete(changed);
    };
  }, [me, enabled]);
}

/**
 * Keeps a member's shared place fresh while they share: every couple of minutes, on whatever page,
 * while Community is in front of them. It only uses location access already given (it never asks),
 * stops while the window is hidden, and stops when sharing is turned off. An update only ever moves a
 * place that is already there, so one landing after sharing was turned off can't switch it back on.
 * It also keeps a member's rough place in Nearby fresh while they show there (useNearbyUpdates).
 */
export function useLiveLocation(me: string, enabled: boolean) {
  useNearbyUpdates(me, enabled);
  useEffect(() => {
    if (!enabled || !me) return;
    let timer: ReturnType<typeof setInterval> | null = null;
    let ended = false;
    // Refused once: not tried again until the app restarts or another account signs in.
    let refused = false;
    // Moved on by every start and stop, so a check that answers late can't start updates that should be off.
    let gen = 0;
    const front = () => !document.hidden;
    const stopTimer = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    const send = async () => {
      if (ended || refused || !front() || inflight) return;
      const work = (async () => {
        // Access was turned off since: nothing is sent, and nothing is asked.
        if (!(await locationAllowed())) return;
        const spot = await whereAmI();
        if (ended || !front()) return;
        const still = await moveSharedLocation(me, { lat: spot.coords.latitude, lng: spot.coords.longitude, accuracy: spot.coords.accuracy });
        if (still) lastSent = Date.now();
        // No place to move: sharing was turned off (on the iPhone, say). Stop until it is turned on again.
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
        // Anything else (no fix, no connection) is fine: the next update comes in two minutes.
      } finally {
        inflight = null;
      }
    };
    const start = async () => {
      const mine = ++gen;
      stopTimer();
      if (ended || refused || !front()) return;
      let sharing = false;
      try {
        sharing = await amSharingLocation(me);
      } catch {
        return; // checked again when the window next comes to the front
      }
      if (mine !== gen || ended || !front() || !sharing) return;
      // An update now if the last one is over a minute old, then every two minutes.
      if (Date.now() - lastSent > 60e3) send();
      timer = setInterval(send, SHARE_EVERY_MS);
    };
    const visibility = () => {
      if (front()) start();
      else {
        gen++;
        stopTimer();
      }
    };
    const changed = () => void start();
    if (front()) start();
    document.addEventListener('visibilitychange', visibility);
    listeners.add(changed);
    return () => {
      ended = true;
      gen++;
      stopTimer();
      document.removeEventListener('visibilitychange', visibility);
      listeners.delete(changed);
    };
  }, [me, enabled]);
}

/* ---------- the map's sums: Web Mercator, 256-pixel tiles ---------- */

const TILE = 256;
const MIN_Z = 2;
const MAX_Z = 18;
const MAX_LAT = 85.0511;
const tileUrl = (z: number, x: number, y: number) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;

export type MapView = { lat: number; lng: number; z: number };
type Point = { lat: number; lng: number };
/** Before anything is on the map: the whole world. */
const WORLD: MapView = { lat: 20, lng: 10, z: 2 };

export const clampZ = (z: number) => Math.min(MAX_Z, Math.max(MIN_Z, z));
const clampLat = (lat: number) => Math.min(MAX_LAT, Math.max(-MAX_LAT, lat));
const wrapLng = (lng: number) => ((((lng + 180) % 360) + 360) % 360) - 180;
/** A place's position in pixels on the whole world drawn at zoom z. */
const worldX = (lng: number, z: number) => ((lng + 180) / 360) * TILE * 2 ** z;
const worldY = (lat: number, z: number) => {
  const s = Math.sin((clampLat(lat) * Math.PI) / 180);
  return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * TILE * 2 ** z;
};
/** And back: the place at a pixel. */
const placeAt = (x: number, y: number, z: number) => {
  const size = TILE * 2 ** z;
  const n = Math.PI - (2 * Math.PI * y) / size;
  return { lat: (180 / Math.PI) * Math.atan(Math.sinh(n)), lng: (x / size) * 360 - 180 };
};

/** The view that shows every place, with room around the edges for the controls and the card. */
export function viewOf(points: Point[], w: number, h: number, maxZ = 15): MapView {
  if (!points.length || !w || !h) return WORLD;
  if (points.length === 1) return { lat: points[0].lat, lng: points[0].lng, z: Math.min(13, maxZ) };
  const xs = points.map((p) => worldX(p.lng, 0));
  const ys = points.map((p) => worldY(p.lat, 0));
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const fitW = Math.max(80, w - 240);
  const fitH = Math.max(80, h - 300);
  const z = Math.log2(Math.min(fitW / Math.max(x1 - x0, 1e-9), fitH / Math.max(y1 - y0, 1e-9)));
  const c = placeAt((x0 + x1) / 2, (y0 + y1) / 2, 0);
  // A whole zoom level, so the map's tiles are drawn sharp.
  return { lat: c.lat, lng: c.lng, z: clampZ(Math.min(maxZ, Math.floor(z))) };
}

/** How far from the middle of the map its corners are, in kilometres. */
function viewRadiusKm(v: MapView, w: number, h: number): number {
  const metresPerPixel = (156543.03 * Math.cos((v.lat * Math.PI) / 180)) / 2 ** v.z;
  return (Math.hypot(w, h) / 2) * metresPerPixel / 1000;
}

/** The tiles that cover a view `w` × `h` (from the nearest whole zoom, stretched for the fraction in between), and the grid under them. */
function tilesFor(view: MapView, w: number, h: number) {
  const tz = Math.max(0, Math.min(19, Math.round(view.z)));
  const scale = 2 ** (view.z - tz);
  const n = 2 ** tz;
  const cx = worldX(view.lng, tz);
  const cy = worldY(view.lat, tz);
  const tiles: { key: string; url: string; left: number; top: number }[] = [];
  if (w && h) {
    const x0 = Math.floor((cx - w / 2 / scale) / TILE);
    const x1 = Math.floor((cx + w / 2 / scale) / TILE);
    const y0 = Math.max(0, Math.floor((cy - h / 2 / scale) / TILE));
    const y1 = Math.min(n - 1, Math.floor((cy + h / 2 / scale) / TILE));
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        tiles.push({ key: `${tz}/${tx}/${ty}`, url: tileUrl(tz, ((tx % n) + n) % n, ty), left: w / 2 + (tx * TILE - cx) * scale, top: h / 2 + (ty * TILE - cy) * scale });
      }
    }
  }
  // The grid under the tiles moves with the map, so it still feels like one when the tiles are missing.
  const grid = 64 * scale;
  return {
    tiles,
    size: TILE * scale,
    gridStyle: { backgroundSize: `${grid}px ${grid}px`, backgroundPosition: `${(((w / 2 - cx * scale) % grid) + grid) % grid}px ${(((h / 2 - cy * scale) % grid) + grid) % grid}px` },
  };
}

function Tiles({ list, size }: { list: { key: string; url: string; left: number; top: number }[]; size: number }) {
  return (
    <div className="mx-map-tiles" aria-hidden="true">
      {list.map((tile) => (
        <img
          key={tile.key}
          src={tile.url}
          alt=""
          draggable={false}
          style={{ left: tile.left, top: tile.top, width: size + 0.5, height: size + 0.5 }}
          onLoad={(e) => e.currentTarget.classList.add('in')}
          onError={(e) => e.currentTarget.classList.add('gone')}
        />
      ))}
    </div>
  );
}

/** Something drawn on the map: where it is, and a key. `spread` items at the same rough place are set round it. */
export type MapPoint = { id: string; lat: number; lng: number; spread?: boolean };

/**
 * Where each point goes on screen, taking the nearest copy of the world when the map is wider than
 * it. Points marked `spread` that share a rounded place (people in Nearby, events in one hall) are
 * set out in rings round it, a pin's width apart, in a fixed order so a refresh doesn't shuffle them.
 */
function placePoints<T extends MapPoint>(points: readonly T[], view: MapView, w: number, h: number): { p: T; left: number; top: number }[] {
  const zx = worldX(view.lng, view.z);
  const zy = worldY(view.lat, view.z);
  const worldW = TILE * 2 ** view.z;
  const out = points.map((p) => {
    let dx = worldX(p.lng, view.z) - zx;
    dx = ((((dx + worldW / 2) % worldW) + worldW) % worldW) - worldW / 2;
    return { p, left: w / 2 + dx, top: h / 2 + worldY(p.lat, view.z) - zy };
  });
  const groups = new Map<string, typeof out>();
  for (const o of out) {
    if (!o.p.spread) continue;
    const key = `${o.p.lat.toFixed(3)},${o.p.lng.toFixed(3)}`;
    groups.set(key, [...(groups.get(key) ?? []), o]);
  }
  groups.forEach((group) => {
    if (group.length < 2) return;
    const sorted = [...group].sort((a, b) => (a.p.id < b.p.id ? -1 : 1));
    let i = 0;
    for (let ring = 1; i < sorted.length; ring++) {
      const r = 46 * ring;
      const n = Math.min(Math.max(3, Math.floor((2 * Math.PI * r) / 58)), sorted.length - i);
      for (let j = 0; j < n; j++, i++) {
        const a = -Math.PI / 2 + (2 * Math.PI * j) / n + (ring % 2 ? 0 : Math.PI / n);
        sorted[i].left += r * Math.cos(a);
        sorted[i].top += r * Math.sin(a);
      }
    }
  });
  return out.filter((o) => o.left > -80 && o.left < w + 80 && o.top > -80 && o.top < h + 80);
}

/* ---------- the page ---------- */

/** How often friends' places (and people in Nearby) are fetched again while the map is open. */
const REFRESH_MS = 60e3;
/** Churches and events are fetched again on coming back to their layer after this long. */
const STALE_MS = 3 * 60e3;

type Layer = 'friends' | 'nearby' | 'churches' | 'events';
const LAYERS: readonly { key: Layer; label: string }[] = [
  { key: 'friends', label: 'map.friends' },
  { key: 'nearby', label: 'map.nearby' },
  { key: 'churches', label: 'map.churches' },
  { key: 'events', label: 'map.events' },
];
const isLayer = (s: unknown): s is Layer => s === 'friends' || s === 'nearby' || s === 'churches' || s === 'events';

/** Why Nearby can't go on (or show anyone): under 18, location access off, not asked yet, or no fix. */
type NearbyNote = '' | 'adult' | 'ask' | 'settings' | 'nofix';
/** A church or event with where it is, and how far from you when that's known. */
type Entry<T> = { item: T; pos: Point; km: number | null };

/** Who can see your place. `label` and `sub` are the keys of their words. */
const AUDIENCES: { value: FriendLocation['audience']; label: string; sub: string; icon: 'people' | 'star' }[] = [
  { value: 'mutuals', label: 'noteNew.friendsSub', sub: 'd.messages.mutualsSub', icon: 'people' },
  { value: 'close_friends', label: 'noteNew.closeFriends', sub: 'd.messages.closeFriendsSub', icon: 'star' },
];

function firstName(l: { full_name: string; username: string }): string {
  return (l.full_name || '').trim().split(/\s+/)[0] || l.username;
}

/** "Updated just now", "Updated 5m ago", "Updated 3h ago"; `mid` for the middle of a line ("updated 5m ago"). */
function updatedLabel(iso: string, mid = false): string {
  const fresh = Date.now() - new Date(iso).getTime() < 60e3;
  if (fresh) return t(mid ? 'd.messages.updatedNowLower' : 'd.messages.updatedNow');
  return t(mid ? 'd.messages.updatedAgoLower' : 'd.messages.updatedAgo', { time: shortAgo(iso) });
}

/** Someone in Nearby, whose place is only known roughly: "About 2 km away" (never closer than 1). */
const roughAway = (km: number) => t('map.aboutKm', { n: Math.max(1, Math.round(km)) });

/** "Happening now", "Today · 18:30", "Sat 18 Oct · 10:00". */
function eventWhen(e: EventCard): string {
  const s = eventState(e);
  if (s !== 'soon') return s === 'now' ? t('map.happeningNow') : stateWords(s);
  const start = new Date(e.starts_at);
  return `${dayHeading(start)} · ${timeOf(start)}`;
}

/** Nearest first when you know where you are (then by `tie`); as given otherwise. */
function nearestFirst<T>(list: Entry<T>[], tie: (a: T, b: T) => number): Entry<T>[] {
  return [...list].sort((a, b) => (a.km !== null && b.km !== null ? a.km - b.km : 0) || tie(a.item, b.item));
}

/** The way to a place in the computer's maps (Apple Maps on a Mac, its website elsewhere). */
const directionsTo = (p: Point, name: string) => `https://maps.apple.com/?daddr=${p.lat},${p.lng}&q=${encodeURIComponent(name)}`;

export function FriendsMap() {
  const { me } = useMe();
  const route = useRoute();
  const asked = new URLSearchParams(route.split('?')[1] ?? '').get('layer');
  const [layer, setLayer] = useState<Layer>(() => (isLayer(asked) ? asked : 'friends'));
  const layerRef = useRef(layer);
  layerRef.current = layer;

  const [locs, setLocs] = useState<FriendLocation[] | null>(null);
  const [error, setError] = useState('');
  const [chosen, setChosen] = useState<string | null>(null);
  const [settings, setSettings] = useState(false);
  const [audience, setAudience] = useState<FriendLocation['audience']>('mutuals');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [opening, setOpening] = useState(false);
  const [view, setView] = useState<MapView>(WORLD);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const alive = useRef(true);
  const fitted = useRef(false);
  // Once you pick an audience here, a refresh doesn't put back the one saved before.
  const audienceTouched = useRef(false);
  // Moved on when sharing is turned off, so a refresh asked before then can't show your old place as still shared.
  const shareGen = useRef(0);
  const viewRef = useRef(view);
  viewRef.current = view;
  const sizeRef = useRef(size);
  sizeRef.current = size;
  const anim = useRef(0);

  const restricted = !!me.restricted;
  const mine = locs?.find((l) => l.mine) ?? null;
  const sharing = !!mine;
  const friends = useMemo(() => (locs ?? []).filter((l) => !l.mine), [locs]);
  const picked = chosen ? (locs ?? []).find((l) => l.user_id === chosen) ?? null : null;

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      anim.current++;
    };
  }, []);

  const load = useCallback(async () => {
    const gen = shareGen.current;
    try {
      let list = await fetchFriendLocations();
      if (!alive.current) return;
      // Asked before you stopped sharing: your old place in this answer is out of date.
      if (gen !== shareGen.current) list = list.filter((l) => !l.mine);
      setLocs(list);
      setError('');
      const own = list.find((l) => l.mine);
      if (own && !audienceTouched.current) setAudience(own.audience);
    } catch (e) {
      if (!alive.current) return;
      setError(errText(e));
      setLocs((cur) => cur ?? []);
    }
  }, []);

  // While Friends is shown: now, then every minute.
  useEffect(() => {
    if (layer !== 'friends') return;
    load();
    const timer = setInterval(() => !document.hidden && load(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [load, layer]);

  /** Glides the map to a view. Dragging or scrolling stops it. */
  const flyTo = useCallback((to: MapView) => {
    const from = viewRef.current;
    const id = ++anim.current;
    const t0 = performance.now();
    const step = (now: number) => {
      if (id !== anim.current) return;
      const k = Math.min(1, (now - t0) / 320);
      const e = 1 - (1 - k) ** 3;
      setView({ lat: from.lat + (to.lat - from.lat) * e, lng: from.lng + (to.lng - from.lng) * e, z: from.z + (to.z - from.z) * e });
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, []);

  const showEveryone = useCallback(() => flyTo(viewOf(locs ?? [], sizeRef.current.w, sizeRef.current.h)), [locs, flyTo]);

  // Whether anyone is on the map yet (read by the late answer below, so it doesn't move a framed map).
  const locsSeen = useRef(false);
  locsSeen.current = !!locs?.length;

  // The first time there is someone to show (and the map has its size), frame everyone. Later
  // refreshes leave the view alone. With nobody yet, start near you if location access is already
  // on; once someone appears, they are framed.
  const centred = useRef(false);
  useEffect(() => {
    if (layer !== 'friends' || !locs || !size.w || fitted.current) return;
    if (locs.length) {
      fitted.current = true;
      setView(viewOf(locs, size.w, size.h));
      return;
    }
    if (centred.current) return;
    centred.current = true;
    locationAllowed().then((ok) => {
      if (!ok) return;
      whereAmI(10 * 60e3).then((spot) => {
        if (alive.current && !locsSeen.current && layerRef.current === 'friends') flyTo({ lat: spot.coords.latitude, lng: spot.coords.longitude, z: 11 });
      }, () => {});
    });
  }, [locs, size.w, layer]);

  async function turnOn() {
    if (busy || restricted) return;
    setBusy(true);
    setProblem('');
    try {
      const spot = await whereAmI();
      if (!alive.current) return;
      await shareLocation(me.id, { lat: spot.coords.latitude, lng: spot.coords.longitude, accuracy: spot.coords.accuracy, audience });
      // The updater takes it from here, every couple of minutes while Community is open.
      liveLocationChanged(true);
      // With nobody else on the map, go to where you are, so you see your own face appear.
      if (!friends.length) {
        fitted.current = true;
        flyTo({ lat: spot.coords.latitude, lng: spot.coords.longitude, z: 13 });
      }
      toast(t(audience === 'close_friends' ? 'd.messages.sharingClose' : 'd.messages.sharingMutuals'));
      await load();
    } catch (e) {
      if (alive.current) setProblem(placeProblem(e));
    } finally {
      if (alive.current) setBusy(false);
    }
  }

  async function turnOff() {
    if (busy) return;
    setBusy(true);
    setProblem('');
    // The updater only ever moves a place that is there, so one on its way can't share you again.
    shareGen.current++;
    try {
      await stopSharingLocation(me.id);
      shareGen.current++;
      liveLocationChanged();
      if (!alive.current) return;
      setLocs((cur) => (cur ? cur.filter((l) => !l.mine) : cur));
      if (chosen === me.id) setChosen(null);
      toast(t('d.messages.sharingOff'));
      load();
    } catch (e) {
      if (alive.current) setProblem(errText(e));
    } finally {
      if (alive.current) setBusy(false);
    }
  }

  async function chooseAudience(next: FriendLocation['audience']) {
    audienceTouched.current = true;
    setAudience(next);
    // Already sharing: the new choice applies straight away, at the place last sent.
    if (!mine || mine.audience === next) return;
    try {
      await shareLocation(me.id, { lat: mine.lat, lng: mine.lng, accuracy: mine.accuracy, audience: next });
      toast(t(next === 'close_friends' ? 'd.messages.nowClose' : 'd.messages.nowMutuals'));
      load();
    } catch (e) {
      setProblem(errText(e));
    }
  }

  async function message(userId: string) {
    if (opening) return;
    setOpening(true);
    try {
      nav('/direct/t/' + (await openThread(userId)));
    } catch (e) {
      toast(errText(e));
      if (alive.current) setOpening(false);
    }
  }

  /** Chooses someone from the list: the map glides to them and their card opens. */
  const focus = (l: FriendLocation) => {
    setChosen(l.user_id);
    flyTo({ lat: l.lat, lng: l.lng, z: Math.max(viewRef.current.z, 13) });
  };

  const openSettings = () => {
    setProblem('');
    setSettings(true);
  };
  const audienceName = t((mine?.audience ?? audience) === 'close_friends' ? 'd.messages.closeFriendsLower' : 'd.messages.mutualsLower');
  const statusSub =
    locs === null
      ? t('d.messages.lookingForFriends')
      : error
        ? t('d.messages.placesFailed')
        : (sharing ? t('d.messages.withWho', { who: audienceName }) + ' ' : '') + (friends.length ? tn('d.messages.friendsSharing', friends.length) : t('d.messages.noFriendsSharing'));

  /* ---------- where you are (Nearby, Churches, Events) ---------- */

  const [here, setHereState] = useState<Point | null>(null);
  const hereRef = useRef<Point | null>(null);
  const hereAt = useRef(0);
  // Whether we have tried to find where you are on this layer (found or not), so framing can go ahead.
  const [located, setLocated] = useState(false);
  const [centring, setCentring] = useState(false);
  const setHere = useCallback((p: Point) => {
    hereAt.current = Date.now();
    const cur = hereRef.current;
    // Small moves aren't worth drawing everything again for.
    if (cur && distanceKm(cur, p) < 0.05) return;
    hereRef.current = p;
    setHereState(p);
  }, []);

  /** Where you are, only if location access is already on (nothing is asked for this); a recent place will do. */
  const findMe = useRef<Promise<Point | null> | null>(null);
  const whereQuietly = useCallback((): Promise<Point | null> => {
    if (hereRef.current && Date.now() - hereAt.current < 2 * 60e3) return Promise.resolve(hereRef.current);
    if (findMe.current) return findMe.current;
    const job = (async () => {
      try {
        if (!(await locationAllowed())) return null;
        const spot = await whereAmI(2 * 60e3);
        const p = { lat: spot.coords.latitude, lng: spot.coords.longitude };
        if (alive.current) setHere(p);
        return p;
      } catch {
        return null;
      } finally {
        findMe.current = null;
      }
    })();
    findMe.current = job;
    return job;
  }, [setHere]);

  /** "Go to my location": asks for access if need be. */
  async function centreOnMe() {
    if (centring) return;
    setCentring(true);
    try {
      const spot = await whereAmI();
      if (!alive.current) return;
      const p = { lat: spot.coords.latitude, lng: spot.coords.longitude };
      setHere(p);
      flyTo({ ...p, z: Math.min(Math.max(viewRef.current.z, 12), 15) });
    } catch (e) {
      if (alive.current) toast((e as { code?: number })?.code === 1 ? t('map.locationOff') : t('map.noFix'));
    } finally {
      if (alive.current) setCentring(false);
    }
  }

  /* ---------- churches and events ---------- */

  const [churches, setChurches] = useState<Church[] | null>(null);
  const [churchError, setChurchError] = useState('');
  const churchesAt = useRef(0);
  const [events, setEvents] = useState<EventCard[] | null>(null);
  const [eventError, setEventError] = useState('');
  const eventsAt = useRef(0);

  const loadChurches = useCallback(async () => {
    churchesAt.current = Date.now();
    try {
      const all = await fetchChurches();
      if (!alive.current) return;
      setChurches(all.filter((c) => c.status === 'approved' && c.lat !== null && c.lng !== null));
      setChurchError('');
    } catch (e) {
      churchesAt.current = 0;
      if (!alive.current) return;
      setChurchError(errText(e));
      // A refresh that fails keeps what is on the map.
      setChurches((cur) => cur ?? []);
    }
  }, []);

  const loadEvents = useCallback(async () => {
    eventsAt.current = Date.now();
    try {
      const list = await fetchMapEvents();
      if (!alive.current) return;
      setEvents(list.filter((e) => e.lat !== null && e.lng !== null));
      setEventError('');
    } catch (e) {
      eventsAt.current = 0;
      if (!alive.current) return;
      setEventError(errText(e));
      setEvents((cur) => cur ?? []);
    }
  }, []);

  /* ---------- Nearby ---------- */

  const [nearbyOn, setNearbyOn] = useState<boolean | null>(null);
  const [people, setPeople] = useState<NearbyPerson[] | null>(null);
  const [peopleError, setPeopleError] = useState('');
  const [nearbyBusy, setNearbyBusy] = useState(false);
  const nearbyBusyRef = useRef(false);
  const [nearbyNote, setNearbyNote] = useState<NearbyNote>('');
  // How far out people were last asked for, and a number moved on by every ask (and by turning Nearby
  // off), so only the latest answer is shown.
  const peopleKm = useRef(0);
  const peopleReq = useRef(0);

  const loadPeople = useCallback(async (km?: number) => {
    const at = hereRef.current;
    if (!at) return;
    const req = ++peopleReq.current;
    const before = peopleKm.current;
    const want = Math.round(Math.min(100, Math.max(30, km ?? before)));
    peopleKm.current = want;
    try {
      const list = await fetchNearbyPeople(at.lat, at.lng, want);
      if (!alive.current || req !== peopleReq.current) return;
      setPeople(list);
      setPeopleError('');
    } catch (e) {
      if (!alive.current || req !== peopleReq.current) return;
      peopleKm.current = before;
      setPeopleError(errText(e));
      setPeople((cur) => cur ?? []);
    }
  }, []);

  /** The note for when there is no position: why, from what this computer says about location access. */
  const noPlaceNote = async (): Promise<NearbyNote> => {
    const s = await locationState();
    return s === 'denied' ? 'settings' : s === 'prompt' ? 'ask' : 'nofix';
  };

  // On coming to a layer: fetch what it shows (again, if it has been a while), and find where you are.
  useEffect(() => {
    if (layer === 'churches' && Date.now() - churchesAt.current > STALE_MS) loadChurches();
    if (layer === 'events' && Date.now() - eventsAt.current > STALE_MS) loadEvents();
    if (layer === 'friends') return;
    let stop = false;
    whereQuietly().finally(() => {
      if (!stop && alive.current) setLocated(true);
    });
    return () => {
      stop = true;
    };
  }, [layer, loadChurches, loadEvents, whereQuietly]);

  // Nearby: whether you show there now; if you do, your rough place is sent again and people are fetched.
  useEffect(() => {
    if (layer !== 'nearby') return;
    if (restricted) {
      // Members under 14 are certainly under 18.
      setNearbyOn(false);
      setNearbyNote('adult');
      return;
    }
    let stop = false;
    (async () => {
      let on: boolean;
      try {
        on = await nearbyIsOn();
      } catch (e) {
        if (stop || !alive.current) return;
        setNearbyOn((cur) => cur ?? false);
        toast(errText(e));
        return;
      }
      if (stop || !alive.current) return;
      setNearbyOn(on);
      if (!on) return;
      const at = await whereQuietly();
      if (stop || !alive.current) return;
      if (!at) {
        const note = await noPlaceNote();
        if (!stop && alive.current) setNearbyNote(note);
        return;
      }
      setNearbyNote((cur) => (cur === 'adult' ? cur : ''));
      nearbyRefresh(at.lat, at.lng).catch(() => {});
      loadPeople();
    })();
    return () => {
      stop = true;
    };
  }, [layer, restricted, whereQuietly, loadPeople]);

  // While Nearby is shown and on: people again every minute (from where you are then).
  useEffect(() => {
    if (layer !== 'nearby' || !nearbyOn) return;
    const timer = setInterval(() => {
      if (!document.hidden) whereQuietly().then((at) => at && alive.current && loadPeople());
    }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [layer, nearbyOn, whereQuietly, loadPeople]);

  // Zoomed out past where people were asked for: ask again, as far as the farthest corner (up to 100 km).
  const settledView = useSettled(view, 300);
  useEffect(() => {
    if (layer !== 'nearby' || !nearbyOn || !here || people === null || peopleKm.current >= 100 || !size.w) return;
    const far = distanceKm(here, settledView) + viewRadiusKm(settledView, size.w, size.h);
    if (far > peopleKm.current + 1) loadPeople(Math.ceil(far));
  }, [layer, nearbyOn, settledView, here, people, loadPeople, size.w, size.h]);

  async function turnNearbyOn() {
    if (nearbyBusyRef.current || restricted || nearbyNote === 'adult') return;
    nearbyBusyRef.current = true;
    setNearbyBusy(true);
    setNearbyNote('');
    try {
      let spot: GeolocationPosition;
      try {
        spot = await whereAmI();
      } catch (e) {
        if (alive.current) setNearbyNote((e as { code?: number })?.code === 1 ? 'settings' : 'nofix');
        return;
      }
      if (!alive.current) return;
      const p = { lat: spot.coords.latitude, lng: spot.coords.longitude };
      setHere(p);
      const shown = await nearbyTurnOn(p.lat, p.lng);
      if (!alive.current) return;
      if (!shown) {
        // The server's answer: this account isn't 18 or over (or its birthday isn't known).
        setNearbyOn(false);
        setNearbyNote('adult');
        return;
      }
      setNearbyOn(true);
      toast(t('map.nearbyOnToast'));
      framed.current.add('nearby');
      flyTo({ ...p, z: 12 });
      await loadPeople();
    } catch (e) {
      if (alive.current) toast(errText(e));
    } finally {
      nearbyBusyRef.current = false;
      if (alive.current) setNearbyBusy(false);
    }
  }

  async function turnNearbyOff() {
    if (nearbyBusyRef.current) return;
    nearbyBusyRef.current = true;
    setNearbyBusy(true);
    // Answers already on their way can't put people back on the map.
    peopleReq.current++;
    try {
      await nearbyTurnOff();
      if (!alive.current) return;
      setNearbyOn(false);
      setPeople(null);
      setPeopleError('');
      peopleKm.current = 0;
      setPick((cur) => (cur?.kind === 'person' ? null : cur));
      toast(t('map.nearbyOffToast'));
    } catch (e) {
      if (alive.current) toast(errText(e));
    } finally {
      nearbyBusyRef.current = false;
      if (alive.current) setNearbyBusy(false);
    }
  }

  /** "Use my location" under the Nearby switch: asks, then carries on from where you are. */
  async function askForLocation() {
    try {
      const spot = await whereAmI();
      if (!alive.current) return;
      const p = { lat: spot.coords.latitude, lng: spot.coords.longitude };
      setHere(p);
      setNearbyNote('');
      if (nearbyOn) {
        nearbyRefresh(p.lat, p.lng).catch(() => {});
        loadPeople();
      }
    } catch (e) {
      if (alive.current) setNearbyNote((e as { code?: number })?.code === 1 ? 'settings' : 'nofix');
    }
  }

  /* ---------- what is drawn ---------- */

  const churchList = useMemo<Entry<Church>[] | null>(() => {
    if (!churches) return null;
    const list = churches.map((c) => {
      const pos = { lat: c.lat ?? 0, lng: c.lng ?? 0 };
      return { item: c, pos, km: here ? distanceKm(here, pos) : null };
    });
    return nearestFirst(list, (a, b) => a.name.localeCompare(b.name));
  }, [churches, here]);

  const eventList = useMemo<Entry<EventCard>[] | null>(() => {
    if (!events) return null;
    const list = events.map((e) => {
      const pos = { lat: e.lat ?? 0, lng: e.lng ?? 0 };
      return { item: e, pos, km: here ? distanceKm(here, pos) : null };
    });
    return nearestFirst(list, (a, b) => a.starts_at.localeCompare(b.starts_at));
  }, [events, here]);

  // What is chosen on the Nearby, Churches or Events layer (Friends keeps its own `chosen`).
  const [pick, setPick] = useState<{ kind: 'person' | 'church' | 'event'; id: string } | null>(null);
  const pickedPerson = layer === 'nearby' && pick?.kind === 'person' ? people?.find((p) => p.user_id === pick.id) ?? null : null;
  const pickedChurch = layer === 'churches' && pick?.kind === 'church' ? churchList?.find((e) => e.item.id === pick.id) ?? null : null;
  const pickedEvent = layer === 'events' && pick?.kind === 'event' ? eventList?.find((e) => e.item.id === pick.id) ?? null : null;

  // Frame a layer the first time it is shown: you and what is nearest you, or everything when we don't know where you are.
  const framed = useRef(new Set<Layer>());
  useEffect(() => {
    if (!size.w || layer === 'friends' || framed.current.has(layer) || !located) return;
    if (layer === 'nearby') {
      if (!here) return;
      framed.current.add(layer);
      flyTo({ ...here, z: 12 });
      return;
    }
    const list: Entry<unknown>[] | null = layer === 'churches' ? churchList : eventList;
    if (!list) return;
    framed.current.add(layer);
    const pts = (here ? list.filter((e) => e.km !== null && e.km <= 80).slice(0, 6) : list.slice(0, 40)).map((e) => e.pos);
    if (here) pts.push(here);
    if (pts.length) flyTo(viewOf(pts, size.w, size.h, 14));
  }, [size.w, layer, located, here, churchList, eventList]);

  const chooseLayer = (next: Layer) => {
    if (next === layer) return;
    setLayer(next);
    setPick(null);
    setChosen(null);
    // The address says which layer, so a reload (or a link) opens on it.
    nav(next === 'friends' ? '/map' : `/map?layer=${next}`, true);
  };
  // A link to /map?layer=… while the map is already open: follow it.
  useEffect(() => {
    if (isLayer(asked) && asked !== layerRef.current) {
      setLayer(asked);
      setPick(null);
      setChosen(null);
    }
  }, [asked]);

  /** From a list or a pin: choose it and bring it into view. */
  const goTo = (kind: 'person' | 'church' | 'event', id: string, pos: Point) => {
    setPick({ kind, id });
    flyTo({ ...pos, z: Math.max(viewRef.current.z, 13) });
  };

  /* ---------- the layer's points on the map ---------- */

  type Pin = MapPoint & { kind: 'face' | 'person' | 'church' | 'event' | 'here'; label: string; draw: () => React.ReactNode; onPick?: () => void; on?: boolean; mine?: boolean };
  const pins: Pin[] = [];
  if (layer === 'friends') {
    // The chosen face (then yours) on top.
    const order = [...(locs ?? [])].sort((a, b) => Number(a.user_id === chosen) - Number(b.user_id === chosen) || Number(a.mine) - Number(b.mine));
    for (const l of order) {
      const who = l.mine ? t('support.you') : l.full_name || l.username;
      pins.push({
        id: l.user_id, lat: l.lat, lng: l.lng, kind: 'face', on: chosen === l.user_id, mine: l.mine,
        label: l.mine ? t('d.messages.yourLocation') : `${who}. ${updatedLabel(l.updated_at)}`,
        onPick: () => setChosen(l.user_id),
        draw: () => (
          <>
            <span className="mx-map-face">
              <Avatar src={l.avatar_url} name={l.username} size={44} />
            </span>
            <span className="mx-map-label">{l.mine ? t('support.you') : firstName(l)}</span>
          </>
        ),
      });
    }
  } else {
    if (here) pins.push({ id: 'here', lat: here.lat, lng: here.lng, kind: 'here', label: t('map.myLocation'), draw: () => <span className="mx-here-dot" /> });
    if (layer === 'nearby' && nearbyOn) {
      for (const p of people ?? []) {
        pins.push({
          id: p.user_id, lat: p.lat, lng: p.lng, spread: true, kind: 'person', on: pick?.id === p.user_id,
          label: `${p.full_name || p.username}, ${roughAway(p.km)}`,
          onPick: () => setPick({ kind: 'person', id: p.user_id }),
          draw: () => (
            <>
              <span className="mx-mark-face">
                <Avatar src={p.avatar_url} name={p.username} size={40} />
              </span>
              <span className="mx-map-label">{firstName(p)}</span>
            </>
          ),
        });
      }
    }
    if (layer === 'churches') {
      for (const e of churchList ?? []) {
        pins.push({ id: e.item.id, ...e.pos, kind: 'church', on: pick?.id === e.item.id, label: e.item.name, onPick: () => setPick({ kind: 'church', id: e.item.id }), draw: () => <Icon name="church" size={18} stroke={2.1} /> });
      }
    }
    if (layer === 'events') {
      for (const e of eventList ?? []) {
        pins.push({ id: e.item.id, ...e.pos, spread: true, kind: 'event', on: pick?.id === e.item.id, label: `${e.item.title}. ${eventWhen(e.item)}`, onPick: () => setPick({ kind: 'event', id: e.item.id }), draw: () => <DateBlock iso={e.item.starts_at} /> });
      }
    }
    // The chosen one on top.
    pins.sort((a, b) => Number(!!a.on) - Number(!!b.on));
  }

  const renderPin = (p: Pin, left: number, top: number) => {
    const style = { transform: `translate(${Math.round(left)}px, ${Math.round(top)}px)` };
    if (p.kind === 'here') {
      return <span key="here" className="mx-here" style={style} role="img" aria-label={p.label} />;
    }
    const className = p.kind === 'face' ? 'mx-map-pin' + (p.mine ? ' mine' : '') + (p.on ? ' on' : '') : `mx-mark ${p.kind}` + (p.on ? ' on' : '');
    return (
      <button key={p.id} type="button" className={className} style={style} aria-label={p.label} aria-pressed={p.kind === 'face' ? undefined : !!p.on} onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()} onClick={p.onPick}>
        {p.draw()}
      </button>
    );
  };

  /* ---------- the list beside the map (Nearby, Churches, Events) ---------- */

  // The heading over the list: how many, or why there's nothing, or that it's still loading.
  let heading: { title: string; sub?: string; retry?: () => void } | null = null;
  if (layer === 'churches') {
    const n = churchList?.length ?? 0;
    heading =
      churchList === null
        ? null
        : churchError && !n
          ? { title: t('common.didNotLoad'), sub: t('common.tryAgain'), retry: () => { setChurchError(''); setChurches(null); loadChurches(); } }
          : { title: n ? (n === 1 ? t('map.oneChurch') : t('map.churchCount', { n: fmt(n) })) : t('map.noChurches'), sub: n && here ? t('map.nearestFirst') : undefined };
  } else if (layer === 'events') {
    const n = eventList?.length ?? 0;
    heading =
      eventList === null
        ? null
        : eventError && !n
          ? { title: t('common.didNotLoad'), sub: t('common.tryAgain'), retry: () => { setEventError(''); setEvents(null); loadEvents(); } }
          : { title: n ? (n === 1 ? t('map.oneEvent') : t('map.eventCount', { n: fmt(n) })) : t('map.noEvents'), sub: n && here ? t('map.nearestFirst') : undefined };
  } else if (layer === 'nearby' && nearbyOn && (nearbyNote === '' || people !== null) && people !== null) {
    const n = people.length;
    heading =
      peopleError && !n
        ? { title: t('common.didNotLoad'), sub: t('common.tryAgain'), retry: () => { setPeopleError(''); setPeople(null); loadPeople(); } }
        : { title: n ? (n === 1 ? t('map.onePerson') : t('map.personCount', { n: fmt(n) })) : t('map.nobodyNearby') };
  }
  const loadingList = (layer === 'churches' && churchList === null) || (layer === 'events' && eventList === null) || (layer === 'nearby' && !!nearbyOn && people === null && nearbyNote === '');

  const noteLine =
    nearbyNote === 'adult' ? t('map.adultsOnly') : nearbyNote === 'settings' ? t('map.locationOff') : nearbyNote === 'ask' ? t('map.allowLocation') : nearbyNote === 'nofix' ? t('map.noFix') : '';

  const layerSide = (
    <>
      {layer === 'nearby' ? (
        <div className="mx-near-switch">
          <label className="mx-near-row">
            <b>{t('map.showMe')}</b>
            {nearbyBusy || nearbyOn === null ? <Spinner size={18} /> : null}
            <input type="checkbox" role="switch" aria-label={t('map.showMe')} checked={!!nearbyOn} disabled={nearbyBusy || nearbyOn === null || nearbyNote === 'adult'} onChange={(e) => (e.target.checked ? turnNearbyOn() : turnNearbyOff())} />
            <i className="switch" aria-hidden="true" />
          </label>
          {nearbyNote !== 'adult' ? <p className="mx-near-privacy">{t('map.nearbyPrivacy')}</p> : null}
          {noteLine ? (
            <p className={'mx-near-note' + (nearbyNote === 'adult' ? ' quiet' : '')} role="status">
              <span>{noteLine}</span>
              {nearbyNote === 'ask' && nearbyOn ? (
                <button type="button" className="link-btn" onClick={askForLocation}>
                  {t('churches.useMyLocation')}
                </button>
              ) : null}
            </p>
          ) : null}
        </div>
      ) : null}
      {heading ? (
        heading.retry ? (
          <button type="button" className="mx-layer-head retry" onClick={heading.retry}>
            <b>{heading.title}</b>
            <span>{heading.sub}</span>
          </button>
        ) : (
          <div className="mx-layer-head">
            <b>{heading.title}</b>
            {heading.sub ? <span>{heading.sub}</span> : null}
          </div>
        )
      ) : loadingList ? (
        <div className="mx-layer-head">
          <Spinner size={22} />
        </div>
      ) : null}
      <div className="mx-layer-list" role="list">
        {layer === 'nearby' && nearbyOn
          ? (people ?? []).map((p) => (
              <button key={p.user_id} type="button" role="listitem" className={'mx-layer-row' + (pick?.id === p.user_id ? ' on' : '')} onClick={() => goTo('person', p.user_id, p)}>
                <Avatar src={p.avatar_url} name={p.username} size={44} />
                <span className="row-text">
                  <b>
                    {p.full_name || p.username}
                    {p.verified ? <Verified size={12} /> : null}
                  </b>
                  <span>{roughAway(p.km)}</span>
                </span>
              </button>
            ))
          : null}
        {layer === 'churches'
          ? (churchList ?? []).map(({ item: c, pos, km }) => (
              <button key={c.id} type="button" role="listitem" className={'mx-layer-row' + (pick?.id === c.id ? ' on' : '')} onClick={() => goTo('church', c.id, pos)}>
                <span className="mx-layer-icon">
                  <Icon name="church" size={22} />
                </span>
                <span className="row-text">
                  <b>{c.name}</b>
                  {placeOf(c) ? <span>{placeOf(c)}</span> : null}
                </span>
                {km !== null ? <span className="mx-layer-km">{kmText(km)}</span> : null}
              </button>
            ))
          : null}
        {layer === 'events'
          ? (eventList ?? []).map(({ item: e, pos, km }) => (
              <button key={e.id} type="button" role="listitem" className={'mx-layer-row' + (pick?.id === e.id ? ' on' : '')} onClick={() => goTo('event', e.id, pos)}>
                <DateBlock iso={e.starts_at} />
                <span className="row-text">
                  <b>{e.title}</b>
                  <span>{[eventWhen(e), e.place.trim(), km !== null ? kmText(km) : ''].filter(Boolean).join(' · ')}</span>
                  {e.going_count > 0 ? <span className="mx-layer-going">{t('map.going', { n: fmt(e.going_count) })}</span> : null}
                </span>
              </button>
            ))
          : null}
      </div>
    </>
  );

  // A chosen person, church or event: what it is, and the way into it.
  let pickedCard: React.ReactNode = null;
  if (pickedPerson) {
    const p = pickedPerson;
    pickedCard = (
      <PickCard label={p.full_name || p.username} onClose={() => setPick(null)} badge={<Avatar src={p.avatar_url} name={p.username} size={48} />} title={<>{p.full_name || p.username}{p.verified ? <Verified size={13} /> : null}</>} lines={[roughAway(p.km)]}>
        <Link to={'/u/' + p.username} className="btn quiet small">
          {t('chat.viewProfile')}
        </Link>
        <button type="button" className="btn small" disabled={opening} onClick={() => message(p.user_id)}>
          {t('profile.message')}
        </button>
      </PickCard>
    );
  } else if (pickedChurch) {
    const { item: c, pos, km } = pickedChurch;
    pickedCard = (
      <PickCard label={c.name} onClose={() => setPick(null)} badge={<span className="mx-pick-icon"><Icon name="church" size={24} /></span>} title={c.name} lines={[placeOf(c), km !== null ? t('map.away', { d: kmText(km) }) : '']}>
        <a className="btn quiet small" href={directionsTo(pos, c.name)} target="_blank" rel="noreferrer">
          {t('map.directions')}
        </a>
        <Link to={'/churches/' + c.id} className="btn small">
          {t('map.viewChurch')}
        </Link>
      </PickCard>
    );
  } else if (pickedEvent) {
    const { item: e, pos, km } = pickedEvent;
    const where = [e.place.trim() || e.church_name || '', km !== null ? kmText(km) : ''].filter(Boolean).join(' · ');
    pickedCard = (
      <PickCard label={e.title} onClose={() => setPick(null)} badge={<DateBlock iso={e.starts_at} />} title={e.title} lines={[eventWhen(e), where]} accent={e.going_count > 0 ? t('map.going', { n: fmt(e.going_count) }) : ''}>
        <a className="btn quiet small" href={directionsTo(pos, e.place.trim() || e.title)} target="_blank" rel="noreferrer">
          {t('map.directions')}
        </a>
        <Link to={'/events/' + e.id} className="btn small">
          {t('map.viewEvent')}
        </Link>
      </PickCard>
    );
  }

  return (
    <div className="mx-map-page">
      <aside className="mx-map-side" aria-label={t('churchApps.map')}>
        <header className="mx-map-head">
          <button type="button" className="icon-btn" aria-label={t('d.messages.backToMessages')} onClick={() => nav('/direct')}>
            <Icon name="back" size={22} />
          </button>
          <h2>{t('churchApps.map')}</h2>
          {layer === 'friends' ? (
            <button type="button" className="icon-btn" aria-label={t('d.messages.locationSettings')} title={t('d.messages.locationSettings')} onClick={openSettings}>
              <Icon name="settings" size={22} />
            </button>
          ) : null}
        </header>
        <div className="mx-map-tabs" role="tablist" aria-label={t('churchApps.map')}>
          {LAYERS.map((l) => (
            <button key={l.key} type="button" role="tab" aria-selected={layer === l.key} className={layer === l.key ? 'on' : ''} onClick={() => chooseLayer(l.key)}>
              {t(l.label)}
            </button>
          ))}
        </div>

        {layer === 'friends' ? (
          <>
            <button
              type="button"
              className={'mx-map-status' + (sharing ? ' on' : '')}
              onClick={
                error
                  ? () => {
                      setError('');
                      load();
                    }
                  : openSettings
              }
            >
              <span className="mx-map-status-icon">
                <Icon name="location" size={22} />
              </span>
              <span className="mx-map-status-text">
                <b>{t(sharing ? 'd.messages.sharingYourLocation' : 'd.messages.locationIsOff')}</b>
                <span>{statusSub}</span>
              </span>
              {locs === null ? <Spinner size={18} /> : <Icon name="right" size={16} stroke={2} />}
            </button>

            {restricted ? (
              <p className="mx-map-note">{t('d.messages.under14')}</p>
            ) : sharing ? (
              <button type="button" className="btn quiet block mx-map-cta" disabled={busy} onClick={turnOff}>
                {t('d.messages.stopSharing')}
              </button>
            ) : (
              <button type="button" className="btn block mx-map-cta" disabled={busy || locs === null} onClick={turnOn}>
                <Icon name="location" size={18} />
                {t('d.messages.shareMyLocation')}
              </button>
            )}
            {problem && !settings ? (
              <p className="mx-map-problem" role="alert">
                {problem}
              </p>
            ) : null}

            <div className="mx-map-sub">{t('d.messages.friendsOnMap')}</div>
            <div className="mx-map-list">
              {friends.map((l) => {
                const who = l.full_name || l.username;
                return (
                  <div key={l.user_id} className={'mx-map-row' + (chosen === l.user_id ? ' on' : '')}>
                    <button type="button" className="mx-map-row-main" onClick={() => focus(l)} aria-label={t('d.messages.showOnMap', { name: who })}>
                      <Avatar src={l.avatar_url} name={l.username} size={44} />
                      <span className="row-text">
                        <b>
                          {who}
                          {l.verified ? <Verified size={12} /> : null}
                        </b>
                        <span>{updatedLabel(l.updated_at)}</span>
                      </span>
                    </button>
                    <button type="button" className="icon-btn" aria-label={t('d.messages.messageTo', { name: who })} title={t('profile.message')} disabled={opening} onClick={() => message(l.user_id)}>
                      <Icon name="send" size={20} />
                    </button>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          layerSide
        )}
      </aside>

      <MapCanvas
        view={view}
        setView={setView}
        onSize={setSize}
        anim={anim}
        points={pins}
        renderPin={renderPin}
        onBackground={() => {
          setChosen(null);
          setPick(null);
        }}
      >
        <div className="mx-map-controls">
          <button type="button" className="mx-map-ctl" aria-label={t('d.messages.zoomIn')} title={t('d.messages.zoomIn')} onClick={() => flyTo({ ...viewRef.current, z: clampZ(Math.round(viewRef.current.z) + 1) })}>
            <Icon name="plus" size={18} stroke={2.2} />
          </button>
          <button type="button" className="mx-map-ctl" aria-label={t('d.messages.zoomOut')} title={t('d.messages.zoomOut')} onClick={() => flyTo({ ...viewRef.current, z: clampZ(Math.round(viewRef.current.z) - 1) })}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
              <path d="M5 12h14" />
            </svg>
          </button>
          {layer === 'friends' && locs?.length ? (
            <button type="button" className="mx-map-ctl" aria-label={t('d.messages.showEveryone')} title={t('d.messages.showEveryone')} onClick={showEveryone}>
              <Icon name="expand" size={17} stroke={2} />
            </button>
          ) : null}
          {layer !== 'friends' ? (
            <button type="button" className="mx-map-ctl" aria-label={t('map.myLocation')} title={t('map.myLocation')} disabled={centring} onClick={centreOnMe}>
              {centring ? <Spinner size={16} /> : <Icon name="location" size={18} stroke={2} />}
            </button>
          ) : null}
        </div>

        {layer === 'friends' && picked ? (
          // A chosen face: who, when their place was last updated, and a way to message them.
          <div className="mx-map-card" role="dialog" aria-label={picked.mine ? t('support.you') : picked.full_name || picked.username}>
            <Avatar src={picked.avatar_url} name={picked.username} size={48} />
            <span className="row-text">
              <b>
                {picked.mine ? t('support.you') : picked.full_name || picked.username}
                {picked.verified && !picked.mine ? <Verified size={13} /> : null}
              </b>
              <span>{picked.mine ? t('d.messages.sharingWith', { who: audienceName, updated: updatedLabel(picked.updated_at, true) }) : updatedLabel(picked.updated_at)}</span>
            </span>
            {picked.mine ? (
              <button type="button" className="btn quiet small" onClick={openSettings}>
                {t('d.messages.settings')}
              </button>
            ) : (
              <button type="button" className="btn small" disabled={opening} onClick={() => message(picked.user_id)}>
                {t('profile.message')}
              </button>
            )}
            <button type="button" className="icon-btn" aria-label={t('common.close')} onClick={() => setChosen(null)}>
              <Icon name="close" size={18} />
            </button>
          </div>
        ) : null}
        {layer !== 'friends' ? pickedCard : null}
      </MapCanvas>

      {settings ? (
        <Modal title={t('d.messages.locationSharing')} onClose={() => setSettings(false)} className="mx-map-settings">
          <div className="mx-map-set">
            <div className="mx-map-set-row">
              <span className="mx-map-set-text">
                <b>{t('d.messages.shareMyLocation')}</b>
                <span>{restricted ? t('d.messages.notOnYourAccount') : mine ? t('d.messages.onUpdated', { updated: updatedLabel(mine.updated_at, true) }) : t('settings.repliesOff')}</span>
              </span>
              {busy ? <Spinner size={18} /> : null}
              <button type="button" role="switch" aria-checked={sharing} aria-label={t('d.messages.shareMyLocation')} className={'switch' + (sharing ? ' on' : '')} disabled={restricted || busy} onClick={() => (sharing ? turnOff() : turnOn())}>
                <i />
              </button>
            </div>
            {restricted ? (
              <p className="mx-map-note">{t('d.messages.under14')}</p>
            ) : null}
            {problem ? (
              <p className="mx-map-problem" role="alert">
                {problem}
              </p>
            ) : null}
            <div className={'mx-map-who' + (restricted ? ' off' : '')} role="radiogroup" aria-label={t('d.messages.whoCanSee')}>
              <b className="nt-label">{t('d.messages.whoCanSee')}</b>
              {AUDIENCES.map((a) => (
                <button key={a.value} type="button" role="radio" aria-checked={audience === a.value} disabled={restricted} className={'nt-aud' + (audience === a.value ? ' on' : '') + (a.value === 'close_friends' ? ' close' : '')} onClick={() => chooseAudience(a.value)}>
                  <span className="nt-aud-icon">
                    <Icon name={a.icon} size={18} />
                  </span>
                  <span className="row-text">
                    <b>{t(a.label)}</b>
                    <span>{t(a.sub)}</span>
                  </span>
                  <span className="nt-radio" aria-hidden="true" />
                </button>
              ))}
              <Link to="/accounts/close-friends" className="link-btn mx-map-edit" onClick={() => setSettings(false)}>
                {t('d.messages.editCloseFriends')}
              </Link>
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

/** A value that only follows `value` once it has stopped changing for `ms` (the map's view while it moves). */
function useSettled<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return settled;
}

/** The card over the bottom of the map for a chosen person, church or event: what it is, and two ways on. */
function PickCard({ label, badge, title, lines, accent, onClose, children }: { label: string; badge: React.ReactNode; title: React.ReactNode; lines: string[]; accent?: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="mx-pick-card" role="dialog" aria-label={label}>
      <div className="mx-pick-top">
        {badge}
        <span className="row-text">
          <b>{title}</b>
          {lines.filter(Boolean).map((l, i) => (
            <span key={i}>{l}</span>
          ))}
          {accent ? <span className="mx-pick-accent">{accent}</span> : null}
        </span>
        <button type="button" className="icon-btn" aria-label={t('common.close')} onClick={onClose}>
          <Icon name="close" size={18} />
        </button>
      </div>
      <div className="mx-pick-actions">{children}</div>
    </div>
  );
}

/**
 * The map: tiles, a grid under them for when they can't load, and the points drawn by `renderPin`.
 * Drag to move around, scroll or pinch to zoom (around the pointer), double-click to zoom in; arrow
 * keys and +/- too. A click on the map itself (not a drag) calls `onBackground`.
 */
export function MapCanvas<P extends MapPoint>({ view, setView, onSize, anim, points, renderPin, onBackground, className, children }: { view: MapView; setView: React.Dispatch<React.SetStateAction<MapView>>; onSize?: (s: { w: number; h: number }) => void; anim: React.MutableRefObject<number>; points: readonly P[]; renderPin: (p: P, left: number, top: number) => React.ReactNode; onBackground?: () => void; className?: string; children?: React.ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const sizeRef = useRef(size);
  sizeRef.current = size;
  const drag = useRef<{ x: number; y: number; from: MapView; moved: boolean } | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => {
      const s = { w: el.clientWidth, h: el.clientHeight };
      setSize(s);
      onSize?.(s);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /** Zooms by dz around a point of the map (in pixels from its top left), keeping that point still. */
  const zoomAt = useCallback(
    (mx: number, my: number, dz: number) =>
      setView((v) => {
        const z = clampZ(v.z + dz);
        if (z === v.z) return v;
        const k = 2 ** (z - v.z);
        const ox = mx - sizeRef.current.w / 2;
        const oy = my - sizeRef.current.h / 2;
        const p = placeAt((worldX(v.lng, v.z) + ox) * k - ox, (worldY(v.lat, v.z) + oy) * k - oy, z);
        return { lat: clampLat(p.lat), lng: wrapLng(p.lng), z };
      }),
    [setView],
  );

  // Scrolling zooms the map, not the page (so the listener can't be passive).
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      anim.current++;
      const r = el.getBoundingClientRect();
      // A pinch on a trackpad arrives as a wheel with Ctrl held, in small steps.
      zoomAt(e.clientX - r.left, e.clientY - r.top, -e.deltaY * (e.ctrlKey ? 0.012 : 0.0025));
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, [zoomAt]);

  const panBy = (dx: number, dy: number, from: MapView = view) => {
    const p = placeAt(worldX(from.lng, from.z) - dx, worldY(from.lat, from.z) - dy, from.z);
    setView({ ...from, lat: clampLat(p.lat), lng: wrapLng(p.lng) });
  };

  const { w, h } = size;
  const { tiles, size: tileSize, gridStyle } = tilesFor(view, w, h);
  const placed = w && h ? placePoints(points, view, w, h) : [];

  return (
    <section className={'mx-map' + (className ? ' ' + className : '')} aria-label={t('churchApps.map')}>
      <div
        ref={box}
        className="mx-map-view"
        role="application"
        aria-label={t('d.messages.mapHint')}
        aria-roledescription="map"
        tabIndex={0}
        style={gridStyle}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          anim.current++;
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { x: e.clientX, y: e.clientY, from: view, moved: false };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          const dx = e.clientX - d.x;
          const dy = e.clientY - d.y;
          if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
          if (d.moved) panBy(dx, dy, d.from);
        }}
        onPointerUp={() => {
          const d = drag.current;
          drag.current = null;
          // A click on the map itself (not a drag) closes the card.
          if (d && !d.moved) onBackground?.();
        }}
        onPointerCancel={() => (drag.current = null)}
        onDoubleClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          zoomAt(e.clientX - r.left, e.clientY - r.top, 1);
        }}
        onKeyDown={(e) => {
          const step = 100;
          const moves: Record<string, [number, number]> = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
          if (moves[e.key]) {
            e.preventDefault();
            panBy(...moves[e.key]);
          } else if (e.key === '+' || e.key === '=') zoomAt(w / 2, h / 2, 1);
          else if (e.key === '-' || e.key === '_') zoomAt(w / 2, h / 2, -1);
        }}
      >
        <Tiles list={tiles} size={tileSize} />
        {placed.map(({ p, left, top }) => renderPin(p, left, top))}
      </div>
      {children}
      <a className="mx-map-credit" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
        {t('d.messages.osmCredit')}
      </a>
    </section>
  );
}

/** A small map of one place, not to be moved about: the tiles round it and a pin in the middle. */
export function MiniMap({ lat, lng, z = 15, className, children }: { lat: number; lng: number; z?: number; className?: string; children?: React.ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const { tiles, size: tileSize, gridStyle } = tilesFor({ lat, lng, z }, size.w, size.h);
  return (
    <div ref={box} className={'mx-mini ' + (className ?? '')} style={gridStyle}>
      <Tiles list={tiles} size={tileSize} />
      {children}
    </div>
  );
}
