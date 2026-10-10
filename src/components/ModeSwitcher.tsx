import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, Pressable, Text, useWindowDimensions, View } from 'react-native';
import { useRouter } from 'expo-router';
import { tap } from '../lib/haptics';
import { type Key, t } from '../lib/i18n';

/** The four ways to make something, in the order they sit under the shutter. */
export type CreateMode = 'post' | 'story' | 'shorts' | 'live';

const ORDER: CreateMode[] = ['post', 'story', 'shorts', 'live'];
const LABEL: Record<CreateMode, Key> = { post: 'createFlow.modePost', story: 'createFlow.modeStory', shorts: 'createFlow.modeShorts', live: 'createFlow.modeLive' };

/** Where each mode lives. Post and Shorts share the create screen; the others have screens of their own. */
export function modeHref(m: CreateMode): string {
  return m === 'post' ? '/create?mode=post' : m === 'shorts' ? '/create?mode=shorts' : m === 'story' ? '/add-story' : '/go-live';
}

/** Moves to another mode's screen in place of this one, so Back still leaves the create flow. */
export function useModeNav() {
  const router = useRouter();
  return (m: CreateMode) => router.replace(modeHref(m) as any);
}

/**
 * POST · STORY · SHORTS · LIVE, as a strip that slides so the chosen mode sits in the middle: it is
 * bold and white, the others dimmed. Tap a word or swipe the strip sideways to change. LIVE is left
 * out for members who can't broadcast.
 */
export function ModeSwitcher({ mode, onMode, canLive = true, disabled }: { mode: CreateMode; onMode: (m: CreateMode) => void; canLive?: boolean; disabled?: boolean }) {
  const { width } = useWindowDimensions();
  const modes = useMemo(() => ORDER.filter((m) => m !== 'live' || canLive), [canLive]);
  // Where each word sits in the strip, once drawn.
  const [spots, setSpots] = useState<Partial<Record<CreateMode, { x: number; w: number }>>>({});
  const shift = useRef(new Animated.Value(0)).current;
  const placed = useRef(false);

  const spot = spots[mode];
  // Before the frame is drawn, so the strip never shows in the wrong place.
  useLayoutEffect(() => {
    if (!spot) return;
    const to = width / 2 - (spot.x + spot.w / 2);
    // The first placement is instant, so the strip doesn't slide in when a screen opens.
    if (!placed.current) {
      placed.current = true;
      shift.setValue(to);
      return;
    }
    Animated.spring(shift, { toValue: to, useNativeDriver: true, friction: 9, tension: 80 }).start();
  }, [spot, width, shift]);

  // The latest values for the swipe, which is made once.
  const live = useRef({ mode, modes, onMode, disabled });
  live.current = { mode, modes, onMode, disabled };
  const choose = (m: CreateMode) => {
    const cur = live.current;
    if (cur.disabled || m === cur.mode) return;
    tap('select');
    cur.onMode(m);
  };
  const chooseRef = useRef(choose);
  chooseRef.current = choose;

  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
        onPanResponderRelease: (_, g) => {
          const { mode: m, modes: list } = live.current;
          const i = list.indexOf(m);
          if (g.dx < -28 && i < list.length - 1) chooseRef.current(list[i + 1]);
          else if (g.dx > 28 && i > 0) chooseRef.current(list[i - 1]);
        },
      }),
    [],
  );

  return (
    <View {...pan.panHandlers} accessibilityRole="tablist" style={{ height: 48, width, overflow: 'hidden', justifyContent: 'center' }}>
      <Animated.View style={{ flexDirection: 'row', alignSelf: 'flex-start', opacity: spot ? 1 : 0, transform: [{ translateX: shift }] }}>
        {modes.map((m) => {
          const on = m === mode;
          return (
            <Pressable
              key={m}
              onLayout={(e) => {
                const { x, width: w } = e.nativeEvent.layout;
                setSpots((cur) => (cur[m]?.x === x && cur[m]?.w === w ? cur : { ...cur, [m]: { x, w } }));
              }}
              onPress={() => choose(m)}
              hitSlop={{ top: 8, bottom: 8 }}
              accessibilityRole="tab"
              accessibilityLabel={t(LABEL[m])}
              accessibilityState={{ selected: on, disabled: !!disabled }}
              style={{ height: 40, paddingHorizontal: 14, justifyContent: 'center' }}>
              <Text style={{ color: on ? '#ffffff' : 'rgba(255,255,255,0.5)', fontSize: 13.5, fontWeight: on ? '800' : '700', letterSpacing: 1.4 }}>{t(LABEL[m])}</Text>
            </Pressable>
          );
        })}
      </Animated.View>
    </View>
  );
}
