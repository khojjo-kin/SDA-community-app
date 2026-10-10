import React, { useEffect, useRef } from 'react';
import { Animated, Easing, View } from 'react-native';
import { C } from '../lib/theme';

/** Three dots that rise and settle one after another: the other person is typing. Sits inside a chat bubble. */
export function TypingDots({ color = C.fg2, size = 7 }: { color?: string; size?: number }) {
  const dots = useRef([new Animated.Value(0), new Animated.Value(0), new Animated.Value(0)]).current;

  useEffect(() => {
    const loops = dots.map((v, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 140),
          Animated.timing(v, { toValue: 1, duration: 240, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          Animated.timing(v, { toValue: 0, duration: 240, easing: Easing.in(Easing.quad), useNativeDriver: true }),
          // Every dot waits the same total, so the three stay in step from one cycle to the next.
          Animated.delay(420 - i * 140),
        ]),
      ),
    );
    loops.forEach((l) => l.start());
    return () => {
      loops.forEach((l) => l.stop());
    };
  }, [dots]);

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, height: 23 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {dots.map((v, i) => (
        <Animated.View
          key={i}
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: color,
            opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1] }),
            transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, -4] }) }],
          }}
        />
      ))}
    </View>
  );
}
