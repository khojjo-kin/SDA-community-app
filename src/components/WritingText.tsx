import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, Text, type TextStyle, View, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAppFont } from '../lib/fonts';
import { useReduceMotion } from '../lib/motion';
import { C } from '../lib/theme';

/*
 * Words that write themselves: letter by letter in the app's green, with a soft cursor blinking just
 * after the last letter, then they rest. After a pause they write once more, then stay.
 *
 * The whole text is laid out from the first frame, the letters not yet written in a clear colour, so
 * nothing moves or re-wraps as they appear; the cursor is a thin bar in the same line of text. With
 * Reduce Motion on, the words are simply there, with no bar beside them, so they sit exactly centred.
 */

/** How long to wait for the phone to say whether it wants less motion before simply showing the words. */
const ASK_MOTION_MS = 700;

/** How long one letter takes; a space or a stop takes a little longer, like a hand lifting off. */
const LETTER_MS = 52;
const SPACE_MS = 95;
const STOP_MS = 240;
/** Before the first letter, so the screen has settled. */
const START_MS = 380;
/** How long the cursor keeps blinking once the words are written. */
const BLINK_FOR_MS = 2600;
/** The rest before the words write themselves once more. */
const AGAIN_AFTER_MS = 7000;
/** The cursor fades in and out in these steps, so its blink is soft rather than on and off. */
const BLINK_STEPS = [1, 0.75, 0.4, 0.12, 0, 0, 0.12, 0.4, 0.75, 1, 1, 1];
const BLINK_STEP_MS = 85;

/** `#rrggbb` (or `#rgb`) at the given opacity; anything else is left as it is, or made clear at 0. */
function withAlpha(color: string, alpha: number): string {
  let hex = color.trim().replace('#', '');
  if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
  if (!/^[0-9a-f]{6}$/i.test(hex)) return alpha <= 0 ? 'transparent' : color;
  const n = parseInt(hex, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

function delayAfter(ch: string): number {
  if (ch === ' ') return SPACE_MS;
  if (/[.,!?;:…]/.test(ch)) return STOP_MS;
  // A little unevenness reads as writing rather than a machine.
  return LETTER_MS + Math.round((Math.random() - 0.5) * 24);
}

export function WritingText({ text, size = 20, bold = true, center = true, color, again = true, style }: { text: string; size?: number; bold?: boolean; center?: boolean; color?: string; again?: boolean; style?: TextStyle }) {
  const font = useAppFont(bold ? 'bold' : 'regular');
  const reduce = useReduceMotion();
  const ink = color ?? C.accent2;
  // Letters are counted as the phone sees them (Array.from), so an accented letter or emoji is one step.
  const letters = Array.from(text);
  const [shown, setShown] = useState(0);
  // The cursor's opacity; 0 hides it. It keeps its place in the line either way, so nothing moves when it goes.
  const [cursor, setCursor] = useState(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  // The phone answers within a few milliseconds. Should it never answer, the words show rather than stay unwritten.
  const [gaveUp, setGaveUp] = useState(false);
  useEffect(() => {
    if (reduce !== null) return;
    const timer = setTimeout(() => setGaveUp(true), ASK_MOTION_MS);
    return () => clearTimeout(timer);
  }, [reduce]);
  // Once shown still, they stay still: a late answer never takes the words away to write them again.
  const writing = reduce === false && !gaveUp;
  const still = reduce === true || gaveUp;

  useEffect(() => {
    const later = (fn: () => void, ms: number) => {
      timers.current.push(setTimeout(fn, ms));
    };
    const stop = () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
    };
    stop();
    // Until the phone has said whether it wants less motion, keep the words unwritten rather than start and
    // stop; with less motion (or no answer), they are simply there.
    if (!writing) {
      setShown(still ? letters.length : 0);
      setCursor(0);
      return stop;
    }
    let round = 0;
    const blink = (until: number, then: () => void) => {
      let step = 0;
      const tick = () => {
        // Time's up: stop on a step where it has faded right out, so it never just vanishes.
        if (Date.now() >= until && BLINK_STEPS[step % BLINK_STEPS.length] === 0) {
          setCursor(0);
          then();
          return;
        }
        setCursor(BLINK_STEPS[step % BLINK_STEPS.length]);
        step++;
        later(tick, BLINK_STEP_MS);
      };
      tick();
    };
    const write = (i: number) => {
      setShown(i);
      setCursor(1);
      if (i >= letters.length) {
        blink(Date.now() + BLINK_FOR_MS, () => {
          round++;
          if (again && round < 2) later(() => write(0), AGAIN_AFTER_MS);
        });
        return;
      }
      later(() => write(i + 1), delayAfter(letters[i]));
    };
    setShown(0);
    setCursor(0);
    later(() => write(0), START_MS);
    return stop;
    // `letters` follows `text`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, writing, still, again]);

  const base: TextStyle = { fontSize: size, lineHeight: Math.round(size * 1.3), fontFamily: font, fontWeight: bold ? '800' : '600', textAlign: center ? 'center' : undefined };
  const written = letters.slice(0, shown).join('');
  const rest = letters.slice(shown).join('');
  return (
    <Text style={[base, style]} accessibilityRole="text" accessibilityLabel={text}>
      <Text style={{ color: ink }}>{written}</Text>
      {/* A thin bar, drawn lighter than the letters; only while the words are being written. */}
      {writing ? <Text style={{ color: withAlpha(ink, cursor), fontWeight: '300' }}>|</Text> : null}
      <Text style={{ color: 'transparent' }}>{rest}</Text>
    </Text>
  );
}

/* ---------- signed: words that appear as if written by hand ---------- */

/**
 * A handwriting face that ships with the phone, so nothing extra is downloaded: Snell Roundhand on
 * iPhone (a flowing signature script), the system's cursive face on Android.
 */
const SIGNATURE_FONT = Platform.select({ ios: 'SnellRoundhand-Bold', android: 'cursive', default: undefined });

/**
 * Words that sign themselves: the whole line is laid out at once (nothing moves), and a soft edge
 * sweeps from left to right uncovering it, the way a pen signs a name, then a fine stroke underlines
 * it. Drawn over `bg` (the page colour), which the sweep is painted in. With Reduce Motion on, the
 * words are simply there.
 */
export function SignatureText({ text, size = 34, color, bg, style }: { text: string; size?: number; color?: string; bg?: string; style?: ViewStyle }) {
  const reduce = useReduceMotion();
  const ink = color ?? C.fg;
  const paper = bg ?? C.bg;
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  // 0: nothing written yet; 1: the last letter is done. Then the underline draws (0 → 1).
  const pen = useRef(new Animated.Value(0)).current;
  const line = useRef(new Animated.Value(0)).current;
  // Once the words have been shown still, they stay: a late answer about motion never signs them again.
  const settled = useRef(false);
  useEffect(() => {
    if (!box) return;
    const still = () => {
      settled.current = true;
      pen.setValue(1);
      line.setValue(1);
    };
    if (reduce === true || settled.current) {
      still();
      return;
    }
    if (reduce === null) {
      // The phone says within a few milliseconds whether it wants less motion; should it never say, show them.
      const timer = setTimeout(still, 700);
      return () => clearTimeout(timer);
    }
    pen.setValue(0);
    line.setValue(0);
    const signing = Animated.sequence([
      Animated.delay(320),
      Animated.timing(pen, { toValue: 1, duration: Math.min(2600, Math.max(1300, Array.from(text).length * 85)), easing: Easing.bezier(0.42, 0.05, 0.3, 1), useNativeDriver: true }),
      Animated.timing(line, { toValue: 1, duration: 520, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]);
    signing.start();
    return () => signing.stop();
    // Signed once each time the words (or their size) change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [box?.w, box?.h, text, reduce]);

  // Room around the words, so the script's loops and tails aren't clipped.
  const padX = Math.round(size * 0.4);
  const padY = Math.round(size * 0.25);
  const edge = Math.round(size * 0.9);
  const lineW = box ? Math.round(box.w * 0.55) : 0;
  return (
    <View style={[{ alignItems: 'center' }, style]} accessible accessibilityRole="text" accessibilityLabel={text}>
      <View style={{ overflow: 'hidden', paddingHorizontal: padX, paddingVertical: padY }}>
        <Text
          onLayout={(e) => {
            const { width, height } = e.nativeEvent.layout;
            if (!box || Math.abs(box.w - width) > 1 || Math.abs(box.h - height) > 1) setBox({ w: width, h: height });
          }}
          style={{ color: ink, fontSize: size, lineHeight: Math.round(size * 1.35), fontFamily: SIGNATURE_FONT, textAlign: 'center' }}>
          {text}
        </Text>
        {box ? (
          // The page colour slides off to the right; its soft left edge is the pen.
          <Animated.View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: 0,
              width: box.w + padX * 2 + edge,
              flexDirection: 'row',
              transform: [{ translateX: pen.interpolate({ inputRange: [0, 1], outputRange: [-edge, box.w + padX * 2] }) }],
            }}>
            <LinearGradient colors={[withAlpha(paper, 0), paper]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={{ width: edge }} />
            <View style={{ flex: 1, backgroundColor: paper }} />
          </Animated.View>
        ) : (
          // Until the words are measured they stay covered, so they never flash in whole first.
          <View pointerEvents="none" style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: paper }} />
        )}
      </View>
      {box ? (
        <Animated.View
          pointerEvents="none"
          style={{ width: lineW, height: 1.5, marginTop: -padY + 2, borderRadius: 1, backgroundColor: ink, opacity: line.interpolate({ inputRange: [0, 1], outputRange: [0, 0.55] }), transform: [{ scaleX: line }] }}
        />
      ) : null}
    </View>
  );
}
