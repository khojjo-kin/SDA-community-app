import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, Keyboard, Pressable, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { PostGrid, SectionTitle } from '../../../src/components/Grid';
import { Icon } from '../../../src/components/Icon';
import { PersonRow } from '../../../src/components/PersonRow';
import { Empty, ErrorNote, IconButton, Loading, Screen } from '../../../src/components/ui';
import { fetchExplore, searchProfiles } from '../../../src/lib/api';
import { useSession } from '../../../src/lib/session';
import { listen } from '../../../src/lib/store';
import { C, errText } from '../../../src/lib/theme';
import type { Post, Profile } from '../../../src/lib/types';

export default function Explore() {
  const { me } = useSession();
  const router = useRouter();
  const [q, setQ] = useState('');
  const [searching, setSearching] = useState(false);
  const [people, setPeople] = useState<Profile[] | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const input = useRef<TextInput>(null);
  const done = useRef(false);

  const load = useCallback(async (reset: boolean, before?: string) => {
    try {
      if (reset) done.current = false;
      if (done.current) return;
      const page = await fetchExplore(before, 30);
      if (page.length < 30) done.current = true;
      setPosts((cur) => (reset ? page : [...cur, ...page.filter((p) => !cur.some((c) => c.id === p.id))]));
      setStatus('ready');
    } catch (e) {
      setError(errText(e));
      setStatus((s) => (s === 'ready' ? 'ready' : 'error'));
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load(true);
  }, [load]);
  useEffect(() => listen('feed', () => { load(true); }), [load]);

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
        <Pressable onPress={() => input.current?.focus()} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, height: 40, borderRadius: 12, backgroundColor: C.surface2 }}>
          <Icon name="search" size={18} color={C.fg2} />
          <TextInput ref={input} value={q} onChangeText={setQ} onFocus={() => setSearching(true)} placeholder="Search" placeholderTextColor={C.fg3} style={{ flex: 1, color: C.fg, fontSize: 16 }} autoCapitalize="none" autoCorrect={false} returnKeyType="search" keyboardAppearance="dark" accessibilityLabel="Search people" />
        </Pressable>
        {searching ? (
          <Pressable onPress={cancel} hitSlop={8}>
            <Text style={{ color: C.accent2, fontWeight: '600' }}>Cancel</Text>
          </Pressable>
        ) : (
          <IconButton name="bookmark" size={26} label="Saved posts" onPress={() => router.push('/saved')} />
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
          refreshing={refreshing}
          onRefresh={() => { setRefreshing(true); load(true); }}
          onEnd={() => { if (posts.length) load(false, posts[posts.length - 1].created_at); }}
          empty={<Empty icon="search" title="Nothing to explore yet" body="Posts from everyone on Community will appear here." />}
        />
      )}
    </Screen>
  );
}
