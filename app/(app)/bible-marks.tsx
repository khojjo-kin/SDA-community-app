import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { MARK_COLORS, markHex } from '../../src/components/BibleMarks';
import { Icon } from '../../src/components/Icon';
import { Empty, ErrorNote, Loading, Screen, ScreenHeader } from '../../src/components/ui';
import { fetchBibleMarks } from '../../src/lib/api';
import { cachedChapters, type Chapter, loadBibleSettings, verseRef } from '../../src/lib/bible';
import { useT } from '../../src/lib/i18n';
import { useSession } from '../../src/lib/session';
import { ago, C, errText } from '../../src/lib/theme';
import type { BibleMark, BibleMarkColor } from '../../src/lib/types';

type Filter = 'all' | 'notes' | Exclude<BibleMarkColor, ''>;

/** Every verse the member has highlighted or written a note on, newest first. */
export default function BibleMarksScreen() {
  const router = useRouter();
  const t = useT();
  const { me } = useSession();
  const [marks, setMarks] = useState<BibleMark[] | null>(null);
  const [chapters, setChapters] = useState<Record<string, Chapter>>({});
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!me) return;
    setError('');
    try {
      const rows = await fetchBibleMarks(me);
      setMarks(rows);
      // The verse's words, where the chapter is already on the phone.
      const { translation } = await loadBibleSettings();
      setChapters(await cachedChapters(rows, translation));
    } catch (e) {
      setError(errText(e));
    } finally {
      setRefreshing(false);
    }
  }, [me]);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const shown = useMemo(() => (marks ?? []).filter((m) => (filter === 'all' ? true : filter === 'notes' ? !!m.note : m.color === filter)), [marks, filter]);

  const chip = (id: Filter, body: React.ReactNode, label: string) => {
    const on = filter === id;
    return (
      <Pressable key={id} onPress={() => setFilter(id)} accessibilityRole="tab" accessibilityLabel={label} accessibilityState={{ selected: on }} style={({ pressed }) => ({ height: 36, minWidth: 36, paddingHorizontal: typeof body === 'string' ? 16 : 6, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? C.fg : pressed ? C.surface2 : C.surface })}>
        {typeof body === 'string' ? <Text style={{ color: on ? C.bg : C.fg, fontSize: 14.5, fontWeight: '700' }}>{body}</Text> : body}
      </Pressable>
    );
  };

  const open = (m: BibleMark) => router.push({ pathname: '/bible/[book]', params: { book: m.book, c: String(m.chapter), v: String(m.verse) } } as any);

  return (
    <Screen>
      <ScreenHeader title={t('bibleMarks.title')} />
      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} accessibilityRole="tablist" contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 10, gap: 8, alignItems: 'center' }}>
          {chip('all', t('bibleMarks.all'), t('bibleMarks.all'))}
          {chip('notes', t('bibleMarks.notes'), t('bibleMarks.notes'))}
          {MARK_COLORS.map((c) => chip(c.id, <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: c.hex, borderWidth: filter === c.id ? 2 : 0, borderColor: C.bg }} />, t(c.label)))}
        </ScrollView>
      </View>

      {marks === null ? (
        error ? <ErrorNote message={error} onRetry={load} /> : <Loading />
      ) : (
        <FlatList
          data={shown}
          keyExtractor={(m) => `${m.book}.${m.chapter}.${m.verse}`}
          contentContainerStyle={{ paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={C.fg2} />}
          ListEmptyComponent={<Empty icon="compose" title={marks.length ? t('bibleMarks.emptyFilter') : t('bibleMarks.empty')} />}
          renderItem={({ item: m }) => {
            const words = chapters[`${m.book} ${m.chapter}`]?.verses.find((v) => v.verse === m.verse)?.text ?? '';
            const ref = verseRef(m.book, m.chapter, [m.verse]);
            return (
              <Pressable onPress={() => open(m)} accessibilityRole="button" accessibilityLabel={ref} style={({ pressed }) => ({ flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: pressed ? C.press : 'transparent' })}>
                <View style={{ width: 22, alignItems: 'center', paddingTop: 2 }}>
                  {m.color ? <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: markHex(m.color), marginTop: 2 }} /> : <Icon name="compose" size={18} color={C.accent2} weight={2.2} />}
                </View>
                <View style={{ flex: 1, gap: 4 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={{ flex: 1, color: C.fg, fontSize: 16, fontWeight: '700' }}>{ref}</Text>
                    <Text style={{ color: C.fg3, fontSize: 12.5 }}>{ago(m.updated_at)}</Text>
                  </View>
                  {words ? (
                    <Text numberOfLines={2} style={{ color: C.fg2, fontSize: 14.5, lineHeight: 20 }}>
                      {words}
                    </Text>
                  ) : null}
                  {m.note ? (
                    <View style={{ flexDirection: 'row', gap: 6, marginTop: 2 }}>
                      {m.color ? <Icon name="compose" size={15} color={C.accent2} weight={2.2} /> : null}
                      <Text numberOfLines={3} style={{ flex: 1, color: C.fg, fontSize: 14.5, lineHeight: 20 }}>
                        {m.note}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </Pressable>
            );
          }}
        />
      )}
    </Screen>
  );
}

