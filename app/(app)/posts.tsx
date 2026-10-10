import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Text, View, ViewToken } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { PostCard } from '../../src/components/PostCard';
import { FeedSkeleton } from '../../src/components/Skeleton';
import { Empty, ErrorNote, IconButton, Screen } from '../../src/components/ui';
import { fetchPost, fetchUserPosts, recordView } from '../../src/lib/api';
import { getActivePost, setActivePost } from '../../src/lib/autoplay';
import { fetchMoreLike, type GridSource, recallGrid } from '../../src/lib/grid-open';
import { useT } from '../../src/lib/i18n';
import { useSession } from '../../src/lib/session';
import { getPostNow, usePost } from '../../src/lib/store';
import { C, errText } from '../../src/lib/theme';
import type { Post } from '../../src/lib/types';
import { tasteOf, tuneFeed } from './clips-settings';

/*
 * A grid's posts as a feed, opened at the one tapped (see src/lib/grid-open.ts). The posts above it
 * are put back once the list has drawn from the tapped one, and the list keeps that post where it is
 * as they arrive, so the screen opens on it and a scroll up still finds the newer ones. Videos play
 * while their post is the one in view, as on Home; more of the same load as the end comes near.
 */

const renderPost = ({ item }: { item: string }) => <PostCard id={item} />;
const keyOfPost = (id: string) => id;
const KEEP_IN_PLACE = { minIndexForVisible: 0 };

export default function GridPosts() {
  const params = useLocalSearchParams<{ start: string; grid?: string; user?: string }>();
  const startId = String(params.start);
  const { me, profile } = useSession();
  const t = useT();
  const router = useRouter();
  // The grid as it was when the post was tapped. Read once: the grid behind may change while this is open.
  const [opened] = useState(() => recallGrid(params.grid));
  const [source] = useState<GridSource>(() => opened?.source ?? (params.user ? { from: 'user', userId: String(params.user) } : { from: 'list' }));
  const startAt = opened ? Math.max(0, opened.ids.indexOf(startId)) : 0;
  const [ids, setIds] = useState<string[]>(() => (opened ? opened.ids.slice(startAt) : [startId]));
  const above = useRef<string[]>(opened ? opened.ids.slice(0, startAt) : []);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error' | 'missing'>(() => (opened || getPostNow(startId) ? 'ready' : 'loading'));
  const [error, setError] = useState('');
  const [paging, setPaging] = useState(false);
  const startPost = usePost(startId);
  const subtitle = opened?.subtitle ?? (source.from === 'user' ? startPost?.username : undefined);

  // Where the next page starts: the oldest post the server has sent so far.
  const cursor = useRef<string | undefined>(opened ? getPostNow(opened.ids[opened.ids.length - 1])?.created_at : undefined);
  const done = useRef(source.from === 'list');
  const busy = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const tasteRef = useRef(tasteOf(profile));
  tasteRef.current = tasteOf(profile);

  /** Adds posts at the end, leaving out any already shown. */
  const append = useCallback((list: Post[]) => {
    if (!list.length) return;
    setIds((cur) => {
      const have = new Set([...cur, ...above.current]);
      const fresh = list.map((p) => p.id).filter((id) => !have.has(id));
      return fresh.length ? [...cur, ...fresh] : cur;
    });
  }, []);

  /** Puts the posts above the tapped one back; the list holds the tapped one where it is. */
  const restored = useRef(false);
  const restoreAbove = useCallback(() => {
    if (restored.current || !above.current.length) return;
    restored.current = true;
    const before = above.current;
    requestAnimationFrame(() => {
      if (!alive.current) return;
      above.current = [];
      setIds((cur) => [...before.filter((id) => !cur.includes(id)), ...cur]);
    });
  }, []);
  const onContentSize = useCallback((_: number, h: number) => {
    if (h > 0) restoreAbove();
  }, [restoreAbove]);

  // Opened without its grid (a link, or the app was restarted here): find the post, and the profile's others round it.
  const loadAround = useCallback(async () => {
    try {
      const post = getPostNow(startId) ?? (await fetchPost(startId));
      if (!alive.current) return;
      if (!post) {
        setStatus('missing');
        return;
      }
      setStatus('ready');
      if (source.from !== 'user') {
        done.current = true;
        return;
      }
      const theirs = await fetchUserPosts(source.userId);
      if (!alive.current) return;
      const at = theirs.findIndex((p) => p.id === startId);
      above.current = at > 0 ? theirs.slice(0, at).map((p) => p.id) : [];
      append(at >= 0 ? theirs.slice(at + 1) : theirs.filter((p) => p.created_at < post.created_at));
      cursor.current = theirs.length ? theirs[theirs.length - 1].created_at : undefined;
      done.current = !theirs.length;
      restoreAbove();
    } catch (e) {
      if (!alive.current) return;
      setError(errText(e));
      setStatus((s) => (s === 'ready' ? 'ready' : 'error'));
    }
  }, [startId, source, append, restoreAbove]);
  useEffect(() => {
    if (!opened) loadAround();
    // Once, for the post this screen was opened on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadMore = useCallback(async () => {
    if (busy.current || done.current || !cursor.current) return;
    busy.current = true;
    setPaging(true);
    try {
      const page = await fetchMoreLike(source, cursor.current, false);
      if (!alive.current) return;
      if (!page.length) {
        done.current = true;
        return;
      }
      cursor.current = page[page.length - 1].created_at;
      // Explore keeps to the member's sensitive-content choice, as its grid does.
      append(source.from === 'explore' ? tuneFeed(page, me, tasteRef.current, false) : page);
    } catch {
      // Offline for a moment: the next scroll to the end tries again.
    } finally {
      busy.current = false;
      if (alive.current) setPaging(false);
    }
  }, [source, append, me]);

  // As on Home: a post counts as seen once half of it has been on screen for half a second, and the
  // post most in view plays its video, only while this screen is the one showing.
  const meRef = useRef(me);
  meRef.current = me;
  const onSeen = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    for (const v of viewableItems) {
      const post = typeof v.item === 'string' ? getPostNow(v.item) : undefined;
      if (post) recordView(meRef.current, post);
    }
  }).current;
  const inView = useRef<string | null>(null);
  const focused = useRef(false);
  const onActive = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const top = viewableItems.find((v) => v.isViewable && typeof v.item === 'string');
    inView.current = top ? (top.item as string) : null;
    if (focused.current) setActivePost(inView.current);
  }).current;
  const viewabilityPairs = useRef([
    { viewabilityConfig: { itemVisiblePercentThreshold: 50, minimumViewTime: 500 }, onViewableItemsChanged: onSeen },
    { viewabilityConfig: { itemVisiblePercentThreshold: 60 }, onViewableItemsChanged: onActive },
  ]).current;
  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      setActivePost(inView.current);
      return () => {
        focused.current = false;
        // Stop this screen's video, unless the next screen has already chosen its own.
        if (getActivePost() === inView.current) setActivePost(null);
      };
    }, []),
  );

  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));

  return (
    <Screen>
      {/* "Posts" with whose they are above it, as on Instagram; both sides the same width so it stays centred. */}
      <View style={{ height: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8 }}>
        <View style={{ width: 40 }}>
          <IconButton name="back" label={t('common.back')} onPress={back} />
        </View>
        <View style={{ flex: 1, alignItems: 'center', paddingHorizontal: 8 }} accessible accessibilityRole="header">
          {subtitle ? <Text numberOfLines={1} style={{ color: C.fg2, fontSize: 12.5, fontWeight: '600' }}>{subtitle}</Text> : null}
          <Text numberOfLines={1} style={{ color: C.fg, fontSize: 17, fontWeight: '700' }}>{t('profile.tab.posts')}</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>
      {status === 'loading' ? (
        <FeedSkeleton count={1} />
      ) : status === 'error' ? (
        <ErrorNote message={error} onRetry={() => { setStatus('loading'); loadAround(); }} />
      ) : status === 'missing' ? (
        <Empty icon="image" title={t('gridFeed.unavailable')} />
      ) : (
        <FlatList
          data={ids}
          keyExtractor={keyOfPost}
          renderItem={renderPost}
          maintainVisibleContentPosition={KEEP_IN_PLACE}
          onContentSizeChange={onContentSize}
          onEndReached={loadMore}
          onEndReachedThreshold={1.2}
          ListFooterComponent={paging ? <ActivityIndicator color={C.fg2} style={{ paddingVertical: 20 }} /> : null}
          contentContainerStyle={{ paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          windowSize={7}
          initialNumToRender={2}
          maxToRenderPerBatch={4}
          viewabilityConfigCallbackPairs={viewabilityPairs}
        />
      )}
    </Screen>
  );
}
