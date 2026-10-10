import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '../../src/components/Icon';
import { Cover, kindLabel, NowPlayingBar, openOnce, PodMenu, PodRow } from '../../src/components/NowPlayingBar';
import { Skeleton, SkeletonFrame } from '../../src/components/Skeleton';
import { Button, Empty, ErrorNote, Loading, RoundButton, Screen, ScreenHeader, SearchField } from '../../src/components/ui';
import { fetchPod, fetchPodLibrary, fetchPopularPod } from '../../src/lib/api';
import { tap } from '../../src/lib/haptics';
import { play, toggle, useHasTrack, usePlayer } from '../../src/lib/player';
import { useSession } from '../../src/lib/session';
import { C, DARK, errText } from '../../src/lib/theme';
import type { PodItem } from '../../src/lib/types';

type Segment = 'now' | 'song' | 'podcast' | 'library';
const SEGMENTS: { key: Segment; label: string }[] = [
  { key: 'now', label: 'Listen Now' },
  { key: 'song', label: 'Songs' },
  { key: 'podcast', label: 'Podcasts' },
  { key: 'library', label: 'Library' },
];

/** A square cover with its title under it, for the shelves on Listen Now. */
const Tile = React.memo(function Tile({ item, index, onPlay }: { item: PodItem; index: number; onPlay: (index: number) => void }) {
  return (
    <Pressable onPress={() => onPlay(index)} accessibilityRole="button" accessibilityLabel={`Play ${item.title} by ${item.artist || 'unknown'}`} style={({ pressed }) => ({ width: 140, opacity: pressed ? 0.7 : 1 })}>
      <Cover uri={item.cover_url} kind={item.kind} size={140} radius={12} />
      <Text numberOfLines={1} style={{ color: C.fg, fontSize: 14, fontWeight: '600', marginTop: 8 }}>
        {item.title}
      </Text>
      <Text numberOfLines={1} style={{ color: C.fg2, fontSize: 13, marginTop: 2 }}>
        {item.artist || kindLabel(item.kind)}
      </Text>
    </Pressable>
  );
});

/** A horizontal row of tiles with a "See all" that opens the full list. */
function Shelf({ title, items, onSeeAll, onPlay }: { title: string; items: PodItem[]; onSeeAll: () => void; onPlay: (items: PodItem[], index: number) => void }) {
  const shown = useMemo(() => items.slice(0, 12), [items]);
  const playAt = useCallback((i: number) => onPlay(items, i), [items, onPlay]);
  if (!items.length) return null;
  return (
    <View style={{ paddingTop: 24 }}>
      <Pressable onPress={onSeeAll} accessibilityRole="button" accessibilityLabel={`${title}, see all`} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 12, opacity: pressed ? 0.7 : 1 })}>
        <Text accessibilityRole="header" style={{ flex: 1, color: C.fg, fontSize: 20, fontWeight: '700' }}>
          {title}
        </Text>
        <Text style={{ color: C.fg2, fontSize: 15 }}>See all</Text>
        <Icon name="right" size={16} color={C.fg2} weight={2.2} />
      </Pressable>
      <FlatList horizontal data={shown} keyExtractor={(i) => i.id} showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }} renderItem={({ item, index }) => <Tile item={item} index={index} onPlay={playAt} />} />
    </View>
  );
}

/** The big card at the top of Listen Now: what is playing, or the most played track as a place to start. */
function Hero({ item, nowPlaying, playing, onOpen, onPlay }: { item: PodItem; nowPlaying: boolean; playing: boolean; onOpen: () => void; onPlay: () => void }) {
  const { width } = useWindowDimensions();
  const height = Math.min(230, Math.round((width - 32) * 0.58));
  return (
    <Pressable onPress={onOpen} accessibilityRole="button" accessibilityLabel={`${nowPlaying ? 'Playing now' : 'Start listening'}: ${item.title} by ${item.artist || 'unknown'}`} style={({ pressed }) => ({ marginHorizontal: 16, marginTop: 12, height, borderRadius: 22, overflow: 'hidden', backgroundColor: C.surface, opacity: pressed ? 0.88 : 1 })}>
      {item.cover_url ? (
        <Image source={{ uri: item.cover_url }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} cachePolicy="memory-disk" accessibilityIgnoresInvertColors />
      ) : (
        <LinearGradient colors={[C.accent, '#0e6b33', DARK.bg2]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill}>
          <View style={{ position: 'absolute', right: -18, top: -10, opacity: 0.18 }}>
            <Icon name={item.kind === 'podcast' ? 'podcast' : 'headphones'} size={height * 0.9} color="#fff" weight={1.2} />
          </View>
        </LinearGradient>
      )}
      <LinearGradient colors={['rgba(11,16,20,0)', 'rgba(11,16,20,0.55)', 'rgba(11,16,20,0.95)']} locations={[0, 0.45, 1]} style={StyleSheet.absoluteFill} />
      <View style={{ flex: 1, padding: 16, justifyContent: 'flex-end' }}>
        {/* The card is a picture under a dark wash, so its words and button keep the dark theme's colours. */}
        <Text style={{ color: DARK.accent2, fontSize: 12, fontWeight: '800', letterSpacing: 0.8 }}>{nowPlaying ? 'PLAYING NOW' : 'START LISTENING'}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 12, marginTop: 4 }}>
          <View style={{ flex: 1 }}>
            <Text numberOfLines={2} style={{ color: DARK.fg, fontSize: 22, fontWeight: '800', lineHeight: 27 }}>
              {item.title}
            </Text>
            <Text numberOfLines={1} style={{ color: DARK.fg2, fontSize: 15, marginTop: 2 }}>
              {item.artist ? `${item.artist} · ${kindLabel(item.kind)}` : kindLabel(item.kind)}
            </Text>
          </View>
          <Pressable onPress={() => { tap('light'); onPlay(); }} hitSlop={6} accessibilityRole="button" accessibilityLabel={nowPlaying && playing ? 'Pause' : 'Play'} style={({ pressed }) => ({ width: 50, height: 50, borderRadius: 25, backgroundColor: DARK.fg, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.75 : 1 })}>
            <Icon name={nowPlaying && playing ? 'pause' : 'play'} size={26} color={DARK.bg} />
          </Pressable>
        </View>
      </View>
    </Pressable>
  );
}

/** Listen Now before anything has arrived: the big card, then two shelves of covers. */
function ListenSkeleton() {
  const { width } = useWindowDimensions();
  const hero = Math.min(230, Math.round((width - 32) * 0.58));
  return (
    <SkeletonFrame style={{ paddingTop: 12 }}>
      <Skeleton width={width - 32} height={hero} radius={22} x={16} style={{ marginHorizontal: 16 }} />
      {[0, 1].map((shelf) => (
        <View key={shelf} style={{ paddingTop: 24 }}>
          <Skeleton width={shelf ? 128 : 96} height={18} x={16} style={{ marginHorizontal: 16, marginBottom: 14 }} />
          <View style={{ flexDirection: 'row', gap: 12, paddingHorizontal: 16 }}>
            {[0, 1, 2].map((i) => (
              <View key={i} style={{ gap: 8 }}>
                <Skeleton width={140} height={140} radius={12} x={16 + i * 152} />
                <Skeleton width={100} height={11} x={16 + i * 152} />
              </View>
            ))}
          </View>
        </View>
      ))}
    </SkeletonFrame>
  );
}

export default function Pod() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { me, profile } = useSession();
  const { current, playing } = usePlayer();
  const hasTrack = useHasTrack();
  const canAdd = !!profile?.plus || !!profile?.admin_role;

  const [segment, setSegment] = useState<Segment>('now');
  const [q, setQ] = useState('');
  const [popular, setPopular] = useState<PodItem[] | null>(null);
  const [songs, setSongs] = useState<PodItem[] | null>(null);
  const [podcasts, setPodcasts] = useState<PodItem[] | null>(null);
  const [library, setLibrary] = useState<PodItem[] | null>(null);
  const [found, setFound] = useState<PodItem[] | null>(null);
  const [error, setError] = useState('');
  const [menuItem, setMenuItem] = useState<PodItem | null>(null);
  const alive = useRef(true);
  const loaded = useRef(false);
  /** The search the list currently shows (or is fetching), so a slow older search cannot overwrite a newer one. */
  const searchFor = useRef('');
  useEffect(() => () => { alive.current = false; }, []);

  const load = useCallback(async () => {
    setError('');
    try {
      // The library is the member's own: if it alone fails, the shelves still show and it comes back on the next visit.
      const [p, s, c, l] = await Promise.all([fetchPopularPod(), fetchPod('song'), fetchPod('podcast'), fetchPodLibrary(me).catch(() => null)]);
      if (!alive.current) return;
      setPopular(p);
      setSongs(s);
      setPodcasts(c);
      setLibrary((old) => l ?? old ?? []);
      loaded.current = true;
    } catch (e) {
      if (alive.current) setError(errText(e));
    }
  }, [me]);

  // Everything once; afterwards only the library, which the player's save button changes behind this screen's back.
  useFocusEffect(
    useCallback(() => {
      if (!loaded.current) load();
      else fetchPodLibrary(me).then((l) => { if (alive.current) setLibrary(l); }).catch(() => {});
    }, [load, me]),
  );

  const needle = q.trim();
  const searchable = segment === 'song' || segment === 'podcast';
  useEffect(() => {
    if (!searchable || !needle) {
      searchFor.current = '';
      setFound(null);
      return;
    }
    const key = `${segment}:${needle}`;
    searchFor.current = key;
    const timer = setTimeout(() => {
      fetchPod(segment as 'song' | 'podcast', needle)
        .then((list) => { if (alive.current && searchFor.current === key) setFound(list); })
        .catch((e) => { if (alive.current && searchFor.current === key) setError(errText(e)); });
    }, 250);
    return () => clearTimeout(timer);
  }, [searchable, needle, segment]);

  /** Keeps every list in step after a save, an edit or a delete. */
  function applyChange(id: string, next: PodItem | null) {
    const patch = (list: PodItem[] | null) => (list ? (next ? list.map((i) => (i.id === id ? next : i)) : list.filter((i) => i.id !== id)) : list);
    setPopular(patch);
    setSongs(patch);
    setPodcasts(patch);
    setFound(patch);
    setLibrary((list) => {
      if (!list) return list;
      if (!next) return list.filter((i) => i.id !== id);
      const inList = list.some((i) => i.id === id);
      if (next.saved && !inList) return [next, ...list];
      if (!next.saved && inList) return list.filter((i) => i.id !== id);
      return list.map((i) => (i.id === id ? next : i));
    });
  }

  const openList = (kind: 'song' | 'podcast' | 'popular') => openOnce(() => router.push({ pathname: '/pod-list', params: { kind } } as any));
  const openPlayer = (id: string) => openOnce(() => router.push(`/pod/${id}` as any));

  const list = useMemo<PodItem[] | null>(() => {
    if (segment === 'song') return needle ? found : songs;
    if (segment === 'podcast') return needle ? found : podcasts;
    if (segment === 'library') return library;
    return null;
  }, [segment, needle, found, songs, podcasts, library]);

  // The rows' callbacks stay the same from one draw to the next, so a row draws again only when its own track changes.
  const listRef = useRef(list);
  listRef.current = list;
  const playRow = useCallback((_: PodItem, index: number) => play(listRef.current ?? [], index), []);
  const playShelf = useCallback((items: PodItem[], index: number) => play(items, index), []);
  const renderRow = useCallback(({ item, index }: { item: PodItem; index: number }) => <PodRow item={item} index={index} onPress={playRow} onMore={setMenuItem} />, [playRow]);

  const bottomPad = (hasTrack ? 80 : 20) + insets.bottom + 20;
  // The hero is what is playing; failing that, the most played track with its shelf as the queue.
  const heroQueue = popular?.length ? popular : songs?.length ? songs : podcasts ?? [];
  const hero = current ?? heroQueue[0] ?? null;
  const nothingAtAll = loaded.current && !popular?.length && !songs?.length && !podcasts?.length;
  const add = canAdd ? <Button small label="Add to Pod" onPress={() => openOnce(() => router.push('/pod-new' as any))} style={{ marginTop: 8 }} /> : undefined;

  let body: React.ReactNode;
  if (error && !loaded.current) body = <ErrorNote message={error} onRetry={load} />;
  else if (!loaded.current) body = <ListenSkeleton />;
  else if (segment === 'now') {
    body = (
      <ScrollView contentContainerStyle={{ paddingBottom: bottomPad }} showsVerticalScrollIndicator={false}>
        {nothingAtAll ? <Empty icon="headphones" title="Nothing in Pod yet" action={add} /> : null}
        {hero ? <Hero item={hero} nowPlaying={!!current} playing={playing} onOpen={() => openPlayer(hero.id)} onPlay={() => (current ? toggle() : play(heroQueue, 0))} /> : null}
        <Shelf title="Popular" items={popular ?? []} onSeeAll={() => openList('popular')} onPlay={playShelf} />
        <Shelf title="New songs" items={songs ?? []} onSeeAll={() => openList('song')} onPlay={playShelf} />
        <Shelf title="New podcasts" items={podcasts ?? []} onSeeAll={() => openList('podcast')} onPlay={playShelf} />
        {library?.length ? <Shelf title="Your library" items={library} onSeeAll={() => setSegment('library')} onPlay={playShelf} /> : null}
      </ScrollView>
    );
  } else {
    const items = list;
    const empty =
      items === null ? (
        <Loading />
      ) : needle ? (
        <Empty icon="search" title="Nothing matches" />
      ) : segment === 'library' ? (
        <Empty icon="bookmark" title="Your library is empty" />
      ) : segment === 'song' ? (
        <Empty icon="music" title="No songs yet" action={add} />
      ) : (
        <Empty icon="podcast" title="No podcasts yet" action={add} />
      );
    body = (
      <FlatList
        data={items ?? []}
        keyExtractor={(i) => i.id}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        initialNumToRender={12}
        windowSize={9}
        contentContainerStyle={{ paddingTop: 4, paddingBottom: bottomPad }}
        ListHeaderComponent={error ? <ErrorNote message={error} onRetry={load} /> : null}
        ListEmptyComponent={empty}
        renderItem={renderRow}
      />
    );
  }

  return (
    <Screen>
      <ScreenHeader title="Pod" right={canAdd ? <RoundButton name="plus" label="Add a song or podcast" onPress={() => openOnce(() => router.push('/pod-new' as any))} /> : undefined} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 8, paddingTop: 4, paddingBottom: 8 }} accessibilityRole="tablist" style={{ flexGrow: 0 }}>
        {SEGMENTS.map((s) => (
          <Pressable
            key={s.key}
            onPress={() => {
              if (segment === s.key) return;
              tap('select');
              setSegment(s.key);
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected: segment === s.key }}
            accessibilityLabel={s.label}
            style={({ pressed }) => ({ paddingHorizontal: 16, height: 34, borderRadius: 17, backgroundColor: segment === s.key ? C.fg : C.surface, justifyContent: 'center', opacity: pressed ? 0.75 : 1 })}>
            <Text style={{ color: segment === s.key ? C.bg : C.fg, fontWeight: '600' }}>{s.label}</Text>
          </Pressable>
        ))}
      </ScrollView>
      {searchable ? (
        <View style={{ paddingBottom: 6 }}>
          <SearchField value={q} onChangeText={setQ} placeholder={segment === 'song' ? 'Title or artist' : 'Title or host'} label={segment === 'song' ? 'Search songs' : 'Search podcasts'} />
        </View>
      ) : null}
      {body}
      <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: Math.max(insets.bottom, 12), alignItems: 'center' }}>
        <NowPlayingBar />
      </View>
      <PodMenu item={menuItem} onClose={() => setMenuItem(null)} onChange={(next) => { if (menuItem) applyChange(menuItem.id, next); }} />
    </Screen>
  );
}
