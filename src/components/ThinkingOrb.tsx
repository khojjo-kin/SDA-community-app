import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAppFont } from '../lib/fonts';
import { useT } from '../lib/i18n';
import { C } from '../lib/theme';
import { TypingDots } from './TypingDots';

/*
 * How the assistant (Erha, and the support assistant) shows it is thinking: a small living orb of the
 * app's colours — olive green, teal and a touch of Sabbath gold — that turns, breathes and shimmers,
 * next to a line of text with a light sweeping across it. When a person from the support team is
 * typing instead, AgentTyping shows their name and the familiar dots.
 */

const ORB = ['#9be15d', '#1fbf5a', '#0fb5a5', '#f5c84b'] as const;

export function ThinkingOrb({ size = 28 }: { size?: number }) {
  const spin = useRef(new Animated.Value(0)).current;
  const breathe = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const a = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 2600, easing: Easing.linear, useNativeDriver: true }));
    const b = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(breathe, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    a.start();
    b.start();
    return () => {
      a.stop();
      b.stop();
    };
  }, [spin, breathe]);
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const counter = spin.interpolate({ inputRange: [0, 1], outputRange: ['360deg', '0deg'] });
  const scale = breathe.interpolate({ inputRange: [0, 1], outputRange: [0.86, 1.06] });
  const glow = breathe.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.6] });
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Animated.View style={{ position: 'absolute', width: size, height: size, borderRadius: size / 2, backgroundColor: '#1fbf5a', opacity: glow, transform: [{ scale: Animated.multiply(scale, 1.25) }] }} />
      <Animated.View style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden', transform: [{ rotate }, { scale }] }}>
        <LinearGradient colors={ORB} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1 }} />
        {/* A second, smaller swirl turning the other way gives the orb its depth. */}
        <Animated.View style={{ position: 'absolute', left: size * 0.18, top: size * 0.18, width: size * 0.64, height: size * 0.64, borderRadius: size, overflow: 'hidden', opacity: 0.85, transform: [{ rotate: counter }] }}>
          <LinearGradient colors={['#f5c84b', '#0fb5a5', '#1fbf5a']} start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }} style={{ flex: 1 }} />
        </Animated.View>
        <View style={{ position: 'absolute', left: size * 0.22, top: size * 0.16, width: size * 0.26, height: size * 0.18, borderRadius: size, backgroundColor: 'rgba(255,255,255,0.55)' }} />
      </Animated.View>
    </View>
  );
}

/** A line of text with a soft light passing through it, left to right. `center` centres it if it runs onto a second line. */
export function ShimmerText({ text, color = C.fg2, shine = C.accent2, size = 15, bold = false, center = false }: { text: string; color?: string; shine?: string; size?: number; bold?: boolean; center?: boolean }) {
  const font = useAppFont();
  const x = useRef(new Animated.Value(0)).current;
  const [w, setW] = React.useState(0);
  useEffect(() => {
    const a = Animated.loop(Animated.timing(x, { toValue: 1, duration: 1600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }));
    a.start();
    return () => a.stop();
  }, [x]);
  const band = Math.max(36, w * 0.35);
  const left = x.interpolate({ inputRange: [0, 1], outputRange: [-band, w] });
  const inner = x.interpolate({ inputRange: [0, 1], outputRange: [band, -w] });
  const style = { fontSize: size, fontFamily: font, fontWeight: bold ? ('800' as const) : ('600' as const), textAlign: center ? ('center' as const) : undefined };
  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      <Text style={[style, { color }]}>{text}</Text>
      {w ? (
        // A narrow window slides across, showing the same words in the shine colour beneath it.
        <Animated.View pointerEvents="none" style={{ position: 'absolute', top: 0, bottom: 0, width: band, overflow: 'hidden', transform: [{ translateX: left }] }}>
          <Animated.View style={{ width: w, transform: [{ translateX: inner }] }}>
            <Text style={[style, { color: shine }]}>{text}</Text>
          </Animated.View>
        </Animated.View>
      ) : null}
    </View>
  );
}

/** The assistant is working on a reply. */
export function AssistantThinking({ name = 'Erha', label }: { name?: string; label?: string }) {
  const t = useT();
  const words = label ?? t('assistant.thinking', { name });
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 }} accessible accessibilityLabel={words}>
      <ThinkingOrb size={26} />
      <ShimmerText text={words} />
    </View>
  );
}

/** A person from the support team is typing: their name, then the dots. */
export function AgentTyping({ name }: { name: string }) {
  const font = useAppFont();
  const t = useT();
  return (
    <View style={{ gap: 4, paddingVertical: 4 }} accessible accessibilityLabel={t('support.typing', { name })}>
      <Text style={{ color: C.fg3, fontSize: 12.5, fontFamily: font }}>{t('support.fromTeam', { name })}</Text>
      <View style={{ alignSelf: 'flex-start', backgroundColor: C.surface2, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 6 }}>
        <TypingDots />
      </View>
    </View>
  );
}
