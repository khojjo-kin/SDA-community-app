import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { recordPodPlay } from './api';
import type { PodItem } from './types';

/*
 * The one Pod player. Screens read it with usePlayer() and useProgress() and drive it with play(), toggle() and friends.
 * Sound itself comes from <PlayerEngine />, mounted once in the tabs layout so a song keeps going while you browse.
 */

export type RepeatMode = 'off' | 'all' | 'one';

type PlayerState = {
  queue: PodItem[];
  /** Queue positions in the order they will play: the queue itself, or a shuffle of it. */
  order: number[];
  /** Where we are in `order`; -1 when nothing is loaded. */
  cursor: number;
  /** What the person asked for. The engine follows it; the sound may lag a moment behind. */
  playing: boolean;
  shuffle: boolean;
  repeat: RepeatMode;
  /** Bumped whenever the engine must (re)load the current track from the start. */
  loadToken: number;
};

type Progress = {
  position: number;
  duration: number;
  loaded: boolean;
  buffering: boolean;
};

let state: PlayerState = { queue: [], order: [], cursor: -1, playing: false, shuffle: false, repeat: 'off', loadToken: 0 };
let progress: Progress = { position: 0, duration: 0, loaded: false, buffering: false };

const stateListeners = new Set<() => void>();
const progressListeners = new Set<() => void>();

function setState(patch: Partial<PlayerState>) {
  state = { ...state, ...patch };
  stateListeners.forEach((l) => l());
}

function setProgress(patch: Partial<Progress>) {
  const next = { ...progress, ...patch };
  if (next.position === progress.position && next.duration === progress.duration && next.loaded === progress.loaded && next.buffering === progress.buffering) return;
  progress = next;
  progressListeners.forEach((l) => l());
}

const subscribeState = (l: () => void) => {
  stateListeners.add(l);
  return () => {
    stateListeners.delete(l);
  };
};
const subscribeProgress = (l: () => void) => {
  progressListeners.add(l);
  return () => {
    progressListeners.delete(l);
  };
};

/** The engine, once mounted, lends the store these so seeking and restarting need no round trip through state. */
type Engine = { play: () => void; pause: () => void; seekTo: (seconds: number) => void };
let engine: Engine | null = null;

export function currentItem(s: PlayerState = state): PodItem | null {
  if (s.cursor < 0 || s.cursor >= s.order.length) return null;
  return s.queue[s.order[s.cursor]] ?? null;
}

function shuffled(count: number, first: number): number[] {
  const rest = Array.from({ length: count }, (_, i) => i).filter((i) => i !== first);
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  return first >= 0 ? [first, ...rest] : rest;
}

function identity(count: number): number[] {
  return Array.from({ length: count }, (_, i) => i);
}

/* ---------- commands ---------- */

/** Starts `items[index]` with `items` as the queue. Playing the track that is already loaded just resumes it. */
export function play(items: PodItem[], index: number) {
  const target = items[index];
  if (!target) return;
  const same = currentItem()?.id === target.id;
  const order = state.shuffle ? shuffled(items.length, index) : identity(items.length);
  const cursor = order.indexOf(index);
  setState({ queue: items, order, cursor, playing: true, loadToken: same ? state.loadToken : state.loadToken + 1 });
  if (!same) setProgress({ position: 0, duration: target.duration_seconds || 0, loaded: false, buffering: true });
}

export function toggle() {
  if (!currentItem()) return;
  setState({ playing: !state.playing });
}

export function pause() {
  if (state.playing) setState({ playing: false });
}

/** The last seek asked for, so a stale position reported just after it does not drag the scrubber back. */
let lastSeek = { at: 0, to: 0 };

/** Back to the start of the loaded track, without reloading it. */
function rewind() {
  lastSeek = { at: Date.now(), to: 0 };
  setProgress({ position: 0 });
  engine?.seekTo(0);
}

/** Moves to the next track. `auto` is the end of a track; a tap always moves on even when repeat is off. */
export function next(auto = false) {
  const cur = currentItem();
  if (!cur) return;
  if (auto && state.repeat === 'one') {
    rewind();
    engine?.play();
    return;
  }
  const last = state.cursor >= state.order.length - 1;
  if (last) {
    if (auto && state.repeat === 'off') {
      // Done. Leave the track loaded so the bar still shows it, rewound and paused.
      setState({ playing: false });
      engine?.pause();
      rewind();
      return;
    }
    if (state.order.length === 1) {
      rewind();
      if (state.playing) engine?.play();
      return;
    }
    const order = state.shuffle ? shuffled(state.queue.length, -1) : state.order;
    setState({ order, cursor: 0, loadToken: state.loadToken + 1 });
  } else {
    setState({ cursor: state.cursor + 1, loadToken: state.loadToken + 1 });
  }
  const item = currentItem();
  setProgress({ position: 0, duration: item?.duration_seconds || 0, loaded: false, buffering: true });
}

/** Back goes to the start of the track after a few seconds in, like every player; before that, to the previous track. */
export function prev() {
  if (!currentItem()) return;
  if (progress.position > 3 || state.cursor <= 0) {
    rewind();
    return;
  }
  setState({ cursor: state.cursor - 1, loadToken: state.loadToken + 1 });
  const item = currentItem();
  setProgress({ position: 0, duration: item?.duration_seconds || 0, loaded: false, buffering: true });
}

/** Jumps to a track already in the queue (by queue position) without reshuffling. */
export function jumpTo(index: number) {
  const item = state.queue[index];
  if (!item) return;
  if (currentItem()?.id === item.id) {
    if (!state.playing) setState({ playing: true });
    return;
  }
  const cursor = state.order.indexOf(index);
  if (cursor < 0) return;
  setState({ cursor, playing: true, loadToken: state.loadToken + 1 });
  setProgress({ position: 0, duration: item.duration_seconds || 0, loaded: false, buffering: true });
}

export function seek(seconds: number) {
  if (!currentItem()) return;
  const to = Math.max(0, Math.min(seconds, progress.duration || seconds));
  lastSeek = { at: Date.now(), to };
  setProgress({ position: to });
  engine?.seekTo(to);
}

export function stop() {
  setState({ queue: [], order: [], cursor: -1, playing: false, loadToken: state.loadToken + 1 });
  setProgress({ position: 0, duration: 0, loaded: false, buffering: false });
}

export function setShuffle(on: boolean) {
  if (on === state.shuffle) return;
  const index = state.cursor >= 0 ? state.order[state.cursor] : -1;
  const order = on ? shuffled(state.queue.length, index) : identity(state.queue.length);
  setState({ shuffle: on, order, cursor: index >= 0 ? order.indexOf(index) : -1 });
}

export function setRepeat(mode: RepeatMode) {
  setState({ repeat: mode });
}

export function cycleRepeat() {
  setRepeat(state.repeat === 'off' ? 'all' : state.repeat === 'all' ? 'one' : 'off');
}

/** Keeps the queue in step with a change made elsewhere, such as saving a track or editing its title. */
export function patchQueued(id: string, patch: Partial<PodItem>) {
  if (!state.queue.some((i) => i.id === id)) return;
  setState({ queue: state.queue.map((i) => (i.id === id ? { ...i, ...patch } : i)) });
}

/** Drops a deleted track; if it was playing, the next one takes over. */
export function removeQueued(id: string) {
  const at = state.queue.findIndex((i) => i.id === id);
  if (at < 0) return;
  const wasCurrent = currentItem()?.id === id;
  const queue = state.queue.filter((i) => i.id !== id);
  const order = state.order.filter((i) => i !== at).map((i) => (i > at ? i - 1 : i));
  if (!queue.length) return stop();
  const cursor = wasCurrent ? Math.min(state.cursor, order.length - 1) : state.cursor > at ? state.cursor - 1 : state.cursor;
  setState({ queue, order, cursor, loadToken: wasCurrent ? state.loadToken + 1 : state.loadToken });
  if (wasCurrent) setProgress({ position: 0, duration: currentItem()?.duration_seconds || 0, loaded: false, buffering: true });
}

/* ---------- hooks ---------- */

export type PlayerSnapshot = PlayerState & {
  current: PodItem | null;
  /** Queue position of the current track, or -1. */
  index: number;
  /** What follows the current track, in play order. */
  upNext: PodItem[];
};

let snapshot: PlayerSnapshot | null = null;
let snapshotFor: PlayerState | null = null;

function getSnapshot(): PlayerSnapshot {
  if (snapshot && snapshotFor === state) return snapshot;
  const current = currentItem();
  const upNext = state.cursor >= 0 ? state.order.slice(state.cursor + 1).map((i) => state.queue[i]).filter(Boolean) : [];
  snapshot = { ...state, current, index: state.cursor >= 0 ? state.order[state.cursor] : -1, upNext };
  snapshotFor = state;
  return snapshot;
}

/** The queue and what is playing. Changes only when a track or setting changes, so lists can use it freely. */
export function usePlayer(): PlayerSnapshot {
  return useSyncExternalStore(subscribeState, getSnapshot, getSnapshot);
}

/** Position and duration, updated a couple of times a second while something plays. Only scrubbers and clocks need this. */
export function useProgress(): Progress {
  return useSyncExternalStore(subscribeProgress, () => progress, () => progress);
}

/* ---------- engine ---------- */

let engines = 0;

/**
 * Owns the expo-audio player. Mount it exactly once, somewhere that never unmounts while the app is open (the tabs layout).
 * A second copy does nothing, so a stray mount cannot start a duplicate sound.
 */
export function PlayerEngine() {
  const [primary, setPrimary] = useState(false);
  useEffect(() => {
    engines++;
    setPrimary(engines === 1);
    return () => {
      engines--;
    };
  }, []);
  return primary ? <Engine /> : null;
}

function Engine() {
  const player = useAudioPlayer(null, { updateInterval: 500 });
  const status = useAudioPlayerStatus(player);
  const snap = usePlayer();
  const current = snap.current;
  const playingRef = useRef(snap.playing);
  playingRef.current = snap.playing;
  /** Which track the native player holds, so a status from the old file is not read as the new one's. */
  const loadedId = useRef<string | null>(null);
  const loadedAt = useRef(0);

  // Songs should be heard with the ring switch off, like any music app.
  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false }).catch(() => {});
  }, []);

  useEffect(() => {
    engine = {
      play: () => {
        try {
          player.play();
        } catch {
          // released
        }
      },
      pause: () => {
        try {
          player.pause();
        } catch {
          // released
        }
      },
      seekTo: (s) => {
        try {
          player.seekTo(s).catch(() => {});
        } catch {
          // released
        }
      },
    };
    return () => {
      engine = null;
    };
  }, [player]);

  // Load whenever the store asks for a fresh start on the current track.
  useEffect(() => {
    try {
      if (!current) {
        // Nothing to play: fall silent. The old file stays loaded natively, which is cheaper and safer than swapping in nothing.
        if (loadedId.current === null) return;
        loadedId.current = null;
        player.pause();
        player.seekTo(0).catch(() => {});
        return;
      }
      loadedId.current = current.id;
      loadedAt.current = Date.now();
      player.replace({ uri: current.audio_url });
      if (playingRef.current) player.play();
      recordPodPlay(current.id);
    } catch {
      // the player was released
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap.loadToken, player]);

  // Follow the play/pause intent.
  useEffect(() => {
    if (!current) return;
    try {
      if (snap.playing) player.play();
      else player.pause();
    } catch {
      // released
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap.playing, player]);

  // Report where we are.
  useEffect(() => {
    if (!current || loadedId.current !== current.id) return;
    // Just after a swap the native side can still report the old file for a tick; a new track never starts a minute in.
    if (Date.now() - loadedAt.current < 800 && status.currentTime > 1) return;
    const duration = status.duration > 0 && Number.isFinite(status.duration) ? status.duration : current.duration_seconds || 0;
    let position = status.isLoaded && Number.isFinite(status.currentTime) ? status.currentTime : 0;
    // A seek takes a moment to land; until it does, keep showing where the person put the handle.
    if (Date.now() - lastSeek.at < 1200 && Math.abs(position - lastSeek.to) > 1.5) position = lastSeek.to;
    setProgress({
      position,
      duration,
      loaded: status.isLoaded,
      buffering: !!status.isBuffering || !status.isLoaded,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status.currentTime, status.duration, status.isLoaded, status.isBuffering]);

  // Move on when a track ends.
  useEffect(() => {
    if (status.didJustFinish && current && loadedId.current === current.id) next(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status.didJustFinish]);

  return null;
}
