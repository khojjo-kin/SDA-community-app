import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, AppState, Easing, Keyboard, KeyboardAvoidingView, Platform, Pressable, Text, useWindowDimensions, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ago } from '../lib/theme';
import type { StoryItem } from '../lib/types';
import { VerifiedTick } from './Icon';
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

/** The reasons a story can be stopped. It plays only when none of them apply. */
type Why = 'touch' | 'manual' | 'held';
const isStopped = (w: Record<Why, boolean>) => w.touch || w.manual || w.held;

/**
 * Plays stories one after another inside a rounded card: progress bars, tap left or right to move,
 * hold to pause. Stories, highlights and the archive all use it and only differ in what they put in
 * the bar under the card.
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
}) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [gi, setGi] = useState(Math.min(Math.max(0, startGroup), Math.max(0, groups.length - 1)));
  const [si, setSi] = useState(startEntry);
  const progress = useRef(new Animated.Value(0)).current;
  // The id of the video story whose first frame has arrived. Until then its still picture is shown.
  const [started, setStarted] = useState('');
  // Kept from one video to the next, the way people expect a mute switch to behave.
  const [muted, setMuted] = useState(false);
  const why = useRef<Record<Why, boolean>>({ touch: false, manual: false, held: false });
  const closed = useRef(false);
  const advanced = useRef('');

  // The lists can shrink while open (a story removed from a highlight), so both places are kept in range.
  const g = Math.min(gi, Math.max(0, groups.length - 1));
  const group = groups[g];
  const index = Math.min(si, Math.max(0, (group?.entries.length ?? 1) - 1));
  const entry = group?.entries[index];
  const isVideo = entry?.item.type === 'video' && !!entry.item.url;
  // The story id is part of the source, so two stories that share one video file each get a fresh player.
  const player = useVideoPlayer(isVideo ? { uri: entry.item.url, metadata: { title: entry.id } } : null, (p) => {
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
    onClose();
  }, [progress, onClose]);

  const step = useCallback(
    (dir: 1 | -1) => {
      if (!group) return;
      if (dir === 1) {
        if (index < group.entries.length - 1) setSi(index + 1);
        else if (g < groups.length - 1) {
          setGi(g + 1);
          setSi(0);
        } else close();
      } else if (index > 0) setSi(index - 1);
      else if (g > 0) {
        setGi(g - 1);
        setSi(0);
      } else {
        // Already at the very first story: start it again.
        progress.setValue(0);
        if (isVideo) {
          try {
            player.currentTime = 0;
            player.play();
          } catch {
            // the player was released
          }
        } else runRef.current(0);
      }
    },
    [group, groups.length, g, index, close, progress, isVideo, player],
  );

  const stepRef = useRef(step);
  stepRef.current = step;

  const run = (from: number) => {
    Animated.timing(progress, { toValue: 1, duration: Math.max(1, (1 - from) * STILL_MS), easing: Easing.linear, useNativeDriver: false }).start(({ finished }) => {
      if (finished && !closed.current) stepRef.current(1);
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
        if (isVideoRef.current) {
          try {
            playerRef.current.pause();
          } catch {
            // the player was released
          }
        } else progress.stopAnimation();
      } else if (!closed.current) {
        if (isVideoRef.current) {
          try {
            playerRef.current.play();
          } catch {
            // the player was released
          }
        } else progress.stopAnimation((v) => runRef.current(v));
      }
    },
    [progress],
  );

  // Before the story effect below, so a story that opens under a sheet waits for it.
  useEffect(() => {
    setWhy('held', held);
  }, [held, setWhy]);

  useEffect(() => {
    try {
      player.muted = muted;
    } catch {
      // the player was released
    }
  }, [player, muted]);

  // Start the clock for each story as it appears.
  useEffect(() => {
    if (!entry || !group) return;
    // A new story starts afresh; only `held` carries over, because the sheet or keyboard is still there.
    why.current.touch = false;
    why.current.manual = false;
    advanced.current = '';
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
    const id = entry.id;
    let waited = 0;
    const timer = setInterval(() => {
      try {
        if (player.status === 'error') {
          // The video cannot be played: keep its still picture up for a few seconds, then move on.
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
        if (d > 0) {
          progress.setValue(Math.min(1, t / d));
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

  const pause = useCallback(() => setWhy('manual', true), [setWhy]);
  const resume = useCallback(() => setWhy('manual', false), [setWhy]);

  // iOS pauses video when the app goes to the background and does not start it again by itself.
  useEffect(() => {
    if (!isVideo) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active' || isStopped(why.current) || closed.current) return;
      try {
        player.play();
      } catch {
        // the player was released
      }
    });
    return () => sub.remove();
  }, [isVideo, player]);

  // Holding pauses; only a short touch moves to another story.
  const downAt = useRef(0);
  const press = useCallback(() => {
    downAt.current = Date.now();
    setWhy('touch', true);
  }, [setWhy]);
  const release = useCallback(() => setWhy('touch', false), [setWhy]);
  const tap = (dir: 1 | -1) => () => {
    // While something holds the story (the reply keyboard, above all), a tap only puts the keyboard
    // away; moving on would throw away a half-written reply.
    if (held) {
      Keyboard.dismiss();
      return;
    }
    if (Date.now() - downAt.current < 350) step(dir);
  };

  if (!group || !entry) return <View style={{ flex: 1, backgroundColor: '#000' }} />;

  const ctx: PlayerCtx<E> = { group, entry, index, pause, resume, next: () => step(1), close };
  const bottom = Math.max(insets.bottom, 10);
  // The card is the largest 9:16 frame that fits between the status bar and the bar underneath:
  // drawings and stickers are placed in 9:16, so the shape cannot stretch.
  const frame = fitFrame(width - SIDE * 2, height - insets.top - 4 - bottom - BAR);
  const left = Math.round((width - frame.w) / 2);
  const bars = group.entries.length <= 30 ? group.entries : [];
  const second = subtitle?.(ctx);

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: '#000' }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={{ position: 'absolute', top: insets.top + 4, left, width: frame.w, height: frame.h }}>
        <StoryCanvas
          item={entry.item}
          width={frame.w}
          height={frame.h}
          radius={RADIUS}
          onMention={onMention}
          video={isVideo ? <VideoView player={player} style={{ width: frame.w, height: frame.h }} contentFit="cover" nativeControls={false} /> : undefined}
          between={
            <>
              {isVideo && started !== entry.id && entry.item.poster ? <Image source={{ uri: entry.item.poster }} style={{ position: 'absolute', left: 0, top: 0, width: frame.w, height: frame.h }} contentFit="cover" /> : null}
              <LinearGradient pointerEvents="none" colors={['rgba(0,0,0,0.5)', 'rgba(0,0,0,0)']} style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 120 }} />
              <View style={{ position: 'absolute', left: 0, top: 0, width: frame.w, height: frame.h, flexDirection: 'row' }}>
                <Pressable style={{ flex: 1 }} onPress={tap(-1)} onPressIn={press} onPressOut={release} accessibilityLabel="Previous story" />
                <Pressable style={{ flex: 2 }} onPress={tap(1)} onPressIn={press} onPressOut={release} accessibilityLabel="Next story" />
              </View>
            </>
          }
        />
        <View pointerEvents="box-none" style={{ position: 'absolute', top: 8, left: 0, right: 0 }}>
          <View style={{ flexDirection: 'row', gap: 3, paddingHorizontal: 8 }}>
            {bars.map((s, i) => (
              <View key={s.id} style={{ flex: 1, height: 2, borderRadius: 1, backgroundColor: 'rgba(255,255,255,0.35)', overflow: 'hidden' }}>
                {i < index ? <View style={{ flex: 1, backgroundColor: '#fff' }} /> : i === index ? <Animated.View style={{ height: 2, backgroundColor: '#fff', width: progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }} /> : null}
              </View>
            ))}
          </View>
          <View pointerEvents="box-none" style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 10, paddingRight: 2, paddingTop: 8 }}>
            <Pressable
              onPress={onOpenProfile ? () => onOpenProfile(group.user_id) : undefined}
              disabled={!onOpenProfile}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 9, flexShrink: 1 }}
              accessibilityRole={onOpenProfile ? 'button' : undefined}
              accessibilityLabel={`${group.username}'s profile`}>
              <Avatar uri={group.avatar_url} name={group.username} size={32} />
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
        </View>
      </View>
      <View style={{ flex: 1 }} pointerEvents="none" />
      <View style={{ minHeight: BAR, paddingTop: 6, paddingBottom: bottom, justifyContent: 'center', backgroundColor: '#000' }}>{footer ? footer(ctx) : null}</View>
    </KeyboardAvoidingView>
  );
}
