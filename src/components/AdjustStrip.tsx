import React, { useRef, useState } from 'react';
import { PanResponder, Pressable, Text, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { ADJUST_KEYS, Adjust, DEFAULT_ADJUST, isDefaultAdjust } from '../lib/filters';
import { C } from '../lib/theme';
import { Icon } from './Icon';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * A plain slider: drag anywhere along the track. When `min` is below zero the filled part grows out
 * from the middle, so "no change" reads as an empty track.
 */
export function Slider({ value, min, max, onChange, label, disabled, style }: { value: number; min: number; max: number; onChange: (v: number) => void; label: string; disabled?: boolean; style?: StyleProp<ViewStyle> }) {
  const ref = useRef<View>(null);
  const [width, setWidth] = useState(0);
  const latest = useRef({ width, min, max, onChange, disabled });
  latest.current = { width, min, max, onChange, disabled };
  // Where the track sits on the screen, measured when a drag begins.
  const left = useRef(0);

  const toValue = (pageX: number) => {
    const { width: w, min: lo, max: hi } = latest.current;
    if (w <= 0) return lo;
    return Math.round(lo + clamp((pageX - left.current) / w, 0, 1) * (hi - lo));
  };

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !latest.current.disabled,
      onMoveShouldSetPanResponder: () => !latest.current.disabled,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        const pageX = e.nativeEvent.pageX;
        ref.current?.measureInWindow((x) => {
          left.current = x;
          latest.current.onChange(toValue(pageX));
        });
      },
      onPanResponderMove: (_e, g) => latest.current.onChange(toValue(g.moveX)),
    }),
  ).current;

  const span = max - min || 1;
  const zero = min < 0 ? clamp((0 - min) / span, 0, 1) : 0;
  const pos = clamp((value - min) / span, 0, 1);
  const fillLeft = Math.min(zero, pos) * width;
  const fillWidth = Math.abs(pos - zero) * width;

  return (
    <View
      ref={ref}
      {...pan.panHandlers}
      collapsable={false}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ min, max, now: value }}
      accessibilityState={{ disabled: !!disabled }}
      onAccessibilityAction={(e) => {
        const step = Math.max(1, Math.round(span / 20));
        if (e.nativeEvent.actionName === 'increment') onChange(clamp(value + step, min, max));
        if (e.nativeEvent.actionName === 'decrement') onChange(clamp(value - step, min, max));
      }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      style={[{ height: 36, justifyContent: 'center' }, style]}>
      <View style={{ height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.22)' }} />
      {min < 0 ? <View pointerEvents="none" style={{ position: 'absolute', left: zero * width - 1, width: 2, height: 10, borderRadius: 1, backgroundColor: 'rgba(255,255,255,0.45)' }} /> : null}
      <View pointerEvents="none" style={{ position: 'absolute', left: fillLeft, width: fillWidth, height: 3, borderRadius: 2, backgroundColor: '#fff' }} />
      <View pointerEvents="none" style={{ position: 'absolute', left: pos * width - 11, width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 3 }} />
    </View>
  );
}

const LABELS: Record<keyof Adjust, string> = { brightness: 'Brightness', contrast: 'Contrast', saturation: 'Saturation', warmth: 'Warmth' };

/**
 * Brightness, contrast, saturation and warmth sliders. A Community Plus perk: when `locked`, the
 * sliders are shown dimmed under a pill that takes the person to Plus.
 */
export function AdjustStrip({ value, onChange, locked, onUnlock, style }: { value: Adjust; onChange: (next: Adjust) => void; locked?: boolean; onUnlock?: () => void; style?: StyleProp<ViewStyle> }) {
  const changed = !isDefaultAdjust(value);
  return (
    <View style={[{ paddingHorizontal: 16, paddingTop: 6, paddingBottom: 10 }, style]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 2 }}>
        <Text style={{ color: C.fg2, fontSize: 12.5, fontWeight: '700', letterSpacing: 0.6 }}>ADJUST</Text>
        {changed && !locked ? (
          <Pressable onPress={() => onChange({ ...DEFAULT_ADJUST })} hitSlop={8} accessibilityRole="button" accessibilityLabel="Reset adjustments" style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
            <Text style={{ color: C.accent2, fontSize: 13.5, fontWeight: '600' }}>Reset</Text>
          </Pressable>
        ) : null}
      </View>
      <View pointerEvents={locked ? 'none' : 'auto'} style={{ opacity: locked ? 0.35 : 1 }} accessibilityElementsHidden={!!locked} importantForAccessibility={locked ? 'no-hide-descendants' : 'auto'}>
        {ADJUST_KEYS.map((k) => (
          <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Text style={{ width: 84, color: C.fg, fontSize: 14.5 }}>{LABELS[k]}</Text>
            <Slider value={value[k]} min={-100} max={100} onChange={(v) => onChange({ ...value, [k]: v })} label={LABELS[k]} disabled={locked} style={{ flex: 1 }} />
            <Text style={{ width: 34, textAlign: 'right', color: value[k] ? C.fg : C.fg3, fontSize: 13.5, fontVariant: ['tabular-nums'] }}>{value[k] > 0 ? '+' + value[k] : value[k]}</Text>
          </View>
        ))}
      </View>
      {locked ? (
        <View pointerEvents="box-none" style={{ position: 'absolute', left: 16, right: 16, top: 30, bottom: 10, alignItems: 'center', justifyContent: 'center' }}>
          <Pressable onPress={onUnlock} accessibilityRole="button" accessibilityLabel="Advanced editing is part of Community Plus. Learn more" style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 8, height: 40, paddingHorizontal: 16, borderRadius: 20, backgroundColor: 'rgba(24,27,31,0.96)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)', opacity: pressed ? 0.75 : 1 })}>
            <Icon name="crown" size={18} color={C.accent2} />
            <Text style={{ color: C.fg, fontSize: 13.5, fontWeight: '600' }}>Advanced editing is part of Community Plus</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}
