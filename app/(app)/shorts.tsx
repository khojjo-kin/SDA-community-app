import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, useWindowDimensions, View, ViewToken } from 'react-native';
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
import { getPostNow } from '../../src/lib/store';
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
  const [ids, setIds] = useState<string[]>(() => opened?.ids ?? []);
  const [startIndex, setStartIndex] = useState(() => (opened ? Math.max(0, opened.ids.indexOf(startId)) : 0));
  const [status, setStatus] = useState<'loading' | 'ready' | 'missing'>(opened ? 'ready' : 'loading');
  const [current, setCurrent] = useState(startIndex);
  const [focused, setFocused] = useState(false);
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
        let list: Post[] = [post];
        if (source.from === 'user') {
          const theirs = await fetchUserPosts(source.userId, undefined, true);
          if (!alive.current) return;
          if (theirs.some((p) => p.id === startId)) list = theirs;
          else list = [post, ...theirs.filter((p) => p.created_at < post.created_at)];
          cursor.current = theirs.length ? theirs[theirs.length - 1].created_at : undefined;
          done.current = !theirs.length;
        } else {
          done.current = true;
        }
        const at = Math.max(0, list.findIndex((p) => p.id === startId));
        setIds(list.map((p) => p.id));
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
        const page = await fetchMoreLike(source, cursor.current, true);
        if (!alive.current) return;
        if (!page.length) {
          done.current = true;
          break;
        }
        cursor.current = page[page.length - 1].created_at;
        let shorts = page.filter(isShort);
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
      // Offline for a moment: the next swipe to the end tries again.
    } finally {
      busy.current = false;
    }
  }, [source, me]);

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  const onViewable = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const first = viewableItems[0];
    if (first && first.index != null) setCurrent(first.index);
  }).current;
  const viewConfig = useRef({ itemVisiblePercentThreshold: 70 }).current;

  const bottomInset = insets.bottom + 8;
  const renderShort = useCallback(
    ({ item, index }: { item: string; index: number }) => <Reel id={item} active={focused && index === current} width={width} height={height} bottomInset={bottomInset} />,
    [focused, current, width, height, bottomInset],
  );
  const shortLayout = useCallback((_: unknown, index: number) => ({ length: height, offset: height * index, index }), [height]);

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <DarkStatusBar />
      {status === 'loading' ? (
        <ShortsSkeleton width={width} height={height} bottomInset={bottomInset} />
      ) : status === 'missing' || !ids.length ? (
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <DarkEmpty icon="reels" title={t('gridFeed.unavailable')} />
        </View>
      ) : (
        <FlatList
          data={ids}
          keyExtractor={keyOfShort}
          renderItem={renderShort}
          initialScrollIndex={Math.min(startIndex, ids.length - 1)}
          getItemLayout={shortLayout}
          snapToInterval={height}
          snapToAlignment="start"
          disableIntervalMomentum
          decelerationRate="fast"
          showsVerticalScrollIndicator={false}
          onViewableItemsChanged={onViewable}
          viewabilityConfig={viewConfig}
          onEndReached={loadMore}
          onEndReachedThreshold={2}
          windowSize={3}
          initialNumToRender={1}
          maxToRenderPerBatch={2}
          removeClippedSubviews
        />
      )}
      <View style={{ position: 'absolute', top: insets.top + 4, left: 8 }}>
        <IconButton name="back" label={t('common.back')} color="#fff" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
      </View>
    </View>
  );
}
