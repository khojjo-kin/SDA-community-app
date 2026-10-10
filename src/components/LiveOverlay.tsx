import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, Text, TextInput, View } from 'react-native';
import { C, fmt } from '../lib/theme';
import { Icon, VerifiedTick } from './Icon';
import { LIVE_RED, LiveBadge } from './LiveBadge';
import { Avatar } from './ui';

/*
 * The pieces drawn over a live broadcast, on both the broadcaster's and a viewer's screen: who is
 * live and how many are watching, the last few comments, floating hearts, and the box to comment.
 */

/* ---------- comments ---------- */

export type ChatLine = { id: string; username: string; text: string };

/** Keeps the last few comments; older ones fall off the top. */
export function useChatLines(max = 6) {
  const [lines, setLines] = useState<ChatLine[]>([]);
  const add = useCallback(
    (username: string, text: string) => {
      const t = String(text ?? '').trim().slice(0, 200);
      if (!t) return;
      setLines((l) => [...l, { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), username: String(username || 'someone'), text: t }].slice(-max));
    },
    [max],
  );
  return { lines, add };
}

/** The last comments, bottom-left, the oldest fading out. */
export function ChatLines({ lines }: { lines: ChatLine[] }) {
  return (
    <View pointerEvents="none" style={{ gap: 6, paddingRight: 70 }} accessibilityLabel="Comments">
      {lines.map((l, i) => (
        <View key={l.id} style={{ opacity: 0.45 + (0.55 * (i + 1)) / Math.max(1, lines.length) }}>
          <Text numberOfLines={3} style={{ color: '#fff', fontSize: 14.5, lineHeight: 19, textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 4 }}>
            <Text style={{ fontWeight: '700', color: 'rgba(255,255,255,0.85)' }}>{l.username} </Text>
            {l.text}
          </Text>
        </View>
      ))}
    </View>
  );
}

/* ---------- hearts ---------- */

type HeartItem = { id: number; x: number };

/** Hearts rising from the bottom-right corner. `add` sends one up. */
export function useHearts() {
  const [hearts, setHearts] = useState<HeartItem[]>([]);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const add = useCallback(() => {
    const id = Date.now() + Math.random();
    setHearts((h) => [...h.slice(-24), { id, x: Math.random() }]);
    const t = setTimeout(() => {
      timers.current.delete(t);
      setHearts((h) => h.filter((x) => x.id !== id));
    }, 2400);
    timers.current.add(t);
  }, []);
  useEffect(() => {
    const set = timers.current;
    return () => {
      set.forEach(clearTimeout);
      set.clear();
    };
  }, []);
  return { hearts, add };
}

function Heart({ x }: { x: number }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, { toValue: 1, duration: 2200, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  }, [v]);
  const drift = (x - 0.5) * 70;
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        right: 18 + x * 26,
        bottom: 0,
        opacity: v.interpolate({ inputRange: [0, 0.15, 0.8, 1], outputRange: [0, 1, 0.9, 0] }),
        transform: [
          { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, -340] }) },
          { translateX: v.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, drift, -drift * 0.4] }) },
          { scale: v.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0.5, 1.15, 0.9] }) },
        ],
      }}>
      <Icon name="heart" size={30} color={LIVE_RED} fill />
    </Animated.View>
  );
}

export function Hearts({ hearts }: { hearts: HeartItem[] }) {
  return (
    <View pointerEvents="none" style={{ position: 'absolute', right: 0, bottom: 0, width: 110, height: 420 }}>
      {hearts.map((h) => (
        <Heart key={h.id} x={h.x} />
      ))}
    </View>
  );
}

/* ---------- header ---------- */

/** Who is live, the red pill and the number watching. */
export function LiveHeader({ avatar, name, username, verified, viewers, title, right }: { avatar?: string | null; name?: string; username?: string; verified?: boolean; viewers: number; title?: string; right?: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14 }}>
      <Avatar uri={avatar} name={name || username} size={36} />
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <Text numberOfLines={1} style={{ color: '#fff', fontWeight: '700', fontSize: 15, textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 4, flexShrink: 1 }}>
            {username || name || 'Live'}
          </Text>
          {verified ? <VerifiedTick size={14} /> : null}
        </View>
        {title ? (
          <Text numberOfLines={1} style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12.5, textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 4 }}>
            {title}
          </Text>
        ) : null}
      </View>
      <LiveBadge />
      <View accessibilityLabel={`${fmt(viewers)} watching`} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, height: 24, paddingHorizontal: 8, borderRadius: 7, backgroundColor: 'rgba(0,0,0,0.45)' }}>
        <Icon name="eye" size={14} color="#fff" weight={2.2} />
        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12.5 }}>{fmt(viewers)}</Text>
      </View>
      {right}
    </View>
  );
}

/* ---------- the comment box ---------- */

export function LiveComposer({ onSend, onHeart, placeholder = 'Comment…' }: { onSend: (text: string) => void; onHeart: () => void; placeholder?: string }) {
  const [text, setText] = useState('');
  function submit() {
    const t = text.trim();
    if (!t) return;
    onSend(t);
    setText('');
  }
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14 }}>
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', height: 42, borderRadius: 21, borderWidth: 1, borderColor: 'rgba(255,255,255,0.45)', paddingLeft: 16, paddingRight: 4, backgroundColor: 'rgba(0,0,0,0.25)' }}>
        <TextInput value={text} onChangeText={setText} placeholder={placeholder} placeholderTextColor="rgba(255,255,255,0.7)" style={{ flex: 1, color: '#fff', fontSize: 15, paddingVertical: 0 }} returnKeyType="send" onSubmitEditing={submit} blurOnSubmit={false} maxLength={200} keyboardAppearance="dark" accessibilityLabel="Comment" />
        {text.trim() ? (
          <Pressable onPress={submit} hitSlop={6} accessibilityRole="button" accessibilityLabel="Send comment" style={({ pressed }) => ({ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: C.accent, opacity: pressed ? 0.7 : 1 })}>
            <Icon name="send" size={17} color="#fff" weight={2.2} />
          </Pressable>
        ) : null}
      </View>
      <Pressable onPress={onHeart} hitSlop={8} accessibilityRole="button" accessibilityLabel="Send a heart" style={({ pressed }) => ({ width: 42, height: 42, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1, transform: [{ scale: pressed ? 1.15 : 1 }] })}>
        <Icon name="heart" size={28} color="#fff" weight={2} />
      </Pressable>
    </View>
  );
}
