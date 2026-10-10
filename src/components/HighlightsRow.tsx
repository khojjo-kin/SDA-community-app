import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { fetchHighlights } from '../lib/api';
import { listen } from '../lib/store';
import { ringColors } from '../lib/styling';
import { C } from '../lib/theme';
import type { Highlight } from '../lib/types';
import { Icon } from './Icon';

/**
 * The row of highlight circles on a profile. On your own profile it starts with "New".
 * `ringColor` is a Plus member's chosen ring (profiles.ring_color): when set, the circles get that
 * gradient; otherwise they keep the plain grey outline.
 */
export function HighlightsRow({ userId, mine, refreshKey, ringColor }: { userId: string; mine: boolean; refreshKey?: number; ringColor?: string | null }) {
  const router = useRouter();
  const [list, setList] = useState<Highlight[]>([]);

  const load = useCallback(() => {
    fetchHighlights(userId).then(setList).catch(() => {});
  }, [userId]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);
  useEffect(() => listen('profile', load), [load]);

  if (!mine && !list.length) return null;
  const ring = { width: 68, height: 68, borderRadius: 34, borderWidth: 1, borderColor: C.fg3, alignItems: 'center' as const, justifyContent: 'center' as const };
  const gradient = ringColor ? (ringColors(ringColor) as unknown as readonly [string, string, ...string[]]) : null;

  const cover = (h: Highlight, size: number) =>
    h.cover_url ? (
      <Image source={{ uri: h.cover_url }} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: C.surface2 }} contentFit="cover" transition={120} />
    ) : (
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="highlight" size={24} color={C.fg2} />
      </View>
    );

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, paddingTop: 14, gap: 12 }}>
      {mine ? (
        <Pressable onPress={() => router.push('/new-highlight')} accessibilityRole="button" accessibilityLabel="New highlight" style={{ width: 72, alignItems: 'center', gap: 5 }}>
          <View style={ring}>
            <Icon name="plus" size={26} />
          </View>
          <Text numberOfLines={1} style={{ color: C.fg, fontSize: 12 }}>New</Text>
        </Pressable>
      ) : null}
      {list.map((h) => (
        <Pressable key={h.id} onPress={() => router.push(`/highlight/${h.id}`)} accessibilityRole="button" accessibilityLabel={`Highlight: ${h.title}`} style={{ width: 72, alignItems: 'center', gap: 5 }}>
          {gradient ? (
            // The same make-up as a story ring: the gradient, a thin gap in the page colour, then the cover.
            <LinearGradient colors={gradient} start={{ x: 0, y: 1 }} end={{ x: 1, y: 0 }} style={{ width: 68, height: 68, borderRadius: 34, alignItems: 'center', justifyContent: 'center' }}>
              <View style={{ width: 63, height: 63, borderRadius: 31.5, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' }}>{cover(h, 57)}</View>
            </LinearGradient>
          ) : (
            <View style={ring}>{cover(h, 60)}</View>
          )}
          <Text numberOfLines={1} style={{ color: C.fg, fontSize: 12, maxWidth: 72 }}>{h.title}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}
