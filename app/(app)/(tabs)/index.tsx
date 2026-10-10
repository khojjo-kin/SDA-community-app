import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, RefreshControl, Text, View, ViewToken } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { CreateSheet } from '../../../src/components/CreateSheet';
import { FeedSwitch } from '../../../src/components/FeedSwitch';
import { PostCard } from '../../../src/components/PostCard';
import { StoryTray } from '../../../src/components/StoryTray';
import { Button, Empty, ErrorNote, IconButton, Loading, Screen } from '../../../src/components/ui';
import { countUnreadNotices, fetchExplore, fetchFeed, FeedKind, recordView } from '../../../src/lib/api';
import { useSession } from '../../../src/lib/session';
import { getPostNow, listen } from '../../../src/lib/store';
import { C, errText } from '../../../src/lib/theme';

const FEEDS: readonly { key: FeedKind; label: string }[] = [
  { key: 'foryou', label: 'For you' },
  { key: 'following', label: 'Following' },
  { key: 'subscribers', label: 'Subscribers' },
];

/** The feed last chosen in this session. Null until someone picks one, so the default can depend on who they follow. */
let chosenFeed: FeedKind | null = null;

export default function Home() {
  const { me, profile } = useSession();
  const router = useRouter();
  const [kind, setKindState] = useState<FeedKind>(() => chosenFeed ?? ((profile?.following_count ?? 0) > 0 ? 'following' : 'foryou'));
  const [ids, setIds] = useState<string[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [suggested, setSuggested] = useState(false);
  const [unread, setUnread] = useState(false);
  const [trayKey, setTrayKey] = useState(0);
  const [creating, setCreating] = useState(false);
  const meRef = useRef(me);
  meRef.current = me;
  const kindRef = useRef(kind);
  kindRef.current = kind;
  // A post counts as seen once at least half of it has been on screen for half a second.
  const onViewable = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    for (const v of viewableItems) {
      const post = typeof v.item === 'string' ? getPostNow(v.item) : undefined;
      if (post) recordView(meRef.current, post);
    }
  }).current;
  const viewConfig = useRef({ itemVisiblePercentThreshold: 50, minimumViewTime: 500 }).current;
  const cursor = useRef<string | undefined>(undefined);
  const done = useRef(false);
  const busy = useRef(false);
  const mode = useRef<'feed' | 'explore'>('feed');
  // Each fresh load gets a number; a slower, older load that comes back after a newer one is thrown away.
  const seq = useRef(0);

  const load = useCallback(
    async (reset: boolean) => {
      if (!reset && (busy.current || done.current)) return;
      const my = reset ? ++seq.current : seq.current;
      busy.current = true;
      const feed = kindRef.current;
      let which = reset ? 'feed' : mode.current;
      const before = reset ? undefined : cursor.current;
      try {
        let page = which === 'feed' ? await fetchFeed(me, before, feed) : await fetchExplore(before, 12);
        // Following nobody yet: show everyone's latest instead, and say so.
        if (reset && page.length === 0 && feed === 'following') {
          which = 'explore';
          page = await fetchExplore(undefined, 12);
        }
        if (my !== seq.current) return;
        mode.current = which;
        if (reset) done.current = false;
        if (page.length < 12) done.current = true;
        if (page.length) cursor.current = page[page.length - 1].created_at;
        setSuggested(which === 'explore');
        setIds((cur) => (reset ? page.map((p) => p.id) : [...cur, ...page.map((p) => p.id).filter((id) => !cur.includes(id))]));
        setStatus('ready');
      } catch (e) {
        if (my !== seq.current) return;
        setError(errText(e));
        setStatus((s) => (s === 'ready' ? 'ready' : 'error'));
      } finally {
        if (my === seq.current) {
          busy.current = false;
          setRefreshing(false);
        }
      }
    },
    [me],
  );

  useEffect(() => {
    load(true);
  }, [load, kind]);
  useEffect(() => listen('feed', () => { load(true); }), [load]);

  useFocusEffect(
    useCallback(() => {
      countUnreadNotices().then((n) => setUnread(n > 0)).catch(() => {});
    }, []),
  );

  const setKind = (next: FeedKind) => {
    if (next === kind) return;
    chosenFeed = next;
    setKindState(next);
    setIds([]);
    setSuggested(false);
    setStatus('loading');
  };

  const refresh = () => {
    setRefreshing(true);
    setTrayKey((k) => k + 1);
    load(true);
  };

  const empty =
    kind === 'subscribers' ? (
      <Empty icon="crown" title="Nothing from Plus members yet" body="Posts from Community Plus members will appear here. Switch to For you to see everyone." action={<Button small kind="ghost" label="Switch to For you" onPress={() => setKind('foryou')} style={{ marginTop: 8 }} />} />
    ) : (
      <Empty icon="image" title="Welcome to Community" body="Nobody has posted yet. Share the first photo, or find people to follow." action={<View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}><Button small label="Share a photo" onPress={() => router.push('/create?mode=post')} /><Button small kind="ghost" label="Find people" onPress={() => router.push('/explore')} /></View>} />
    );

  return (
    <Screen>
      <View style={{ height: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, gap: 8 }}>
        <IconButton name="plus" size={24} label="Create" bg={C.surface} onPress={() => setCreating(true)} />
        <View style={{ flex: 1, alignItems: 'center' }}>
          <FeedSwitch value={kind} onChange={setKind} options={FEEDS} style={{ alignSelf: 'stretch', maxWidth: 320 }} />
        </View>
        <IconButton name="heart" size={23} label="Notifications" bg={C.surface} badge={unread} onPress={() => { setUnread(false); router.push('/notifications'); }} />
      </View>
      <FlatList
        data={ids}
        keyExtractor={(id) => id}
        renderItem={({ item }) => <PostCard id={item} />}
        ListHeaderComponent={
          <View>
            <StoryTray refreshKey={trayKey} />
            {status === 'ready' && suggested && ids.length > 0 ? (
              <Text style={{ color: C.fg2, paddingHorizontal: 14, paddingBottom: 8, lineHeight: 19 }}>
                You aren't following anyone yet, so here are the latest posts from everyone.{' '}
                <Text style={{ color: C.accent2, fontWeight: '600' }} onPress={() => setKind('foryou')} accessibilityRole="button" accessibilityLabel="Switch to For you">
                  Switch to For you
                </Text>
              </Text>
            ) : null}
          </View>
        }
        ListEmptyComponent={status === 'loading' ? <Loading /> : status === 'error' ? <ErrorNote message={error} onRetry={() => { setStatus('loading'); load(true); }} /> : empty}
        ListFooterComponent={status === 'ready' && ids.length > 0 && done.current ? <Text style={{ color: C.fg2, textAlign: 'center', padding: 28 }}>You're all caught up</Text> : null}
        onEndReached={() => load(false)}
        onEndReachedThreshold={0.6}
        contentContainerStyle={{ paddingBottom: 110 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={C.fg2} />}
        windowSize={7}
        initialNumToRender={3}
        onViewableItemsChanged={onViewable}
        viewabilityConfig={viewConfig}
      />
      <CreateSheet visible={creating} onClose={() => setCreating(false)} />
    </Screen>
  );
}
