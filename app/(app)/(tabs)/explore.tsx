import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, Keyboard, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { PostGrid, SectionTitle } from '../../../src/components/Grid';
import { Icon } from '../../../src/components/Icon';
import { PersonRow } from '../../../src/components/PersonRow';
import { Avatar, Empty, ErrorNote, Loading, RoundButton, Screen } from '../../../src/components/ui';
import { fetchExplore, fetchLives, searchProfiles } from '../../../src/lib/api';
import { useSession } from '../../../src/lib/session';
import { listen } from '../../../src/lib/store';
import { C, errText } from '../../../src/lib/theme';
import type { LiveCard, Post, Profile } from '../../../src/lib/types';
import { tasteKey, tasteOf, tuneFeed } from '../clips-settings';

/** How many posts the grid asks for at a time. */
const PAGE = 30;

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
                <Text style={{ color: '#fff', fontSize: 9.5, fontWeight: '800', letterSpacing: 0.8 }}>LIVE</Text>
              </View>
            </View>
            <Text numberOfLines={1} style={{ color: C.fg, fontSize: 12, maxWidth: 72 }}>{l.username}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

export default function Explore() {
  const { me, profile } = useSession();
  const router = useRouter();
  const [q, setQ] = useState('');
  const [searching, setSearching] = useState(false);
  const [people, setPeople] = useState<Profile[] | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [lives, setLives] = useState<LiveCard[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const input = useRef<TextInput>(null);
  const done = useRef(false);
  // Where the next page starts: the last post the server sent, which may be one that isn't shown.
  const cursor = useRef<string | undefined>(undefined);
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
      try {
        if (reset) {
          done.current = false;
          cursor.current = undefined;
          loadLives();
        }
        if (done.current) return;
        const page = await fetchExplore(reset ? undefined : cursor.current, PAGE);
        if (page.length < PAGE) done.current = true;
        if (page.length) cursor.current = page[page.length - 1].created_at;
        const shown = tuneFeed(page, me, tasteRef.current, false);
        setPosts((cur) => (reset ? shown : [...cur, ...shown.filter((p) => !cur.some((c) => c.id === p.id))]));
        setStatus('ready');
      } catch (e) {
        setError(errText(e));
        setStatus((s) => (s === 'ready' ? 'ready' : 'error'));
      } finally {
        setRefreshing(false);
      }
    },
    // `sensitiveKey` is here so changing the filter makes a new loader, which the effect below runs again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [loadLives, me, sensitiveKey],
  );

  useEffect(() => {
    load(true);
  }, [load]);
  useEffect(() => listen('feed', () => { load(true); }), [load]);
  // Someone going live, or ending one, announces on the stories topic.
  useEffect(() => listen('stories', loadLives), [loadLives]);

  useEffect(() => {
    if (!searching) return;
    let live = true;
    const t = setTimeout(() => {
      searchProfiles(q)
        .then((r) => { if (live) setPeople(r.filter((p) => p.id !== me)); })
        .catch(() => { if (live) setPeople([]); });
    }, 220);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [q, searching, me]);

  const cancel = () => {
    setSearching(false);
    setQ('');
    setPeople(null);
    Keyboard.dismiss();
  };

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingTop: 8, paddingBottom: 10 }}>
        <Pressable onPress={() => input.current?.focus()} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, height: 40, borderRadius: 20, backgroundColor: C.surface }}>
          <Icon name="search" size={18} color={C.fg2} weight={2.2} />
          <TextInput ref={input} value={q} onChangeText={setQ} onFocus={() => setSearching(true)} placeholder="Search" placeholderTextColor={C.fg3} style={{ flex: 1, color: C.fg, fontSize: 16, paddingVertical: 0 }} autoCapitalize="none" autoCorrect={false} returnKeyType="search" keyboardAppearance={C.blurTint} accessibilityLabel="Search people" />
        </Pressable>
        {searching ? (
          <Pressable onPress={cancel} hitSlop={8} accessibilityRole="button" accessibilityLabel="Cancel search">
            <Text style={{ color: C.accent2, fontWeight: '600' }}>Cancel</Text>
          </Pressable>
        ) : (
          <>
            <RoundButton name="users" size={40} iconSize={22} bg={C.surface} label="Communities and pages" onPress={() => router.push('/groups')} />
            <RoundButton name="bookmark" size={40} iconSize={22} bg={C.surface} label="Saved posts" onPress={() => router.push('/saved')} />
          </>
        )}
      </View>

      {searching ? (
        <FlatList
          data={people ?? []}
          keyExtractor={(p) => p.id}
          renderItem={({ item }) => <PersonRow person={item} />}
          ListHeaderComponent={<SectionTitle>{q.trim() ? 'Results' : 'Suggested'}</SectionTitle>}
          ListEmptyComponent={people === null ? <Loading /> : <Empty title="No one found" body={q.trim() ? 'Check the spelling, or try part of a username.' : 'When more people join, you can find them here.'} />}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 110 }}
        />
      ) : status === 'loading' ? (
        <Loading />
      ) : status === 'error' ? (
        <ErrorNote message={error} onRetry={() => { setStatus('loading'); load(true); }} />
      ) : (
        <PostGrid
          posts={posts}
          header={lives.length ? <LiveStrip lives={lives} /> : null}
          refreshing={refreshing}
          onRefresh={() => { setRefreshing(true); load(true); }}
          onEnd={() => { if (cursor.current) load(false); }}
          empty={<Empty icon="search" title="Nothing to explore yet" body="Posts from everyone on Community will appear here." />}
        />
      )}
    </Screen>
  );
}
