import React, { useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, Pressable, ScrollView, Text, View, ViewStyle } from 'react-native';
import { useAppFont } from '../../lib/fonts';
import { chipLabel, dateRange, Day, Lesson, parseDate } from '../../lib/sabbath-school';
import { C } from '../../lib/theme';

/**
 * Small pieces shared by the Sabbath School pages. Page colours come from `C` at render time so
 * the coming light and green themes apply; the saturated lesson colours carry white text and are
 * fixed, because white on a deep colour reads in every theme.
 */

/**
 * One colour per lesson, in turn: deep green, teal, indigo, plum, terracotta, ochre, slate blue,
 * olive, brick, deep sea. Each one keeps white text above 4.5:1 contrast.
 */
export const TILE_COLOURS = ['#1f6b4a', '#14727a', '#3f4aa0', '#74375f', '#a8512f', '#8f6b18', '#46618a', '#5f6b25', '#8a3a3a', '#2e5c6e'] as const;

/** The colour for lesson `n` (1-based), the same on the grid, in Saved and in Completed. */
export function tileColour(n: number): string {
  const len = TILE_COLOURS.length;
  const i = Number.isFinite(n) && n > 0 ? (n - 1) % len : 0;
  return TILE_COLOURS[i];
}

/** Deep green into teal: behind the memory text when a lesson has no picture. */
export const HERO_GRADIENT = ['#0b3b2b', '#0e5a4b', '#127470'] as const;

/** Day names as the church says them: Saturday is the Sabbath. */
export const WEEKDAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Sabbath'];

/** Short names for the seven study days, Sabbath first. */
export const STUDY_DAYS = ['Sab', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

/** A day's full name, "Wednesday" (or "Sabbath"); an extra section keeps its own name, "Inside Story". */
export function dayName(d: Day): string {
  if (!/^\d+$/.test(d.id)) return chipLabel(d);
  const date = parseDate(d.date);
  return isNaN(date.getTime()) ? d.title : WEEKDAY[date.getDay()];
}

/** "Lesson 3, 10 Oct – 16 Oct 2026": the line under a lesson in Saved and Completed. `n` 0 leaves the number out. */
export function lessonLine(l: Lesson, n: number): string {
  const end = parseDate(l.end_date);
  const dates = `${dateRange(l.start_date, l.end_date)}${isNaN(end.getTime()) ? '' : ` ${end.getFullYear()}`}`;
  return n ? `Lesson ${n}, ${dates}` : dates;
}

function channels(c: string): [number, number, number] | null {
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(c);
  if (short) return [parseInt(short[1] + short[1], 16), parseInt(short[2] + short[2], 16), parseInt(short[3] + short[3], 16)];
  const long = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})(?:[0-9a-f]{2})?$/i.exec(c);
  if (long) return [parseInt(long[1], 16), parseInt(long[2], 16), parseInt(long[3], 16)];
  const fn = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i.exec(c);
  if (fn) return [Number(fn[1]), Number(fn[2]), Number(fn[3])];
  return null;
}

/** A theme colour see-through, for tints such as the accent behind a chip. Works in styles and in the reading page's CSS. */
export function alpha(colour: string, a: number): string {
  const v = channels(colour);
  return v ? `rgba(${v[0]},${v[1]},${v[2]},${Math.max(0, Math.min(1, a))})` : 'transparent';
}

/** A grey block in the shape of what is loading, gently pulsing unless the phone asks for less motion. */
export function Skeleton({ style, light }: { style?: ViewStyle; light?: boolean }) {
  const pulse = useRef(new Animated.Value(0.6)).current;
  useEffect(() => {
    const run: { loop: Animated.CompositeAnimation | null; live: boolean } = { loop: null, live: true };
    AccessibilityInfo.isReduceMotionEnabled()
      .then((reduce) => {
        if (!run.live || reduce) return;
        run.loop = Animated.loop(
          Animated.sequence([
            Animated.timing(pulse, { toValue: 1, duration: 750, useNativeDriver: true }),
            Animated.timing(pulse, { toValue: 0.6, duration: 750, useNativeDriver: true }),
          ]),
        );
        run.loop.start();
      })
      .catch(() => {});
    return () => {
      run.live = false;
      run.loop?.stop();
    };
  }, [pulse]);
  return <Animated.View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[{ backgroundColor: light ? 'rgba(255,255,255,0.22)' : C.surface, borderRadius: 12, opacity: pulse }, style]} />;
}

/** Rounded tabs in a row: the chosen one filled, the others outlined. */
export function PillTabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string }[]; value: T; onChange: (id: T) => void }) {
  const font = useAppFont('bold');
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} accessibilityRole="tablist" contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
      {tabs.map((t) => {
        const on = t.id === value;
        return (
          <Pressable
            key={t.id}
            onPress={() => onChange(t.id)}
            accessibilityRole="tab"
            accessibilityLabel={t.label}
            accessibilityState={{ selected: on }}
            style={({ pressed }) => ({ height: 38, paddingHorizontal: 18, borderRadius: 19, justifyContent: 'center', backgroundColor: on ? C.fg : 'transparent', borderWidth: 1.5, borderColor: on ? C.fg : alpha(C.fg, 0.24), opacity: pressed ? 0.7 : 1 })}>
            <Text style={{ color: on ? C.bg : C.fg, fontSize: 15, fontWeight: '700', fontFamily: font }}>{t.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/**
 * Seven dots for Sabbath to Friday: filled for a day the member opened or finished, a ring
 * around today. Read out as one line ("3 of 7 days read") rather than seven separate dots.
 */
export function WeekDots({ states, today }: { states: ('done' | 'opened' | null)[]; today?: number }) {
  const read = states.filter(Boolean).length;
  return (
    <View accessible accessibilityLabel={`${read} of ${STUDY_DAYS.length} days read this week`} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      {STUDY_DAYS.map((label, i) => {
        const filled = !!states[i];
        const isToday = i === today;
        return (
          <View key={label} style={{ alignItems: 'center', gap: 6, flex: 1 }}>
            <View style={{ width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', borderWidth: isToday ? 2 : 0, borderColor: C.fg }}>
              <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: filled ? C.accent : 'transparent', borderWidth: filled ? 0 : 1.5, borderColor: alpha(C.fg, 0.3) }} />
            </View>
            <Text style={{ color: isToday ? C.fg : C.fg3, fontSize: 11.5, fontWeight: isToday ? '700' : '500' }}>{label}</Text>
          </View>
        );
      })}
    </View>
  );
}

/** A thin bar showing how far through something the member is, 0 to 1. */
export function ProgressBar({ value, track = 'rgba(255,255,255,0.25)', fill = '#ffffff' }: { value: number; track?: string; fill?: string }) {
  const v = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  return (
    <View style={{ height: 4, borderRadius: 2, backgroundColor: track, overflow: 'hidden' }}>
      <View style={{ width: `${v * 100}%`, height: 4, borderRadius: 2, backgroundColor: fill }} />
    </View>
  );
}
