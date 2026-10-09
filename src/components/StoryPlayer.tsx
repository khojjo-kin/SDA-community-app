import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, AppState, Easing, KeyboardAvoidingView, Platform, Pressable, Text, useWindowDimensions, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ago } from '../lib/theme';
import type { StoryItem } from '../lib/types';
import { fitFrame, StoryCanvas } from './StoryCanvas';
import { Avatar, IconButton } from './ui';

export type PlayerEntry = { id: string; item: StoryItem; created_at: string };
export type PlayerGroup<E extends PlayerEntry = PlayerEntry> = { key: string; user_id: string; username: string; avatar_url: string; entries: E[] };
export type PlayerCtx<E extends PlayerEntry> = { group: PlayerGroup<E>; entry: E; pause: () => void; resume: () => void; next: () => void; close: () => void };

const STILL_MS = 5000;

/**
 * Plays stories one after another: progress bars, tap left or right to move, hold to pause.
 * Stories, highlights and the archive all use it and only differ in what they put in the footer.
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
  showTime?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [gi, setGi] = useState(Math.min(Math.max(0, startGroup), Math.max(0, groups.length - 1)));
  const [si, setSi] = useState(startEntry);
  const progress = useRef(new Animated.Value(0)).current;
  // The id of the video story whose first frame has arrived. Until then its still picture is shown.
  const [started, setStarted] = useState('');
  const paused = useRef(false);
  const closed = useRef(false);
  const advanced = useRef('');

  const group = groups[gi];
  const entry = group?.entries[Math.min(si, Math.max(0, (group?.entries.length ?? 1) - 1))];
  const isVideo = entry?.item.type === 'video' && !!entry.item.url;
  // The story id is part of the source, so two stories that share one video file each get a fresh player.
  const player = useVideoPlayer(isVideo ? { uri: entry.item.url, metadata: { title: entry.id } } : null, (p) => {
    p.loop = false;
  });

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
        if (si < group.entries.length - 1) setSi(si + 1);
        else if (gi < groups.length - 1) {
          setGi(gi + 1);
          setSi(0);
        } else close();
      } else if (si > 0) setSi(si - 1);
      else if (gi > 0) {
        setGi(gi - 1);
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
    [group, groups.length, gi, si, close, progress, isVideo, player],
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

  // Start the clock for each story as it appears.
  useEffect(() => {
    if (!entry || !group) return;
    paused.current = false;
    advanced.current = '';
    progress.setValue(0);
    onShowRef.current?.(entry, group);
    if (!isVideo) {
      runRef.current(0);
      return () => progress.stopAnimation();
    }
    try {
      player.play();
    } catch {
      // the player was released
    }
    const id = entry.id;
    let waited = 0;
    const timer = setInterval(() => {
      try {
        if (player.status === 'error') {
          // The video cannot be played: keep its still picture up for a few seconds, then move on.
          if (paused.current) return;
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
          if (t >= d - 0.15 && advanced.current !== id && !paused.current) {
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

  const pause = useCallback(() => {
    if (paused.current) return;
    paused.current = true;
    if (isVideo) {
      try {
        player.pause();
      } catch {
        // the player was released
      }
    } else progress.stopAnimation();
  }, [isVideo, player, progress]);

  const resume = useCallback(() => {
    if (!paused.current || closed.current) return;
    paused.current = false;
    if (isVideo) {
      try {
        player.play();
      } catch {
        // the player was released
      }
    } else progress.stopAnimation((v) => runRef.current(v));
  }, [isVideo, player, progress]);

  // iOS pauses video when the app goes to the background and does not start it again by itself.
  useEffect(() => {
    if (!isVideo) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active' || paused.current || closed.current) return;
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
  const hold = useCallback(() => {
    downAt.current = Date.now();
    pause();
  }, [pause]);
  const tap = (dir: 1 | -1) => () => {
    if (Date.now() - downAt.current < 350) step(dir);
  };

  if (!group || !entry) return <View style={{ flex: 1, backgroundColor: '#000' }} />;

  const ctx: PlayerCtx<E> = { group, entry, pause, resume, next: () => step(1), close };
  const frame = fitFrame(width, height - insets.top - Math.max(insets.bottom, 10) - 66);
  const left = Math.round((width - frame.w) / 2);
  const bars = group.entries.length <= 30 ? group.entries : [];

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: '#000' }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={{ position: 'absolute', top: insets.top, left, width: frame.w, height: frame.h }}>
        <StoryCanvas
          item={entry.item}
          width={frame.w}
          height={frame.h}
          radius={14}
          onMention={onMention}
          video={isVideo ? <VideoView player={player} style={{ width: frame.w, height: frame.h }} contentFit="cover" nativeControls={false} /> : undefined}
          between={
            <>
              {isVideo && started !== entry.id && entry.item.poster ? <Image source={{ uri: entry.item.poster }} style={{ position: 'absolute', left: 0, top: 0, width: frame.w, height: frame.h }} contentFit="cover" /> : null}
              <LinearGradient pointerEvents="none" colors={['rgba(0,0,0,0.5)', 'rgba(0,0,0,0)']} style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 120 }} />
              <View style={{ position: 'absolute', left: 0, top: 0, width: frame.w, height: frame.h, flexDirection: 'row' }}>
                <Pressable style={{ flex: 1 }} onPress={tap(-1)} onPressIn={hold} onPressOut={resume} accessibilityLabel="Previous story" />
                <Pressable style={{ flex: 2 }} onPress={tap(1)} onPressIn={hold} onPressOut={resume} accessibilityLabel="Next story" />
              </View>
            </>
          }
        />
        <View pointerEvents="box-none" style={{ position: 'absolute', top: 8, left: 0, right: 0 }}>
          <View style={{ flexDirection: 'row', gap: 4, paddingHorizontal: 10 }}>
            {bars.map((s, i) => (
              <View key={s.id} style={{ flex: 1, height: 2.5, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.35)', overflow: 'hidden' }}>
                {i < si ? <View style={{ flex: 1, backgroundColor: '#fff' }} /> : i === si ? <Animated.View style={{ height: 2.5, backgroundColor: '#fff', width: progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }} /> : null}
              </View>
            ))}
          </View>
          <View pointerEvents="box-none" style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 12, paddingRight: 6, paddingTop: 10 }}>
            <Pressable onPress={onOpenProfile ? () => onOpenProfile(group.user_id) : undefined} disabled={!onOpenProfile} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 }} accessibilityRole={onOpenProfile ? 'button' : undefined} accessibilityLabel={`${group.username}'s profile`}>
              <Avatar uri={group.avatar_url} name={group.username} size={34} />
              <Text numberOfLines={1} style={{ color: '#fff', fontWeight: '600', flexShrink: 1 }}>{group.username}</Text>
              {showTime ? <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13.5 }}>{ago(entry.created_at)}</Text> : null}
            </Pressable>
            {badge ? badge(ctx) : null}
            <View style={{ flex: 1 }} pointerEvents="none" />
            <IconButton name="close" label="Close" size={28} color="#fff" onPress={close} />
          </View>
        </View>
      </View>
      <View style={{ flex: 1 }} pointerEvents="none" />
      <View style={{ minHeight: 62, paddingTop: 8, paddingBottom: Math.max(insets.bottom, 10), backgroundColor: '#000' }}>{footer ? footer(ctx) : null}</View>
    </KeyboardAvoidingView>
  );
}
