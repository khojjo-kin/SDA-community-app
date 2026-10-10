import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, Easing, Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import * as Clipboard from 'expo-clipboard';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { deletePodItem, setPodSaved } from '../lib/api';
import { tap } from '../lib/haptics';
import { useReduceMotion } from '../lib/motion';
import { next, patchQueued, removeQueued, toggle, useBuffering, usePlayer, useProgress, useTrackState } from '../lib/player';
import { useSession } from '../lib/session';
import { C, errText } from '../lib/theme';
import type { PodItem } from '../lib/types';
import { Icon } from './Icon';
import { Sheet, SheetRow, useToast } from './ui';

/** When a Pod screen was last opened from a tap, so a quick second tap doesn't open it twice. */
let openedAt = 0;

/** Runs `go` unless something was opened a moment ago (a double tap). */
export function openOnce(go: () => void) {
  const now = Date.now();
  if (now - openedAt < 700) return;
  openedAt = now;
  go();
}

/*
 * The floating "now playing" bar, plus the small pieces every Pod screen shares: covers, list rows and the row menu.
 */

/** "3:45", or "1:02:10" for a long podcast. */
export function durationLabel(seconds: number): string {
  const s = Math.max(0, Math.round(seconds || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

export function kindLabel(kind: PodItem['kind']): string {
  return kind === 'podcast' ? 'Podcast' : 'Song';
}

/** Album art, or a dark square with the kind's icon when there is none. */
export function Cover({ uri, kind, size, radius = Math.round(size * 0.18) }: { uri?: string | null; kind: PodItem['kind']; size: number; radius?: number }) {
  if (uri) return <Image source={{ uri }} recyclingKey={uri} style={{ width: size, height: size, borderRadius: radius, backgroundColor: C.surface2 }} contentFit="cover" transition={160} cachePolicy="memory-disk" accessibilityIgnoresInvertColors />;
  return (
    <View style={{ width: size, height: size, borderRadius: radius, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: C.hairline }}>
      <Icon name={kind === 'podcast' ? 'podcast' : 'music'} size={Math.round(size * 0.42)} color={C.fg2} />
    </View>
  );
}

/** The bars' full height, and how tall each rises to at most (as a share of it). */
const MARK_H = 14;
const MARK_PEAKS = [0.65, 1, 0.45];
const MARK_LOW = 4 / MARK_H;

/** Three bars that bounce while the track plays and rest, short, while it is paused. Still when the phone asks for less motion. */
function PlayingMark({ playing }: { playing: boolean }) {
  const reduce = useReduceMotion();
  const bars = useRef(MARK_PEAKS.map(() => new Animated.Value(0))).current;
  const moving = playing && reduce === false;
  useEffect(() => {
    if (!moving) return;
    const loops = bars.map((b, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(b, { toValue: 1, duration: 280 + i * 110, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
          Animated.timing(b, { toValue: 0, duration: 280 + i * 110, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        ]),
      ),
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [moving, bars]);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: MARK_H }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {MARK_PEAKS.map((peak, i) => {
        // Each bar is drawn full height and squashed towards its foot, so it grows upwards.
        const scale = moving ? bars[i].interpolate({ inputRange: [0, 1], outputRange: [MARK_LOW + 0.1, peak] }) : playing ? peak : MARK_LOW;
        const lift = moving ? bars[i].interpolate({ inputRange: [0, 1], outputRange: [(MARK_H / 2) * (1 - MARK_LOW - 0.1), (MARK_H / 2) * (1 - peak)] }) : (MARK_H / 2) * (1 - (playing ? peak : MARK_LOW));
        return <Animated.View key={i} style={{ width: 3, height: MARK_H, borderRadius: 1.5, backgroundColor: C.accent2, transform: [{ translateY: lift }, { scaleY: scale }] }} />;
      })}
    </View>
  );
}

/**
 * One track in a list: cover, title, who it is by, how long, and a menu. The current track is marked
 * in green. It draws again only when its own track starts or stops, so long lists stay smooth; pass
 * callbacks that don't change from one draw to the next.
 */
export const PodRow = React.memo(function PodRow({ item, index = 0, onPress, onMore, compact }: { item: PodItem; index?: number; onPress: (item: PodItem, index: number) => void; onMore?: (item: PodItem) => void; compact?: boolean }) {
  const track = useTrackState(item.id);
  const isCurrent = track !== null;
  const playing = track === 'playing';
  const size = compact ? 48 : 56;
  const sub = item.artist ? `${item.artist} · ${kindLabel(item.kind)}` : kindLabel(item.kind);
  return (
    <Pressable onPress={() => onPress(item, index)} accessibilityRole="button" accessibilityLabel={`${isCurrent ? (playing ? 'Playing, ' : 'Paused, ') : 'Play '}${item.title} by ${item.artist || 'unknown'}, ${durationLabel(item.duration_seconds)}`} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 16, paddingRight: onMore ? 4 : 16, minHeight: size + 14, backgroundColor: pressed ? C.press : 'transparent' })}>
      <Cover uri={item.cover_url} kind={item.kind} size={size} radius={10} />
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {isCurrent ? <PlayingMark playing={playing} /> : null}
          <Text numberOfLines={1} style={{ flex: 1, color: isCurrent ? C.accent2 : C.fg, fontSize: 16, fontWeight: '600' }}>
            {item.title}
          </Text>
        </View>
        <Text numberOfLines={1} style={{ color: C.fg2, fontSize: 13.5 }}>
          {sub}
        </Text>
      </View>
      {item.duration_seconds > 0 ? <Text style={{ color: C.fg3, fontSize: 13, fontVariant: ['tabular-nums'] }}>{durationLabel(item.duration_seconds)}</Text> : null}
      {onMore ? (
        <Pressable onPress={() => onMore(item)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`More options for ${item.title}`} style={({ pressed }) => ({ width: 40, height: 40, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
          <Icon name="more" size={22} color={C.fg2} />
        </Pressable>
      ) : null}
    </Pressable>
  );
});

/** The link to a track, the same shape as post links. */
export function podLink(id: string): string {
  return `community://pod/${id}`;
}

/**
 * The "..." menu on a track: library, share, and delete when it is yours or you are an admin.
 * `onChange` hands back the updated track (or null when deleted) so the list can keep up.
 */
export function PodMenu({ item, onClose, onChange, hideOpen }: { item: PodItem | null; onClose: () => void; onChange?: (next: PodItem | null) => void; hideOpen?: boolean }) {
  const toast = useToast();
  const { me, profile } = useSession();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const canDelete = !!item && (item.user_id === me || !!profile?.admin_role);

  async function save() {
    if (!item || busy) return;
    setBusy(true);
    const nextSaved = !item.saved;
    try {
      await setPodSaved(me, item.id, nextSaved);
      patchQueued(item.id, { saved: nextSaved });
      onChange?.({ ...item, saved: nextSaved });
      toast(nextSaved ? 'Added to your library' : 'Removed from your library');
      onClose();
    } catch (e) {
      toast(errText(e));
    } finally {
      setBusy(false);
    }
  }

  function share() {
    if (!item) return;
    Clipboard.setStringAsync(podLink(item.id))
      .then(() => toast('Link copied'))
      .catch((e) => toast(errText(e)));
    onClose();
  }

  function remove() {
    if (!item) return;
    Alert.alert(`Delete ${item.title}?`, 'It goes from Pod for everyone. This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deletePodItem(item.id);
            removeQueued(item.id);
            onChange?.(null);
            toast('Deleted');
            onClose();
          } catch (e) {
            toast(errText(e));
          }
        },
      },
    ]);
  }

  return (
    <Sheet visible={!!item} onClose={onClose} title={item?.title}>
      {hideOpen ? null : <SheetRow first icon="headphones" label="Open" onPress={() => { onClose(); if (item) openOnce(() => router.push(`/pod/${item.id}` as any)); }} />}
      <SheetRow first={hideOpen} icon="bookmark" label={item?.saved ? 'Remove from library' : 'Add to library'} onPress={save} right={busy ? <ActivityIndicator color={C.fg2} /> : undefined} />
      <SheetRow icon="link" label="Share" onPress={share} />
      {canDelete ? <SheetRow icon="trash" label="Delete" onPress={remove} danger /> : null}
    </Sheet>
  );
}

/** A thin line under the bar showing how far in the track is. */
function ProgressLine() {
  const { position, duration } = useProgress();
  const fraction = duration > 0 ? Math.min(1, position / duration) : 0;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 30, right: 30, bottom: 0, height: 2, backgroundColor: C.hairline }}>
      <View style={{ width: `${Math.round(fraction * 100)}%`, height: 2, backgroundColor: C.accent2 }} />
    </View>
  );
}

/**
 * The compact player that floats above the tab bar (and at the foot of Pod's own screens).
 * It is the same width and roundness as the tab bar so the two read as one piece of glass. Renders nothing until a track is loaded.
 */
export function NowPlayingBar({ style }: { style?: ViewStyle }) {
  const router = useRouter();
  const { current, playing, upNext, repeat } = usePlayer();
  // Not useProgress(): this bar floats over every tab, and the clock ticks a few times a second while a track plays.
  // ProgressLine below takes the ticks on its own.
  const buffering = useBuffering();
  if (!current) return null;
  const canSkip = upNext.length > 0 || repeat !== 'off';
  return (
    <BlurView intensity={50} tint={C.blurTint} style={[{ width: '92%', maxWidth: 420, height: 60, borderRadius: 30, overflow: 'hidden', borderWidth: 1, borderColor: C.hairline }, style]}>
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: C.glass, paddingLeft: 10, paddingRight: 8, gap: 10 }}>
        <Pressable onPress={() => openOnce(() => router.push(`/pod/${current.id}` as any))} accessibilityRole="button" accessibilityLabel={`Now playing: ${current.title} by ${current.artist || 'unknown'}. Open the player`} style={({ pressed }) => ({ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, opacity: pressed ? 0.7 : 1 })}>
          <Cover uri={current.cover_url} kind={current.kind} size={40} radius={10} />
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={{ color: C.fg, fontSize: 14.5, fontWeight: '600' }}>
              {current.title}
            </Text>
            <Text numberOfLines={1} style={{ color: C.fg2, fontSize: 12.5, marginTop: 1 }}>
              {current.artist || kindLabel(current.kind)}
            </Text>
          </View>
        </Pressable>
        <Pressable onPress={() => { tap('light'); toggle(); }} hitSlop={6} accessibilityRole="button" accessibilityLabel={playing ? 'Pause' : 'Play'} style={({ pressed }) => ({ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
          {buffering && playing ? <ActivityIndicator color={C.fg} size="small" /> : <Icon name={playing ? 'pause' : 'play'} size={26} />}
        </Pressable>
        <Pressable onPress={() => { tap('light'); next(); }} hitSlop={6} disabled={!canSkip} accessibilityRole="button" accessibilityLabel="Next track" accessibilityState={{ disabled: !canSkip }} style={({ pressed }) => ({ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', opacity: !canSkip ? 0.35 : pressed ? 0.6 : 1 })}>
          <Icon name="skipnext" size={24} />
        </Pressable>
      </View>
      <ProgressLine />
    </BlurView>
  );
}
