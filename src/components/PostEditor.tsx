import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Image as RNImage, KeyboardAvoidingView, PanResponder, PixelRatio, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus, useAudioRecorder } from 'expo-audio';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { ColorMatrix } from 'react-native-color-matrix-image-filters';
import type { Matrix } from 'react-native-color-matrix-image-filters';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { captureRef } from 'react-native-view-shot';
import { fetchPod } from '../lib/api';
import { Adjust, DEFAULT_ADJUST, isPlainLook, lookMatrix, NORMAL_FILTER } from '../lib/filters';
import { C, clock, DARK, errText } from '../lib/theme';
import type { Overlay, PodItem } from '../lib/types';
import { AdjustStrip, Slider } from './AdjustStrip';
import { FilterStrip } from './FilterStrip';
import { Icon, IconName } from './Icon';
import type { PickedItem } from './MediaPicker';
import { DarkEmpty, DarkLoading } from './OnDark';
import { overlayBox, OverlayLabel } from './StoryCanvas';
import { Empty, Loading, SearchField, Sheet, useToast } from './ui';
import { markRecording } from '../lib/player';

/* ---------- what an edited photo carries ---------- */

/**
 * Everything done to one photo in the editor. The look and the overlays are baked into the uploaded
 * file at share time; `alt` (alt text) goes with the uploaded photo as words.
 */
export type PhotoEdit = { filter: string; adjust: Adjust; overlays: Overlay[]; alt?: string };

export const PLAIN_EDIT: PhotoEdit = { filter: NORMAL_FILTER, adjust: DEFAULT_ADJUST, overlays: [] };

/** The longest alt text kept for one photo. */
export const ALT_MAX = 300;

/** True when the photo can be uploaded exactly as it came from the library (alt text changes nothing in the file). */
export function isPlainEdit(e: PhotoEdit | null | undefined): boolean {
  return !e || (isPlainLook(e.filter, e.adjust) && e.overlays.length === 0);
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const COLORS = ['#ffffff', '#000000', '#ff3040', '#ff8a3d', '#ffd23f', '#3ddc84', '#4a5df6', '#ff5fa2'];
const EMOJI = ['😀', '😂', '🥹', '😍', '🙏', '❤️', '🔥', '✨', '💯', '👏', '🙌', '👍', '🎉', '🌹', '🌈', '☀️', '🌙', '⭐', '🕊️', '📖', '🎶', '🫶', '😇', '✅'];
const WORDS = ['Blessed', 'Sabbath', 'Amen', 'Grace', 'Praise'];
const VOICE_LIMIT_MS = 60000;
const COVER_COUNT = 8;

/** A height for something new that is not on top of what is already in the middle of the photo. */
function freeY(taken: Overlay[], want: number): number {
  const clear = (y: number) => taken.every((o) => Math.abs(o.x - 0.5) > 0.22 || Math.abs(o.y - y) > 0.085);
  for (let i = 0; i < 8; i++) {
    for (const y of [want + i * 0.1, want - i * 0.1]) if (y >= 0.12 && y <= 0.88 && clear(y)) return y;
  }
  return want;
}

/* ---------- baking the look and the overlays into a file ---------- */

type Job = { seq: number; uri: string; matrix: Matrix | null; overlays: Overlay[]; width: number; height: number; resolve: (uri: string) => void; reject: (e: Error) => void };
type Host = { start: (job: Job) => void };

const hosts: Host[] = [];
let queue: Promise<unknown> = Promise.resolve();
let seq = 0;
const MAX_W = 1600;
const MAX_H = 2000;
const SETTLE_MS = 600;
const GIVE_UP_MS = 30000;

function fitSize(width: number, height: number): { w: number; h: number } | null {
  if (!(width > 0) || !(height > 0)) return null;
  const k = Math.min(1, MAX_W / width, MAX_H / height);
  return { w: Math.max(1, Math.round(width * k)), h: Math.max(1, Math.round(height * k)) };
}

/** One export: the photo under its colour matrix with the overlays on top, parked off the left edge of the screen. */
function OffscreenCapture({ job, onDone }: { job: Job; onDone: (out: string | Error) => void }) {
  const ref = useRef<View>(null);
  const [size, setSize] = useState(() => fitSize(job.width, job.height));
  const latest = useRef(onDone);
  latest.current = onDone;
  const finished = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const finish = useCallback((out: string | Error) => {
    if (finished.current) return;
    finished.current = true;
    latest.current(out);
  }, []);
  const later = useCallback((ms: number, fn: () => void) => {
    timers.current.push(setTimeout(fn, ms));
  }, []);
  useEffect(() => {
    const t = timers.current;
    return () => {
      t.forEach((id) => clearTimeout(id));
      t.length = 0;
    };
  }, []);
  useEffect(() => {
    if (size) return;
    let live = true;
    RNImage.getSize(
      job.uri,
      (w, h) => {
        if (!live) return;
        const s = fitSize(w, h);
        if (s) setSize(s);
        else finish(new Error('That photo could not be opened.'));
      },
      () => {
        if (live) finish(new Error('That photo could not be opened.'));
      },
    );
    return () => {
      live = false;
    };
  }, [job.uri, size, finish]);
  useEffect(() => {
    later(GIVE_UP_MS, () => finish(new Error('Preparing the photo took too long. Try again.')));
  }, [later, finish]);

  function capture() {
    later(SETTLE_MS, () => {
      captureRef(ref, { format: 'jpg', quality: 0.95, result: 'tmpfile', useRenderInContext: Platform.OS === 'ios' }).then(
        (out) => finish(out),
        (e) => finish(e instanceof Error ? e : new Error('The edited photo could not be saved.')),
      );
    });
  }

  if (!size) return null;
  const scale = PixelRatio.get();
  const w = size.w / scale;
  const h = size.h / scale;
  const image = <RNImage source={{ uri: job.uri }} style={{ width: w, height: h }} resizeMode="cover" fadeDuration={0} onLoad={capture} onError={() => finish(new Error('That photo could not be opened.'))} />;
  return (
    <View ref={ref} collapsable={false} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ position: 'absolute', left: -10000, top: 0, width: w, height: h, backgroundColor: '#000' }}>
      {job.matrix ? <ColorMatrix matrix={job.matrix} style={{ width: w, height: h }}>{image}</ColorMatrix> : image}
      {job.overlays.map((o) => (
        <View key={o.id} pointerEvents="none" style={overlayBox(o, w, h)}>
          <OverlayLabel o={o} frameW={w} />
        </View>
      ))}
    </View>
  );
}

function LookExporter() {
  const [job, setJob] = useState<Job | null>(null);
  const current = useRef<Job | null>(null);
  useEffect(() => {
    const host: Host = {
      start: (j) => {
        current.current = j;
        setJob(j);
      },
    };
    hosts.push(host);
    return () => {
      const i = hosts.indexOf(host);
      if (i >= 0) hosts.splice(i, 1);
      const j = current.current;
      current.current = null;
      if (j) j.reject(new Error('The screen closed before the photo was prepared.'));
    };
  }, []);
  const settle = useCallback((j: Job, out: string | Error) => {
    if (current.current !== j) return;
    current.current = null;
    setJob(null);
    if (out instanceof Error) j.reject(out);
    else j.resolve(out);
  }, []);
  if (!job) return null;
  return <OffscreenCapture key={job.seq} job={job} onDone={(out) => settle(job, out)} />;
}

/** Draws the photo with its filter, adjustments and overlays and returns a temporary JPEG. For a plain edit it returns the uri unchanged. */
function renderEdited(uri: string, edit: PhotoEdit, width: number, height: number): Promise<string> {
  if (isPlainEdit(edit)) return Promise.resolve(uri);
  const matrix = isPlainLook(edit.filter, edit.adjust) ? null : lookMatrix(edit.filter, edit.adjust);
  const run = () =>
    new Promise<string>((resolve, reject) => {
      const host = hosts[hosts.length - 1];
      if (!host) {
        reject(new Error('Editing is not ready on this screen. Try again.'));
        return;
      }
      host.start({ seq: ++seq, uri, matrix, overlays: edit.overlays, width, height, resolve, reject });
    });
  const result = queue.then(run, run);
  queue = result.catch(() => undefined);
  return result;
}

/** Render `exporter` once on the screen, then `exportEdited` bakes a photo's edits into a file at share time. */
export function useLookExport(): { exportEdited: (uri: string, edit: PhotoEdit, width: number, height: number) => Promise<string>; exporter: React.ReactNode } {
  const exporter = useMemo(() => <LookExporter />, []);
  return { exportEdited: renderEdited, exporter };
}

/* ---------- pieces of the editor ---------- */

type Frame = { w: number; h: number };

/** Text or a sticker that can be dragged around the photo. Tap to select it. */
function EditableOverlay({ o, frame, selected, onTap, onMove, onDrag }: { o: Overlay; frame: Frame; selected: boolean; onTap: () => void; onMove: (x: number, y: number) => void; onDrag: (on: boolean) => void }) {
  const latest = useRef({ o, frame, onTap, onMove, onDrag });
  latest.current = { o, frame, onTap, onMove, onDrag };
  const start = useRef({ x: 0, y: 0, moved: false });
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        start.current = { x: latest.current.o.x, y: latest.current.o.y, moved: false };
        latest.current.onDrag(true);
      },
      onPanResponderMove: (_e, g) => {
        if (Math.abs(g.dx) + Math.abs(g.dy) > 5) start.current.moved = true;
        if (!start.current.moved) return;
        const f = latest.current.frame;
        latest.current.onMove(clamp(start.current.x + g.dx / f.w, 0.04, 0.96), clamp(start.current.y + g.dy / f.h, 0.05, 0.95));
      },
      onPanResponderRelease: () => {
        latest.current.onDrag(false);
        if (!start.current.moved) latest.current.onTap();
      },
      onPanResponderTerminate: () => latest.current.onDrag(false),
    }),
  ).current;
  return (
    <View pointerEvents="box-none" style={overlayBox(o, frame.w, frame.h)}>
      <View {...pan.panHandlers} accessible accessibilityRole="button" accessibilityLabel={`${o.kind === 'emoji' ? 'Sticker' : 'Text'}: ${o.text}. Drag to move, tap for options.`} style={{ padding: 4, borderRadius: 10, borderWidth: 1.5, borderStyle: 'dashed', borderColor: selected ? 'rgba(255,255,255,0.9)' : 'transparent' }}>
        <OverlayLabel o={o} frameW={frame.w} />
      </View>
    </View>
  );
}

function Tool({ icon, cc, label, onPress, active, dim }: { icon?: IconName; cc?: boolean; label: string; onPress: () => void; active?: boolean; dim?: boolean }) {
  const ink = active ? '#000' : '#fff';
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: !!active }} style={({ pressed }) => ({ alignItems: 'center', gap: 6, width: 62, opacity: pressed ? 0.65 : dim ? 0.45 : 1 })}>
      <View style={{ width: 52, height: 52, borderRadius: 15, backgroundColor: active ? '#fff' : '#2a2d32', alignItems: 'center', justifyContent: 'center' }}>
        {cc ? (
          <View style={{ paddingHorizontal: 4, paddingVertical: 1, borderRadius: 5, borderWidth: 2, borderColor: ink }}>
            <Text style={{ color: ink, fontWeight: '800', fontSize: 12, letterSpacing: 0.5 }}>CC</Text>
          </View>
        ) : icon ? (
          <Icon name={icon} size={25} color={ink} />
        ) : null}
      </View>
      <Text style={{ color: DARK.fg2, fontSize: 12.5 }}>{label}</Text>
    </Pressable>
  );
}

function SmallRound({ icon, text, label, onPress }: { icon?: IconName; text?: string; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={4} accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => ({ width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(38,38,40,0.9)', alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}>
      {icon ? <Icon name={icon} size={22} color="#fff" /> : <Text style={{ color: '#fff', fontSize: 17, fontWeight: '600' }}>{text}</Text>}
    </Pressable>
  );
}

function Swatches({ value, onPick }: { value: string; onPick: (c: string) => void }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10 }}>
      {COLORS.map((c) => (
        <Pressable key={c} onPress={() => onPick(c)} hitSlop={4} accessibilityRole="button" accessibilityLabel={`Colour ${c}`} accessibilityState={{ selected: value === c }} style={{ width: value === c ? 32 : 26, height: value === c ? 32 : 26, borderRadius: 16, backgroundColor: c, borderWidth: 2, borderColor: '#fff' }} />
      ))}
    </View>
  );
}

function Pill({ label, icon, onPress, primary, disabled }: { label: string; icon?: IconName; onPress: () => void; primary?: boolean; disabled?: boolean }) {
  return (
    <Pressable onPress={disabled ? undefined : onPress} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: !!disabled }} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, height: 42, paddingHorizontal: 18, borderRadius: 21, backgroundColor: primary ? DARK.accent : '#2a2d32', opacity: disabled ? 0.5 : pressed ? 0.7 : 1 })}>
      {icon && !primary ? <Icon name={icon} size={18} color="#fff" /> : null}
      <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>{label}</Text>
      {icon && primary ? <Icon name={icon} size={18} color="#fff" weight={2.4} /> : null}
    </Pressable>
  );
}

/* ---------- the editor ---------- */

type ToolName = null | 'audio' | 'text' | 'voice' | 'caption' | 'overlay' | 'edit' | 'cover';

/**
 * The second step of sharing: the photos (or the one video) on a black canvas with the tools under
 * them. Edits, the song, the caption and the video cover live in the screen that renders this, so
 * they survive moving on to the share step and back.
 */
export function PostEditor({
  items,
  edits,
  setEdits,
  audio,
  onAudio,
  caption,
  onCaption,
  poster,
  onPoster,
  plus,
  onClose,
  onNext,
}: {
  items: PickedItem[];
  edits: PhotoEdit[];
  setEdits: React.Dispatch<React.SetStateAction<PhotoEdit[]>>;
  audio: PodItem | null;
  onAudio: (a: PodItem | null) => void;
  caption: string;
  onCaption: (s: string) => void;
  /** Videos: the frame used as the cover, as a local file. */
  poster: string;
  onPoster: (uri: string) => void;
  /** Community Plus: unlocks the adjustment sliders. */
  plus: boolean;
  onClose: () => void;
  onNext: () => void;
}) {
  const toast = useToast();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isVideo = items[0]?.type === 'video';
  const [canvas, setCanvas] = useState<Frame>({ w: width, h: Math.round(width * 1.25) });
  const [page, setPage] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [tool, setTool] = useState<ToolName>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [editTab, setEditTab] = useState<'filters' | 'adjust'>('filters');
  const [draft, setDraft] = useState<{ id?: string; text: string; color: string; bg: boolean; size: number }>({ text: '', color: '#ffffff', bg: false, size: 30 });
  // Whether this screen is the one showing: the song and the video stop while another is on top (Plus, say).
  const [focused, setFocused] = useState(true);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );
  // And while the app is in the background: the sound is set to keep playing there (for Pod), so the
  // song of a half-made post would otherwise go on over other apps.
  const [awake, setAwake] = useState(() => AppState.currentState !== 'background');
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => setAwake(s !== 'background'));
    return () => sub.remove();
  }, []);
  // Audio sheet.
  const [q, setQ] = useState('');
  const [songs, setSongs] = useState<PodItem[] | null>(null);
  // Voice note: recorded and played back here only, for now.
  const recorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, numberOfChannels: 1, bitRate: 64000, isMeteringEnabled: true });
  const [recording, setRecording] = useState(false);
  const [recordedMs, setRecordedMs] = useState(0);
  const [bars, setBars] = useState<number[]>([]);
  const [voice, setVoice] = useState<{ uri: string; ms: number } | null>(null);
  const micOn = useRef(false);
  // Pod leaves the sound's setup alone while this screen records (src/lib/player.tsx markRecording).
  const podHeld = useRef(false);
  const holdPodAudio = useCallback((on: boolean) => {
    if (podHeld.current === on) return;
    podHeld.current = on;
    markRecording(on);
  }, []);
  useEffect(
    () => () => {
      if (podHeld.current) {
        podHeld.current = false;
        markRecording(false);
      }
    },
    [],
  );
  const stopping = useRef(false);
  // Video cover.
  const [covers, setCovers] = useState<string[] | null>(null);
  const makingCovers = useRef(false);
  const [paused, setPaused] = useState(false);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  const pageIdx = clamp(page, 0, Math.max(0, items.length - 1));
  const item = items[pageIdx];
  const editOf = (i: number): PhotoEdit => edits[i] ?? PLAIN_EDIT;
  const edit = editOf(pageIdx);
  const patchEdit = (i: number, change: Partial<PhotoEdit> | ((e: PhotoEdit) => Partial<PhotoEdit>)) =>
    setEdits((cur) => items.map((_, k) => (k === i ? { ...(cur[k] ?? PLAIN_EDIT), ...(typeof change === 'function' ? change(cur[k] ?? PLAIN_EDIT) : change) } : cur[k] ?? PLAIN_EDIT)));
  const patchOverlay = (id: string, change: Partial<Overlay>) => patchEdit(pageIdx, (e) => ({ overlays: e.overlays.map((o) => (o.id === id ? { ...o, ...change } : o)) }));
  const chosen = edit.overlays.find((o) => o.id === selected) ?? null;

  /* ----- sound: the chosen song plays while editing, the video plays on the canvas ----- */

  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false, shouldPlayInBackground: true }).catch(() => {});
  }, []);

  // The song rests while a voice note is being made, while another screen is on top, and in the background.
  const songOn = !!audio?.audio_url && focused && awake && tool !== 'voice';
  const song = useAudioPlayer(audio?.audio_url ? { uri: audio.audio_url } : null);
  useEffect(() => {
    if (!songOn) return;
    try {
      song.loop = true;
      song.play();
    } catch {
      // the player was released
    }
    return () => {
      try {
        song.pause();
      } catch {
        // already gone
      }
    };
  }, [song, songOn]);

  const video = useVideoPlayer(isVideo ? { uri: items[0].uri } : null, (p) => {
    p.loop = true;
  });
  useEffect(() => {
    if (!isVideo) return;
    try {
      video.muted = !!audio;
      if (paused || !focused || !awake || tool === 'voice' || tool === 'cover') video.pause();
      else video.play();
    } catch {
      // the player was released
    }
  }, [video, isVideo, paused, focused, awake, audio, tool]);

  /* ----- songs from Pod ----- */

  useEffect(() => {
    if (tool !== 'audio') return;
    let live = true;
    const t = setTimeout(() => {
      fetchPod('song', q)
        .then((r) => { if (live) setSongs(r); })
        .catch((e) => { if (live) { setSongs([]); toast(errText(e)); } });
    }, q ? 220 : 0);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [tool, q, toast]);

  /* ----- voice note ----- */

  async function startRecording() {
    if (recording) return;
    try {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) {
        toast('Microphone access is off. Turn it on for Community in the Settings app.');
        return;
      }
      try {
        song.pause();
      } catch {
        // nothing playing
      }
      holdPodAudio(true);
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true, shouldPlayInBackground: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      micOn.current = true;
      stopping.current = false;
      setRecordedMs(0);
      setBars([]);
      setVoice(null);
      setRecording(true);
    } catch (e) {
      setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true, shouldPlayInBackground: true }).catch(() => {});
      toast(errText(e));
      holdPodAudio(false);
    }
  }

  const stopRecording = useCallback(
    async (keep: boolean) => {
      if (stopping.current) return;
      stopping.current = true;
      micOn.current = false;
      let ms = 0;
      try {
        ms = recorder.getStatus().durationMillis;
      } catch {
        ms = 0;
      }
      setRecording(false);
      try {
        await recorder.stop();
        await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true, shouldPlayInBackground: true }).catch(() => {});
        holdPodAudio(false);
        const uri = recorder.uri;
        if (!keep) return;
        if (!uri || ms < 800) {
          toast('That was too short. Record a little longer.');
          return;
        }
        setVoice({ uri, ms });
      } catch (e) {
        holdPodAudio(false);
        if (keep) toast(errText(e));
      }
    },
    [recorder, toast],
  );

  // A recording never carries on behind another screen.
  useFocusEffect(
    useCallback(
      () => () => {
        if (micOn.current) stopRecording(false);
      },
      [stopRecording],
    ),
  );

  useEffect(() => {
    if (!recording) return;
    const t = setInterval(() => {
      try {
        const s = recorder.getStatus();
        setRecordedMs(s.durationMillis);
        const level = typeof s.metering === 'number' ? clamp((s.metering + 50) / 50, 0.08, 1) : 0.2 + Math.random() * 0.6;
        setBars((cur) => [...cur.slice(-39), level]);
        if (s.durationMillis >= VOICE_LIMIT_MS) stopRecording(true);
      } catch {
        // the recorder was released
      }
    }, 200);
    return () => clearInterval(t);
  }, [recording, recorder, stopRecording]);

  const voicePlayer = useAudioPlayer(voice ? { uri: voice.uri } : null);
  const voiceStatus = useAudioPlayerStatus(voicePlayer);
  function toggleVoice() {
    try {
      if (voiceStatus.playing) voicePlayer.pause();
      else {
        if (voiceStatus.didJustFinish || voiceStatus.currentTime >= Math.max(0, voiceStatus.duration - 0.05)) voicePlayer.seekTo(0);
        voicePlayer.play();
      }
    } catch {
      // the player was released
    }
  }

  /* ----- video cover ----- */

  async function openCover() {
    setTool('cover');
    // Made once, even if the panel is closed and opened again while they are still being made.
    if (covers || !item || makingCovers.current) return;
    makingCovers.current = true;
    try {
      const total = Math.max(0.5, item.duration ?? 1) * 1000;
      const out: string[] = [];
      for (let i = 0; i < COVER_COUNT; i++) {
        const t = await VideoThumbnails.getThumbnailAsync(item.uri, { time: Math.round((total * (i + 0.5)) / COVER_COUNT), quality: 0.5 });
        out.push(t.uri);
      }
      if (alive.current) setCovers(out);
    } catch (e) {
      if (!alive.current) return;
      setCovers([]);
      toast(errText(e));
    } finally {
      makingCovers.current = false;
    }
  }

  /* ----- text and stickers ----- */

  const photoOnly = (what: string) => {
    if (!isVideo) return false;
    toast(`${what} are for photo posts.`);
    return true;
  };

  function startText(existing?: Overlay) {
    if (photoOnly('Text and stickers')) return;
    setSelected(null);
    setDraft(existing ? { id: existing.id, text: existing.text, color: existing.color, bg: !!existing.bg, size: existing.size } : { text: '', color: draft.color, bg: draft.bg, size: 30 });
    setTool('text');
  }

  function commitText() {
    const text = draft.text.trim();
    setTool(null);
    if (!text) {
      if (draft.id) patchEdit(pageIdx, (e) => ({ overlays: e.overlays.filter((o) => o.id !== draft.id) }));
      return;
    }
    if (draft.id) patchOverlay(draft.id, { text, color: draft.color, bg: draft.bg, size: draft.size });
    else patchEdit(pageIdx, (e) => ({ overlays: [...e.overlays, { id: newId(), kind: 'text', text, x: 0.5, y: freeY(e.overlays, 0.45), size: draft.size, color: draft.color, bg: draft.bg }] }));
  }

  function addSticker(o: Pick<Overlay, 'kind' | 'text' | 'size' | 'color' | 'bg'>) {
    patchEdit(pageIdx, (e) => ({ overlays: [...e.overlays, { id: newId(), ...o, x: 0.5, y: freeY(e.overlays, 0.3) }] }));
    setTool(null);
  }

  function next() {
    if (voice) toast('Voice notes on posts are coming soon');
    onNext();
  }

  /* ----- layout ----- */

  const onPageEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setSelected(null);
    setPage(clamp(Math.round(e.nativeEvent.contentOffset.x / width), 0, items.length - 1));
  };
  const frameFor = (it: PickedItem): Frame => {
    const w = it.w > 0 ? it.w : 4;
    const h = it.h > 0 ? it.h : 5;
    const k = Math.min(canvas.w / w, canvas.h / h);
    return { w: Math.max(1, Math.floor(w * k)), h: Math.max(1, Math.floor(h * k)) };
  };
  const frame = item ? frameFor(item) : canvas;
  const panel = tool === 'edit' || tool === 'cover';
  const openEdit = () => (isVideo ? openCover() : setTool('edit'));
  const openEditRef = useRef(openEdit);
  openEditRef.current = openEdit;
  // "Swipe up to edit": an upward swipe over the tools opens the edit panel (a tap on the words does too).
  const swipeUp = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => g.dy < -12 && Math.abs(g.dy) > Math.abs(g.dx) * 1.5,
      onPanResponderRelease: (_e, g) => {
        if (g.dy < -30) openEditRef.current();
      },
    }),
  ).current;

  if (!item) {
    return (
      <View style={{ flex: 1, backgroundColor: '#000', justifyContent: 'center' }}>
        <DarkEmpty title="Nothing to edit" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#000', paddingTop: insets.top }}>
      {/* the canvas */}
      <View style={{ flex: 1 }} onLayout={(e) => setCanvas({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
        {isVideo ? (
          <Pressable onPress={() => setPaused((p) => !p)} accessibilityRole="button" accessibilityLabel={paused ? 'Play the video' : 'Pause the video'} style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <VideoView player={video} style={{ width: frame.w, height: frame.h }} contentFit="contain" nativeControls={false} />
            {paused ? (
              <View pointerEvents="none" style={{ position: 'absolute', width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="play" size={32} color="#fff" />
              </View>
            ) : null}
          </Pressable>
        ) : (
          <ScrollView horizontal pagingEnabled scrollEnabled={items.length > 1 && !dragging} showsHorizontalScrollIndicator={false} onMomentumScrollEnd={onPageEnd} style={{ flex: 1 }}>
            {items.map((it, i) => {
              const f = frameFor(it);
              const e = editOf(i);
              const plain = isPlainLook(e.filter, e.adjust);
              const img = <RNImage source={{ uri: it.uri }} style={{ width: f.w, height: f.h }} resizeMode="cover" fadeDuration={0} />;
              return (
                <View key={it.uri + i} style={{ width, height: canvas.h, alignItems: 'center', justifyContent: 'center' }}>
                  <View style={{ width: f.w, height: f.h, overflow: 'hidden' }}>
                    {plain ? img : <ColorMatrix matrix={lookMatrix(e.filter, e.adjust)} style={{ width: f.w, height: f.h }}>{img}</ColorMatrix>}
                    {e.overlays.map((o) => (
                      <EditableOverlay key={o.id} o={o} frame={f} selected={selected === o.id} onTap={() => setSelected(selected === o.id ? null : o.id)} onMove={(x, y) => patchEdit(i, (cur) => ({ overlays: cur.overlays.map((v) => (v.id === o.id ? { ...v, x, y } : v)) }))} onDrag={setDragging} />
                    ))}
                  </View>
                </View>
              );
            })}
          </ScrollView>
        )}

        <View style={{ position: 'absolute', top: 10, left: 12 }}>
          <SmallRound icon="close" label="Close" onPress={onClose} />
        </View>
        {items.length > 1 ? (
          <View pointerEvents="none" style={{ position: 'absolute', top: 18, right: 14, backgroundColor: 'rgba(10,12,14,0.7)', paddingHorizontal: 9, paddingVertical: 4, borderRadius: 12 }}>
            <Text style={{ color: '#fff', fontSize: 12.5 }}>{pageIdx + 1}/{items.length}</Text>
          </View>
        ) : null}

        {/* the song */}
        <View pointerEvents="box-none" style={{ position: 'absolute', top: 10, left: 64, right: 64, alignItems: 'center' }}>
          <Pressable onPress={() => { setSelected(null); setTool('audio'); }} accessibilityRole="button" accessibilityLabel={audio ? `Audio: ${audio.title} by ${audio.artist}` : 'Add audio'} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 8, height: 40, paddingHorizontal: 14, borderRadius: 20, backgroundColor: 'rgba(38,38,40,0.9)', maxWidth: '100%', opacity: pressed ? 0.7 : 1 })}>
            <Icon name="music" size={17} color="#fff" />
            <Text numberOfLines={1} style={{ flexShrink: 1, color: '#fff', fontWeight: '700', fontSize: 14 }}>{audio ? `${audio.title} · ${audio.artist}` : 'Add audio'}</Text>
          </Pressable>
        </View>

        {chosen ? (
          <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: 12, alignItems: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, padding: 5, borderRadius: 26, backgroundColor: 'rgba(20,20,22,0.86)' }}>
              <SmallRound text="A−" label="Smaller" onPress={() => patchOverlay(chosen.id, { size: clamp(Math.round(chosen.size / 1.18), 12, 140) })} />
              <SmallRound text="A+" label="Bigger" onPress={() => patchOverlay(chosen.id, { size: clamp(Math.round(chosen.size * 1.18), 12, 140) })} />
              {chosen.kind === 'text' ? <SmallRound icon="compose" label="Edit text" onPress={() => startText(chosen)} /> : null}
              <SmallRound icon="trash" label="Remove" onPress={() => { patchEdit(pageIdx, (e) => ({ overlays: e.overlays.filter((o) => o.id !== chosen.id) })); setSelected(null); }} />
              <SmallRound icon="check" label="Done" onPress={() => setSelected(null)} />
            </View>
          </View>
        ) : null}
      </View>

      {/* under the canvas: the tools, or the edit panel */}
      {panel ? (
        <View style={{ paddingBottom: insets.bottom + 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, height: 48 }}>
            {tool === 'edit' ? (
              <View style={{ flex: 1, flexDirection: 'row', gap: 18 }} accessibilityRole="tablist">
                {(['filters', 'adjust'] as const).map((t) => (
                  <Pressable key={t} onPress={() => setEditTab(t)} hitSlop={8} accessibilityRole="tab" accessibilityState={{ selected: editTab === t }}>
                    <Text style={{ color: editTab === t ? '#fff' : DARK.fg3, fontWeight: '700', fontSize: 15 }}>{t === 'filters' ? 'Filters' : 'Adjust'}</Text>
                  </Pressable>
                ))}
              </View>
            ) : (
              <Text style={{ flex: 1, color: '#fff', fontWeight: '700', fontSize: 15 }}>Choose a cover</Text>
            )}
            <Pressable onPress={() => setTool(null)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Done" style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
              <Text style={{ color: DARK.accent2, fontWeight: '700', fontSize: 15.5 }}>Done</Text>
            </Pressable>
          </View>
          {tool === 'edit' ? (
            editTab === 'filters' ? (
              <FilterStrip uri={item.uri} value={edit.filter} onChange={(id) => patchEdit(pageIdx, { filter: id })} />
            ) : (
              <AdjustStrip value={edit.adjust} onChange={(adjust) => patchEdit(pageIdx, { adjust })} locked={!plus} onUnlock={() => router.push('/plus')} />
            )
          ) : covers === null ? (
            <DarkLoading />
          ) : covers.length === 0 ? (
            <Text style={{ color: DARK.fg2, textAlign: 'center', padding: 24 }}>The video's frames could not be read.</Text>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 10, gap: 6 }} style={{ flexGrow: 0 }}>
              {covers.map((uri, i) => (
                <Pressable key={uri} onPress={() => onPoster(uri)} accessibilityRole="button" accessibilityLabel={`Cover frame ${i + 1}`} accessibilityState={{ selected: poster === uri }} style={({ pressed }) => ({ width: 64, height: 96, borderRadius: 8, overflow: 'hidden', borderWidth: 2, borderColor: poster === uri ? DARK.accent : 'transparent', backgroundColor: DARK.surface2, opacity: pressed ? 0.75 : 1 })}>
                  <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" />
                </Pressable>
              ))}
            </ScrollView>
          )}
        </View>
      ) : (
        <View {...swipeUp.panHandlers} style={{ paddingBottom: insets.bottom + 10 }}>
          <Pressable onPress={openEdit} accessibilityRole="button" accessibilityLabel={isVideo ? 'Edit video' : 'Edit'} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 7, opacity: pressed ? 0.6 : 1 })}>
            <View style={{ transform: [{ rotate: '180deg' }] }}>
              <Icon name="down" size={14} color={DARK.fg2} weight={2.4} />
            </View>
            <Text style={{ color: DARK.fg2, fontSize: 12.5 }}>Swipe up to edit</Text>
          </Pressable>
          <View style={{ flexDirection: 'row', justifyContent: 'space-evenly', paddingHorizontal: 4, paddingTop: 4 }}>
            <Tool icon="music" label="Audio" active={!!audio} onPress={() => { setSelected(null); setTool('audio'); }} />
            <Tool icon="text" label="Text" dim={isVideo} onPress={() => startText()} />
            <Tool icon="mic" label="Voice" active={!!voice} onPress={() => { setSelected(null); setTool('voice'); }} />
            <Tool cc label="Captions" active={!!caption.trim()} onPress={() => { setSelected(null); setTool('caption'); }} />
            <Tool icon="sticker" label="Overlay" dim={isVideo} onPress={() => { if (photoOnly('Text and stickers')) return; setSelected(null); setTool('overlay'); }} />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 16 }}>
            <Pill label={isVideo ? 'Edit video' : 'Edit'} icon="sliders" onPress={openEdit} />
            <Pill label="Next" icon="arrow" primary onPress={next} />
          </View>
        </View>
      )}

      {/* typing text */}
      {tool === 'text' ? (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.7)', paddingTop: insets.top + 8 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14 }}>
            <Pressable onPress={() => setDraft({ ...draft, bg: !draft.bg })} accessibilityRole="button" accessibilityLabel={draft.bg ? 'Remove the label behind the text' : 'Put a label behind the text'} accessibilityState={{ selected: draft.bg }} style={{ width: 44, height: 44, borderRadius: 12, borderWidth: 2, borderColor: '#fff', backgroundColor: draft.bg ? '#fff' : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: draft.bg ? '#000' : '#fff', fontWeight: '800', fontSize: 20 }}>A</Text>
            </Pressable>
            <Pressable onPress={commitText} hitSlop={8} accessibilityRole="button" accessibilityLabel="Done" style={{ height: 44, paddingHorizontal: 18, borderRadius: 22, backgroundColor: '#fff', justifyContent: 'center' }}>
              <Text style={{ color: '#000', fontWeight: '700', fontSize: 16 }}>Done</Text>
            </Pressable>
          </View>
          <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 24 }}>
            <TextInput value={draft.text} onChangeText={(text) => setDraft({ ...draft, text })} autoFocus multiline maxLength={160} placeholder="Type something" placeholderTextColor="rgba(255,255,255,0.5)" keyboardAppearance="dark" selectionColor="#fff" style={{ color: draft.color, fontSize: Math.max(14, draft.size), fontWeight: '800', textAlign: 'center', maxHeight: 220 }} accessibilityLabel="Text on the photo" />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20 }}>
            <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>A</Text>
            <Slider value={draft.size} min={14} max={72} onChange={(size) => setDraft({ ...draft, size })} label="Text size" style={{ flex: 1 }} />
            <Text style={{ color: '#fff', fontSize: 20, fontWeight: '700' }}>A</Text>
          </View>
          <Swatches value={draft.color} onPick={(color) => setDraft({ ...draft, color })} />
        </KeyboardAvoidingView>
      ) : null}

      {/* a song from Pod */}
      <Sheet visible={tool === 'audio'} onClose={() => setTool(null)} title="Add audio" tall>
        <SearchField value={q} onChangeText={setQ} placeholder="Search songs on Pod" />
        {songs === null ? (
          <Loading />
        ) : songs.length === 0 ? (
          <Empty icon="music" title="No songs found" />
        ) : (
          <ScrollView style={{ flex: 1, marginTop: 8 }} keyboardShouldPersistTaps="handled">
            {audio ? (
              <Pressable onPress={() => { onAudio(null); setTool(null); }} accessibilityRole="button" accessibilityLabel="Remove the audio" style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 8, opacity: pressed ? 0.7 : 1 })}>
                <View style={{ width: 44, height: 44, borderRadius: 8, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="mute" size={22} color={C.fg2} />
                </View>
                <Text style={{ flex: 1, color: C.like, fontWeight: '600' }}>No audio</Text>
              </Pressable>
            ) : null}
            {songs.map((s) => {
              const on = audio?.id === s.id;
              return (
                <Pressable key={s.id} onPress={() => { onAudio(s); setTool(null); }} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={`${s.title} by ${s.artist}`} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 8, opacity: pressed ? 0.7 : 1 })}>
                  {s.cover_url ? (
                    <Image source={{ uri: s.cover_url }} style={{ width: 44, height: 44, borderRadius: 8, backgroundColor: C.surface2 }} contentFit="cover" transition={100} />
                  ) : (
                    <View style={{ width: 44, height: 44, borderRadius: 8, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name="music" size={22} color={C.fg2} />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={1} style={{ color: C.fg, fontWeight: '600' }}>{s.title}</Text>
                    <Text numberOfLines={1} style={{ color: C.fg2, fontSize: 13.5 }}>{s.artist}{s.duration_seconds ? ` · ${clock(s.duration_seconds)}` : ''}</Text>
                  </View>
                  {on ? <Icon name="check" size={20} color={C.accent2} weight={2.4} /> : null}
                </Pressable>
              );
            })}
          </ScrollView>
        )}
      </Sheet>

      {/* the caption */}
      <Sheet visible={tool === 'caption'} onClose={() => setTool(null)} title="Captions">
        <View style={{ paddingHorizontal: 16, gap: 12 }}>
          <TextInput value={caption} onChangeText={onCaption} autoFocus multiline maxLength={2200} placeholder="Write a caption…" placeholderTextColor={C.fg3} keyboardAppearance={C.blurTint} style={{ minHeight: 110, maxHeight: 200, padding: 12, borderRadius: 12, backgroundColor: C.surface, color: C.fg, fontSize: 16, textAlignVertical: 'top' }} accessibilityLabel="Caption" />
          {/* For the photo on screen; each photo in a post has its own. */}
          <TextInput value={edit.alt ?? ''} onChangeText={(text) => patchEdit(pageIdx, { alt: text })} maxLength={ALT_MAX} placeholder={items.length > 1 ? `Alt text · ${pageIdx + 1}/${items.length}` : 'Alt text'} placeholderTextColor={C.fg3} keyboardAppearance={C.blurTint} selectionColor={C.accent2} style={{ paddingHorizontal: 12, paddingVertical: 12, borderRadius: 12, backgroundColor: C.surface, color: C.fg, fontSize: 16 }} accessibilityLabel="Alt text" />
          <Pressable onPress={() => setTool(null)} accessibilityRole="button" accessibilityLabel="Done" style={({ pressed }) => ({ height: 46, borderRadius: 12, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.75 : 1 })}>
            <Text style={{ color: C.onAccent, fontWeight: '600', fontSize: 15.5 }}>Done</Text>
          </Pressable>
        </View>
      </Sheet>

      {/* stickers */}
      <Sheet visible={tool === 'overlay'} onClose={() => setTool(null)} title="Overlay">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="always" style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingBottom: 14 }}>
          {WORDS.map((w) => (
            <Pressable key={w} onPress={() => addSticker({ kind: 'text', text: w, size: 34, color: '#ffffff', bg: true })} accessibilityRole="button" accessibilityLabel={`Sticker ${w}`} style={({ pressed }) => ({ height: 38, paddingHorizontal: 16, borderRadius: 19, backgroundColor: '#fff', borderWidth: StyleSheet.hairlineWidth, borderColor: C.line, justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}>
              <Text style={{ color: '#000', fontWeight: '800', fontSize: 16 }}>{w}</Text>
            </Pressable>
          ))}
        </ScrollView>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 10 }}>
          {EMOJI.map((e) => (
            <Pressable key={e} onPress={() => addSticker({ kind: 'emoji', text: e, size: 64, color: '#ffffff' })} accessibilityRole="button" accessibilityLabel={`Sticker ${e}`} style={({ pressed }) => ({ width: '12.5%', height: 48, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
              <Text style={{ fontSize: 30 }}>{e}</Text>
            </Pressable>
          ))}
        </View>
      </Sheet>

      {/* a voice note */}
      <Sheet visible={tool === 'voice'} onClose={() => { if (recording) stopRecording(false); setTool(null); }} title="Voice">
        <View style={{ paddingHorizontal: 20, alignItems: 'center', gap: 16, paddingBottom: 6 }}>
          <View style={{ height: 56, width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3 }} accessibilityLabel={recording ? `Recording, ${clock(recordedMs / 1000)}` : voice ? `Voice note, ${clock(voice.ms / 1000)}` : 'Nothing recorded yet'}>
            {(recording ? bars : voice ? Array.from({ length: 40 }, (_, i) => 0.25 + 0.5 * Math.abs(Math.sin(i * 0.7))) : []).map((v, i) => (
              <View key={i} style={{ width: 4, height: Math.max(4, Math.round(v * 52)), borderRadius: 2, backgroundColor: recording ? C.like : C.accent2 }} />
            ))}
          </View>
          <Text style={{ color: C.fg, fontSize: 16, fontVariant: ['tabular-nums'] }} accessibilityLiveRegion="polite">{recording ? `Recording ${clock(recordedMs / 1000)}` : voice ? clock(voice.ms / 1000) : '0:00'}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 28 }}>
            {voice && !recording ? (
              <Pressable onPress={() => setVoice(null)} accessibilityRole="button" accessibilityLabel="Delete the voice note" style={({ pressed }) => ({ width: 48, height: 48, borderRadius: 24, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}>
                <Icon name="trash" size={22} />
              </Pressable>
            ) : null}
            <Pressable onPress={() => (recording ? stopRecording(true) : voice ? toggleVoice() : startRecording())} accessibilityRole="button" accessibilityLabel={recording ? 'Stop recording' : voice ? (voiceStatus.playing ? 'Pause' : 'Play the voice note') : 'Start recording'} style={({ pressed }) => ({ width: 72, height: 72, borderRadius: 36, backgroundColor: recording ? C.like : voice ? C.accent : C.fg, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.75 : 1 })}>
              <Icon name={recording ? 'stop' : voice ? (voiceStatus.playing ? 'pause' : 'play') : 'mic'} size={30} color={recording ? '#fff' : voice ? C.onAccent : C.bg} />
            </Pressable>
            {voice && !recording ? (
              <Pressable onPress={startRecording} accessibilityRole="button" accessibilityLabel="Record again" style={({ pressed }) => ({ width: 48, height: 48, borderRadius: 24, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}>
                <Icon name="mic" size={22} />
              </Pressable>
            ) : null}
          </View>
          <Text style={{ color: C.fg3, fontSize: 12.5, textAlign: 'center' }}>Voice notes on posts are coming soon.</Text>
        </View>
      </Sheet>

    </View>
  );
}
