// Pod's player: one audio element for the whole app and the bar along the bottom of the window,
// so a song keeps playing while you move around. The queue, shuffle and repeat work as in the
// iPhone app's player (src/lib/player.tsx); the sound comes from a browser audio element.
import React, { useEffect, useSyncExternalStore } from 'react';
import { recordPodPlay } from 'shared/api';
import { clock } from 'shared/theme';
import type { PodItem } from 'shared/types';
import { nav, parts, useRoute } from '../lib/router';
import { Icon } from './kit';
import '../styles/church.css';

export type RepeatMode = 'off' | 'all' | 'one';

type State = {
  queue: PodItem[];
  /** Queue positions in the order they will play: the queue itself, or a shuffle of it. */
  order: number[];
  /** Where we are in `order`; -1 when nothing is loaded. */
  cursor: number;
  playing: boolean;
  shuffle: boolean;
  repeat: RepeatMode;
};

/** Seconds in, the track's length, and whether it is still loading. */
export type Progress = { t: number; d: number; buffering: boolean };

let state: State = { queue: [], order: [], cursor: -1, playing: false, shuffle: false, repeat: 'off' };
let progress: Progress = { t: 0, d: 0, buffering: false };
const stateListeners = new Set<() => void>();
const progressListeners = new Set<() => void>();
/** The one audio element, made by PlayerProvider. */
let audio: HTMLAudioElement | null = null;

function set(patch: Partial<State>) {
  state = { ...state, ...patch };
  stateListeners.forEach((l) => l());
}

function setProgress(patch: Partial<Progress>) {
  const next = { ...progress, ...patch };
  if (next.t === progress.t && next.d === progress.d && next.buffering === progress.buffering) return;
  progress = next;
  progressListeners.forEach((l) => l());
}

const currentItem = (s: State = state): PodItem | null => (s.cursor >= 0 && s.cursor < s.order.length ? s.queue[s.order[s.cursor]] ?? null : null);

function shuffled(count: number, first: number): number[] {
  const rest = Array.from({ length: count }, (_, i) => i).filter((i) => i !== first);
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  return first >= 0 ? [first, ...rest] : rest;
}
const identity = (count: number) => Array.from({ length: count }, (_, i) => i);

/** Puts the current track in the audio element from the start, and plays it if playing. */
function load() {
  const it = currentItem();
  if (!audio || !it) return;
  audio.src = it.audio_url;
  setProgress({ t: 0, d: it.duration_seconds || 0, buffering: true });
  if (state.playing) audio.play().catch(() => set({ playing: false }));
  recordPodPlay(it.id);
  if ('mediaSession' in navigator && typeof MediaMetadata !== 'undefined') {
    navigator.mediaSession.metadata = new MediaMetadata({ title: it.title, artist: it.artist || it.full_name, artwork: it.cover_url ? [{ src: it.cover_url }] : [] });
  }
}

function rewind() {
  if (audio) audio.currentTime = 0;
  setProgress({ t: 0 });
}

/* ---------- commands ---------- */

/** Plays `item` with `list` as the queue. The track already loaded just pauses or carries on. */
function play(item: PodItem, list?: PodItem[]) {
  if (currentItem()?.id === item.id) {
    toggle();
    return;
  }
  const queue = list && list.some((x) => x.id === item.id) ? list : [item];
  const index = queue.findIndex((x) => x.id === item.id);
  const order = state.shuffle ? shuffled(queue.length, index) : identity(queue.length);
  set({ queue, order, cursor: order.indexOf(index), playing: true });
  load();
}

function toggle() {
  if (!audio || !currentItem()) return;
  if (audio.paused) {
    set({ playing: true });
    audio.play().catch(() => set({ playing: false }));
  } else {
    set({ playing: false });
    audio.pause();
  }
}

/** The next track. `auto` is the end of a track; pressing Next always moves on, even with repeat off. */
function next(auto = false) {
  if (!currentItem()) return;
  if (auto && state.repeat === 'one') {
    rewind();
    audio?.play().catch(() => set({ playing: false }));
    return;
  }
  if (state.cursor >= state.order.length - 1) {
    if (auto && state.repeat === 'off') {
      // Done: the track stays in the bar, rewound and paused.
      set({ playing: false });
      audio?.pause();
      rewind();
      return;
    }
    if (state.order.length === 1) {
      rewind();
      if (state.playing) audio?.play().catch(() => set({ playing: false }));
      return;
    }
    set({ order: state.shuffle ? shuffled(state.queue.length, -1) : state.order, cursor: 0 });
  } else set({ cursor: state.cursor + 1 });
  load();
}

/** Back to the start after a few seconds in, as every player does; before that, the previous track. */
function prev() {
  if (!currentItem()) return;
  if (progress.t > 3 || state.cursor <= 0) {
    rewind();
    return;
  }
  set({ cursor: state.cursor - 1 });
  load();
}

/** Plays a track already in the queue, keeping the order. */
function jumpTo(id: string) {
  const index = state.queue.findIndex((x) => x.id === id);
  const cursor = state.order.indexOf(index);
  if (cursor < 0) return;
  if (cursor === state.cursor) {
    if (!state.playing) toggle();
    return;
  }
  set({ cursor, playing: true });
  load();
}

function seek(seconds: number) {
  if (!audio || !currentItem()) return;
  const to = Math.max(0, Math.min(seconds, progress.d || seconds));
  audio.currentTime = to;
  setProgress({ t: to });
}

function setShuffle(on: boolean) {
  if (on === state.shuffle) return;
  const index = state.cursor >= 0 ? state.order[state.cursor] : -1;
  const order = on ? shuffled(state.queue.length, index) : identity(state.queue.length);
  set({ shuffle: on, order, cursor: index >= 0 ? order.indexOf(index) : -1 });
}

function cycleRepeat() {
  set({ repeat: state.repeat === 'off' ? 'all' : state.repeat === 'all' ? 'one' : 'off' });
}

/** Keeps the queue in step with a change made elsewhere, such as saving a track to the library. */
function patchQueued(id: string, patch: Partial<PodItem>) {
  if (!state.queue.some((i) => i.id === id)) return;
  set({ queue: state.queue.map((i) => (i.id === id ? { ...i, ...patch } : i)) });
}

/** Drops a deleted track; if it was playing, the next one takes over. */
function removeQueued(id: string) {
  const at = state.queue.findIndex((i) => i.id === id);
  if (at < 0) return;
  const wasCurrent = currentItem()?.id === id;
  const queue = state.queue.filter((i) => i.id !== id);
  if (!queue.length) return stop();
  const order = state.order.filter((i) => i !== at).map((i) => (i > at ? i - 1 : i));
  const cursor = wasCurrent ? Math.min(state.cursor, order.length - 1) : state.cursor > state.order.indexOf(at) ? state.cursor - 1 : state.cursor;
  set({ queue, order, cursor });
  if (wasCurrent) load();
}

/** Stops and clears the player; the bar goes away. */
function stop() {
  audio?.pause();
  set({ queue: [], order: [], cursor: -1, playing: false });
  setProgress({ t: 0, d: 0, buffering: false });
}

/* ---------- reading it ---------- */

export type Player = {
  /** The track loaded now, or null. */
  item: PodItem | null;
  playing: boolean;
  queue: PodItem[];
  /** What follows the current track, in play order. */
  upNext: PodItem[];
  shuffle: boolean;
  repeat: RepeatMode;
  play: (item: PodItem, queue?: PodItem[]) => void;
  toggle: () => void;
  next: () => void;
  prev: () => void;
  seek: (seconds: number) => void;
  jumpTo: (id: string) => void;
  setShuffle: (on: boolean) => void;
  cycleRepeat: () => void;
  patch: (id: string, patch: Partial<PodItem>) => void;
  remove: (id: string) => void;
  stop: () => void;
};

const commands = { play, toggle, next: () => next(), prev, seek, jumpTo, setShuffle, cycleRepeat, patch: patchQueued, remove: removeQueued, stop };
let snapshot: Player | null = null;
let snapshotOf: State | null = null;
function getSnapshot(): Player {
  if (snapshot && snapshotOf === state) return snapshot;
  const upNext = state.cursor >= 0 ? state.order.slice(state.cursor + 1).map((i) => state.queue[i]).filter(Boolean) : [];
  snapshot = { item: currentItem(), playing: state.playing, queue: state.queue, upNext, shuffle: state.shuffle, repeat: state.repeat, ...commands };
  snapshotOf = state;
  return snapshot;
}

const subscribe = (set: Set<() => void>) => (l: () => void) => {
  set.add(l);
  return () => {
    set.delete(l);
  };
};
const subscribeState = subscribe(stateListeners);
const subscribeProgress = subscribe(progressListeners);

/** What is playing and the commands to change it. Changes only when a track or a setting changes. */
export const usePlayer = (): Player => useSyncExternalStore(subscribeState, getSnapshot);

/** Position and length, a few times a second while something plays. Only clocks and scrubbers need this. */
export const useProgress = (): Progress => useSyncExternalStore(subscribeProgress, () => progress);

/** Shuffle and repeat as round buttons, green when on. Shared by the bar and the full player. */
export function ShuffleRepeat({ size = 18, className = 'icon-btn' }: { size?: number; className?: string }) {
  const p = usePlayer();
  const repeatLabel = p.repeat === 'off' ? 'Repeat off' : p.repeat === 'all' ? 'Repeat all' : 'Repeat this track';
  return (
    <>
      <button className={className + ' ch-toggle' + (p.shuffle ? ' on' : '')} aria-label={p.shuffle ? 'Shuffle on' : 'Shuffle off'} aria-pressed={p.shuffle} title="Shuffle" onClick={() => p.setShuffle(!p.shuffle)}>
        <Icon name="shuffle" size={size} />
      </button>
      <button className={className + ' ch-toggle' + (p.repeat !== 'off' ? ' on' : '')} aria-label={repeatLabel} aria-pressed={p.repeat !== 'off'} title={repeatLabel} onClick={p.cycleRepeat}>
        <Icon name="repeat" size={size} />
        {p.repeat === 'one' ? <span className="ch-one">1</span> : null}
      </button>
    </>
  );
}

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const route = useRoute();
  const p = usePlayer();
  const pos = useProgress();

  useEffect(() => {
    const a = new Audio();
    a.preload = 'auto';
    audio = a;
    const update = () => setProgress({ t: a.currentTime, d: isFinite(a.duration) && a.duration > 0 ? a.duration : currentItem()?.duration_seconds || 0 });
    const on: [string, () => void][] = [
      ['timeupdate', update],
      ['loadedmetadata', update],
      ['playing', () => setProgress({ buffering: false })],
      ['canplay', () => setProgress({ buffering: false })],
      ['waiting', () => setProgress({ buffering: true })],
      ['play', () => state.playing || set({ playing: true })],
      ['pause', () => state.playing && set({ playing: false })],
      ['ended', () => next(true)],
    ];
    for (const [e, fn] of on) a.addEventListener(e, fn);
    // The keyboard's media keys (and the Mac's Now Playing controls) drive the same player.
    const keys: [MediaSessionAction, () => void][] = [
      ['play', () => audio?.paused && toggle()],
      ['pause', () => audio && !audio.paused && toggle()],
      ['previoustrack', prev],
      ['nexttrack', () => next()],
    ];
    for (const [k, fn] of keys) {
      try {
        navigator.mediaSession?.setActionHandler(k, fn);
      } catch {
        // Not offered by this browser.
      }
    }
    return () => {
      for (const [e, fn] of on) a.removeEventListener(e, fn);
      a.pause();
      a.src = '';
      if (audio === a) audio = null;
    };
  }, []);

  // The full player (/pod/<id>) shows everything the bar does, so the bar steps aside there.
  const seg = parts(route);
  const onItsPage = !!p.item && seg[0] === 'pod' && seg[1] === p.item.id;
  const item = p.item;

  return (
    <>
      {children}
      {item && !onItsPage ? (
        <div className="now-playing" role="region" aria-label="Now playing">
          <button className="ch-bar-open" onClick={() => nav('/pod/' + item.id)} aria-label={'Open the player: ' + item.title} title="Open the player">
            <span className="np-art">{item.cover_url ? <img src={item.cover_url} alt="" /> : <Icon name={item.kind === 'podcast' ? 'podcast' : 'music'} size={20} />}</span>
            <span className="row-text">
              <b>{item.title}</b>
              <span>{item.artist || item.full_name}</span>
            </span>
          </button>
          <button className="icon-btn" aria-label="Previous" onClick={p.prev}>
            <Icon name="skipback" size={18} />
          </button>
          <button className="np-play" aria-label={p.playing ? 'Pause' : 'Play'} onClick={p.toggle}>
            <Icon name={p.playing ? 'pause' : 'play'} size={18} />
          </button>
          <button className="icon-btn" aria-label="Next" onClick={p.next}>
            <Icon name="skipnext" size={18} />
          </button>
          <span className="np-time">{clock(pos.t)}</span>
          <input className="np-seek" type="range" min={0} max={pos.d || 1} step={1} value={Math.min(pos.t, pos.d || 1)} onChange={(e) => p.seek(Number(e.target.value))} aria-label="Position" />
          <span className="np-time">{clock(pos.d)}</span>
          <ShuffleRepeat size={16} className="icon-btn tiny" />
          <button className="icon-btn" aria-label="Close player" onClick={p.stop}>
            <Icon name="close" size={18} />
          </button>
        </div>
      ) : null}
    </>
  );
}
