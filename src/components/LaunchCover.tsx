import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, StyleSheet } from 'react-native';
import * as NativeSplash from 'expo-splash-screen';
import { useSession } from '../lib/session';
import { themeName } from '../lib/theme';

/*
 * The logo the app opens on, from cold only: the logo in the middle of a black screen (Dark) or a
 * white one (White), then a quick fade into the first screen. No ring, no growing.
 *
 * It takes over from the phone's own launch screen (app.json, expo-splash-screen: black with the
 * white logo, or white with the dark logo when the phone is in light mode), the same logo 160 points
 * wide in the middle. The root layout takes the launch screen down only once this cover's first
 * frame — background and logo — is on screen, so there is no gap between the two.
 *
 * It stays at least MIN_MS once drawn, so a fast phone doesn't flash it, and never more than MAX_MS,
 * so a slow connection can't keep anyone out. From the moment it starts to fade it lets every touch
 * through, and it is gone from the screen as soon as the fade ends.
 */

const LOGO = 160;
const MIN_MS = 400;
const MAX_MS = 2500;
const FADE_MS = 200;

// Where the phone's launch screen goes, if it has to fade: a soft cross-fade on iPhone when the
// phone's light or dark mode differs from the app's theme. Invisible when they match.
try {
  NativeSplash.setOptions({ fade: true, duration: FADE_MS });
} catch {
  // Older native side: the launch screen simply goes at once.
}

// Whether the first screen is ready to be seen. Set once, by LaunchReady.
let firstScreenReady = false;
const waiting = new Set<() => void>();

function markReady() {
  if (firstScreenReady) return;
  firstScreenReady = true;
  waiting.forEach((go) => go());
  waiting.clear();
}

// Whether the cover's first frame (background and logo) has been drawn.
let coverDrawn = false;
let onCoverDrawn: (() => void)[] = [];

function markCoverDrawn() {
  if (coverDrawn) return;
  coverDrawn = true;
  onCoverDrawn.forEach((go) => go());
  onCoverDrawn = [];
}

/**
 * Resolves once the cover's first frame is on screen, or after `limit` milliseconds whatever
 * happens. The root layout waits for it before taking the launch screen down, so the launch screen
 * gives way to the same picture rather than to a frame of background while the logo is being read.
 */
export function whenCoverDrawn(limit = 800): Promise<void> {
  if (coverDrawn) return Promise.resolve();
  return new Promise((resolve) => {
    const late = setTimeout(resolve, limit);
    onCoverDrawn.push(() => {
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

/** Draw once, after everything else in the root layout, outside anything keyed on the theme or language. */
export function LaunchCover() {
  const [up, setUp] = useState(true);
  if (!up) return null;
  return <Cover onGone={() => setUp(false)} />;
}

function Cover({ onGone }: { onGone: () => void }) {
  // Read once: the cover is drawn in the theme the app opens in.
  const [white] = useState(() => themeName() === 'white');
  const [leaving, setLeaving] = useState(false);
  const opacity = useRef(new Animated.Value(1)).current;
  const done = useRef(onGone);
  done.current = onGone;
  // The first frame needs both the cover laid out and the logo read.
  const parts = useRef({ laidOut: false, logo: false }).current;
  const [drawnAt, setDrawnAt] = useState(0);

  const partDone = (part: 'laidOut' | 'logo') => {
    parts[part] = true;
    if (!parts.laidOut || !parts.logo) return;
    // One frame later the picture is on the glass.
    requestAnimationFrame(() => {
      markCoverDrawn();
      setDrawnAt(Date.now());
    });
  };

  // Fade once the first screen is ready and the cover has been seen for MIN_MS, or at MAX_MS whatever happens.
  useEffect(() => {
    // Should the logo never report in, count the cover as drawn when the launch screen gives up waiting.
    const late = setTimeout(() => setDrawnAt((at) => at || Date.now()), 800);
    const cap = setTimeout(() => setLeaving(true), MAX_MS);
    return () => {
      clearTimeout(late);
      clearTimeout(cap);
    };
  }, []);
  useEffect(() => {
    if (!drawnAt) return;
    let hold: ReturnType<typeof setTimeout> | undefined;
    const go = () => {
      hold = setTimeout(() => setLeaving(true), Math.max(0, drawnAt + MIN_MS - Date.now()));
    };
    if (firstScreenReady) go();
    else waiting.add(go);
    return () => {
      waiting.delete(go);
      if (hold) clearTimeout(hold);
    };
  }, [drawnAt]);

  useEffect(() => {
    if (!leaving) return;
    const fade = Animated.timing(opacity, { toValue: 0, duration: FADE_MS, easing: Easing.out(Easing.quad), useNativeDriver: true });
    fade.start();
    // Gone when the fade ends, even if the animation never reports back.
    const gone = setTimeout(() => done.current(), FADE_MS + 50);
    return () => {
      fade.stop();
      clearTimeout(gone);
    };
  }, [leaving, opacity]);

  return (
    <Animated.View
      // Holds touches while it is up, so nothing underneath is pressed by accident; lets every touch
      // through from the moment it starts to fade.
      pointerEvents={leaving ? 'none' : 'auto'}
      onLayout={() => partDone('laidOut')}
      accessible={!leaving}
      accessibilityLabel="Community"
      accessibilityElementsHidden={leaving}
      importantForAccessibility={leaving ? 'no-hide-descendants' : 'yes'}
      style={[StyleSheet.absoluteFill, { backgroundColor: white ? '#ffffff' : '#000000', alignItems: 'center', justifyContent: 'center', opacity }]}>
      {/* No fade-in of its own on Android (fadeDuration), or the hand-off from the launch screen would show. */}
      <Image
        source={white ? require('../../assets/splash-icon-dark.png') : require('../../assets/splash-icon.png')}
        style={{ width: LOGO, height: LOGO }}
        resizeMode="contain"
        fadeDuration={0}
        onLoad={() => partDone('logo')}
        onError={() => partDone('logo')}
        accessibilityIgnoresInvertColors
      />
    </Animated.View>
  );
}
