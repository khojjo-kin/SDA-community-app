import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, Easing, Pressable, ScrollView, Text, TextInput, useWindowDimensions, View } from 'react-native';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { fetchLive, fetchLiveComments, profilesInOrder } from '../lib/api';
import { tap } from '../lib/haptics';
// Plain t(): every screen is drawn again from the root when the language changes.
import { t } from '../lib/i18n';
import { useReduceMotion } from '../lib/motion';
import { DARK, errText, fmt } from '../lib/theme';
import type { LiveComment } from '../lib/types';
import { Icon, VerifiedTick } from './Icon';
import { LIVE_RED, LiveBadge } from './LiveBadge';
import { Avatar } from './ui';

/*
 * The pieces drawn over a live broadcast, on both the broadcaster's and a viewer's screen: who is
 * live and how many are watching, the last few comments, floating hearts, and the box to comment.
 */

/* ---------- comments ---------- */

export type ChatLine = { id: string; userId: string; username: string; text: string; at: string };

/**
 * The latest comments on a live (up to `max`, scrolled through on screen). They are rows in the
 * database (community_live_comments), so the database decides who wrote each one: the latest are
 * loaded when the screen opens, new ones arrive as database changes on the live's channel (`listen`,
 * before it subscribes), and each name is looked up from the commenter's profile, never taken from a
 * message.
 */
export function useLiveComments(liveId: string | null, max = 50) {
  const [lines, setLines] = useState<ChatLine[]>([]);
  // Usernames already looked up; '' for an account I can't see, so it isn't asked for again.
  const names = useRef(new Map<string, string>());
  // Removed comments, so one arriving late (or still in a load) doesn't come back.
  const removed = useRef(new Set<string>());
  const shown = useRef(new Set<string>());

  useEffect(() => {
    shown.current = new Set(lines.map((l) => l.id));
  }, [lines]);

  const add = useCallback(
    async (rows: LiveComment[]) => {
      const fresh = rows.filter((r) => r?.id && r.user_id && String(r.text ?? '').trim() && !removed.current.has(r.id));
      if (!fresh.length) return;
      const unknown = [...new Set(fresh.map((r) => r.user_id))].filter((id) => !names.current.has(id));
      if (unknown.length) {
        try {
          for (const p of await profilesInOrder(unknown)) names.current.set(p.id, p.username);
          // Accounts I can't see stay nameless, and aren't asked for again.
          for (const id of unknown) if (!names.current.has(id)) names.current.set(id, '');
        } catch {
          // Shown as "someone" this time; asked again with their next comment.
        }
      }
      setLines((cur) => {
        const byId = new Map(cur.map((l) => [l.id, l]));
        for (const r of fresh) {
          if (removed.current.has(r.id)) continue;
          byId.set(r.id, { id: r.id, userId: r.user_id, username: names.current.get(r.user_id) ?? '', text: String(r.text).trim(), at: String(r.created_at ?? '') });
        }
        const when = (l: ChatLine) => Date.parse(l.at) || 0;
        return [...byId.values()].sort((a, b) => when(a) - when(b)).slice(-max);
      });
    },
    [max],
  );

  const drop = useCallback((id: string) => {
    if (!id) return;
    removed.current.add(id);
    setLines((cur) => cur.filter((l) => l.id !== id));
  }, []);

  /** Whether a comment is on screen now. */
  const has = useCallback((id: string) => shown.current.has(id), []);

  /** Registers the listener for new comments on a channel; call it before the channel subscribes. */
  const listen = useCallback(
    (channel: RealtimeChannel, id: string) => {
      channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'community_live_comments', filter: `live_id=eq.${id}` }, (payload) => {
        add([payload.new as LiveComment]);
      });
    },
    [add],
  );

  useEffect(() => {
    if (!liveId) return;
    let alive = true;
    fetchLiveComments(liveId, max)
      .then((rows) => {
        if (alive) add(rows);
      })
      .catch(() => {
        // New comments still arrive; the earlier ones are only a nicety.
      });
    return () => {
      alive = false;
    };
  }, [liveId, max, add]);

  return { lines, add, drop, has, listen };
}

/**
 * The comments, bottom-left, newest at the bottom. The list follows each new comment unless it has
 * been scrolled up to read older ones; scrolling back to the bottom follows again. A comment
 * `canRemove` allows can be long pressed (or, with a screen reader, given its Remove action) to take
 * it down.
 */
export function ChatLines({ lines, canRemove, onRemove }: { lines: ChatLine[]; canRemove?: (line: ChatLine) => boolean; onRemove?: (line: ChatLine) => void }) {
  const { height } = useWindowDimensions();
  const ref = useRef<ScrollView>(null);
  // At the newest comment (or not yet scrolled at all).
  const following = useRef(true);
  // The first jump to the bottom happens without animating, so the list opens where it belongs.
  const placed = useRef(false);
  function ask(line: ChatLine) {
    Alert.alert(t('live.removeQuestion'), undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('live.remove'), style: 'destructive', onPress: () => onRemove?.(line) },
    ]);
  }
  if (!lines.length) return null;
  return (
    <ScrollView
      ref={ref}
      style={{ maxHeight: Math.round(height * 0.28), flexGrow: 0 }}
      contentContainerStyle={{ gap: 6, paddingRight: 70 }}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      scrollEventThrottle={64}
      onScroll={(e) => {
        const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
        following.current = contentOffset.y + layoutMeasurement.height >= contentSize.height - 24;
      }}
      onContentSizeChange={() => {
        if (!following.current) return;
        ref.current?.scrollToEnd({ animated: placed.current });
        placed.current = true;
      }}
      accessibilityLabel={t('live.comments')}>
      {lines.map((l) => {
        const name = l.username || t('live.someone');
        const words = (
          <Text numberOfLines={3} style={{ color: '#fff', fontSize: 14.5, lineHeight: 19, textShadowColor: 'rgba(0,0,0,0.75)', textShadowRadius: 4, textShadowOffset: { width: 0, height: 1 } }}>
            <Text style={{ fontWeight: '700', color: 'rgba(255,255,255,0.88)' }}>{name} </Text>
            {l.text}
          </Text>
        );
        if (!onRemove || !canRemove?.(l)) {
          return (
            <View key={l.id} pointerEvents="none" accessible accessibilityLabel={`${name}: ${l.text}`}>
              {words}
            </View>
          );
        }
        return (
          <Pressable
            key={l.id}
            onLongPress={() => ask(l)}
            delayLongPress={350}
            accessibilityLabel={`${name}: ${l.text}`}
            accessibilityActions={[{ name: 'remove', label: t('live.removeComment') }]}
            onAccessibilityAction={(e) => {
              if (e.nativeEvent.actionName === 'remove') ask(l);
            }}
            style={({ pressed }) => (pressed ? { opacity: 0.6 } : null)}>
            {words}
          </Pressable>
        );
      })}
    </ScrollView>
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

/** One heart. With Reduce Motion on it fades in and out a little way up, without drifting or growing. */
function Heart({ x, still }: { x: number; still: boolean }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, { toValue: 1, duration: 2200, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  }, [v]);
  const drift = still ? 0 : (x - 0.5) * 70;
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        right: 18 + x * 26,
        bottom: 0,
        opacity: v.interpolate({ inputRange: [0, 0.15, 0.8, 1], outputRange: [0, 1, 0.9, 0] }),
        transform: [
          { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, still ? -60 : -340] }) },
          { translateX: v.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, drift, -drift * 0.4] }) },
          { scale: still ? 1 : v.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0.5, 1.15, 0.9] }) },
        ],
      }}>
      <Icon name="heart" size={30} color={LIVE_RED} fill />
    </Animated.View>
  );
}

export function Hearts({ hearts }: { hearts: HeartItem[] }) {
  const still = useReduceMotion() === true;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', right: 0, bottom: 0, width: 110, height: 420 }}>
      {hearts.map((h) => (
        <Heart key={h.id} x={h.x} still={still} />
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
            {username || name || t('live.noName')}
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
      <View accessibilityLabel={t('live.watchingCount', { count: fmt(viewers) })} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, height: 24, paddingHorizontal: 8, borderRadius: 7, backgroundColor: 'rgba(0,0,0,0.45)' }}>
        <Icon name="eye" size={14} color="#fff" weight={2.2} />
        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12.5 }}>{fmt(viewers)}</Text>
      </View>
      {right}
    </View>
  );
}

/* ---------- the comment box ---------- */

const MAX_COMMENT = 200;

/**
 * Why a comment wasn't posted, in words for the person. The database turns a comment away once the
 * live has ended with the same refusal as for a live this account can't see, so the live is looked
 * up to tell which: an ended one says so (`ended`), rather than a puzzling "isn't available".
 */
export async function commentRefusal(e: unknown, liveId: string): Promise<{ ended: boolean; text: string }> {
  const code = String((e as any)?.code ?? '');
  // 42501: refused by the access rules. 23503: the live itself is gone.
  if (code === '42501' || code === '23503') {
    try {
      const card = await fetchLive(liveId);
      if (!card || card.ended_at) return { ended: true, text: t('live.hasEnded') };
    } catch {
      // Not known: the general reason below.
    }
  }
  return { ended: false, text: errText(e) };
}

/**
 * The comment box and the heart. `onSend` resolves true once the comment is posted; on false (the
 * screen has said why) the words go back in the box, so nothing typed is lost.
 */
export function LiveComposer({ onSend, onHeart, placeholder }: { onSend: (text: string) => Promise<boolean>; onHeart: () => void; placeholder?: string }) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  // State lands a frame late, so a quick second tap could slip past `sending`: the ref cannot.
  const busy = useRef(false);
  async function submit() {
    const words = text.trim();
    if (!words || busy.current) return;
    busy.current = true;
    setSending(true);
    // Emptied at once, so the next comment can be typed while this one goes.
    setText('');
    let sent = false;
    try {
      sent = await onSend(words);
    } catch {
      sent = false;
    } finally {
      busy.current = false;
      setSending(false);
    }
    // Anything typed meanwhile stays, after the words that didn't go.
    if (!sent) setText((now) => (now.trim() ? `${words} ${now}` : words).slice(0, MAX_COMMENT));
  }
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14 }}>
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', height: 42, borderRadius: 21, borderWidth: 1, borderColor: 'rgba(255,255,255,0.45)', paddingLeft: 16, paddingRight: 4, backgroundColor: 'rgba(0,0,0,0.25)' }}>
        <TextInput value={text} onChangeText={setText} placeholder={placeholder ?? t('live.commentPlaceholder')} placeholderTextColor="rgba(255,255,255,0.7)" selectionColor="#ffffff" style={{ flex: 1, color: '#fff', fontSize: 15, paddingVertical: 0 }} returnKeyType="send" onSubmitEditing={submit} submitBehavior="submit" maxLength={MAX_COMMENT} keyboardAppearance="dark" accessibilityLabel={t('live.commentLabel')} />
        {sending ? (
          <View style={{ width: 34, height: 34, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color="#fff" />
          </View>
        ) : text.trim() ? (
          <Pressable onPress={submit} hitSlop={6} accessibilityRole="button" accessibilityLabel={t('live.sendComment')} style={({ pressed }) => ({ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: DARK.accent, opacity: pressed ? 0.7 : 1 })}>
            <Icon name="send" size={17} color="#fff" weight={2.2} />
          </Pressable>
        ) : null}
      </View>
      <Pressable onPress={() => { tap('light'); onHeart(); }} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('live.sendHeart')} style={({ pressed }) => ({ width: 42, height: 42, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1, transform: [{ scale: pressed ? 1.15 : 1 }] })}>
        <Icon name="heart" size={28} color="#fff" weight={2} />
      </Pressable>
    </View>
  );
}
