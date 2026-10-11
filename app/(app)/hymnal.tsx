import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, Text, useWindowDimensions, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Icon } from '../../src/components/Icon';
import { Skeleton, SkeletonFrame } from '../../src/components/Skeleton';
import { Empty, ErrorNote, Screen, ScreenHeader, SearchField, SectionLabel } from '../../src/components/ui';
import { fetchHymns } from '../../src/lib/api';
import { cachedHymnList, groupBySection, HYMN_COUNT, HymnRow, keepHymnList, loadFavourites, peekHymnList, searchKey } from '../../src/lib/hymnal';
import { C, errText } from '../../src/lib/theme';

/** The list is flat so every row has its own key: a hymn can sit under Favourites and under its section. */
type Item = { kind: 'header'; key: string; title: string } | { kind: 'hymn'; key: string; hymn: HymnRow };

/** One hymn: its number, then its title. */
const HymnLine = React.memo(function HymnLine({ hymn, onOpen }: { hymn: HymnRow; onOpen: (n: number) => void }) {
  return (
    <Pressable onPress={() => onOpen(hymn.number)} accessibilityRole="button" accessibilityLabel={`Hymn ${hymn.number}, ${hymn.title}`} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, minHeight: 48, backgroundColor: pressed ? C.press : 'transparent' })}>
      <Text style={{ width: 40, textAlign: 'right', color: C.fg2, fontSize: 16, fontVariant: ['tabular-nums'] }}>{hymn.number}</Text>
      <Text numberOfLines={1} style={{ flex: 1, color: C.fg, fontSize: 17 }}>{hymn.title}</Text>
      <Icon name="right" size={18} color={C.fg2} weight={2} />
    </Pressable>
  );
});

/** Rows of numbers and titles while the list is on its way. */
function ListSkeleton() {
  const { width } = useWindowDimensions();
  const room = width - 16 - 40 - 14 - 16 - 32;
  const widths = [0.62, 0.48, 0.74, 0.55, 0.68, 0.4, 0.58, 0.7, 0.5, 0.64];
  return (
    <SkeletonFrame style={{ paddingTop: 10 }}>
      <Skeleton width={110} height={13} x={16} style={{ marginHorizontal: 16, marginTop: 12, marginBottom: 14 }} />
      {widths.map((f, i) => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, height: 48 }}>
          <View style={{ width: 40, alignItems: 'flex-end' }}>
            <Skeleton width={24} height={12} x={32} />
          </View>
          <Skeleton width={Math.round(room * f)} height={13} x={70} />
        </View>
      ))}
    </SkeletonFrame>
  );
}

export default function Hymnal() {
  const router = useRouter();
  const [q, setQ] = useState('');
  // The list read earlier in this session (or kept on the phone) shows at once; the server's copy follows.
  const [hymns, setHymns] = useState<HymnRow[] | null>(() => peekHymnList());
  const [error, setError] = useState('');
  const [favourites, setFavourites] = useState<number[]>([]);
  const openedAt = useRef(0);
  const hasList = useRef(!!hymns);
  hasList.current = !!hymns;

  const load = useCallback(async () => {
    setError('');
    let have = hasList.current;
    if (!have) {
      const kept = await cachedHymnList();
      if (kept) {
        setHymns(kept);
        have = true;
      }
    }
    try {
      const rows = await fetchHymns();
      if (rows.length) {
        keepHymnList(rows);
        setHymns(rows);
      } else setHymns((old) => old ?? rows);
    } catch (e) {
      // With a copy on the phone, the hymnal works without the connection.
      if (!have) setError(errText(e));
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

  const open = useCallback(
    (n: number) => {
      const now = Date.now();
      if (now - openedAt.current < 700) return;
      openedAt.current = now;
      router.push({ pathname: '/hymn/[number]', params: { number: String(n) } } as any);
    },
    [router],
  );

  const needle = q.trim();
  const asNumber = /^\d+$/.test(needle) ? parseInt(needle, 10) : 0;
  const exact = asNumber >= 1 && asNumber <= HYMN_COUNT ? asNumber : 0;

  // Each title's search form, worked out once per list rather than on every letter typed.
  const keyed = useMemo(() => (hymns ?? []).map((h) => ({ h, key: searchKey(h.title) })), [hymns]);

  const items = useMemo<Item[]>(() => {
    if (!hymns) return [];
    const row = (h: HymnRow, prefix: string): Item => ({ kind: 'hymn', key: `${prefix}${h.number}`, hymn: h });
    if (needle) {
      // Digits match the start of the number (so "10" shows 10 and 100–109); words must all appear in the title.
      if (asNumber) return hymns.filter((h) => String(h.number).startsWith(needle)).map((h) => row(h, 's'));
      const words = searchKey(needle).split(' ').filter(Boolean);
      if (!words.length) return [];
      return keyed.filter(({ key }) => words.every((w) => key.includes(w))).map(({ h }) => row(h, 's'));
    }
    const out: Item[] = [];
    const starred = favourites.map((n) => hymns.find((h) => h.number === n)).filter((h): h is HymnRow => !!h);
    if (starred.length) {
      out.push({ kind: 'header', key: 'h-favourites', title: 'Favourites' });
      starred.forEach((h) => out.push(row(h, 'f')));
    }
    // Numbered as well as named: a section an admin splits in two would otherwise give two rows one key.
    groupBySection(hymns).forEach((g, i) => {
      out.push({ kind: 'header', key: `h-${i}-${g.section}`, title: g.section });
      g.hymns.forEach((h) => out.push(row(h, 's')));
    });
    return out;
  }, [hymns, keyed, needle, asNumber, favourites]);

  const exactHymn = exact && hymns ? hymns.find((h) => h.number === exact) : undefined;
  const renderItem = useCallback(({ item }: { item: Item }) => (item.kind === 'header' ? <SectionLabel>{item.title}</SectionLabel> : <HymnLine hymn={item.hymn} onOpen={open} />), [open]);

  return (
    <Screen>
      <ScreenHeader title="Hymnal" />
      <View style={{ paddingBottom: 6 }}>
        <SearchField value={q} onChangeText={setQ} placeholder="Number or title" label="Search the hymnal" />
      </View>
      {error && !hymns ? (
        <ErrorNote message={error} onRetry={load} />
      ) : !hymns ? (
        <ListSkeleton />
      ) : !hymns.length ? (
        <Empty icon="hymnal" title="The hymnal is being added" />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(it) => it.key}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          initialNumToRender={24}
          maxToRenderPerBatch={24}
          windowSize={11}
          contentContainerStyle={{ paddingBottom: 60 }}
          ListHeaderComponent={
            exactHymn ? (
              <Pressable onPress={() => open(exactHymn.number)} accessibilityRole="button" accessibilityLabel={`Open hymn ${exactHymn.number}, ${exactHymn.title}`} style={({ pressed }) => ({ marginTop: 4, marginBottom: 6, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: pressed ? C.press : 'transparent', flexDirection: 'row', alignItems: 'center', gap: 12 })}>
                <Icon name="hymnal" size={24} color={C.accent2} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: C.accent2, fontSize: 13, fontWeight: '700' }}>Open hymn {exactHymn.number}</Text>
                  <Text numberOfLines={1} style={{ color: C.fg, fontSize: 17, fontWeight: '700' }}>{exactHymn.title}</Text>
                </View>
                <Icon name="right" size={18} color={C.fg2} weight={2} />
              </Pressable>
            ) : null
          }
          ListEmptyComponent={<Empty icon="search" title="No hymn matches" />}
          ListFooterComponent={
            !needle ? <Text style={{ color: C.fg3, fontSize: 12.5, textAlign: 'center', paddingTop: 24, paddingHorizontal: 24, lineHeight: 17 }}>The Seventh-day Adventist Hymnal (1985), hymns 1 to {HYMN_COUNT}.</Text> : null
          }
          renderItem={renderItem}
        />
      )}
    </Screen>
  );
}
