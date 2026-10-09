import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { fetchHighlights } from '../lib/api';
import { listen } from '../lib/store';
import { C } from '../lib/theme';
import type { Highlight } from '../lib/types';
import { Icon } from './Icon';

/** The row of highlight circles on a profile. On your own profile it starts with "New". */
export function HighlightsRow({ userId, mine, refreshKey }: { userId: string; mine: boolean; refreshKey?: number }) {
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
  const ring = { width: 68, height: 68, borderRadius: 34, borderWidth: 1, borderColor: '#3a4048', alignItems: 'center' as const, justifyContent: 'center' as const };

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
          <View style={ring}>
            {h.cover_url ? (
              <Image source={{ uri: h.cover_url }} style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: C.surface2 }} contentFit="cover" transition={120} />
            ) : (
              <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="highlight" size={24} color={C.fg2} />
              </View>
            )}
          </View>
          <Text numberOfLines={1} style={{ color: C.fg, fontSize: 12, maxWidth: 72 }}>{h.title}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}
