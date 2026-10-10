import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, LayoutChangeEvent, useWindowDimensions, View, ViewToken } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DarkEmpty, DarkStatusBar } from '../../src/components/OnDark';
import { Reel } from '../../src/components/Reel';
import { ShortsSkeleton } from '../../src/components/Skeleton';
import { IconButton } from '../../src/components/ui';
import { fetchPost, fetchUserPosts } from '../../src/lib/api';
import { fetchMoreLike, type GridSource, isShort, recallGrid } from '../../src/lib/grid-open';
import { useT } from '../../src/lib/i18n';
import { useSession } from '../../src/lib/session';
import { getPostNow, listen } from '../../src/lib/store';
import type { Post } from '../../src/lib/types';
import { tasteOf, tuneFeed } from './clips-settings';

/*
 * A grid's Shorts in the full-screen player, opened at the one tapped (see src/lib/grid-open.ts):
 * swipe up and down through the grid's other Shorts, then on into more from the same place. Only the
 * Short on screen plays. The same player and actions as the Shorts tab (Reel).
 */

const keyOfShort = (id: string) => id;
/** Pages fetched in a row looking for Shorts among other posts (a group's) before stopping. */
const LOOK_AHEAD = 3;
/** Ask for more this many Shorts before the end, so the next one is always there. */
const AHEAD = 3;

export default function GridShorts() {
  const params = useLocalSearchParams<{ start: string; grid?: string; user?: string }>();
  const startId = String(params.start);
  const router = useRouter();
  const t = useT();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const { me, profile } = useSession();
  const [opened] = useState(() => recallGrid(params.grid));
  const [source] = useState<GridSource>(() => opened?.source ?? (params.user ? { from: 'user', userId: String(params.user) } : { from: 'list' }));
  // Only the grid's Shorts that are still here (one deleted meanwhile would be a black page).
  const [ids, setIds] = useState<string[]>(() => opened?.ids.filter((id) => getPostNow(id)) ?? []);
  const [startIndex, setStartIndex] = useState(() => (opened ? Math.max(0, opened.ids.filter((id) => getPostNow(id)).indexOf(startId)) : 0));
  const [status, setStatus] = useState<'loading' | 'ready' | 'missing'>(opened ? 'ready' : 'loading');
  const [current, setCurrent] = useState(startIndex);
  const [focused, setFocused] = useState(false);
  // The list's own height, measured: each Short fills exactly one page of it.
  const [page, setPage] = useState(height);
  const cursor = useRef<string | undefined>(opened ? getPostNow(opened.ids[opened.ids.length - 1])?.created_at : undefined);
  const done = useRef(source.from === 'list');
  const busy = useRef(false);
  const alive = useRef(true);
  const leaving = useRef(false);
  const list = useRef<FlatList<string>>(null);
  const idsRef = useRef(ids);
  idsRef.current = ids;
  const currentRef = useRef(current);
  currentRef.current = current;
  const pageRef = useRef(page);
  pageRef.current = page;
  const focusedRef = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const tasteRef = useRef(tasteOf(profile));
  tasteRef.current = tasteOf(profile);

  const leave = useCallback(() => {
    if (leaving.current) return;
    leaving.current = true;
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }, [router]);

  // Opened without its grid (a link, or the app was restarted here): the Short, and that profile's others round it.
  useEffect(() => {
    if (opened) return;
    (async () => {
      try {
        const post = getPostNow(startId) ?? (await fetchPost(startId));
        if (!alive.current) return;
        if (!post) {
          setStatus('missing');
          return;
        }
        let shorts: Post[] = [post];
        if (source.from === 'user') {
          const theirs = await fetchUserPosts(source.userId, undefined, true);
          if (!alive.current) return;
          if (theirs.some((p) => p.id === startId)) shorts = theirs;
          else shorts = [post, ...theirs.filter((p) => p.created_at < post.created_at)];
          cursor.current = theirs.length ? theirs[theirs.length - 1].created_at : undefined;
          done.current = !theirs.length;
        } else {
          done.current = true;
        }
        const at = Math.max(0, shorts.findIndex((p) => p.id === startId));
        setIds(shorts.map((p) => p.id));
        setStartIndex(at);
        setCurrent(at);
        setStatus('ready');
      } catch {
        if (alive.current) {
          // Show the one Short if it is here at all; otherwise there is nothing to play.
          if (getPostNow(startId)) {
            setIds([startId]);
            setStatus('ready');
          } else {
            setStatus('missing');
          }
        }
      }
    })();
    // Once, for the Short this screen was opened on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadMore = useCallback(async () => {
    if (busy.current || done.current || !cursor.current) return;
    busy.current = true;
    try {
      for (let i = 0; i < LOOK_AHEAD && !done.current && cursor.current; i++) {
        const rows = await fetchMoreLike(source, cursor.current, true);
        if (!alive.current) return;
        if (!rows.length) {
          done.current = true;
          break;
        }
        cursor.current = rows[rows.length - 1].created_at;
        let shorts = rows.filter(isShort);
        if (source.from === 'explore') shorts = tuneFeed(shorts, me, tasteRef.current, false);
        if (!shorts.length) continue;
        setIds((cur) => {
          const have = new Set(cur);
          const fresh = shorts.map((p) => p.id).filter((id) => !have.has(id));
          return fresh.length ? [...cur, ...fresh] : cur;
        });
        break;
      }
    } catch {
      // Offline for a moment: getting near the end again tries again.
    } finally {
      busy.current = false;
    }
  }, [source, me]);

  // Near the end, more are asked for (again, if the last try failed).
  useEffect(() => {
    if (status === 'ready' && ids.length && current >= ids.length - AHEAD) loadMore();
  }, [status, current, ids.length, loadMore]);

  // A Short deleted from its menu here: the next one takes its place, or the screen closes with the last.
  useEffect(
    () =>
      listen('feed', () => {
        const cur = idsRef.current;
        const kept = cur.filter((id) => getPostNow(id));
        if (kept.length === cur.length) return;
        if (!kept.length) {
          // Only while this screen is in front: under another one, going back would close that one
          // instead. Then it just says the Short isn't available, with its back button working.
          if (focusedRef.current) leave();
          else setIds([]);
          return;
        }
        setIds(kept);
        const last = kept.length - 1;
        if (currentRef.current > last) {
          setCurrent(last);
          list.current?.scrollToOffset({ offset: last * pageRef.current, animated: false });
        }
      }),
    [leave],
  );

  useFocusEffect(
    useCallback(() => {
      focusedRef.current = true;
      setFocused(true);
      return () => {
        focusedRef.current = false;
        setFocused(false);
      };
    }, []),
  );

  // A new page height (a call bar came and went): keep the Short in view lined up.
  useEffect(() => {
    list.current?.scrollToOffset({ offset: currentRef.current * page, animated: false });
  }, [page]);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    if (h > 0 && Math.abs(h - pageRef.current) > 0.5) setPage(h);
  }, []);

  const onViewable = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const first = viewableItems[0];
    if (first && first.index != null) setCurrent(first.index);
  }).current;
  const viewConfig = useRef({ itemVisiblePercentThreshold: 70 }).current;

  const bottomInset = insets.bottom + 8;
  const renderShort = useCallback(
    ({ item, index }: { item: string; index: number }) => <Reel id={item} active={focused && index === current} width={width} height={page} bottomInset={bottomInset} />,
    [focused, current, width, page, bottomInset],
  );
  const shortLayout = useCallback((_: unknown, index: number) => ({ length: page, offset: page * index, index }), [page]);

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }} onLayout={onLayout}>
      <DarkStatusBar />
      {status === 'loading' ? (
        <ShortsSkeleton width={width} height={page} bottomInset={bottomInset} />
      ) : status === 'missing' || !ids.length ? (
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <DarkEmpty icon="reels" title={t('gridFeed.unavailable')} />
        </View>
      ) : (
        <FlatList
          ref={list}
          data={ids}
          keyExtractor={keyOfShort}
          renderItem={renderShort}
          initialScrollIndex={Math.min(startIndex, ids.length - 1)}
          getItemLayout={shortLayout}
          snapToInterval={page}
          snapToAlignment="start"
          disableIntervalMomentum
          decelerationRate="fast"
          showsVerticalScrollIndicator={false}
          scrollsToTop={false}
          onViewableItemsChanged={onViewable}
          viewabilityConfig={viewConfig}
          onEndReached={loadMore}
          onEndReachedThreshold={2}
          // The Short before and the one after stay ready, so a swipe either way shows a picture at once.
          windowSize={3}
          initialNumToRender={2}
          maxToRenderPerBatch={2}
        />
      )}
      <View style={{ position: 'absolute', top: insets.top + 4, left: 8 }}>
        <IconButton name="back" label={t('common.back')} color="#fff" onPress={leave} />
      </View>
    </View>
  );
}
