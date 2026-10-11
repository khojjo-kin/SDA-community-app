import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, AppState, Easing, Keyboard, KeyboardAvoidingView, PanResponder, Platform, Pressable, Text, useWindowDimensions, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useReduceMotion } from '../lib/motion';
import { ago } from '../lib/theme';
import type { StoryItem } from '../lib/types';
import { Icon, VerifiedTick } from './Icon';
import { fitFrame, StoryCanvas } from './StoryCanvas';
import { Avatar, IconButton } from './ui';

export type PlayerEntry = { id: string; item: StoryItem; created_at: string };
export type PlayerGroup<E extends PlayerEntry = PlayerEntry> = {
  key: string;
  user_id: string;
  username: string;
  avatar_url: string;
  entries: E[];
  /** Shows the verified tick by the name. */
  verified?: boolean;
};
export type PlayerCtx<E extends PlayerEntry> = { group: PlayerGroup<E>; entry: E; index: number; pause: () => void; resume: () => void; next: () => void; close: () => void };

const STILL_MS = 5000;
/** The gap either side of the story card. */
const SIDE = 6;
/** Room under the card for the reply box or the row of buttons. */
const BAR = 64;
const RADIUS = 16;
/** A story still loading after this long shows a spinner. */
const SPINNER_AFTER_MS = 450;
/** Held this long, the name, bars and reply box step aside so the story can be seen whole. */
const HIDE_AFTER_MS = 260;

/**
 * The reasons a story can be stopped. It plays only when none of them apply: a finger on it, the
 * screen's own pause, something on top (`held`), the app in the background, its photo still loading,
 * or a swipe to another person under way.
 */
type Why = 'touch' | 'manual' | 'held' | 'app' | 'wait' | 'drag';
const isStopped = (w: Record<Why, boolean>) => w.touch || w.manual || w.held || w.app || w.wait || w.drag;

/** The pictures a story shows, to load ahead of time. */
function stillsOf(item: StoryItem): string[] {
  if (item.type === 'collage') return (item.urls ?? []).slice(0, 4);
  if (item.type === 'video') return item.poster ? [item.poster] : [];
  if (item.type === 'image') return item.url ? [item.url] : [];
  return [];
}

/**
 * Plays stories one after another inside a rounded card: progress bars, tap left or right to move,
 * hold to pause, swipe sideways to the next or previous person. Stories, memories (highlights in the
 * code) and the archive all use it and only differ in what they put in the bar under the card.
 */
export function StoryPlayer<E extends PlayerEntry>({
  groups,
  startGroup = 0,
  startEntry = 0,
  onShow,
  onClose,
  onOpenProfile,
  onMention,
  footer,
  badge,
  actions,
  subtitle,
  held = false,
  showTime = true,
  notice,
}: {
  groups: PlayerGroup<E>[];
  startGroup?: number;
  startEntry?: number;
  /** Called each time a story comes on screen. */
  onShow?: (entry: E, group: PlayerGroup<E>) => void;
  onClose: () => void;
  onOpenProfile?: (userId: string) => void;
  onMention?: (userId: string) => void;
  footer?: (ctx: PlayerCtx<E>) => React.ReactNode;
  /** A small label next to the name, such as the close friends star. */
  badge?: (ctx: PlayerCtx<E>) => React.ReactNode;
  /** Extra buttons in the top row, just before Close (the More button on someone else's story). */
  actions?: (ctx: PlayerCtx<E>) => React.ReactNode;
  /** A second line under the name, such as the highlight's title. */
  subtitle?: (ctx: PlayerCtx<E>) => string | null | undefined;
  /** While true the story stays paused: a sheet is open, the keyboard is up, or another screen is on top. */
  held?: boolean;
  showTime?: boolean;
  /** A small label under the top row, such as the quiet preview's "they won't see you watched". */
  notice?: string;
}) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const reduceMotion = useReduceMotion();
  const [gi, setGi] = useState(Math.min(Math.max(0, startGroup), Math.max(0, groups.length - 1)));
  const [si, setSi] = useState(startEntry);
  const progress = useRef(new Animated.Value(0)).current;
  // The card's sideways movement and fade while swiping to another person.
  const drag = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(1)).current;
  // The name, bars and reply box: they fade while a finger holds the story.
  const chrome = useRef(new Animated.Value(1)).current;
  // The id of the video story whose first frame has arrived. Until then its still picture is shown.
  const [started, setStarted] = useState('');
  // The id of the story whose picture has loaded; a photo's clock waits for it.
  const [readyId, setReadyId] = useState('');
  // The video on screen is waiting for the network.
  const [videoWaiting, setVideoWaiting] = useState(false);
  const [spinner, setSpinner] = useState(false);
  const [hiding, setHiding] = useState(false);
  const [keyboard, setKeyboard] = useState(false);
  // Kept from one video to the next, the way people expect a mute switch to behave.
  const [muted, setMuted] = useState(false);
  const why = useRef<Record<Why, boolean>>({ touch: false, manual: false, held: false, app: false, wait: false, drag: false });
  const closed = useRef(false);
  const advanced = useRef('');
  // The story the clock and the video's timer belong to. Emptied the moment another one is asked for,
  // so a late tick from the old one can never move the new one's bar.
  const shown = useRef('');
  // A video's bar is gliding to the end on the native side (restarted whenever playback stops or starts).
  const gliding = useRef(false);
  // Stories whose picture has loaded: going back to one starts its clock at once.
  const loaded = useRef(new Set<string>());
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // A swipe to another person is under way, and which way the new card comes in from.
  const swiping = useRef(false);
  const incoming = useRef<0 | 1 | -1>(0);

  // The lists can shrink while open (a story removed from a highlight), so both places are kept in range.
  const g = Math.min(gi, Math.max(0, groups.length - 1));
  const group = groups[g];
  const index = Math.min(si, Math.max(0, (group?.entries.length ?? 1) - 1));
  const entry = group?.entries[index];
  const isVideo = entry?.item.type === 'video' && !!entry.item.url;
  // The story id is part of the source, so two stories that share one video file each get a fresh
  // player; cached on the phone, so watching it again doesn't download it again.
  const player = useVideoPlayer(isVideo ? { uri: entry.item.url, metadata: { title: entry.id }, useCaching: true } : null, (p) => {
    p.loop = false;
  });
  // Pausing and resuming can be asked for from a callback made several renders ago, so they read these.
  const isVideoRef = useRef(isVideo);
  isVideoRef.current = isVideo;
  const playerRef = useRef(player);
  playerRef.current = player;

  const close = useCallback(() => {
    if (closed.current) return;
    closed.current = true;
    progress.stopAnimation();
    // Silent at once, rather than playing on while the viewer fades away.
    try {
      playerRef.current.pause();
    } catch {
      // the player was released
    }
    onClose();
  }, [progress, onClose]);

  /** Moves to another story. The bar is emptied first, so the next one never shows full for a moment. */
  const goTo = useCallback(
    (nextGroup: number, nextEntry: number) => {
      shown.current = '';
      gliding.current = false;
      progress.setValue(0);
      setGi(nextGroup);
      setSi(nextEntry);
    },
    [progress],
  );

  const step = useCallback(
    (dir: 1 | -1) => {
      if (!group) return;
      if (dir === 1) {
        if (index < group.entries.length - 1) goTo(g, index + 1);
        else if (g < groups.length - 1) goTo(g + 1, 0);
        else close();
      } else if (index > 0) goTo(g, index - 1);
      else if (g > 0) goTo(g - 1, 0);
      else {
        // Already at the very first story: start it again.
        gliding.current = false;
        advanced.current = '';
        progress.setValue(0);
        if (isVideo) {
          try {
            player.currentTime = 0;
            if (!isStopped(why.current)) player.play();
          } catch {
            // the player was released
          }
        } else if (!isStopped(why.current)) runRef.current(0);
      }
    },
    [group, groups.length, g, index, close, progress, isVideo, player, goTo],
  );

  const stepRef = useRef(step);
  stepRef.current = step;
  const goToRef = useRef(goTo);
  goToRef.current = goTo;
  const closeRef = useRef(close);
  closeRef.current = close;

  const run = (from: number) => {
    const id = shown.current;
    // Asked for from a callback that arrives a moment later (the bar's position comes back from the
    // native side), so it checks again that nothing has stopped the story meanwhile.
    if (!id || isStopped(why.current)) return;
    // On the native side, so the bar runs smoothly however busy the app is (it moves by scale, not width).
    Animated.timing(progress, { toValue: 1, duration: Math.max(1, (1 - from) * STILL_MS), easing: Easing.linear, useNativeDriver: true }).start(({ finished }) => {
      if (finished && !closed.current && shown.current === id) stepRef.current(1);
    });
  };
  const runRef = useRef(run);
  runRef.current = run;

  const onShowRef = useRef(onShow);
  onShowRef.current = onShow;

  // Stops or restarts the clock and the video, but only when the overall answer changes: a finger
  // lifted while a sheet is still open must not start the story again.
  const setWhy = useCallback(
    (reason: Why, on: boolean) => {
      const before = isStopped(why.current);
      why.current[reason] = on;
      const after = isStopped(why.current);
      if (before === after) return;
      if (after) {
        progress.stopAnimation();
        gliding.current = false;
        if (isVideoRef.current) {
          try {
            playerRef.current.pause();
          } catch {
            // the player was released
          }
        }
      } else if (!closed.current && shown.current) {
        if (isVideoRef.current) {
          try {
            playerRef.current.play();
          } catch {
            // the player was released
          }
        } else {
          // The bar's position comes back a moment later; by then a tap may have moved on to another
          // story, whose own clock is already running (or a video, which has none), so it is left alone.
          const id = shown.current;
          progress.stopAnimation((v) => {
            if (shown.current === id) runRef.current(v);
          });
        }
      }
    },
    [progress],
  );
  const setWhyRef = useRef(setWhy);
  setWhyRef.current = setWhy;

  // Before the story effect below, so a story that opens under a sheet waits for it.
  useEffect(() => {
    setWhy('held', held);
  }, [held, setWhy]);

  // Leaving the app (or pulling down Control Center) pauses the story; coming back carries on.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => setWhy('app', state !== 'active'));
    return () => sub.remove();
  }, [setWhy]);

  // The reply box sits right on the keyboard, without the room kept for the home bar.
  useEffect(() => {
    const up = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setKeyboard(true));
    const down = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboard(false));
    return () => {
      up.remove();
      down.remove();
    };
  }, []);

  useEffect(() => {
    try {
      player.muted = muted;
    } catch {
      // the player was released
    }
  }, [player, muted]);

  /** The story's picture has loaded (or there is none): its clock may start. */
  const markReady = useCallback(
    (id: string) => {
      loaded.current.add(id);
      setReadyId(id);
      if (shown.current === id) setWhy('wait', false);
    },
    [setWhy],
  );

  // Start the clock for each story as it appears.
  useEffect(() => {
    if (!entry || !group) return;
    const id = entry.id;
    shown.current = id;
    // A new story starts afresh; only `held`, `app` and a swipe still settling carry over.
    why.current.touch = false;
    why.current.manual = false;
    why.current.wait = !isVideo && !loaded.current.has(id);
    advanced.current = '';
    gliding.current = false;
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
    setHiding(false);
    progress.setValue(0);
    onShowRef.current?.(entry, group);
    if (!isVideo) {
      if (!isStopped(why.current)) runRef.current(0);
      return () => progress.stopAnimation();
    }
    if (!isStopped(why.current)) {
      try {
        player.play();
      } catch {
        // the player was released
      }
    }
    let waited = 0;
    let shownAt = -1;
    const timer = setInterval(() => {
      if (shown.current !== id) return;
      try {
        if (player.status === 'error') {
          // The video cannot be played: keep its still picture up for a few seconds, then move on.
          setVideoWaiting(false);
          if (isStopped(why.current)) return;
          waited += 100;
          progress.setValue(Math.min(1, waited / STILL_MS));
          if (waited >= STILL_MS && advanced.current !== id) {
            advanced.current = id;
            stepRef.current(1);
          }
          return;
        }
        const d = player.duration;
        const t = player.currentTime;
        if (t > 0.05) setStarted(id);
        setVideoWaiting(player.status === 'loading' || (player.status !== 'readyToPlay' && t <= 0.05));
        if (d > 0) {
          const at = Math.min(1, t / d);
          if (player.playing && !isStopped(why.current)) {
            // Playing: one smooth run to the end on the native side, started again after any stop.
            if (!gliding.current) {
              gliding.current = true;
              progress.setValue(at);
              shownAt = at;
              Animated.timing(progress, { toValue: 1, duration: Math.max(1, (d - t) * 1000), easing: Easing.linear, useNativeDriver: true }).start();
            }
          } else if (gliding.current || Math.abs(at - shownAt) > 0.001) {
            // Buffering or paused: the run stops and the bar waits exactly where the video is.
            gliding.current = false;
            shownAt = at;
            progress.setValue(at);
          }
          if (t >= d - 0.15 && advanced.current !== id && !isStopped(why.current)) {
            advanced.current = id;
            stepRef.current(1);
          }
        }
      } catch {
        // the player was released
      }
    }, 100);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry?.id, isVideo, player]);

  // The next story's picture (or the next person's first, and their face) loads while this one plays.
  useEffect(() => {
    if (!group) return;
    const nextPerson = index + 1 < group.entries.length ? undefined : groups[g + 1];
    const next = group.entries[index + 1] ?? nextPerson?.entries[0];
    const urls = next ? stillsOf(next.item) : [];
    if (nextPerson?.avatar_url) urls.push(nextPerson.avatar_url);
    if (urls.length) Image.prefetch(urls, 'memory-disk').catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry?.id]);

  // Still loading after a moment: a spinner says so.
  const loading = !!entry && (isVideo ? videoWaiting : readyId !== entry.id);
  useEffect(() => {
    if (!loading) {
      setSpinner(false);
      return;
    }
    const timer = setTimeout(() => setSpinner(true), SPINNER_AFTER_MS);
    return () => clearTimeout(timer);
  }, [loading, entry?.id]);

  // The name, bars and reply box step aside while a finger holds the story.
  useEffect(() => {
    const anim = Animated.timing(chrome, { toValue: hiding ? 0 : 1, duration: hiding ? 180 : 160, useNativeDriver: true });
    anim.start();
    return () => anim.stop();
  }, [hiding, chrome]);

  useEffect(
    () => () => {
      if (holdTimer.current) clearTimeout(holdTimer.current);
    },
    [],
  );

  const pause = useCallback(() => setWhy('manual', true), [setWhy]);
  const resume = useCallback(() => setWhy('manual', false), [setWhy]);

  // Holding pauses; only a short touch moves to another story.
  const downAt = useRef(0);
  const press = useCallback(() => {
    downAt.current = Date.now();
    setWhy('touch', true);
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = setTimeout(() => setHiding(true), HIDE_AFTER_MS);
  }, [setWhy]);
  const release = useCallback(() => {
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
    setHiding(false);
    setWhy('touch', false);
  }, [setWhy]);
  const tap = (dir: 1 | -1) => () => {
    // While something holds the story (the reply keyboard, above all), a tap only puts the keyboard
    // away; moving on would throw away a half-written reply.
    if (held) {
      Keyboard.dismiss();
      return;
    }
    if (swiping.current) return;
    if (Date.now() - downAt.current < 350) step(dir);
  };

  /* ----- swiping sideways to the next or previous person ----- */

  const gRef = useRef(g);
  gRef.current = g;
  const countRef = useRef(groups.length);
  countRef.current = groups.length;
  const heldRef = useRef(held);
  heldRef.current = held;
  const widthRef = useRef(width);
  widthRef.current = width;
  const reduceRef = useRef(reduceMotion);
  reduceRef.current = reduceMotion;

  const settle = () => {
    swiping.current = false;
    setWhyRef.current('drag', false);
  };

  const finish = (dx: number, vx: number) => {
    const w = widthRef.current;
    const cur = gRef.current;
    const dir: 1 | -1 | 0 = dx < -w * 0.25 || (vx < -0.5 && dx < -24) ? 1 : dx > w * 0.25 || (vx > 0.5 && dx > 24) ? -1 : 0;
    if (dir === 0 || (dir === -1 && cur <= 0)) {
      Animated.spring(drag, { toValue: 0, speed: 22, bounciness: 3, useNativeDriver: true }).start(settle);
      return;
    }
    if (dir === 1 && cur >= countRef.current - 1) {
      // Past the last person: the viewer closes, as it does after their last story.
      Animated.parallel([
        Animated.timing(drag, { toValue: -w * 0.35, duration: 150, easing: Easing.in(Easing.quad), useNativeDriver: true }),
        Animated.timing(fade, { toValue: 0, duration: 150, useNativeDriver: true }),
      ]).start(() => closeRef.current());
      return;
    }
    if (reduceRef.current === true) {
      drag.setValue(0);
      goToRef.current(cur + dir, 0);
      settle();
      return;
    }
    Animated.parallel([
      Animated.timing(drag, { toValue: -dir * w * 0.35, duration: 140, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      Animated.timing(fade, { toValue: 0, duration: 140, useNativeDriver: true }),
    ]).start(() => {
      incoming.current = dir;
      goToRef.current(cur + dir, 0);
      // Should the next card never be drawn (the list changed at that very moment), the card comes back anyway.
      setTimeout(() => {
        if (!incoming.current) return;
        incoming.current = 0;
        drag.setValue(0);
        fade.setValue(1);
        settle();
      }, 500);
    });
  };
  const finishRef = useRef(finish);
  finishRef.current = finish;

  const pan = useRef(
    PanResponder.create({
      // Only a clearly sideways move, with someone to move to, and nothing (the keyboard, a sheet) holding the story.
      onMoveShouldSetPanResponderCapture: (_, s) => !swiping.current && countRef.current > 1 && !heldRef.current && Math.abs(s.dx) > 12 && Math.abs(s.dx) > Math.abs(s.dy) * 1.5,
      onPanResponderGrant: () => {
        swiping.current = true;
        setWhyRef.current('drag', true);
      },
      onPanResponderMove: (_, s) => {
        // There is no one before the first person, so the card only gives a little that way.
        drag.setValue(s.dx > 0 && gRef.current <= 0 ? s.dx * 0.3 : s.dx);
      },
      onPanResponderRelease: (_, s) => finishRef.current(s.dx, s.vx),
      onPanResponderTerminate: () => finishRef.current(0, 0),
      onPanResponderTerminationRequest: () => false,
    }),
  ).current;

  // The next person's card slides in once it has been drawn, so the last person's never shows in its place.
  useLayoutEffect(() => {
    const dir = incoming.current;
    if (!dir) return;
    incoming.current = 0;
    drag.setValue(dir * widthRef.current * 0.35);
    Animated.parallel([
      Animated.timing(drag, { toValue: 0, duration: 200, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(fade, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start(() => settle());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [g]);

  if (!group || !entry) return <View style={{ flex: 1, backgroundColor: '#000' }} />;

  const ctx: PlayerCtx<E> = { group, entry, index, pause, resume, next: () => step(1), close };
  const bottom = Math.max(insets.bottom, 10);
  // The card is the largest 9:16 frame that fits between the status bar and the bar underneath:
  // drawings and stickers are placed in 9:16, so the shape cannot stretch.
  const frame = fitFrame(width - SIDE * 2, height - insets.top - 4 - bottom - BAR);
  const left = Math.round((width - frame.w) / 2);
  const bars = group.entries.length <= 30 ? group.entries : [];
  const second = subtitle?.(ctx);
  const entryId = entry.id;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: '#000' }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Animated.View {...pan.panHandlers} style={{ position: 'absolute', top: insets.top + 4, left, width: frame.w, height: frame.h, opacity: fade, transform: [{ translateX: drag }] }}>
        {/* A fresh canvas for each story, so nothing of the one before can show while this one loads. */}
        <StoryCanvas
          key={entryId}
          item={entry.item}
          width={frame.w}
          height={frame.h}
          radius={RADIUS}
          onMention={onMention}
          onReady={() => markReady(entryId)}
          video={isVideo ? <VideoView player={player} style={{ width: frame.w, height: frame.h }} contentFit="cover" nativeControls={false} onFirstFrameRender={() => setStarted(entryId)} /> : undefined}
          between={
            <>
              {isVideo && started !== entryId && entry.item.poster ? <Image source={{ uri: entry.item.poster }} style={{ position: 'absolute', left: 0, top: 0, width: frame.w, height: frame.h }} contentFit="cover" cachePolicy="memory-disk" /> : null}
              <LinearGradient pointerEvents="none" colors={['rgba(0,0,0,0.5)', 'rgba(0,0,0,0)']} style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 120 }} />
              <View style={{ position: 'absolute', left: 0, top: 0, width: frame.w, height: frame.h, flexDirection: 'row' }}>
                <Pressable style={{ flex: 1 }} onPress={tap(-1)} onPressIn={press} onPressOut={release} accessibilityLabel="Previous story" />
                <Pressable style={{ flex: 2 }} onPress={tap(1)} onPressIn={press} onPressOut={release} accessibilityLabel="Next story" />
              </View>
              {spinner ? (
                <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, width: frame.w, height: frame.h, alignItems: 'center', justifyContent: 'center' }}>
                  <ActivityIndicator color="#fff" />
                </View>
              ) : null}
            </>
          }
        />
        <Animated.View pointerEvents={hiding ? 'none' : 'box-none'} style={{ position: 'absolute', top: 8, left: 0, right: 0, opacity: chrome }}>
          <View style={{ flexDirection: 'row', gap: 3, paddingHorizontal: 8 }}>
            {bars.map((s, i) => (
              <View key={s.id} style={{ flex: 1, height: 2, borderRadius: 1, backgroundColor: 'rgba(255,255,255,0.35)', overflow: 'hidden' }}>
                {i < index ? <View style={{ flex: 1, backgroundColor: '#fff' }} /> : i === index ? <Animated.View style={{ width: '100%', height: 2, backgroundColor: '#fff', transformOrigin: 'left', transform: [{ scaleX: progress }] }} /> : null}
              </View>
            ))}
          </View>
          <View pointerEvents="box-none" style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 10, paddingRight: 2, paddingTop: 8 }}>
            <Pressable
              onPress={onOpenProfile ? () => onOpenProfile(group.user_id) : undefined}
              disabled={!onOpenProfile}
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 9, flexShrink: 1, opacity: pressed ? 0.7 : 1 })}
              accessibilityRole={onOpenProfile ? 'button' : undefined}
              accessibilityLabel={`${group.username}'s profile`}>
              {/* Keyed by person, so the last person's face never shows beside the next one's name. */}
              <Avatar key={group.user_id} uri={group.avatar_url} name={group.username} size={32} />
              <View style={{ flexShrink: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <Text numberOfLines={1} style={{ color: '#fff', fontWeight: '700', fontSize: 14.5, flexShrink: 1 }}>{group.username}</Text>
                  {group.verified ? <VerifiedTick size={14} /> : null}
                  {showTime ? <Text style={{ color: 'rgba(255,255,255,0.62)', fontSize: 14 }}>{ago(entry.created_at)}</Text> : null}
                </View>
                {second ? <Text numberOfLines={1} style={{ color: 'rgba(255,255,255,0.78)', fontSize: 12.5, marginTop: 1 }}>{second}</Text> : null}
              </View>
            </Pressable>
            {badge ? badge(ctx) : null}
            <View style={{ flex: 1 }} pointerEvents="none" />
            {actions ? actions(ctx) : null}
            {isVideo ? <IconButton name={muted ? 'mute' : 'sound'} label={muted ? 'Turn sound on' : 'Mute'} size={22} color="#fff" onPress={() => setMuted((m) => !m)} /> : null}
            <IconButton name="close" label="Close" size={26} color="#fff" onPress={close} />
          </View>
          {notice ? (
            <View pointerEvents="none" style={{ flexDirection: 'row', paddingHorizontal: 10, paddingTop: 4 }}>
              <View accessibilityLiveRegion="polite" style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 26, paddingHorizontal: 10, borderRadius: 13, backgroundColor: 'rgba(0,0,0,0.55)' }}>
                <Icon name="eye" size={14} color="#fff" weight={2.2} />
                <Text style={{ color: '#fff', fontSize: 12.5, fontWeight: '600' }}>{notice}</Text>
              </View>
            </View>
          ) : null}
        </Animated.View>
      </Animated.View>
      <View style={{ flex: 1 }} pointerEvents="none" />
      <Animated.View pointerEvents={hiding ? 'none' : 'auto'} style={{ minHeight: BAR, paddingTop: 6, paddingBottom: keyboard ? 8 : bottom, justifyContent: 'center', backgroundColor: '#000', opacity: chrome }}>
        {footer ? footer(ctx) : null}
      </Animated.View>
    </KeyboardAvoidingView>
  );
}
