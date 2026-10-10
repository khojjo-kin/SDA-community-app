// The friends' map (/map), from the iPhone app (app/(app)/map.tsx): friends who share where they are
// with you, as faces on a map with a list beside it, and sharing your own place. Sharing is always a
// choice (off until turned on here), seen only by mutual followers or your close friends, never open
// to members under 14, and the server stops showing a place 24 hours after its last update. While you
// share, your place is sent again every couple of minutes whenever Community is open on this computer
// (useLiveLocation below, kept running on every page by the Messages button in the corner).
//
// The map is drawn without a map library: OpenStreetMap's tiles placed with the Web Mercator sums,
// dragged to pan, scrolled (or pinched) to zoom. If the tiles can't load (offline), the faces and the
// list still show, over a plain grid.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { amSharingLocation, fetchFriendLocations, moveSharedLocation, openThread, shareLocation, stopSharingLocation } from 'shared/api';
import { ago, errText } from 'shared/theme';
import type { FriendLocation } from 'shared/types';
import { useMe } from '../lib/me';
import { nav } from '../lib/router';
import { Avatar, Icon, Link, Modal, Spinner, Verified, toast } from '../ui/kit';
import '../styles/map.css';

/* ---------- keeping your shared place fresh (the iPhone's src/lib/liveLocation.ts) ---------- */

/** How often your place is sent while you share and Community is open in front of you. */
const SHARE_EVERY_MS = 2 * 60e3;

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
  if (code === 1) return 'Location access is off for Community. Allow it (on a Mac: System Settings → Privacy & Security → Location Services), then try again.';
  if (code === 2) return "Your location couldn't be found. Check that Location Services and Wi-Fi are on, then try again.";
  if (code === 3) return 'Finding your location took too long. Try again.';
  return errText(e);
}

/**
 * Keeps a member's shared place fresh while they share: every couple of minutes, on whatever page,
 * while Community is in front of them. It only uses location access already given (it never asks),
 * stops while the window is hidden, and stops when sharing is turned off. An update only ever moves a
 * place that is already there, so one landing after sharing was turned off can't switch it back on.
 */
export function useLiveLocation(me: string, enabled: boolean) {
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

type View = { lat: number; lng: number; z: number };
/** Before anyone is on the map: the whole world. */
const WORLD: View = { lat: 20, lng: 10, z: 2 };

const clampZ = (z: number) => Math.min(MAX_Z, Math.max(MIN_Z, z));
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
function viewOf(points: { lat: number; lng: number }[], w: number, h: number): View {
  if (!points.length || !w || !h) return WORLD;
  if (points.length === 1) return { lat: points[0].lat, lng: points[0].lng, z: 13 };
  const xs = points.map((p) => worldX(p.lng, 0));
  const ys = points.map((p) => worldY(p.lat, 0));
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const fitW = Math.max(80, w - 240);
  const fitH = Math.max(80, h - 300);
  const z = Math.log2(Math.min(fitW / Math.max(x1 - x0, 1e-9), fitH / Math.max(y1 - y0, 1e-9)));
  const c = placeAt((x0 + x1) / 2, (y0 + y1) / 2, 0);
  // A whole zoom level, so the map's tiles are drawn sharp.
  return { lat: c.lat, lng: c.lng, z: clampZ(Math.min(15, Math.floor(z))) };
}

/* ---------- the page ---------- */

/** How often friends' places are fetched again while the map is open. */
const REFRESH_MS = 60e3;

const AUDIENCES: { value: FriendLocation['audience']; label: string; sub: string; icon: 'people' | 'star' }[] = [
  { value: 'mutuals', label: 'Mutual followers', sub: 'People you follow who follow you back', icon: 'people' },
  { value: 'close_friends', label: 'Close friends', sub: 'Only the people on your close friends list', icon: 'star' },
];

function firstName(l: { full_name: string; username: string }): string {
  return (l.full_name || '').trim().split(/\s+/)[0] || l.username;
}

/** "Updated just now", "Updated 5m ago", "Updated 3h ago". */
function updatedLabel(iso: string): string {
  const a = ago(iso);
  return a === 'now' ? 'Updated just now' : `Updated ${a} ago`;
}

export function FriendsMap() {
  const { me } = useMe();
  const [locs, setLocs] = useState<FriendLocation[] | null>(null);
  const [error, setError] = useState('');
  const [chosen, setChosen] = useState<string | null>(null);
  const [settings, setSettings] = useState(false);
  const [audience, setAudience] = useState<FriendLocation['audience']>('mutuals');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [opening, setOpening] = useState(false);
  const [view, setView] = useState<View>(WORLD);
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

  // Now, then every minute while the map is open.
  useEffect(() => {
    load();
    const t = setInterval(() => !document.hidden && load(), REFRESH_MS);
    return () => clearInterval(t);
  }, [load]);

  /** Glides the map to a view. Dragging or scrolling stops it. */
  const flyTo = useCallback((to: View) => {
    const from = viewRef.current;
    const id = ++anim.current;
    const t0 = performance.now();
    const step = (t: number) => {
      if (id !== anim.current) return;
      const k = Math.min(1, (t - t0) / 320);
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
    if (!locs || !size.w || fitted.current) return;
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
        if (alive.current && !locsSeen.current) flyTo({ lat: spot.coords.latitude, lng: spot.coords.longitude, z: 11 });
      }, () => {});
    });
  }, [locs, size.w]);

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
      toast(audience === 'close_friends' ? 'Sharing your location with close friends' : 'Sharing your location with mutual followers');
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
      toast('Location sharing is off');
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
      toast(next === 'close_friends' ? 'Now only close friends can see your location' : 'Now mutual followers can see your location');
      load();
    } catch (e) {
      setProblem(errText(e));
    }
  }

  async function message(l: FriendLocation) {
    if (opening) return;
    setOpening(true);
    try {
      nav('/direct/t/' + (await openThread(l.user_id)));
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
  const audienceName = (mine?.audience ?? audience) === 'close_friends' ? 'close friends' : 'mutual followers';
  const statusSub =
    locs === null
      ? 'Looking for friends…'
      : error
        ? "Friends' places didn't load. Click to try again."
        : `${sharing ? `With ${audienceName}. ` : ''}${friends.length ? `${friends.length} ${friends.length === 1 ? 'friend is' : 'friends are'} sharing with you.` : 'No friends are sharing with you right now.'}`;

  return (
    <div className="mx-map-page">
      <aside className="mx-map-side" aria-label="Friends on the map">
        <header className="mx-map-head">
          <button type="button" className="icon-btn" aria-label="Back to messages" onClick={() => nav('/direct')}>
            <Icon name="back" size={22} />
          </button>
          <h2>Map</h2>
          <button type="button" className="icon-btn" aria-label="Location sharing settings" title="Location sharing settings" onClick={openSettings}>
            <Icon name="settings" size={22} />
          </button>
        </header>

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
            <b>{sharing ? 'Sharing your location' : 'Your location is off'}</b>
            <span>{statusSub}</span>
          </span>
          {locs === null ? <Spinner size={18} /> : <Icon name="right" size={16} stroke={2} />}
        </button>

        {restricted ? (
          <p className="mx-map-note">Members under 14 can't share their location.</p>
        ) : sharing ? (
          <button type="button" className="btn quiet block mx-map-cta" disabled={busy} onClick={turnOff}>
            Stop sharing
          </button>
        ) : (
          <button type="button" className="btn block mx-map-cta" disabled={busy || locs === null} onClick={turnOn}>
            <Icon name="location" size={18} />
            Share my location
          </button>
        )}
        {problem && !settings ? (
          <p className="mx-map-problem" role="alert">
            {problem}
          </p>
        ) : null}

        <div className="mx-map-sub">Friends on the map</div>
        <div className="mx-map-list">
          {locs !== null && !friends.length ? <p className="mx-map-empty">When mutual followers or close friends share their location with you, they show here and on the map.</p> : null}
          {friends.map((l) => {
            const who = l.full_name || l.username;
            return (
              <div key={l.user_id} className={'mx-map-row' + (chosen === l.user_id ? ' on' : '')}>
                <button type="button" className="mx-map-row-main" onClick={() => focus(l)} aria-label={`Show ${who} on the map`}>
                  <Avatar src={l.avatar_url} name={l.username} size={44} />
                  <span className="row-text">
                    <b>
                      {who}
                      {l.verified ? <Verified size={12} /> : null}
                    </b>
                    <span>{updatedLabel(l.updated_at)}</span>
                  </span>
                </button>
                <button type="button" className="icon-btn" aria-label={`Message ${who}`} title="Message" disabled={opening} onClick={() => message(l)}>
                  <Icon name="send" size={20} />
                </button>
              </div>
            );
          })}
        </div>
        <p className="mx-map-foot">Only the people you choose see your location, and only while you share it. Members under 14 can't share theirs.</p>
      </aside>

      <MapCanvas view={view} setView={setView} onSize={setSize} anim={anim} locs={locs ?? []} chosen={chosen} onChoose={setChosen}>
        <div className="mx-map-controls">
          <button type="button" className="mx-map-ctl" aria-label="Zoom in" title="Zoom in" onClick={() => flyTo({ ...viewRef.current, z: clampZ(Math.round(viewRef.current.z) + 1) })}>
            <Icon name="plus" size={18} stroke={2.2} />
          </button>
          <button type="button" className="mx-map-ctl" aria-label="Zoom out" title="Zoom out" onClick={() => flyTo({ ...viewRef.current, z: clampZ(Math.round(viewRef.current.z) - 1) })}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
              <path d="M5 12h14" />
            </svg>
          </button>
          {locs?.length ? (
            <button type="button" className="mx-map-ctl" aria-label="Show everyone" title="Show everyone" onClick={showEveryone}>
              <Icon name="expand" size={17} stroke={2} />
            </button>
          ) : null}
        </div>

        {picked ? (
          // A chosen face: who, when their place was last updated, and a way to message them.
          <div className="mx-map-card" role="dialog" aria-label={picked.mine ? 'You' : picked.full_name || picked.username}>
            <Avatar src={picked.avatar_url} name={picked.username} size={48} />
            <span className="row-text">
              <b>
                {picked.mine ? 'You' : picked.full_name || picked.username}
                {picked.verified && !picked.mine ? <Verified size={13} /> : null}
              </b>
              <span>{picked.mine ? `Sharing with ${audienceName} · ${updatedLabel(picked.updated_at).toLowerCase()}` : updatedLabel(picked.updated_at)}</span>
            </span>
            {picked.mine ? (
              <button type="button" className="btn quiet small" onClick={openSettings}>
                Settings
              </button>
            ) : (
              <button type="button" className="btn small" disabled={opening} onClick={() => message(picked)}>
                Message
              </button>
            )}
            <button type="button" className="icon-btn" aria-label="Close" onClick={() => setChosen(null)}>
              <Icon name="close" size={18} />
            </button>
          </div>
        ) : null}
      </MapCanvas>

      {settings ? (
        <Modal title="Location sharing" onClose={() => setSettings(false)} className="mx-map-settings">
          <div className="mx-map-set">
            <div className="mx-map-set-row">
              <span className="mx-map-set-text">
                <b>Share my location</b>
                <span>{restricted ? 'Not available on your account' : mine ? `On · ${updatedLabel(mine.updated_at).toLowerCase()}` : 'Off'}</span>
              </span>
              {busy ? <Spinner size={18} /> : null}
              <button type="button" role="switch" aria-checked={sharing} aria-label="Share my location" className={'switch' + (sharing ? ' on' : '')} disabled={restricted || busy} onClick={() => (sharing ? turnOff() : turnOn())}>
                <i />
              </button>
            </div>
            {restricted ? (
              <p className="mx-map-note">
                <Icon name="shield" size={18} />
                Members under 14 can't share their location.
              </p>
            ) : null}
            {problem ? (
              <p className="mx-map-problem" role="alert">
                {problem}
              </p>
            ) : null}
            <div className={'mx-map-who' + (restricted ? ' off' : '')} role="radiogroup" aria-label="Who can see it">
              <b className="nt-label">Who can see it</b>
              {AUDIENCES.map((a) => (
                <button key={a.value} type="button" role="radio" aria-checked={audience === a.value} disabled={restricted} className={'nt-aud' + (audience === a.value ? ' on' : '') + (a.value === 'close_friends' ? ' close' : '')} onClick={() => chooseAudience(a.value)}>
                  <span className="nt-aud-icon">
                    <Icon name={a.icon} size={18} />
                  </span>
                  <span className="row-text">
                    <b>{a.label}</b>
                    <span>{a.sub}</span>
                  </span>
                  <span className="nt-radio" aria-hidden="true" />
                </button>
              ))}
              <Link to="/accounts/close-friends" className="link-btn mx-map-edit" onClick={() => setSettings(false)}>
                Edit close friends
              </Link>
            </div>
            <p className="mx-map-how">
              While you share, your location is sent again every couple of minutes whenever Community is open on this computer. It stays on until you turn it off, and friends stop seeing it 24 hours after its last update.
            </p>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

/**
 * The map: tiles, a grid under them for when they can't load, and the faces. Drag to move around,
 * scroll or pinch to zoom (around the pointer), double-click to zoom in; arrow keys and +/- too.
 */
function MapCanvas({ view, setView, onSize, anim, locs, chosen, onChoose, children }: { view: View; setView: React.Dispatch<React.SetStateAction<View>>; onSize: (s: { w: number; h: number }) => void; anim: React.MutableRefObject<number>; locs: FriendLocation[]; chosen: string | null; onChoose: (id: string | null) => void; children?: React.ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const sizeRef = useRef(size);
  sizeRef.current = size;
  const drag = useRef<{ x: number; y: number; from: View; moved: boolean } | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => {
      const s = { w: el.clientWidth, h: el.clientHeight };
      setSize(s);
      onSize(s);
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

  const panBy = (dx: number, dy: number, from: View = view) => {
    const p = placeAt(worldX(from.lng, from.z) - dx, worldY(from.lat, from.z) - dy, from.z);
    setView({ ...from, lat: clampLat(p.lat), lng: wrapLng(p.lng) });
  };

  const { w, h } = size;
  // Tiles from the nearest whole zoom, stretched for the fraction in between.
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
  const tileSize = TILE * scale;
  // The grid under the tiles moves with the map, so it still feels like one when the tiles are missing.
  const grid = 64 * scale;
  const gridPos = `${(((w / 2 - cx * scale) % grid) + grid) % grid}px ${(((h / 2 - cy * scale) % grid) + grid) % grid}px`;

  // Each face where its place is, taking the nearest copy of the world when the map is wider than it.
  const zx = worldX(view.lng, view.z);
  const zy = worldY(view.lat, view.z);
  const worldW = TILE * 2 ** view.z;
  const pins = locs
    .map((l) => {
      let dx = worldX(l.lng, view.z) - zx;
      dx = ((((dx + worldW / 2) % worldW) + worldW) % worldW) - worldW / 2;
      return { l, left: w / 2 + dx, top: h / 2 + worldY(l.lat, view.z) - zy };
    })
    .filter((p) => p.left > -80 && p.left < w + 80 && p.top > -80 && p.top < h + 80)
    // The chosen face (then yours) on top.
    .sort((a, b) => Number(a.l.user_id === chosen) - Number(b.l.user_id === chosen) || Number(a.l.mine) - Number(b.l.mine));

  return (
    <section className="mx-map" aria-label="Map">
      <div
        ref={box}
        className="mx-map-view"
        role="application"
        aria-label="Map. Drag to move, scroll to zoom."
        aria-roledescription="map"
        tabIndex={0}
        style={{ backgroundSize: `${grid}px ${grid}px`, backgroundPosition: gridPos }}
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
          if (d && !d.moved) onChoose(null);
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
        <div className="mx-map-tiles" aria-hidden="true">
          {tiles.map((t) => (
            <img
              key={t.key}
              src={t.url}
              alt=""
              draggable={false}
              style={{ left: t.left, top: t.top, width: tileSize + 0.5, height: tileSize + 0.5 }}
              onLoad={(e) => e.currentTarget.classList.add('in')}
              onError={(e) => e.currentTarget.classList.add('gone')}
            />
          ))}
        </div>
        {pins.map(({ l, left, top }) => {
          const who = l.mine ? 'You' : l.full_name || l.username;
          return (
            <button
              key={l.user_id}
              type="button"
              className={'mx-map-pin' + (l.mine ? ' mine' : '') + (chosen === l.user_id ? ' on' : '')}
              style={{ transform: `translate(${Math.round(left)}px, ${Math.round(top)}px)` }}
              aria-label={l.mine ? 'Your location' : `${who}. ${updatedLabel(l.updated_at)}`}
              onPointerDown={(e) => e.stopPropagation()}
              onDoubleClick={(e) => e.stopPropagation()}
              onClick={() => onChoose(l.user_id)}
            >
              <span className="mx-map-face">
                <Avatar src={l.avatar_url} name={l.username} size={44} />
              </span>
              <span className="mx-map-label">{l.mine ? 'You' : firstName(l)}</span>
            </button>
          );
        })}
      </div>
      {children}
      <a className="mx-map-credit" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
        © OpenStreetMap contributors
      </a>
    </section>
  );
}
