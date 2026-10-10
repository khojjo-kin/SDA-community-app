import React, { useEffect, useRef, useState } from 'react';
import { Text, type TextStyle } from 'react-native';
import { useAppFont } from '../lib/fonts';
import { useReduceMotion } from '../lib/motion';
import { C } from '../lib/theme';

/*
 * Words that write themselves: letter by letter in the app's green, with a soft cursor blinking just
 * after the last letter, then they rest. After a pause they write once more, then stay.
 *
 * The whole text is laid out from the first frame, the letters not yet written in a clear colour, so
 * nothing moves or re-wraps as they appear; the cursor is a thin bar in the same line of text. With
 * Reduce Motion on, the words are simply there.
 */

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

  useEffect(() => {
    const later = (fn: () => void, ms: number) => {
      timers.current.push(setTimeout(fn, ms));
    };
    const stop = () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
    };
    stop();
    // Until the phone has said whether it wants less motion, keep the words unwritten rather than start and stop.
    if (reduce === null) {
      setShown(0);
      setCursor(0);
      return stop;
    }
    if (reduce) {
      setShown(letters.length);
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
  }, [text, reduce, again]);

  const base: TextStyle = { fontSize: size, lineHeight: Math.round(size * 1.3), fontFamily: font, fontWeight: bold ? '800' : '600', textAlign: center ? 'center' : undefined };
  const written = letters.slice(0, shown).join('');
  const rest = letters.slice(shown).join('');
  return (
    <Text style={[base, style]} accessibilityRole="text" accessibilityLabel={text}>
      <Text style={{ color: ink }}>{written}</Text>
      {/* A thin bar, drawn lighter than the letters. */}
      <Text style={{ color: withAlpha(ink, cursor), fontWeight: '300' }}>|</Text>
      <Text style={{ color: 'transparent' }}>{rest}</Text>
    </Text>
  );
}
