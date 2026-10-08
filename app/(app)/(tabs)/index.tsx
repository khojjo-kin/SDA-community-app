import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, RefreshControl, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Wordmark } from '../../../src/components/AuthShell';
import { PostCard } from '../../../src/components/PostCard';
import { StoryTray } from '../../../src/components/StoryTray';
import { Button, Empty, ErrorNote, IconButton, Loading, Screen } from '../../../src/components/ui';
import { countUnreadNotices, fetchExplore, fetchFeed } from '../../../src/lib/api';
import { useSession } from '../../../src/lib/session';
import { listen } from '../../../src/lib/store';
import { C, errText } from '../../../src/lib/theme';

export default function Home() {
  const { me } = useSession();
  const router = useRouter();
  const [ids, setIds] = useState<string[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [suggested, setSuggested] = useState(false);
  const [unread, setUnread] = useState(false);
  const [trayKey, setTrayKey] = useState(0);
  const cursor = useRef<string | undefined>(undefined);
  const done = useRef(false);
  const busy = useRef(false);
  const mode = useRef<'feed' | 'explore'>('feed');

  const load = useCallback(
    async (reset: boolean) => {
      if (busy.current) return;
      if (!reset && done.current) return;
      busy.current = true;
      try {
        if (reset) {
          cursor.current = undefined;
          done.current = false;
          mode.current = 'feed';
        }
        let page = mode.current === 'feed' ? await fetchFeed(me, cursor.current) : await fetchExplore(cursor.current, 12);
        if (reset && page.length === 0) {
          mode.current = 'explore';
          page = await fetchExplore(undefined, 12);
        }
        if (page.length < 12) done.current = true;
        if (page.length) cursor.current = page[page.length - 1].created_at;
        setSuggested(mode.current === 'explore');
        setIds((cur) => (reset ? page.map((p) => p.id) : [...cur, ...page.map((p) => p.id).filter((id) => !cur.includes(id))]));
        setStatus('ready');
      } catch (e) {
        setError(errText(e));
        setStatus((s) => (s === 'ready' ? 'ready' : 'error'));
      } finally {
        busy.current = false;
        setRefreshing(false);
      }
    },
    [me],
  );

  useEffect(() => {
    load(true);
  }, [load]);
  useEffect(() => listen('feed', () => { load(true); }), [load]);

  useFocusEffect(
    useCallback(() => {
      countUnreadNotices().then((n) => setUnread(n > 0)).catch(() => {});
    }, []),
  );

  const refresh = () => {
    setRefreshing(true);
    setTrayKey((k) => k + 1);
    load(true);
  };

  return (
    <Screen>
      <View style={{ height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8 }}>
        <IconButton name="plus" size={28} label="New post" onPress={() => router.push('/create')} />
        <Wordmark size={34} />
        <IconButton name="heart" size={26} label="Notifications" badge={unread} onPress={() => { setUnread(false); router.push('/notifications'); }} />
      </View>
      <FlatList
        data={ids}
        keyExtractor={(id) => id}
        renderItem={({ item }) => <PostCard id={item} />}
        ListHeaderComponent={
          <View>
            <StoryTray refreshKey={trayKey} />
            {status === 'ready' && suggested && ids.length > 0 ? <Text style={{ color: C.fg2, paddingHorizontal: 14, paddingBottom: 6 }}>You aren't following anyone yet, so here are the latest posts from everyone.</Text> : null}
          </View>
        }
        ListEmptyComponent={
          status === 'loading' ? (
            <Loading />
          ) : status === 'error' ? (
            <ErrorNote message={error} onRetry={() => { setStatus('loading'); load(true); }} />
          ) : (
            <Empty icon="image" title="Welcome to Community" body="Nobody has posted yet. Share the first photo, or find people to follow." action={<View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}><Button small label="Share a photo" onPress={() => router.push('/create')} /><Button small kind="ghost" label="Find people" onPress={() => router.push('/explore')} /></View>} />
          )
        }
        ListFooterComponent={status === 'ready' && ids.length > 0 && done.current ? <Text style={{ color: C.fg2, textAlign: 'center', padding: 28 }}>You're all caught up</Text> : null}
        onEndReached={() => load(false)}
        onEndReachedThreshold={0.6}
        contentContainerStyle={{ paddingBottom: 110 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={C.fg2} />}
        windowSize={7}
        initialNumToRender={3}
      />
    </Screen>
  );
}
