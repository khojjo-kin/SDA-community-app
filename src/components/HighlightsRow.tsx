import React, { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { Animated, Easing, Pressable, ScrollView, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import { fetchHighlights } from '../lib/api';
import { useReduceMotion } from '../lib/motion';
import { listen } from '../lib/store';
import { ringColors } from '../lib/styling';
import { C } from '../lib/theme';
import type { Highlight } from '../lib/types';
import { Icon } from './Icon';

/*
 * Memories (stored as highlights) on a profile.
 *
 * A memory made in the last day that this phone hasn't opened yet wears the green ring, the way a new
 * story does. Which ones have been opened is kept for this run of the app only (a plain Set rather
 * than storage): a fresh start simply shows the day's new memories as new again.
 *
 * When you have just made or edited a memory, its ring turns once the next time your profile shows,
 * so you can see where it went. The screen that saved it calls markMemoryJustMade before going back.
 */

const opened = new Set<string>();
let justMade: { id: string; at: number } | null = null;
/** Each profile's memories as last loaded, so going back to a profile shows its row at once instead of popping in. */
const known = new Map<string, Highlight[]>();

/** New for a day after it is made. */
const FRESH_MS = 24 * 3600e3;
/** How long the turning ring stays before it settles into the ordinary one. */
const SPIN_SHOWN_MS = 2000;
/** A turn that never got seen (the profile wasn't opened) isn't worth playing much later. */
const JUST_MADE_MS = 10 * 60e3;

/** Notes that this phone has opened a memory, so it stops looking new. */
export function markMemoryOpened(id: string) {
  opened.add(id);
}

/** The memory you just made or saved: its ring turns once when your profile next appears. */
export function markMemoryJustMade(id: string) {
  justMade = { id, at: Date.now() };
}

const SIZE = 68;
const GAP_SIZE = 63;
const COVER = 57;

type Colors = readonly [string, string, ...string[]];

/**
 * The ring that turns once: an arc of the ring's colours sweeping round. Then it settles into what the
 * circle will show from now on, so the hand-over at the end can't be seen: with `stay` the full ring
 * fades in under the arc; without it the arc fades away, leaving the grey outline.
 */
function SpinRing({ colors, stay, children }: { colors: Colors; stay: boolean; children: React.ReactNode }) {
  const turn = useRef(new Animated.Value(0)).current;
  const settle = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const run = Animated.sequence([
      Animated.timing(turn, { toValue: 1, duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(settle, { toValue: 1, duration: 260, useNativeDriver: true }),
    ]);
    run.start();
    return () => run.stop();
  }, [turn, settle]);
  const rotate = turn.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  // The arc fades from the ring's last colour to nothing, so it reads as a sweep rather than a disc.
  const tail = colors[colors.length - 1];
  const arc = [...colors, /^#[0-9a-f]{6}$/i.test(tail) ? `${tail}00` : 'transparent'] as unknown as Colors;
  const fadeOut = settle.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });
  return (
    <View style={{ width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' }}>
      {stay ? (
        <Animated.View style={{ position: 'absolute', width: SIZE, height: SIZE, borderRadius: SIZE / 2, overflow: 'hidden', opacity: settle }}>
          <LinearGradient colors={colors} start={{ x: 0, y: 1 }} end={{ x: 1, y: 0 }} style={{ flex: 1 }} />
        </Animated.View>
      ) : (
        <View style={{ position: 'absolute', width: SIZE, height: SIZE, borderRadius: SIZE / 2, borderWidth: 1, borderColor: C.fg3 }} />
      )}
      <Animated.View style={{ position: 'absolute', width: SIZE, height: SIZE, borderRadius: SIZE / 2, overflow: 'hidden', opacity: stay ? 1 : fadeOut, transform: [{ rotate }] }}>
        <LinearGradient colors={arc} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={{ flex: 1 }} />
      </Animated.View>
      {/* The thin gap in the page colour between ring and cover. Once the arc has faded, the outline beyond it shows. */}
      <View style={{ width: GAP_SIZE, height: GAP_SIZE, borderRadius: GAP_SIZE / 2, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' }}>{children}</View>
    </View>
  );
}

/**
 * The row of memory circles on a profile. On your own profile it starts with "New".
 * `ringColor` is a Plus member's chosen ring (profiles.ring_color): when set, every circle gets that
 * gradient; otherwise only new memories do, and the rest keep the plain grey outline.
 */
export function HighlightsRow({ userId, mine, refreshKey, ringColor }: { userId: string; mine: boolean; refreshKey?: number; ringColor?: string | null }) {
  const router = useRouter();
  const reduceMotion = useReduceMotion();
  const [list, setList] = useState<Highlight[]>(() => known.get(userId) ?? []);
  const [focused, setFocused] = useState(false);
  const [spinId, setSpinId] = useState<string | null>(null);
  // Opening a memory changes `opened`, which React can't see; this draws the row again.
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  // Only the latest answer is used (a profile can change under the row, and answers can arrive out of order).
  const ask = useRef(0);
  // A memory was just tapped: a second tap a moment later doesn't open it twice.
  const lastOpen = useRef(0);

  const load = useCallback(() => {
    const asked = ++ask.current;
    fetchHighlights(userId)
      .then((h) => {
        known.set(userId, h);
        if (asked === ask.current) setList(h);
      })
      .catch(() => {});
  }, [userId]);

  // Another profile in the same row (the screen was reused): its own memories, not the last one's.
  useEffect(() => {
    setList(known.get(userId) ?? []);
  }, [userId]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);
  useEffect(() => listen('profile', load), [load]);

  // The new memory is saved while its own screen is still on top, so the turn waits until this
  // profile is actually the screen in front.
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      redraw();
      return () => setFocused(false);
    }, []),
  );

  useEffect(() => {
    if (!mine || !focused || !justMade) return;
    if (Date.now() - justMade.at > JUST_MADE_MS) {
      justMade = null;
      return;
    }
    const id = justMade.id;
    if (!list.some((h) => h.id === id)) return;
    justMade = null;
    // With Reduce Motion on, the ring doesn't turn: the memory just shows as new.
    if (reduceMotion !== true) setSpinId(id);
  }, [mine, focused, list, reduceMotion]);

  useEffect(() => {
    if (!spinId) return;
    const t = setTimeout(() => setSpinId(null), SPIN_SHOWN_MS);
    return () => clearTimeout(t);
  }, [spinId]);

  if (!mine && !list.length) return null;
  const outline = { width: SIZE, height: SIZE, borderRadius: SIZE / 2, borderWidth: 1, borderColor: C.fg3, alignItems: 'center' as const, justifyContent: 'center' as const };
  // '' is the app's own green ring.
  const colors = ringColors(ringColor) as unknown as Colors;
  const now = Date.now();
  const isNew = (h: Highlight) => !opened.has(h.id) && now - new Date(h.created_at).getTime() < FRESH_MS;

  const cover = (h: Highlight, size: number) =>
    h.cover_url ? (
      <Image source={{ uri: h.cover_url }} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: C.surface2 }} contentFit="cover" transition={120} cachePolicy="memory-disk" />
    ) : (
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="highlight" size={24} color={C.fg2} />
      </View>
    );

  /** Opens a screen, once: a second tap a moment later does nothing. */
  function go(path: string) {
    const at = Date.now();
    if (at - lastOpen.current < 700) return false;
    lastOpen.current = at;
    router.push(path);
    return true;
  }

  function open(h: Highlight) {
    if (!go(`/highlight/${h.id}`)) return;
    markMemoryOpened(h.id);
    redraw();
  }

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, paddingTop: 14, gap: 12 }}>
      {mine ? (
        <Pressable onPress={() => go('/new-highlight')} accessibilityRole="button" accessibilityLabel="New memory" style={({ pressed }) => ({ width: 72, alignItems: 'center', gap: 5, opacity: pressed ? 0.7 : 1 })}>
          <View style={outline}>
            <Icon name="plus" size={26} />
          </View>
          <Text numberOfLines={1} style={{ color: C.fg, fontSize: 12 }}>New</Text>
        </Pressable>
      ) : null}
      {list.map((h) => {
        const fresh = isNew(h);
        const ringed = fresh || !!ringColor;
        return (
          <Pressable key={h.id} onPress={() => open(h)} accessibilityRole="button" accessibilityLabel={`Memory: ${h.title}${fresh ? ', new' : ''}`} style={({ pressed }) => ({ width: 72, alignItems: 'center', gap: 5, opacity: pressed ? 0.7 : 1 })}>
            {h.id === spinId ? (
              // The cover is already the size it will settle at, so nothing jumps when the turn ends.
              <SpinRing colors={colors} stay={ringed}>{cover(h, ringed ? COVER : 60)}</SpinRing>
            ) : ringed ? (
              // The same make-up as a story ring: the gradient, a thin gap in the page colour, then the cover.
              <LinearGradient colors={colors} start={{ x: 0, y: 1 }} end={{ x: 1, y: 0 }} style={{ width: SIZE, height: SIZE, borderRadius: SIZE / 2, alignItems: 'center', justifyContent: 'center' }}>
                <View style={{ width: GAP_SIZE, height: GAP_SIZE, borderRadius: GAP_SIZE / 2, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' }}>{cover(h, COVER)}</View>
              </LinearGradient>
            ) : (
              <View style={outline}>{cover(h, 60)}</View>
            )}
            <Text numberOfLines={1} style={{ color: C.fg, fontSize: 12, maxWidth: 72 }}>{h.title}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
