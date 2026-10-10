import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useToast } from '../components/ui';
import { recordPodPlay } from './api';
import { useCalls } from './calls';
import { t } from './i18n';
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
  // The same track resumes, unless it never loaded (it timed out): then it is loaded again.
  const same = currentItem()?.id === target.id && (state.playing || progress.loaded);
  const order = state.shuffle ? shuffled(items.length, index) : identity(items.length);
  const cursor = order.indexOf(index);
  setState({ queue: items, order, cursor, playing: true, loadToken: same ? state.loadToken : state.loadToken + 1 });
  if (!same) setProgress({ position: 0, duration: target.duration_seconds || 0, loaded: false, buffering: true });
}

export function toggle() {
  if (!currentItem()) return;
  // A track that never loaded (it timed out, or the connection dropped): Play loads it again.
  if (!state.playing && !progress.loaded) {
    setState({ playing: true, loadToken: state.loadToken + 1 });
    setProgress({ position: 0, buffering: true });
    return;
  }
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

/** Only whether the track is still loading: for something that shows a spinner, and should not draw again with every tick of the clock. */
export function useBuffering(): boolean {
  return useSyncExternalStore(subscribeProgress, () => progress.buffering, () => progress.buffering);
}

const trackState = (id: string): 'playing' | 'paused' | null => (currentItem()?.id === id ? (state.playing ? 'playing' : 'paused') : null);

/**
 * 'playing' or 'paused' when `id` is the track loaded now, null for any other. For rows in a list:
 * each draws again only when its own track starts, stops or changes, not whenever anything does.
 */
export function useTrackState(id: string): 'playing' | 'paused' | null {
  return useSyncExternalStore(subscribeState, () => trackState(id), () => trackState(id));
}

const hasTrack = () => !!currentItem();

/** Whether a track is loaded, so the player bar is showing. Changes only when that does. */
export function useHasTrack(): boolean {
  return useSyncExternalStore(subscribeState, hasTrack, hasTrack);
}

/** Room to leave at the foot of a tab's list for the player bar over the tab bar: its height and the gap above it. */
export const PLAYER_BAR_SPACE = 68;

/** Room at the foot of a tab screen's list so its last row clears the tab bar, and the player bar when it shows. */
export function useTabListBottom(): number {
  return 110 + (useHasTrack() ? PLAYER_BAR_SPACE : 0);
}

/* ---------- engine ---------- */

let engines = 0;

/**
 * The track the engine last loaded, and for which load (the store's loadToken). It outlives the engine:
 * the tab bar it sits in is put back after a theme change, and the new engine uses this to tell that
 * remount apart from a request for a fresh start. The position to carry on from is `progress.position`.
 */
let engineTrack: { id: string; token: number } | null = null;

/**
 * Owns the expo-audio player. Mount it exactly once, somewhere that stays while the app is open (the tabs layout).
 * A second copy does nothing, so a stray mount cannot start a duplicate sound. When that place is drawn again
 * (a theme change does this), the new engine picks the track up where the old one left it: see `engineTrack`.
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

/**
 * How Pod's sound is set up: heard with the ring switch off, like any music app, and carrying on with
 * the screen locked or another app open (the app may play audio in the background). Other apps' sound
 * may still play alongside, as before.
 */
const AUDIO_MODE = { playsInSilentMode: true, shouldPlayInBackground: true, allowsRecording: false } as const;

/** Whether a call is on (or ringing), kept by the engine. */
let callOn = false;
/** How many voice recordings are going on now (a voice message, a voice-over in the post editor). */
let recordings = 0;

/**
 * Says a recording has started (true) or ended (false). While one goes on, Pod leaves the sound's setup
 * alone: switching recording off, as Pod's setup does, would stop the recording half-way.
 */
export function markRecording(on: boolean) {
  recordings = Math.max(0, recordings + (on ? 1 : -1));
}

/**
 * Sets Pod's sound up again. Other screens set their own (voice messages, a post's music), and any
 * setting they leave out goes back to its default, background play included, so this is repeated
 * whenever Pod starts to play and as the app goes into the background while it plays.
 */
function claimAudio() {
  // A call has the sound set up for talking (the microphone on): Pod leaves it alone until the call is
  // over, when the call puts the same setup back. Otherwise a track moving on, or the phone being locked,
  // mid-call would cut the microphone off.
  if (callOn || recordings > 0) return;
  setAudioModeAsync(AUDIO_MODE).catch(() => {});
}

/**
 * When the app last told the sound what to do. The sound's own reports trail a command by a moment,
 * so one isn't taken for the phone's doing (see the engine) until this long after it.
 */
let commandAt = 0;
const SETTLE_MS = 1500;
/** A pause or a start the phone made by itself, passed on to the store; the engine doesn't send it back as a command. */
let phoneSaid: { playing: boolean; at: number } | null = null;
/** How long a track may take to start playing before the spinner gives way and the member is told. */
const LOAD_TIMEOUT_MS = 25000;

function Engine() {
  const toast = useToast();
  const { inCall } = useCalls();
  useEffect(() => {
    callOn = inCall;
  }, [inCall]);
  const player = useAudioPlayer(null, { updateInterval: 500 });
  const status = useAudioPlayerStatus(player);
  const snap = usePlayer();
  const current = snap.current;
  const playingRef = useRef(snap.playing);
  playingRef.current = snap.playing;
  const statusRef = useRef(status);
  statusRef.current = status;
  /** Which track the native player holds, so a status from the old file is not read as the new one's. */
  const loadedId = useRef<string | null>(null);
  const loadedAt = useRef(0);
  /** Set after a remount: where to put the track back to once the file is in, before it may play. */
  const resumeAt = useRef<number | null>(null);

  useEffect(() => {
    claimAudio();
    // Going to the background (or the screen locking) while a track plays: make sure it may carry on.
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active' && state.playing && currentItem()) claimAudio();
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    engine = {
      play: () => {
        commandAt = Date.now();
        try {
          claimAudio();
          player.play();
        } catch {
          // released
        }
      },
      pause: () => {
        commandAt = Date.now();
        try {
          player.pause();
        } catch {
          // released
        }
      },
      seekTo: (s) => {
        commandAt = Date.now();
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
    commandAt = Date.now();
    try {
      if (!current) {
        engineTrack = null;
        resumeAt.current = null;
        // Nothing to play: fall silent. The old file stays loaded natively, which is cheaper and safer than swapping in nothing.
        if (loadedId.current === null) return;
        loadedId.current = null;
        player.pause();
        player.seekTo(0).catch(() => {});
        return;
      }
      // The same load an earlier engine already made: this engine is a remount (the tab bar is drawn
      // again after a theme change), not a new start. Carry on from where it was, and don't count a play.
      const resuming = engineTrack?.id === current.id && engineTrack.token === snap.loadToken;
      engineTrack = { id: current.id, token: snap.loadToken };
      loadedId.current = current.id;
      loadedAt.current = Date.now();
      player.replace({ uri: current.audio_url });
      if (resuming) {
        resumeAt.current = progress.position;
        return;
      }
      resumeAt.current = null;
      if (playingRef.current) {
        claimAudio();
        player.play();
      }
      recordPodPlay(current.id);
    } catch {
      // the player was released
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap.loadToken, player]);

  // Follow the play/pause intent.
  useEffect(() => {
    // The phone did this itself (see below), so the sound is already that way.
    const said = phoneSaid;
    phoneSaid = null;
    if (said && said.playing === snap.playing && Date.now() - said.at < 1000) return;
    // While a remount puts the track back in place, playing waits for that (the effect below starts it).
    if (!current || resumeAt.current !== null) return;
    commandAt = Date.now();
    try {
      if (snap.playing) {
        claimAudio();
        player.play();
      } else player.pause();
    } catch {
      // released
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap.playing, player]);

  // The phone paused or restarted the sound by itself: headphones taken out, a call coming in or
  // ending, the headphones' own button. The buttons on every screen follow, so they never show Pause
  // over silence. Reports just after the app's own command are left alone until it has settled.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const check = () => {
      timer = null;
      const s = statusRef.current;
      const item = currentItem();
      if (!item || loadedId.current !== item.id || resumeAt.current !== null || !s.isLoaded) return;
      const wait = SETTLE_MS - (Date.now() - commandAt);
      if (wait > 0) {
        timer = setTimeout(check, wait + 50);
        return;
      }
      // The end of a track stops the sound too; the track moving on handles that. (When the file doesn't
      // say how long it is, the length saved with the track stands in, so its end isn't taken for a pause.)
      const length = s.duration > 0 && Number.isFinite(s.duration) ? s.duration : item.duration_seconds || 0;
      const ending = s.didJustFinish || (length > 0 && s.currentTime >= length - 1);
      if (state.playing && !s.playing && !s.isBuffering && s.timeControlStatus !== 'waitingToPlayAtSpecifiedRate' && !ending) {
        phoneSaid = { playing: false, at: Date.now() };
        setState({ playing: false });
      } else if (!state.playing && s.playing) {
        phoneSaid = { playing: true, at: Date.now() };
        setState({ playing: true });
      }
    };
    check();
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [status.playing, status.isBuffering, status.timeControlStatus, status.isLoaded]);

  // A track that never arrives (a broken link, no connection): stop waiting after a while and say so,
  // rather than spinning for ever. Play tries again.
  useEffect(() => {
    if (!current || !snap.playing || status.isLoaded) return;
    const token = snap.loadToken;
    const timer = setTimeout(() => {
      if (state.loadToken !== token || !state.playing || statusRef.current.isLoaded) return;
      setState({ playing: false });
      setProgress({ buffering: false });
      toast(t('pod.cantPlay'));
    }, LOAD_TIMEOUT_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap.loadToken, snap.playing, status.isLoaded]);

  // After a remount, once the file is in: back to where the last engine was, then play only if it was playing.
  useEffect(() => {
    const at = resumeAt.current;
    if (at === null || !status.isLoaded || !current || loadedId.current !== current.id) return;
    resumeAt.current = null;
    lastSeek = { at: Date.now(), to: at };
    commandAt = Date.now();
    const id = current.id;
    const go = () => {
      commandAt = Date.now();
      try {
        if (playingRef.current && loadedId.current === id && resumeAt.current === null) player.play();
      } catch {
        // released
      }
    };
    try {
      player.seekTo(at).then(go, go);
    } catch {
      // released
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status.isLoaded, player]);

  // Report where we are.
  useEffect(() => {
    if (!current || loadedId.current !== current.id) return;
    // Just after a swap the native side can still report the old file for a tick; a new track never starts a minute in.
    if (Date.now() - loadedAt.current < 800 && status.currentTime > 1) return;
    const duration = status.duration > 0 && Number.isFinite(status.duration) ? status.duration : current.duration_seconds || 0;
    let position = status.isLoaded && Number.isFinite(status.currentTime) ? status.currentTime : 0;
    // A seek takes a moment to land; until it does, keep showing where the person put the handle.
    if (Date.now() - lastSeek.at < 1200 && Math.abs(position - lastSeek.to) > 1.5) position = lastSeek.to;
    // Still putting the track back after a remount: keep showing where it was, not the new player's 0:00.
    if (resumeAt.current !== null) position = resumeAt.current;
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
