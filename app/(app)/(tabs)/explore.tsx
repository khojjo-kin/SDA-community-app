import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, Keyboard, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useNavigation, useRouter } from 'expo-router';
import { PostGrid, SectionTitle } from '../../../src/components/Grid';
import { Icon } from '../../../src/components/Icon';
import { PersonRow } from '../../../src/components/PersonRow';
import { GridSkeleton, RowsSkeleton, SlowLine } from '../../../src/components/Skeleton';
import { Avatar, Button, Empty, ErrorNote, IconButton, Screen, useToast } from '../../../src/components/ui';
import { fetchExplore, fetchLives, searchProfiles } from '../../../src/lib/api';
import type { GridSource } from '../../../src/lib/grid-open';
import { t } from '../../../src/lib/i18n';
import { useSession } from '../../../src/lib/session';
import { listen } from '../../../src/lib/store';
import { C, errText } from '../../../src/lib/theme';
import type { LiveCard, Post, Profile } from '../../../src/lib/types';
import { tasteKey, tasteOf, tuneFeed } from '../clips-settings';
import { useTabListBottom } from '../../../src/lib/player';

/** How many posts the grid asks for at a time. */
const PAGE = 30;
/** A post opened from the grid carries on with more from Explore (src/lib/grid-open.ts). */
const EXPLORE: GridSource = { from: 'explore' };

/** Who is broadcasting right now: a row of faces, each with a red LIVE pill. Draws nothing when nobody is. */
function LiveStrip({ lives }: { lives: LiveCard[] }) {
  const router = useRouter();
  if (!lives.length) return null;
  return (
    <View style={{ paddingTop: 2, paddingBottom: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingBottom: 10 }}>
        <Icon name="live" size={16} color={C.like} weight={2} />
        <Text accessibilityRole="header" style={{ color: C.fg, fontSize: 15, fontWeight: '700' }}>Live now</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, gap: 14 }}>
        {lives.map((l) => (
          <Pressable key={l.id} onPress={() => router.push(`/live/${l.id}`)} accessibilityRole="button" accessibilityLabel={`${l.username} is live${l.title ? `: ${l.title}` : ''}`} style={({ pressed }) => ({ width: 72, alignItems: 'center', gap: 6, opacity: pressed ? 0.7 : 1 })}>
            <View style={{ alignItems: 'center' }}>
              <View style={{ padding: 2.5, borderRadius: 40, borderWidth: 2, borderColor: C.like }}>
                <Avatar uri={l.avatar_url} name={l.full_name || l.username} size={58} />
              </View>
              <View style={{ marginTop: -10, paddingHorizontal: 7, height: 18, borderRadius: 6, backgroundColor: C.like, borderWidth: 2, borderColor: C.bg, justifyContent: 'center' }}>
                <Text style={{ color: '#fff', fontSize: 9.5, fontWeight: '800', letterSpacing: 0.8 }}>{t('common.live')}</Text>
              </View>
            </View>
            <Text numberOfLines={1} style={{ color: C.fg, fontSize: 12, maxWidth: 72 }}>{l.username}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const keyOfPerson = (p: Profile) => p.id;
const renderPerson = ({ item }: { item: Profile }) => <PersonRow person={item} />;

export default function Explore() {
  const listBottom = useTabListBottom();
  const { me, profile } = useSession();
  const router = useRouter();
  const navigation = useNavigation();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [searching, setSearching] = useState(false);
  const [people, setPeople] = useState<Profile[] | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [lives, setLives] = useState<LiveCard[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  // The next page didn't come: the end of the grid offers to try again.
  const [pageFailed, setPageFailed] = useState(false);
  const statusRef = useRef(status);
  statusRef.current = status;
  const input = useRef<TextInput>(null);
  const grid = useRef<FlatList<Post>>(null);
  const done = useRef(false);
  // Where the next page starts: the last post the server sent, which may be one that isn't shown.
  const cursor = useRef<string | undefined>(undefined);
  // A page on its way, so the end of the grid never asks twice for the same one.
  const busy = useRef(false);
  // Each fresh load gets a number; a page that comes back after a newer fresh load is thrown away.
  const seq = useRef(0);
  // Explore only takes the sensitive filter from Your feed; topics shape For you and Clips.
  const taste = tasteOf(profile);
  const tasteRef = useRef(taste);
  tasteRef.current = taste;
  const sensitiveKey = tasteKey({ more: [], less: [], lessSensitive: taste.lessSensitive });

  const loadLives = useCallback(() => {
    fetchLives()
      .then((list) => setLives(list.filter((l) => !l.ended_at)))
      .catch(() => {});
  }, []);

  const load = useCallback(
    async (reset: boolean) => {
      if (!reset && (busy.current || done.current)) return;
      const my = reset ? ++seq.current : seq.current;
      busy.current = true;
      if (!reset) setPageFailed(false);
      if (reset) loadLives();
      try {
        const page = await fetchExplore(reset ? undefined : cursor.current, PAGE);
        if (my !== seq.current) return;
        if (reset) done.current = false;
        if (page.length < PAGE) done.current = true;
        if (page.length) cursor.current = page[page.length - 1].created_at;
        const shown = tuneFeed(page, me, tasteRef.current, false);
        setPosts((cur) => {
          if (reset) return shown;
          const have = new Set(cur.map((c) => c.id));
          return [...cur, ...shown.filter((p) => !have.has(p.id))];
        });
        if (reset) setPageFailed(false);
        setStatus('ready');
      } catch (e) {
        if (my !== seq.current) return;
        if (!reset) setPageFailed(true);
        // Already showing the grid: it stays, and the toast says the refresh didn't work.
        else if (statusRef.current === 'ready') toast(errText(e));
        else {
          setError(errText(e));
          setStatus('error');
        }
      } finally {
        if (my === seq.current) {
          busy.current = false;
          setRefreshing(false);
        }
      }
    },
    // `sensitiveKey` is here so changing the filter makes a new loader, which the effect below runs again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [loadLives, me, sensitiveKey, toast],
  );

  useEffect(() => {
    load(true);
  }, [load]);
  // Something feeds show has changed (a new post, a block): a fresh grid, from the top.
  useEffect(
    () =>
      listen('feed', () => {
        grid.current?.scrollToOffset({ offset: 0, animated: false });
        load(true);
      }),
    [load],
  );
  // Someone going live, or ending one, announces on the stories topic.
  useEffect(() => listen('stories', loadLives), [loadLives]);

  // A tap on the tab while Explore is showing goes back to the top of the grid.
  useEffect(() => {
    const off = navigation.addListener('tabPress' as never, () => {
      if (navigation.isFocused()) grid.current?.scrollToOffset({ offset: 0, animated: true });
    });
    return off;
  }, [navigation]);

  // A search that didn't go through says so (with Try again), rather than "No one found".
  const [searchError, setSearchError] = useState('');
  const [searchTry, setSearchTry] = useState(0);
  useEffect(() => {
    if (!searching) return;
    let live = true;
    const timer = setTimeout(() => {
      searchProfiles(q)
        .then((r) => {
          if (!live) return;
          setPeople(r.filter((p) => p.id !== me));
          setSearchError('');
        })
        .catch((e) => {
          if (!live) return;
          setSearchError(errText(e));
          setPeople([]);
        });
    }, 220);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [q, searching, me, searchTry]);

  const cancel = () => {
    setSearching(false);
    setQ('');
    setPeople(null);
    setSearchError('');
    Keyboard.dismiss();
  };

  // One tap, one screen: a second tap while the first screen is still opening is ignored.
  const lastOpen = useRef(0);
  const go = (href: string) => {
    const now = Date.now();
    if (now - lastOpen.current < 600) return;
    lastOpen.current = now;
    router.push(href as any);
  };

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingLeft: 16, paddingRight: searching ? 16 : 8, paddingTop: 6, paddingBottom: 10 }}>
        <Pressable onPress={() => input.current?.focus()} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, height: 38, borderRadius: 12, backgroundColor: C.field }}>
          <Icon name="search" size={17} color={C.fg2} weight={2.2} />
          <TextInput
            ref={input}
            value={q}
            onChangeText={setQ}
            onFocus={() => setSearching(true)}
            placeholder={t('common.search')}
            placeholderTextColor={C.fg2}
            selectionColor={C.accent2}
            style={{ flex: 1, color: C.fg, fontSize: 17, paddingVertical: 0 }}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            clearButtonMode="while-editing"
            keyboardAppearance={C.blurTint}
            accessibilityLabel="Search people"
          />
        </Pressable>
        {searching ? (
          <Pressable onPress={cancel} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('common.cancel')} style={({ pressed }) => ({ marginLeft: 8, opacity: pressed ? 0.6 : 1 })}>
            <Text style={{ color: C.accent2, fontSize: 16, fontWeight: '600' }}>{t('common.cancel')}</Text>
          </Pressable>
        ) : (
          <>
            <IconButton name="users" size={25} label="Communities and pages" onPress={() => go('/groups')} />
            <IconButton name="bookmark" size={24} label="Saved posts" onPress={() => go('/saved')} />
          </>
        )}
      </View>
      <SlowLine active={refreshing && !searching} />

      {searching ? (
        <FlatList
          data={people ?? []}
          keyExtractor={keyOfPerson}
          renderItem={renderPerson}
          ListHeaderComponent={<SectionTitle>{q.trim() ? 'Results' : 'Suggested'}</SectionTitle>}
          ListEmptyComponent={
            people === null ? (
              <RowsSkeleton count={6} avatar={50} padY={8} trailing="button" />
            ) : searchError ? (
              <ErrorNote message={searchError} onRetry={() => { setSearchError(''); setPeople(null); setSearchTry((n) => n + 1); }} />
            ) : (
              <Empty icon="search" title="No one found" />
            )
          }
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={{ paddingBottom: listBottom }}
        />
      ) : status === 'loading' ? (
        <GridSkeleton />
      ) : status === 'error' ? (
        <ErrorNote message={error} onRetry={() => { setStatus('loading'); load(true); }} />
      ) : (
        <PostGrid
          listRef={grid}
          posts={posts}
          header={lives.length ? <LiveStrip lives={lives} /> : null}
          footer={
            pageFailed && posts.length ? (
              <View style={{ alignItems: 'center', paddingVertical: 20 }}>
                <Button small kind="ghost" label={t('common.tryAgain')} onPress={() => load(false)} />
              </View>
            ) : null
          }
          refreshing={refreshing}
          onRefresh={() => { setRefreshing(true); load(true); }}
          onEnd={() => { if (cursor.current) load(false); }}
          source={EXPLORE}
          empty={<Empty icon="search" title="Nothing to explore yet" />}
        />
      )}
    </Screen>
  );
}
