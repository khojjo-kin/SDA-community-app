import React, { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { AdminFrame, CardsSkeleton, Chips, PageSpinner, usePagedList } from '../../src/components/AdminFrame';
import { SlowLine } from '../../src/components/Skeleton';
import { Avatar, Empty, ErrorNote } from '../../src/components/ui';
import { fetchFeedback, fetchRatingSummary } from '../../src/lib/api';
import { agoLong, C } from '../../src/lib/theme';
import type { Feedback } from '../../src/lib/types';

type Filter = 'all' | Feedback['kind'];
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'review', label: 'Reviews' },
  { key: 'idea', label: 'Ideas' },
  { key: 'problem', label: 'Problems' },
];

const keyOfFeedback = (f: Feedback) => f.id;

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

/** One review, idea or problem: who sent it, from what, and their words. */
const FeedbackItem = React.memo(function FeedbackItem({ f, onOpen }: { f: Feedback; onOpen: (userId: string) => void }) {
  const name = f.full_name || f.username || 'A former member';
  return (
    <View style={{ marginHorizontal: 16, marginBottom: 10, padding: 14, borderRadius: 16, backgroundColor: C.surface, gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Pressable disabled={!f.user_id} onPress={() => f.user_id && onOpen(f.user_id)} accessibilityRole="button" accessibilityLabel={`${name}, open in Members`} style={({ pressed }) => ({ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, opacity: pressed ? 0.6 : 1 })}>
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
      {f.text ? <Text selectable style={{ color: C.fg, lineHeight: 21 }}>{f.text}</Text> : null}
    </View>
  );
});

/** What members have told us: ratings from the "Enjoying Community?" question and Help, ideas and problems. */
export default function AdminFeedback() {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>('all');
  // The average is over every review, not just those scrolled through.
  const [rating, setRating] = useState<{ average: number; count: number } | null>(null);

  const fetchPage = useCallback((last: Feedback | null) => fetchFeedback(last?.created_at, filter === 'all' ? undefined : filter), [filter]);
  const list = usePagedList(fetchPage, { pageSize: 50, keyOf: keyOfFeedback });

  const loadRating = useCallback(() => {
    fetchRatingSummary().then(setRating, () => {});
  }, []);
  useFocusEffect(loadRating);

  const open = useCallback((userId: string) => router.push(`/admin-member/${userId}` as any), [router]);
  const renderItem = useCallback(({ item }: { item: Feedback }) => <FeedbackItem f={item} onOpen={open} />, [open]);

  const stars = rating ? Math.round(rating.average) : 0;
  const header =
    rating && rating.count && (filter === 'all' || filter === 'review') ? (
      <View style={{ marginHorizontal: 16, marginBottom: 12, padding: 14, borderRadius: 16, backgroundColor: C.surface, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <Text style={{ color: C.fg, fontSize: 30, fontWeight: '800', fontVariant: ['tabular-nums'] }}>{rating.average.toFixed(1)}</Text>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ color: C.warn, fontSize: 16, letterSpacing: 1 }} accessibilityLabel={`${rating.average.toFixed(1)} stars on average`}>
            {'★★★★★'.slice(0, stars)}
            <Text style={{ color: C.fg3 }}>{'★★★★★'.slice(stars)}</Text>
          </Text>
          <Text style={{ color: C.fg2, fontSize: 13 }}>
            {rating.count} rating{rating.count === 1 ? '' : 's'}
          </Text>
        </View>
      </View>
    ) : null;

  return (
    <AdminFrame section="feedback" title="Feedback and reviews">
      <Chips value={filter} onChange={setFilter} options={FILTERS} />
      <SlowLine active={list.slow} />
      {list.items === null ? (
        list.error ? <ErrorNote message={list.error} onRetry={list.retry} /> : <CardsSkeleton />
      ) : (
        <FlatList
          data={list.items}
          keyExtractor={keyOfFeedback}
          renderItem={renderItem}
          initialNumToRender={6}
          windowSize={9}
          onEndReached={list.more}
          onEndReachedThreshold={0.6}
          contentContainerStyle={{ paddingBottom: 60 }}
          refreshControl={<RefreshControl refreshing={list.refreshing} onRefresh={() => { list.refresh(); loadRating(); }} tintColor={C.fg2} />}
          ListHeaderComponent={header}
          ListFooterComponent={<PageSpinner active={list.paging} />}
          ListEmptyComponent={<Empty icon="star" title="Nothing here yet" />}
        />
      )}
    </AdminFrame>
  );
}
