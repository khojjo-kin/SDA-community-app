import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, useWindowDimensions, View, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { t } from '../lib/i18n';
import { useReduceMotion } from '../lib/motion';
import { C } from '../lib/theme';

/*
 * Loading shapes: soft blocks where a screen's content will be, with a gentle shine sweeping across
 * them, shown the first time a screen has nothing to show yet (a slow connection, no saved copy).
 * Once anything has arrived, or the screen has a saved copy, the real content shows instead and
 * these never come back for a refresh.
 *
 * Every block on screen shares one sweep, which runs on the native side, so the shine passes over
 * the whole screen as one band from left to right. Each block is told how far it sits from the left
 * edge of the screen (`x`) so it can light up as the band passes it; that is known from the layout,
 * which is why the shapes below are drawn to the same measurements as the screens they stand in for.
 *
 * The colours are read from the theme as the shapes draw, so they suit Dark, White and Green. On the
 * always-black screens (Shorts) they use a dark version whatever the theme. With Reduce Motion on the
 * blocks stay still.
 */

// One sweep for the whole app: 0 to 1 again and again while any block is on screen. The band moves
// during the first part and rests off screen for the rest, so each pass has a pause after it.
const sweep = new Animated.Value(0);
const SWEEP_MS = 1500;
const MOVING = 0.75;
let users = 0;
let loop: Animated.CompositeAnimation | null = null;

function join() {
  users++;
  if (users > 1) return;
  sweep.setValue(0);
  loop = Animated.loop(Animated.timing(sweep, { toValue: 1, duration: SWEEP_MS, easing: Easing.linear, useNativeDriver: true }));
  loop.start();
}

function leave() {
  users = Math.max(0, users - 1);
  if (users > 0) return;
  loop?.stop();
  loop = null;
}

/** The block's colour and the shine's, for the theme in use or for an always-dark screen. */
function tones(dark?: boolean): { base: string; shine: string } {
  if (dark) return { base: 'rgba(255,255,255,0.09)', shine: 'rgba(255,255,255,0.09)' };
  // White has dark text: a pale grey block with a bright shine. Dark and Green: a lighter block with a faint one.
  if (C.statusBar === 'dark') return { base: C.surface, shine: 'rgba(255,255,255,0.8)' };
  return { base: C.surface, shine: 'rgba(255,255,255,0.065)' };
}

/**
 * One block. `x` is how far its left edge is from the left of the screen, so the shine reaches it
 * at the right moment; leave it out for something at the left edge.
 */
export function Skeleton({ width, height, radius = 6, x = 0, dark, style }: { width: number; height: number; radius?: number; x?: number; dark?: boolean; style?: ViewStyle }) {
  const reduce = useReduceMotion();
  const { width: screen } = useWindowDimensions();
  const moving = reduce === false;
  useEffect(() => {
    if (!moving) return;
    join();
    return leave;
  }, [moving]);
  const { base, shine } = tones(dark);
  const band = Math.round(Math.min(260, screen * 0.55));
  return (
    <View style={[{ width, height, borderRadius: radius, backgroundColor: base, overflow: 'hidden' }, style]}>
      {moving ? (
        <Animated.View
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: 0,
            width: band,
            transform: [{ translateX: sweep.interpolate({ inputRange: [0, MOVING, 1], outputRange: [-band - x, screen - x, screen - x] }) }],
          }}>
          <LinearGradient colors={['rgba(255,255,255,0)', shine, 'rgba(255,255,255,0)']} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} />
        </Animated.View>
      ) : null}
    </View>
  );
}

/** Wraps a set of blocks: screen readers hear "Loading" once instead of nothing. */
export function SkeletonFrame({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return (
    <View accessible accessibilityRole="progressbar" accessibilityLabel={t('loading.label')} style={style}>
      {children}
    </View>
  );
}

/* ---------- the shapes of particular screens ---------- */

/** Home: post cards, as PostCard lays them out (face and name, a square picture, two lines under it). */
export function FeedSkeleton({ count = 2 }: { count?: number }) {
  const { width } = useWindowDimensions();
  const media = width - 20;
  return (
    <SkeletonFrame>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={{ paddingBottom: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 12, paddingVertical: 8, height: 50 }}>
            <Skeleton width={34} height={34} radius={17} x={12} />
            <View style={{ gap: 6 }}>
              <Skeleton width={i % 2 ? 96 : 124} height={11} x={56} />
              {i % 2 ? null : <Skeleton width={78} height={9} x={56} />}
            </View>
          </View>
          <Skeleton width={media} height={media} radius={14} x={10} style={{ marginHorizontal: 10 }} />
          <View style={{ paddingHorizontal: 14, paddingTop: 14, gap: 8 }}>
            <Skeleton width={Math.round(width * (i % 2 ? 0.5 : 0.62))} height={11} x={14} />
            <Skeleton width={Math.round(width * (i % 2 ? 0.34 : 0.4))} height={11} x={14} />
          </View>
        </View>
      ))}
    </SkeletonFrame>
  );
}

/** One circle in the story tray, with the name under it. `index` is its place in the row, for the shine. */
export function StoryCircleSkeleton({ index }: { index: number }) {
  // The tray starts 12 in, and each circle takes 76 plus a 14 gap.
  const x = 12 + index * 90;
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: 76, alignItems: 'center', gap: 8 }}>
      <Skeleton width={70} height={70} radius={35} x={x + 3} />
      <Skeleton width={46} height={9} x={x + 15} />
    </View>
  );
}

/** The three-column grid's cells, with Grid.tsx's tall cells and two-point gaps. */
function GridCells({ rows }: { rows: number }) {
  const { width } = useWindowDimensions();
  const gap = 2;
  const size = Math.floor((width - gap * 2) / 3);
  const tall = Math.round(size * 1.33);
  return (
    <View style={{ gap }}>
      {Array.from({ length: rows }, (_, r) => (
        <View key={r} style={{ flexDirection: 'row', gap }}>
          {[0, 1, 2].map((c) => (
            <Skeleton key={c} width={size} height={tall} radius={0} x={c * (size + gap)} />
          ))}
        </View>
      ))}
    </View>
  );
}

/** Explore: the grid of posts. */
export function GridSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <SkeletonFrame>
      <GridCells rows={rows} />
    </SkeletonFrame>
  );
}

/** A profile's top: the face, name and three counts, two lines of bio, the two buttons, then the grid. */
export function ProfileSkeleton() {
  const { width } = useWindowDimensions();
  // The counts share what is left beside the face, as they do on the real profile.
  const statsLeft = 16 + 88 + 22;
  const statW = (width - statsLeft - 16 - 16) / 3;
  return (
    <SkeletonFrame>
      <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 22 }}>
          <Skeleton width={88} height={88} radius={44} x={16} />
          <View style={{ flex: 1 }}>
            <Skeleton width={Math.min(150, width * 0.36)} height={13} x={statsLeft} style={{ marginBottom: 14 }} />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {[0, 1, 2].map((i) => (
                <View key={i} style={{ flex: 1, gap: 7 }}>
                  <Skeleton width={30} height={15} x={statsLeft + i * (statW + 8)} />
                  <Skeleton width={Math.min(58, statW - 4)} height={10} x={statsLeft + i * (statW + 8)} />
                </View>
              ))}
            </View>
          </View>
        </View>
        <View style={{ gap: 8, marginTop: 18 }}>
          <Skeleton width={Math.round(width * 0.72)} height={11} x={16} />
          <Skeleton width={Math.round(width * 0.46)} height={11} x={16} />
        </View>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 18 }}>
          <Skeleton width={(width - 40) / 2} height={34} radius={10} x={16} />
          <Skeleton width={(width - 40) / 2} height={34} radius={10} x={24 + (width - 40) / 2} />
        </View>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 14, marginTop: 10 }}>
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} width={24} height={24} radius={6} x={(width / 3) * i + width / 6 - 12} />
        ))}
      </View>
      <GridCells rows={3} />
    </SkeletonFrame>
  );
}

const NAME_WIDTHS = [0.42, 0.3, 0.5, 0.36, 0.46, 0.33];
const LINE_WIDTHS = [0.62, 0.5, 0.7, 0.44, 0.58, 0.66];

/**
 * A list of people or chats: a round face, a name, a line under it, and optionally something on the
 * right (a post's picture in Notifications, a button in Followers and Following).
 */
export function RowsSkeleton({ count = 8, avatar = 56, gap = 12, padY = 8, trailing }: { count?: number; avatar?: number; gap?: number; padY?: number; trailing?: 'square' | 'button' }) {
  const { width } = useWindowDimensions();
  const textX = 16 + avatar + gap;
  const right = trailing === 'square' ? 46 + gap : trailing === 'button' ? 96 + gap : 0;
  const room = width - textX - 16 - right;
  return (
    <SkeletonFrame style={{ paddingTop: 4 }}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap, paddingHorizontal: 16, paddingVertical: padY }}>
          <Skeleton width={avatar} height={avatar} radius={avatar / 2} x={16} />
          <View style={{ flex: 1, gap: 8 }}>
            <Skeleton width={Math.round(room * NAME_WIDTHS[i % NAME_WIDTHS.length] * 1.4)} height={12} x={textX} />
            <Skeleton width={Math.round(room * LINE_WIDTHS[i % LINE_WIDTHS.length] * 1.3)} height={10} x={textX} />
          </View>
          {trailing === 'square' ? <Skeleton width={46} height={46} radius={8} x={width - 16 - 46} /> : null}
          {trailing === 'button' ? <Skeleton width={96} height={32} radius={9} x={width - 16 - 96} /> : null}
        </View>
      ))}
    </SkeletonFrame>
  );
}

/**
 * The Shorts tab before the first short arrives: black, a faint shine over the whole screen, the
 * column of buttons down the right, and the face, name and caption at the bottom, where Reel.tsx
 * puts them.
 */
export function ShortsSkeleton({ width, height, bottomInset }: { width: number; height: number; bottomInset: number }) {
  const textW = width - 14 - 76;
  return (
    <SkeletonFrame style={{ width, height, backgroundColor: '#000' }}>
      <Skeleton dark width={width} height={height} radius={0} style={{ position: 'absolute', backgroundColor: 'rgba(255,255,255,0.03)' }} />
      <View style={{ position: 'absolute', right: 10, bottom: bottomInset + 28, alignItems: 'center', gap: 18 }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <View key={i} style={{ alignItems: 'center', gap: 6 }}>
            <Skeleton dark width={32} height={32} radius={16} x={width - 10 - 32} />
            {i < 3 ? <Skeleton dark width={22} height={8} radius={4} x={width - 10 - 27} /> : null}
          </View>
        ))}
      </View>
      <View style={{ position: 'absolute', left: 14, bottom: bottomInset + 18, width: textW, gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Skeleton dark width={36} height={36} radius={18} x={14} />
          <Skeleton dark width={Math.min(110, textW * 0.4)} height={11} x={60} />
        </View>
        <Skeleton dark width={Math.round(textW * 0.85)} height={10} x={14} />
        <Skeleton dark width={Math.round(textW * 0.55)} height={10} x={14} />
      </View>
      <View style={{ position: 'absolute', left: 14, right: 14, bottom: bottomInset + 4, height: 2, borderRadius: 1, backgroundColor: 'rgba(255,255,255,0.15)' }} />
    </SkeletonFrame>
  );
}

/**
 * A thin line under a screen's header that runs while a refresh or the next page is taking a while.
 * It stays hidden for the first 1.5 seconds, so a quick answer never shows it; the pull-to-refresh
 * spinner covers that moment. Draws nothing in the layout: it floats over the top of what follows.
 */
export function SlowLine({ active }: { active: boolean }) {
  const { width } = useWindowDimensions();
  const reduce = useReduceMotion();
  const [late, setLate] = useState(false);
  const shown = useRef(new Animated.Value(0)).current;
  const run = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!active) {
      setLate(false);
      return;
    }
    const wait = setTimeout(() => setLate(true), 1500);
    return () => clearTimeout(wait);
  }, [active]);

  useEffect(() => {
    const fade = Animated.timing(shown, { toValue: late ? 1 : 0, duration: late ? 180 : 260, useNativeDriver: true });
    fade.start();
    if (!late || reduce !== false) return () => fade.stop();
    run.setValue(0);
    const pass = Animated.loop(Animated.timing(run, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.quad), useNativeDriver: true }));
    pass.start();
    return () => {
      fade.stop();
      pass.stop();
    };
  }, [late, reduce, shown, run]);

  const seg = Math.round(width * 0.38);
  return (
    <View pointerEvents="none" style={{ height: 0, zIndex: 3, elevation: 3 }}>
      <Animated.View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 2, overflow: 'hidden', opacity: shown, backgroundColor: reduce === false ? 'transparent' : C.accentSoft }}>
        {reduce === false ? (
          <Animated.View style={{ width: seg, height: 2, borderRadius: 1, backgroundColor: C.accent, transform: [{ translateX: run.interpolate({ inputRange: [0, 1], outputRange: [-seg, width] }) }] }} />
        ) : (
          <View style={{ width: '100%', height: 2, backgroundColor: C.accent, opacity: 0.6 }} />
        )}
      </Animated.View>
    </View>
  );
}
