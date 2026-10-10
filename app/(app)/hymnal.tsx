import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Icon } from '../../src/components/Icon';
import { Empty, ErrorNote, Loading, Screen, ScreenHeader, SearchField, SectionLabel } from '../../src/components/ui';
import { fetchHymns } from '../../src/lib/api';
import { groupBySection, HYMN_COUNT, loadFavourites, searchKey } from '../../src/lib/hymnal';
import { C, errText } from '../../src/lib/theme';
import type { Hymn } from '../../src/lib/types';

type Row = Pick<Hymn, 'number' | 'title' | 'section'>;
/** The list is flat so every row has its own key: a hymn can sit under Favourites and under its section. */
type Item = { kind: 'header'; key: string; title: string } | { kind: 'hymn'; key: string; hymn: Row };

export default function Hymnal() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [hymns, setHymns] = useState<Row[] | null>(null);
  const [error, setError] = useState('');
  const [favourites, setFavourites] = useState<number[]>([]);

  const load = useCallback(async () => {
    setError('');
    setHymns(null);
    try {
      setHymns(await fetchHymns());
    } catch (e) {
      setError(errText(e));
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  // The hymn page toggles hearts, so re-read them whenever this screen comes back.
  useFocusEffect(
    useCallback(() => {
      loadFavourites().then(setFavourites);
    }, []),
  );

  const open = (n: number) => router.push({ pathname: '/hymn/[number]', params: { number: String(n) } } as any);

  const needle = q.trim();
  const asNumber = /^\d+$/.test(needle) ? parseInt(needle, 10) : 0;
  const exact = asNumber >= 1 && asNumber <= HYMN_COUNT ? asNumber : 0;

  const items = useMemo<Item[]>(() => {
    if (!hymns) return [];
    const row = (h: Row, prefix: string): Item => ({ kind: 'hymn', key: `${prefix}${h.number}`, hymn: h });
    if (needle) {
      // Digits match the start of the number (so "10" shows 10 and 100–109); words must all appear in the title.
      const words = searchKey(needle).split(' ').filter(Boolean);
      const hits = asNumber
        ? hymns.filter((h) => String(h.number).startsWith(needle))
        : hymns.filter((h) => {
            const key = searchKey(h.title);
            return words.length > 0 && words.every((w) => key.includes(w));
          });
      return hits.map((h) => row(h, 's'));
    }
    const out: Item[] = [];
    const starred = favourites.map((n) => hymns.find((h) => h.number === n)).filter((h): h is Row => !!h);
    if (starred.length) {
      out.push({ kind: 'header', key: 'h-favourites', title: 'Favourites' });
      starred.forEach((h) => out.push(row(h, 'f')));
    }
    for (const g of groupBySection(hymns)) {
      out.push({ kind: 'header', key: `h-${g.section}`, title: g.section });
      g.hymns.forEach((h) => out.push(row(h, 's')));
    }
    return out;
  }, [hymns, needle, asNumber, favourites]);

  const exactHymn = exact && hymns ? hymns.find((h) => h.number === exact) : undefined;

  return (
    <Screen>
      <ScreenHeader title="Hymnal" />
      <View style={{ paddingBottom: 6 }}>
        <SearchField value={q} onChangeText={setQ} placeholder="Number or title" label="Search the hymnal" />
      </View>
      {error ? (
        <ErrorNote message={error} onRetry={load} />
      ) : !hymns ? (
        <Loading />
      ) : !hymns.length ? (
        <Empty icon="hymnal" title="The hymnal is being added" body="All 695 hymns will appear here once they have been loaded. Check back soon." />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(it) => it.key}
          keyboardShouldPersistTaps="handled"
          initialNumToRender={24}
          contentContainerStyle={{ paddingBottom: 60 }}
          ListHeaderComponent={
            exactHymn ? (
              <Pressable onPress={() => open(exactHymn.number)} accessibilityRole="button" accessibilityLabel={`Open hymn ${exactHymn.number}, ${exactHymn.title}`} style={({ pressed }) => ({ marginHorizontal: 16, marginTop: 8, marginBottom: 10, padding: 14, borderRadius: 14, backgroundColor: pressed ? C.surface2 : C.surface, flexDirection: 'row', alignItems: 'center', gap: 12 })}>
                <Icon name="hymnal" size={24} color={C.accent2} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: C.fg2, fontSize: 13 }}>Open hymn {exactHymn.number}</Text>
                  <Text numberOfLines={1} style={{ color: C.fg, fontSize: 17, fontWeight: '700' }}>{exactHymn.title}</Text>
                </View>
                <Icon name="right" size={18} color={C.fg2} weight={2} />
              </Pressable>
            ) : null
          }
          ListEmptyComponent={<Text style={{ color: C.fg2, textAlign: 'center', padding: 24 }}>No hymn matches that. Try a number, or a word from the title.</Text>}
          ListFooterComponent={
            !needle ? (
              <Text style={{ color: C.fg3, fontSize: 12.5, textAlign: 'center', paddingTop: 24, paddingHorizontal: 24, lineHeight: 17 }}>The Seventh-day Adventist Hymnal (1985), hymns 1 to {HYMN_COUNT}. Tap the heart on a hymn to keep it under Favourites.</Text>
            ) : null
          }
          renderItem={({ item }) =>
            item.kind === 'header' ? (
              <SectionLabel>{item.title}</SectionLabel>
            ) : (
              <Pressable onPress={() => open(item.hymn.number)} accessibilityRole="button" accessibilityLabel={`Hymn ${item.hymn.number}, ${item.hymn.title}`} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, minHeight: 48, backgroundColor: pressed ? 'rgba(255,255,255,0.05)' : 'transparent' })}>
                <Text style={{ width: 40, textAlign: 'right', color: C.fg2, fontSize: 16, fontVariant: ['tabular-nums'] }}>{item.hymn.number}</Text>
                <Text numberOfLines={1} style={{ flex: 1, color: C.fg, fontSize: 17 }}>{item.hymn.title}</Text>
                <Icon name="right" size={18} color={C.fg2} weight={2} />
              </Pressable>
            )
          }
        />
      )}
    </Screen>
  );
}
