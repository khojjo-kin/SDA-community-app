import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NowPlayingBar, PodMenu, PodRow } from '../../src/components/NowPlayingBar';
import { RowsSkeleton } from '../../src/components/Skeleton';
import { Empty, ErrorNote, Screen, ScreenHeader, SearchField } from '../../src/components/ui';
import { fetchPod, fetchPopularPod } from '../../src/lib/api';
import { play, useHasTrack } from '../../src/lib/player';
import { errText } from '../../src/lib/theme';
import type { PodItem } from '../../src/lib/types';

type Kind = 'song' | 'podcast' | 'popular';

const TITLES: Record<Kind, string> = { song: 'New songs', podcast: 'New podcasts', popular: 'Popular' };

/** The whole of one shelf from Listen Now. */
export default function PodList() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ kind?: string }>();
  const kind: Kind = params.kind === 'song' || params.kind === 'podcast' || params.kind === 'popular' ? params.kind : 'popular';
  const hasTrack = useHasTrack();
  const [q, setQ] = useState('');
  const [items, setItems] = useState<PodItem[] | null>(null);
  const [error, setError] = useState('');
  const [menuItem, setMenuItem] = useState<PodItem | null>(null);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  const load = useCallback(async () => {
    setError('');
    try {
      const list = kind === 'popular' ? await fetchPopularPod(100) : await fetchPod(kind);
      if (alive.current) setItems(list);
    } catch (e) {
      if (alive.current) setError(errText(e));
    }
  }, [kind]);
  useEffect(() => {
    load();
  }, [load]);

  const needle = q.trim().toLowerCase();
  const shown = useMemo(() => (items ? (needle ? items.filter((i) => i.title.toLowerCase().includes(needle) || i.artist.toLowerCase().includes(needle)) : items) : null), [items, needle]);

  // The same callbacks from one draw to the next, so a row draws again only when its own track changes.
  const shownRef = useRef(shown);
  shownRef.current = shown;
  const playRow = useCallback((_: PodItem, index: number) => play(shownRef.current ?? [], index), []);
  const renderRow = useCallback(({ item, index }: { item: PodItem; index: number }) => <PodRow item={item} index={index} onPress={playRow} onMore={setMenuItem} />, [playRow]);

  return (
    <Screen>
      <ScreenHeader title={TITLES[kind]} />
      <View style={{ paddingBottom: 6 }}>
        <SearchField value={q} onChangeText={setQ} placeholder="Title or artist" label={`Search ${TITLES[kind].toLowerCase()}`} />
      </View>
      {error && items === null ? (
        <ErrorNote message={error} onRetry={load} />
      ) : shown === null ? (
        <RowsSkeleton count={9} avatar={56} padY={7} />
      ) : (
        <FlatList
          data={shown}
          keyExtractor={(i) => i.id}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          initialNumToRender={12}
          windowSize={9}
          contentContainerStyle={{ paddingTop: 4, paddingBottom: (hasTrack ? 80 : 20) + insets.bottom + 20 }}
          ListEmptyComponent={needle ? <Empty icon="search" title="Nothing matches" /> : <Empty icon={kind === 'podcast' ? 'podcast' : 'music'} title="Nothing here yet" />}
          renderItem={renderRow}
        />
      )}
      <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: Math.max(insets.bottom, 12), alignItems: 'center' }}>
        <NowPlayingBar />
      </View>
      <PodMenu
        item={menuItem}
        onClose={() => setMenuItem(null)}
        onChange={(next) => {
          if (!menuItem) return;
          setItems((list) => (list ? (next ? list.map((i) => (i.id === menuItem.id ? next : i)) : list.filter((i) => i.id !== menuItem.id)) : list));
        }}
      />
    </Screen>
  );
}
