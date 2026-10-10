import React, { useEffect, useRef, useState } from 'react';
import { Animated, LayoutChangeEvent, Pressable, Text, View, ViewStyle } from 'react-native';
import { C } from '../lib/theme';

export type FeedOption<T extends string> = { key: T; label: string };

const HEIGHT = 34;
const PAD = 3;

/**
 * A compact segmented pill: a dark track with a light thumb that slides under the chosen label.
 * Every segment is the same width, so the thumb can move with one native-driven transform.
 * With `plain`, it is just the words side by side: the chosen one bold and full colour, the others dimmer.
 */
export function FeedSwitch<T extends string>({ value, onChange, options, style, plain }: { value: T; onChange: (next: T) => void; options: readonly FeedOption<T>[]; style?: ViewStyle; plain?: boolean }) {
  const [track, setTrack] = useState(0);
  const index = Math.max(0, options.findIndex((o) => o.key === value));
  const pos = useRef(new Animated.Value(index)).current;
  const segment = track > 0 ? (track - PAD * 2) / options.length : 0;

  useEffect(() => {
    Animated.spring(pos, { toValue: index, useNativeDriver: true, damping: 18, stiffness: 220, mass: 0.6 }).start();
  }, [index, pos]);

  const onLayout = (e: LayoutChangeEvent) => setTrack(e.nativeEvent.layout.width);

  if (plain) {
    return (
      <View accessibilityRole="tablist" style={[{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 20, height: HEIGHT }, style]}>
        {options.map((o) => {
          const on = o.key === value;
          return (
            <Pressable key={o.key} onPress={() => { if (!on) onChange(o.key); }} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={o.label} hitSlop={8}>
              <Text numberOfLines={1} style={{ color: on ? C.fg : C.fg3, fontSize: 16, fontWeight: on ? '800' : '600' }}>{o.label}</Text>
            </Pressable>
          );
        })}
      </View>
    );
  }

  return (
    <View onLayout={onLayout} accessibilityRole="tablist" style={[{ height: HEIGHT, borderRadius: HEIGHT / 2, padding: PAD, backgroundColor: C.surface, flexDirection: 'row' }, style]}>
      {segment > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: PAD,
            left: PAD,
            width: segment,
            height: HEIGHT - PAD * 2,
            borderRadius: (HEIGHT - PAD * 2) / 2,
            backgroundColor: C.fg,
            transform: [{ translateX: Animated.multiply(pos, segment) }],
          }}
        />
      ) : null}
      {options.map((o) => {
        const on = o.key === value;
        return (
          <Pressable
            key={o.key}
            onPress={() => { if (!on) onChange(o.key); }}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={o.label}
            hitSlop={{ top: 8, bottom: 8 }}
            style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 }}>
            <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85} style={{ color: on ? C.bg : C.fg2, fontSize: 13, fontWeight: on ? '700' : '600', letterSpacing: 0.1 }}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
