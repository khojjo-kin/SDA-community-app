import React, { useEffect, useRef, useState } from 'react';
import { Animated, AppState, Easing, Image, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useReduceMotion } from '../lib/motion';
import { useSession } from '../lib/session';

/*
 * The logo the app opens on. When the app starts from cold, and when it comes back after a long
 * time in the background, the logo covers the screen for a moment and then lifts away to show the
 * first screen underneath.
 *
 * From cold it takes over from the phone's own launch screen, so it copies that exactly (app.json,
 * expo-splash-screen): the same dark background in every theme, and splash-icon.png 160 points wide
 * in the middle of the screen. Its first frame is the launch screen's last, so nobody sees the
 * hand-off; then a soft green ring breathes out from behind the logo while the first screen gets
 * ready, and the cover fades as the logo grows a touch. Coming back after a long time away, the
 * logo fades in on the same background first.
 *
 * It stays at least MIN_MS, so a fast phone doesn't flash it, and never more than MAX_MS, so a slow
 * connection can't keep anyone out. With Reduce Motion on there is no ring and no growing: the logo
 * simply fades.
 */

/** The launch screen's colour and logo size, from app.json. Fixed: the launch screen doesn't follow the theme. */
const BRAND_BG = '#0b1014';
const LOGO = 160;
/** The app's green (theme.ts), for the ring. */
const GREEN = '#1fbf5a';

const MIN_MS = 600;
/** Coming back the logo still has to fade in, so it stays a little longer. */
const MIN_RETURN_MS = 850;
const MAX_MS = 2500;
/** This long in the background and the app opens on the logo again, as if new. */
const AWAY_MS = 15 * 60 * 1000;

// Whether the first screen is ready to be seen. Set once, by LaunchReady; after that a cover on the
// way back from the background only waits for its own minimum.
let firstScreenReady = false;
const waiting = new Set<() => void>();

function markReady() {
  if (firstScreenReady) return;
  firstScreenReady = true;
  waiting.forEach((go) => go());
  waiting.clear();
}

// Whether the cover's logo has been drawn, so the phone's launch screen can go without a gap.
let logoDrawn = false;
let onLogoDrawn: (() => void)[] = [];

function markLogoDrawn() {
  if (logoDrawn) return;
  logoDrawn = true;
  onLogoDrawn.forEach((go) => go());
  onLogoDrawn = [];
}

/**
 * Resolves once the cover's logo is on screen, or after `limit` milliseconds whatever happens. The
 * root layout waits for it before taking the launch screen down, so the launch screen gives way to
 * an identical picture rather than to a frame of background while the logo is still being read.
 */
export function whenCoverDrawn(limit = 300): Promise<void> {
  if (logoDrawn) return Promise.resolve();
  return new Promise((resolve) => {
    const late = setTimeout(resolve, limit);
    onLogoDrawn.push(() => {
      clearTimeout(late);
      resolve();
    });
  });
}

/**
 * Says the first screen can be shown: drawn inside the session, it waits until the account is known
 * (from the phone's copy or the database), then two frames more, so the screen it reveals has been
 * laid out and drawn rather than a blank one.
 */
export function LaunchReady(): null {
  const { loading } = useSession();
  useEffect(() => {
    if (loading || firstScreenReady) return;
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(markReady);
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [loading]);
  return null;
}

type Showing = { id: number; from: 'cold' | 'return' };

/** Draw once, after everything else in the root layout, outside anything keyed on the theme or language. */
export function LaunchCover() {
  const [showing, setShowing] = useState<Showing | null>({ id: 0, from: 'cold' });

  useEffect(() => {
    // When the app went to the background; 0 while it is in front (or only briefly covered by the
    // phone, such as Control Centre, which is 'inactive' and doesn't count).
    let leftAt = 0;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') {
        leftAt = Date.now();
      } else if (state === 'active') {
        if (leftAt && Date.now() - leftAt >= AWAY_MS) setShowing((cur) => cur ?? { id: Date.now(), from: 'return' });
        leftAt = 0;
      }
    });
    return () => sub.remove();
  }, []);

  if (!showing) return null;
  return <Cover key={showing.id} from={showing.from} onGone={() => setShowing(null)} />;
}

function Cover({ from, onGone }: { from: Showing['from']; onGone: () => void }) {
  const reduce = useReduceMotion();
  const [leaving, setLeaving] = useState(false);
  // The whole cover's opacity: 1 while it is up, 0 once it has lifted.
  const cover = useRef(new Animated.Value(1)).current;
  // The logo arriving: already there from cold (it is the launch screen's), faded in on the way back.
  const arrive = useRef(new Animated.Value(from === 'cold' ? 1 : 0)).current;
  // One breath of the ring, 0 to 1, over and over while the cover waits.
  const ring = useRef(new Animated.Value(0)).current;
  // The logo growing a touch as the cover fades.
  const lift = useRef(new Animated.Value(0)).current;
  const shownAt = useRef(Date.now()).current;
  const done = useRef(onGone);
  done.current = onGone;

  // Coming back: the logo fades in (and settles from slightly smaller, unless motion is reduced).
  useEffect(() => {
    if (from !== 'return') return;
    const a = Animated.timing(arrive, { toValue: 1, duration: 300, easing: Easing.out(Easing.cubic), useNativeDriver: true });
    a.start();
    return () => a.stop();
  }, [from, arrive]);

  // The ring, only once the phone has said motion is fine. It keeps breathing as the cover fades.
  useEffect(() => {
    if (reduce !== false) return;
    ring.setValue(0);
    const breath = Animated.loop(Animated.timing(ring, { toValue: 1, duration: 1500, easing: Easing.out(Easing.quad), useNativeDriver: true }));
    breath.start();
    return () => breath.stop();
  }, [reduce, ring]);

  // Lift once the first screen is ready and the minimum has passed, or at the maximum whatever happens.
  useEffect(() => {
    let hold: ReturnType<typeof setTimeout> | undefined;
    const go = () => {
      const least = from === 'cold' ? MIN_MS : MIN_RETURN_MS;
      hold = setTimeout(() => setLeaving(true), Math.max(0, shownAt + least - Date.now()));
    };
    const cap = setTimeout(() => setLeaving(true), MAX_MS);
    if (firstScreenReady) go();
    else waiting.add(go);
    return () => {
      waiting.delete(go);
      if (hold) clearTimeout(hold);
      clearTimeout(cap);
    };
  }, [from, shownAt]);

  useEffect(() => {
    if (!leaving) return;
    const plain = reduce === true;
    const fade = Animated.timing(cover, { toValue: 0, duration: plain ? 240 : 320, easing: Easing.out(Easing.quad), useNativeDriver: true });
    const anim = plain ? fade : Animated.parallel([fade, Animated.timing(lift, { toValue: 1, duration: 320, easing: Easing.out(Easing.quad), useNativeDriver: true })]);
    anim.start(({ finished }) => {
      if (finished) done.current();
    });
    return () => anim.stop();
    // Only the moment it starts to leave matters; `reduce` is read then.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leaving]);

  const still = reduce !== false;
  return (
    <Animated.View
      // Holds touches while it is up, so nothing underneath is pressed by accident; lets every touch
      // through from the moment it starts to fade.
      pointerEvents={leaving ? 'none' : 'auto'}
      accessible={!leaving}
      accessibilityLabel="Community"
      accessibilityElementsHidden={leaving}
      importantForAccessibility={leaving ? 'no-hide-descendants' : 'yes'}
      style={[StyleSheet.absoluteFill, { backgroundColor: BRAND_BG, alignItems: 'center', justifyContent: 'center', opacity: cover }]}>
      {/* Light status bar text on the dark cover, whatever the theme; the theme's own returns as it fades. */}
      {leaving ? null : <StatusBar style="light" />}
      {still ? null : (
        <>
          {/* A faint green glow, and a thin ring breathing out past it. Both start invisible, so the first frame is the launch screen's. */}
          <Animated.View
            pointerEvents="none"
            style={{
              position: 'absolute',
              width: LOGO,
              height: LOGO,
              borderRadius: LOGO / 2,
              backgroundColor: GREEN,
              opacity: ring.interpolate({ inputRange: [0, 0.35, 1], outputRange: [0, 0.1, 0] }),
              transform: [{ scale: ring.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1.25] }) }],
            }}
          />
          <Animated.View
            pointerEvents="none"
            style={{
              position: 'absolute',
              width: LOGO,
              height: LOGO,
              borderRadius: LOGO / 2,
              borderWidth: 1.5,
              borderColor: GREEN,
              opacity: ring.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 0.55, 0] }),
              transform: [{ scale: ring.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1.6] }) }],
            }}
          />
        </>
      )}
      <Animated.View style={{ opacity: arrive, transform: [{ scale: lift.interpolate({ inputRange: [0, 1], outputRange: [1, 1.1] }) }] }}>
        <Animated.View style={{ transform: [{ scale: still ? 1 : arrive.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) }] }}>
          {/* No fade-in of its own on Android (fadeDuration), or the hand-off from the launch screen would show. */}
          <Image
            source={require('../../assets/splash-icon.png')}
            style={{ width: LOGO, height: LOGO }}
            resizeMode="contain"
            fadeDuration={0}
            onLoad={() => requestAnimationFrame(markLogoDrawn)}
            accessibilityIgnoresInvertColors
          />
        </Animated.View>
      </Animated.View>
    </Animated.View>
  );
}
