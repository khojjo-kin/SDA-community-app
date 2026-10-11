import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, LayoutChangeEvent, PanResponder, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, IconName } from '../../../src/components/Icon';
import { Cover, durationLabel, kindLabel, podLink, PodMenu, PodRow } from '../../../src/components/NowPlayingBar';
import { Button, ErrorNote, Loading, RoundButton, Screen, useToast } from '../../../src/components/ui';
import { fetchPodItem, setPodSaved } from '../../../src/lib/api';
import { tap } from '../../../src/lib/haptics';
import { useReduceMotion } from '../../../src/lib/motion';
import { cycleRepeat, jumpTo, next, patchQueued, play, prev, seek, setShuffle, toggle, useBuffering, usePlayer, useProgress } from '../../../src/lib/player';
import { useSession } from '../../../src/lib/session';
import { C, errText } from '../../../src/lib/theme';
import type { PodItem } from '../../../src/lib/types';

/** A bar you can tap or drag along. While a finger is on it the bar follows the finger, not the sound. */
function Scrubber({ position, duration, disabled, onSeek }: { position: number; duration: number; disabled?: boolean; onSeek: (seconds: number) => void }) {
  const [width, setWidth] = useState(0);
  const [drag, setDrag] = useState<number | null>(null);
  const widthRef = useRef(0);
  const originX = useRef(0);
  const dragRef = useRef<number | null>(null);
  const durationRef = useRef(duration);
  durationRef.current = duration;

  const fractionAt = (pageX: number) => Math.max(0, Math.min(1, (pageX - originX.current) / Math.max(1, widthRef.current)));
  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !disabled,
        onMoveShouldSetPanResponder: () => !disabled,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (e) => {
          originX.current = e.nativeEvent.pageX - e.nativeEvent.locationX;
          const f = fractionAt(e.nativeEvent.pageX);
          dragRef.current = f;
          setDrag(f);
        },
        onPanResponderMove: (e) => {
          const f = fractionAt(e.nativeEvent.pageX);
          dragRef.current = f;
          setDrag(f);
        },
        onPanResponderRelease: () => {
          if (dragRef.current !== null) onSeek(dragRef.current * durationRef.current);
          dragRef.current = null;
          setDrag(null);
        },
        onPanResponderTerminate: () => {
          dragRef.current = null;
          setDrag(null);
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [disabled, onSeek],
  );

  const onLayout = (e: LayoutChangeEvent) => {
    widthRef.current = e.nativeEvent.layout.width;
    setWidth(e.nativeEvent.layout.width);
  };
  const fraction = drag ?? (duration > 0 ? Math.min(1, position / duration) : 0);
  const shown = drag !== null ? drag * duration : position;
  const active = drag !== null;
  return (
    <View style={{ gap: 6 }}>
      <View
        {...responder.panHandlers}
        onLayout={onLayout}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel="Position"
        accessibilityValue={{ min: 0, max: Math.round(duration), now: Math.round(shown), text: `${durationLabel(shown)} of ${durationLabel(duration)}` }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) => onSeek(Math.max(0, Math.min(duration, position + (e.nativeEvent.actionName === 'increment' ? 15 : -15))))}
        style={{ height: 28, justifyContent: 'center' }}>
        <View style={{ height: active ? 8 : 5, borderRadius: 4, backgroundColor: C.surface2, overflow: 'hidden' }}>
          <View style={{ width: Math.round(fraction * width), height: '100%', backgroundColor: active ? C.fg : C.fg2 }} />
        </View>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={{ color: active ? C.fg : C.fg3, fontSize: 12.5, fontVariant: ['tabular-nums'] }}>{durationLabel(shown)}</Text>
        <Text style={{ color: active ? C.fg : C.fg3, fontSize: 12.5, fontVariant: ['tabular-nums'] }}>{duration > 0 ? `-${durationLabel(Math.max(0, duration - shown))}` : '--:--'}</Text>
      </View>
    </View>
  );
}

function Transport({ playing, buffering, canPrev, canNext, onPrev, onToggle, onNext }: { playing: boolean; buffering: boolean; canPrev: boolean; canNext: boolean; onPrev: () => void; onToggle: () => void; onNext: () => void }) {
  const side = (name: IconName, label: string, on: boolean, press: () => void) => (
    <Pressable onPress={() => { tap('light'); press(); }} disabled={!on} hitSlop={8} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: !on }} style={({ pressed }) => ({ width: 56, height: 56, alignItems: 'center', justifyContent: 'center', opacity: !on ? 0.35 : pressed ? 0.6 : 1 })}>
      <Icon name={name} size={36} />
    </Pressable>
  );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 28 }}>
      {side('skipback', 'Previous track', canPrev, onPrev)}
      <Pressable onPress={() => { tap('light'); onToggle(); }} hitSlop={6} accessibilityRole="button" accessibilityLabel={playing ? 'Pause' : 'Play'} style={({ pressed }) => ({ width: 76, height: 76, borderRadius: 38, backgroundColor: C.fg, alignItems: 'center', justifyContent: 'center', transform: [{ scale: pressed ? 0.94 : 1 }] })}>
        {buffering && playing ? <ActivityIndicator color={C.bg} /> : <Icon name={playing ? 'pause' : 'play'} size={40} color={C.bg} />}
      </Pressable>
      {side('skipnext', 'Next track', canNext, onNext)}
    </View>
  );
}

/** The little round button under the transport: shuffle, repeat, save, share. Green when it is on. */
function Extra({ name, label, on, onPress, badge, fill }: { name: IconName; label: string; on?: boolean; onPress: () => void; badge?: string; fill?: boolean }) {
  return (
    <Pressable onPress={() => { tap('select'); onPress(); }} hitSlop={8} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: !!on }} style={({ pressed }) => ({ width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? C.accentSoft : 'transparent', opacity: pressed ? 0.6 : 1 })}>
      <Icon name={name} size={24} color={on ? C.accent2 : C.fg2} fill={fill} />
      {badge ? (
        <View style={{ position: 'absolute', top: 6, right: 6, minWidth: 14, height: 14, borderRadius: 7, paddingHorizontal: 3, backgroundColor: C.accent2, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: C.bg, fontSize: 9.5, fontWeight: '800' }}>{badge}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

/** The time row and scrubber only re-render with progress here, so the rest of the screen stays still. */
function LiveScrubber({ disabled }: { disabled?: boolean }) {
  const { position, duration } = useProgress();
  return <Scrubber position={position} duration={duration} disabled={disabled} onSeek={seek} />;
}

function LiveTransport({ canPrev, canNext }: { canPrev: boolean; canNext: boolean }) {
  const { playing } = usePlayer();
  // Only whether it is loading: the buttons needn't draw again with every tick of the clock.
  const buffering = useBuffering();
  return <Transport playing={playing} buffering={buffering} canPrev={canPrev} canNext={canNext} onPrev={prev} onToggle={toggle} onNext={() => next()} />;
}

export default function PodPlayer() {
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const reduce = useReduceMotion();
  const { me } = useSession();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { current, playing, queue, upNext, shuffle, repeat } = usePlayer();
  const [fetched, setFetched] = useState<PodItem | null>(null);
  const [error, setError] = useState('');
  const [menu, setMenu] = useState(false);
  const [moreText, setMoreText] = useState(false);
  const [saving, setSaving] = useState(false);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  const isCurrent = !!current && current.id === id;
  const queued = queue.find((i) => i.id === id) ?? null;
  const item: PodItem | null = isCurrent ? current : queued ?? fetched;

  const load = useCallback(async () => {
    if (!id) return;
    setError('');
    try {
      const got = await fetchPodItem(id);
      if (!alive.current) return;
      if (!got) setError('This track is no longer in Pod.');
      else {
        setFetched(got);
        patchQueued(got.id, { saved: got.saved, plays: got.plays });
      }
    } catch (e) {
      if (alive.current) setError(errText(e));
    }
  }, [id]);
  useEffect(() => {
    // The queue copy might be stale on "saved"; a fresh read is cheap and keeps the bookmark honest.
    load();
  }, [load]);

  // The cover breathes: full size while the sound plays, a little smaller when it is paused (as music players do).
  const scale = useRef(new Animated.Value(isCurrent && playing ? 1 : 0.86)).current;
  useEffect(() => {
    const to = isCurrent && playing ? 1 : 0.86;
    // With Reduce Motion on, it simply takes its new size.
    if (reduce !== false) {
      scale.setValue(to);
      return;
    }
    const spring = Animated.spring(scale, { toValue: to, useNativeDriver: true, damping: 16, stiffness: 160, mass: 0.8 });
    spring.start();
    return () => spring.stop();
  }, [isCurrent, playing, scale, reduce]);

  // The rows of Up next play their track; the same function from one draw to the next.
  const queueRef = useRef(queue);
  queueRef.current = queue;
  const jumpToRow = useCallback((u: PodItem) => jumpTo(queueRef.current.findIndex((x) => x.id === u.id)), []);

  async function toggleSaved() {
    if (!item || saving) return;
    const nextSaved = !item.saved;
    setSaving(true);
    try {
      await setPodSaved(me, item.id, nextSaved);
      patchQueued(item.id, { saved: nextSaved });
      setFetched((f) => (f && f.id === item.id ? { ...f, saved: nextSaved } : f));
      toast(nextSaved ? 'Added to your library' : 'Removed from your library');
    } catch (e) {
      toast(errText(e));
    } finally {
      if (alive.current) setSaving(false);
    }
  }

  function share() {
    if (!item) return;
    Clipboard.setStringAsync(podLink(item.id))
      .then(() => toast('Link copied'))
      .catch((e) => toast(errText(e)));
  }

  const close = () => (router.canGoBack() ? router.back() : router.replace('/pod' as any));
  // As wide as the screen allows, but small enough on a short phone that the title, the time bar and
  // every button still fit under it without scrolling (they take about 420 points with the header).
  const art = Math.round(Math.max(160, Math.min(width - 48, height - insets.top - insets.bottom - 423)));
  const description = item?.description?.trim() ?? '';
  const canPrev = isCurrent;
  const canNext = isCurrent && (upNext.length > 0 || repeat !== 'off' || queue.length > 1);

  return (
    <Screen>
      <View style={{ height: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 }}>
        <RoundButton name="down" label="Close the player" onPress={close} />
        <Text accessibilityRole="header" numberOfLines={1} style={{ flex: 1, color: C.fg2, fontSize: 13, fontWeight: '700', letterSpacing: 0.8, textAlign: 'center' }}>
          {item ? (isCurrent ? 'PLAYING NOW' : kindLabel(item.kind).toUpperCase()) : ''}
        </Text>
        <View style={{ width: 44, alignItems: 'flex-end' }}>{item ? <RoundButton name="more" label="More options" onPress={() => setMenu(true)} /> : null}</View>
      </View>
      {error && !item ? (
        <ErrorNote message={error} onRetry={load} />
      ) : !item ? (
        <Loading />
      ) : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 8, paddingBottom: insets.bottom + 40 }} showsVerticalScrollIndicator={false}>
          <View style={{ alignItems: 'center', height: art, justifyContent: 'center' }}>
            <Animated.View style={{ transform: [{ scale }], shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 24, shadowOffset: { width: 0, height: 14 }, elevation: 12 }}>
              <Cover uri={item.cover_url} kind={item.kind} size={art} radius={18} />
            </Animated.View>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 26 }}>
            <View style={{ flex: 1 }}>
              <Text numberOfLines={2} style={{ color: C.fg, fontSize: 22, fontWeight: '800', lineHeight: 27 }}>
                {item.title}
              </Text>
              <Text numberOfLines={1} style={{ color: C.accent2, fontSize: 17, marginTop: 3 }}>
                {item.artist || kindLabel(item.kind)}
              </Text>
            </View>
            {isCurrent ? (
              <Pressable onPress={() => { tap('select'); toggleSaved(); }} hitSlop={8} accessibilityRole="button" accessibilityLabel={item.saved ? 'Remove from library' : 'Add to library'} accessibilityState={{ selected: item.saved, busy: saving }} style={({ pressed }) => ({ width: 40, height: 40, borderRadius: 20, backgroundColor: C.round, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
                {saving ? <ActivityIndicator color={C.fg} size="small" /> : <Icon name="bookmark" size={20} color={item.saved ? C.accent2 : C.fg} fill={item.saved} />}
              </Pressable>
            ) : null}
          </View>

          {isCurrent ? (
            <>
              <View style={{ marginTop: 22 }}>
                <LiveScrubber />
              </View>
              <View style={{ marginTop: 18 }}>
                <LiveTransport canPrev={canPrev} canNext={canNext} />
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-evenly', marginTop: 26 }}>
                <Extra name="shuffle" label={shuffle ? 'Shuffle on' : 'Shuffle off'} on={shuffle} onPress={() => setShuffle(!shuffle)} />
                <Extra name="repeat" label={repeat === 'off' ? 'Repeat off' : repeat === 'all' ? 'Repeat all' : 'Repeat this track'} on={repeat !== 'off'} badge={repeat === 'one' ? '1' : undefined} onPress={cycleRepeat} />
                <Extra name="bookmark" label={item.saved ? 'Remove from library' : 'Add to library'} on={item.saved} fill={item.saved} onPress={toggleSaved} />
                <Extra name="send" label="Share" onPress={share} />
              </View>
            </>
          ) : (
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 22 }}>
              <Button label="Play" onPress={() => play([item], 0)} style={{ flex: 1 }} />
              <Button label={item.saved ? 'Saved' : 'Save'} kind="ghost" busy={saving} onPress={toggleSaved} style={{ flex: 1 }} />
              <Pressable onPress={share} hitSlop={6} accessibilityRole="button" accessibilityLabel="Share" style={({ pressed }) => ({ width: 46, height: 46, borderRadius: 12, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}>
                <Icon name="send" size={22} />
              </Pressable>
            </View>
          )}

          {item.duration_seconds > 0 && !isCurrent ? <Text style={{ color: C.fg3, fontSize: 13, marginTop: 14 }}>{durationLabel(item.duration_seconds)}</Text> : null}

          {description ? (
            <View style={{ marginTop: 28 }}>
              <Text accessibilityRole="header" style={{ color: C.fg, fontSize: 17, fontWeight: '700', marginBottom: 8 }}>
                About
              </Text>
              <Text numberOfLines={moreText ? undefined : 4} style={{ color: C.fg2, fontSize: 15, lineHeight: 21 }}>
                {description}
              </Text>
              {description.length > 180 ? (
                <Pressable onPress={() => setMoreText((m) => !m)} hitSlop={6} accessibilityRole="button" accessibilityLabel={moreText ? 'Show less' : 'Read more'} style={({ pressed }) => ({ alignSelf: 'flex-start', paddingVertical: 6, opacity: pressed ? 0.6 : 1 })}>
                  <Text style={{ color: C.accent2, fontSize: 14.5, fontWeight: '600' }}>{moreText ? 'Show less' : 'Read more'}</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          {item.username ? (
            <Text style={{ color: C.fg3, fontSize: 13, marginTop: 18 }}>
              Added by @{item.username} · {item.plays === 1 ? '1 play' : `${item.plays} plays`}
            </Text>
          ) : null}

          {isCurrent && upNext.length ? (
            <View style={{ marginTop: 28, marginHorizontal: -24 }}>
              <Text accessibilityRole="header" style={{ color: C.fg, fontSize: 17, fontWeight: '700', paddingHorizontal: 24, marginBottom: 6 }}>
                Up next
              </Text>
              {upNext.slice(0, 30).map((u) => (
                <PodRow key={u.id} item={u} compact onPress={jumpToRow} />
              ))}
            </View>
          ) : null}

          {!isCurrent && current ? (
            <Pressable onPress={() => router.replace(`/pod/${current.id}` as any)} accessibilityRole="button" accessibilityLabel={`Now playing: ${current.title}. Open it`} style={({ pressed }) => ({ marginTop: 28, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 14, backgroundColor: pressed ? C.surface2 : C.surface })}>
              <Cover uri={current.cover_url} kind={current.kind} size={40} radius={10} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.fg2, fontSize: 12 }}>{playing ? 'Playing now' : 'Paused'}</Text>
                <Text numberOfLines={1} style={{ color: C.fg, fontSize: 15, fontWeight: '600' }}>
                  {current.title}
                </Text>
              </View>
              <Icon name="right" size={18} color={C.fg2} weight={2} />
            </Pressable>
          ) : null}
        </ScrollView>
      )}
      <PodMenu
        item={menu ? item : null}
        hideOpen
        onClose={() => setMenu(false)}
        onChange={(nextItem) => {
          if (!nextItem) {
            close();
            return;
          }
          setFetched(nextItem);
        }}
      />
    </Screen>
  );
}
