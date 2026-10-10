import React, { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { AdminFrame } from '../../src/components/AdminFrame';
import { Avatar, Empty, ErrorNote, Loading } from '../../src/components/ui';
import { fetchFeedback } from '../../src/lib/api';
import { agoLong, C, errText } from '../../src/lib/theme';
import type { Feedback } from '../../src/lib/types';

type Filter = 'all' | Feedback['kind'];
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'review', label: 'Reviews' },
  { key: 'idea', label: 'Ideas' },
  { key: 'problem', label: 'Problems' },
];

/** The coloured label on each one. A function, so the colours come from the theme in use. */
function KindPill({ f }: { f: Feedback }) {
  const look =
    f.kind === 'review'
      ? { label: f.rating ? `Review ★${f.rating}` : 'Review', color: C.warn, bg: C.warn + '24' }
      : f.kind === 'idea'
        ? { label: 'Idea', color: C.accent2, bg: C.accentSoft }
        : { label: 'Problem', color: C.like, bg: C.like + '24' };
  return (
    <View style={{ height: 24, paddingHorizontal: 9, borderRadius: 12, backgroundColor: look.bg, justifyContent: 'center' }}>
      <Text style={{ color: look.color, fontSize: 12, fontWeight: '700' }}>{look.label}</Text>
    </View>
  );
}

/** What members have told us: ratings from the "Enjoying Community?" question and Help, ideas and problems. */
export default function AdminFeedback() {
  const router = useRouter();
  const [items, setItems] = useState<Feedback[] | null>(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(() => {
    setError('');
    return fetchFeedback()
      .then(setItems)
      .catch((e) => setError(errText(e)));
  }, []);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function pull() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  const shown = (items ?? []).filter((f) => filter === 'all' || f.kind === filter);
  const rated = (items ?? []).filter((f) => f.kind === 'review' && f.rating);
  const average = rated.length ? rated.reduce((n, f) => n + (f.rating ?? 0), 0) / rated.length : 0;
  const counts = (k: Filter) => (k === 'all' ? items?.length ?? 0 : (items ?? []).filter((f) => f.kind === k).length);

  return (
    <AdminFrame section="feedback" title="Feedback and reviews">
      {/* The chips scroll sideways rather than wrap on a narrow phone. */}
      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingBottom: 8 }}>
          {FILTERS.map((f) => {
            const on = filter === f.key;
            return (
              <Pressable key={f.key} onPress={() => setFilter(f.key)} accessibilityRole="tab" accessibilityLabel={`${f.label}, ${counts(f.key)}`} accessibilityState={{ selected: on }} style={({ pressed }) => ({ paddingHorizontal: 14, height: 34, borderRadius: 17, backgroundColor: on ? C.fg : C.surface, justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}>
                <Text style={{ color: on ? C.bg : C.fg, fontWeight: '600' }}>
                  {f.label}
                  {items ? <Text style={{ color: on ? C.bg : C.fg2, fontWeight: '500' }}>{`  ${counts(f.key)}`}</Text> : null}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
      {items === null ? (
        error ? <ErrorNote message={error} onRetry={load} /> : <Loading />
      ) : (
        <FlatList
          data={shown}
          keyExtractor={(f) => f.id}
          contentContainerStyle={{ paddingBottom: 60 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={pull} tintColor={C.fg2} />}
          ListHeaderComponent={
            rated.length && (filter === 'all' || filter === 'review') ? (
              <View style={{ marginHorizontal: 16, marginBottom: 12, padding: 14, borderRadius: 16, backgroundColor: C.surface, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                <Text style={{ color: C.fg, fontSize: 30, fontWeight: '800', fontVariant: ['tabular-nums'] }}>{average.toFixed(1)}</Text>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ color: C.warn, fontSize: 16, letterSpacing: 1 }} accessibilityLabel={`${average.toFixed(1)} stars on average`}>
                    {'★★★★★'.slice(0, Math.round(average))}
                    <Text style={{ color: C.fg3 }}>{'★★★★★'.slice(Math.round(average))}</Text>
                  </Text>
                  <Text style={{ color: C.fg2, fontSize: 13 }}>Average from {rated.length} rating{rated.length === 1 ? '' : 's'}</Text>
                </View>
              </View>
            ) : null
          }
          ListEmptyComponent={<Empty icon="star" title="Nothing here yet" body={filter === 'all' ? 'Reviews, ideas and problems members send appear here.' : 'Nothing of this kind has been sent yet.'} />}
          renderItem={({ item: f }) => {
            const name = f.full_name || f.username || 'A former member';
            return (
              <View style={{ marginHorizontal: 16, marginBottom: 10, padding: 14, borderRadius: 16, backgroundColor: C.surface, gap: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Pressable disabled={!f.user_id} onPress={() => f.user_id && router.push(`/admin-member/${f.user_id}` as any)} accessibilityRole="button" accessibilityLabel={`${name}, open in Members`} style={({ pressed }) => ({ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, opacity: pressed ? 0.6 : 1 })}>
                    <Avatar uri={f.avatar_url} name={name} size={32} />
                    <View style={{ flex: 1 }}>
                      <Text numberOfLines={1} style={{ color: C.fg, fontWeight: '700' }}>{name}</Text>
                      <Text numberOfLines={1} style={{ color: C.fg3, fontSize: 12.5 }}>
                        {agoLong(f.created_at)}
                        {f.platform ? ` · ${f.platform === 'ios' ? 'iPhone' : f.platform === 'android' ? 'Android' : f.platform}` : ''}
                        {f.app_version ? ` · ${f.app_version}` : ''}
                      </Text>
                    </View>
                  </Pressable>
                  <KindPill f={f} />
                </View>
                {f.text ? <Text selectable style={{ color: C.fg, lineHeight: 21 }}>{f.text}</Text> : f.kind === 'review' ? <Text style={{ color: C.fg3, fontStyle: 'italic' }}>No words, just the stars.</Text> : null}
              </View>
            );
          }}
        />
      )}
    </AdminFrame>
  );
}
