import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/*
 * Whether the phone asks for less motion (Reduce Motion on iPhone, Remove animations on Android).
 * Moving decoration — the shimmer on loading shapes, the launch logo's ring — is left out when it
 * does, and only plain fades remain.
 *
 * The answer is kept here once known, so the next thing that asks has it on its very first frame
 * instead of moving for a moment and then stopping.
 */
let known: boolean | null = null;
const listeners = new Set<(reduce: boolean) => void>();
let watching = false;

function watch() {
  if (watching) return;
  watching = true;
  try {
    AccessibilityInfo.isReduceMotionEnabled()
      .then((reduce) => tell(!!reduce))
      .catch(() => {});
    AccessibilityInfo.addEventListener('reduceMotionChanged', (reduce) => tell(!!reduce));
  } catch {
    // A phone that can't say: treat it as not asking for less motion.
  }
}

function tell(reduce: boolean) {
  known = reduce;
  listeners.forEach((l) => l(reduce));
}

/** The last answer, or null while the phone hasn't said yet. */
export function reduceMotionNow(): boolean | null {
  watch();
  return known;
}

/** True when the phone asks for less motion; null until it has answered (a few milliseconds at start-up). */
export function useReduceMotion(): boolean | null {
  const [reduce, setReduce] = useState<boolean | null>(() => reduceMotionNow());
  useEffect(() => {
    watch();
    listeners.add(setReduce);
    // It may have answered between the first draw and now.
    if (known !== null) setReduce(known);
    return () => {
      listeners.delete(setReduce);
    };
  }, []);
  return reduce;
}
