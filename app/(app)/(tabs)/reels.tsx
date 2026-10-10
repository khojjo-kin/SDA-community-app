import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, LayoutChangeEvent, Pressable, Text, useWindowDimensions, View, ViewToken } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DarkEmpty, DarkErrorNote, DarkStatusBar } from '../../../src/components/OnDark';
import { Reel } from '../../../src/components/Reel';
import { ShortsSkeleton } from '../../../src/components/Skeleton';
import { Button, IconButton } from '../../../src/components/ui';
import { fetchReels } from '../../../src/lib/api';
import { tap } from '../../../src/lib/haptics';
import { useT } from '../../../src/lib/i18n';
import { prefetchLibrary } from '../../../src/lib/library';
import { usePlayer } from '../../../src/lib/player';
import { useSession } from '../../../src/lib/session';
import { getPostNow, listen } from '../../../src/lib/store';
import { errText } from '../../../src/lib/theme';
import type { Post } from '../../../src/lib/types';
import { tasteKey, tasteOf, tuneFeed } from '../clips-settings';

const keyOfClip = (id: string) => id;

/** How many clips the server sends at a time (see fetchReels). */
const PAGE = 10;
/** When the member's choices leave a whole page out, look this many pages further before giving up. */
const EXTRA_PAGES = 3;
/** Ask for the next page this many Shorts before the end, so the next one is always there. */
const AHEAD = 3;
/** The floating tab bar's height and the gap above it (see the tabs layout). */
const TAB_BAR = 64;
/** Pod's now-playing bar, which sits above the tab bar while a track is loaded, and the gap above it. */
const POD_BAR = 60 + 8;

export default function Reels() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const { me, profile } = useSession();
  const podLoaded = !!usePlayer().current;
  const t = useT();
  const [friends, setFriends] = useState(false);
  const [ids, setIds] = useState<string[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [current, setCurrent] = useState(0);
  const [focused, setFocused] = useState(false);
  // The list's own height, measured: each Short fills exactly one page of it, so a swipe never stops halfway.
  const [page, setPage] = useState(height);
  const cursor = useRef<string | undefined>(undefined);
  const done = useRef(false);
  const request = useRef(0);
  // A page further on is on its way: the end of the list asks only once.
  const paging = useRef(false);
  // Something changed elsewhere (a post shared, someone blocked) while Shorts wasn't showing: load afresh on return.
  const stale = useRef(false);
  const list = useRef<FlatList<string>>(null);
  const idsRef = useRef(ids);
  idsRef.current = ids;
  const currentRef = useRef(current);
  currentRef.current = current;
  const pageRef = useRef(page);
  pageRef.current = page;
  const focusedRef = useRef(false);

  // What the member wants more and less of (Your feed). The key changes only when the choices do,
  // and a change loads the clips again with them.
  const taste = tasteOf(profile);
  const key = tasteKey(taste);
  const tasteRef = useRef(taste);
  tasteRef.current = taste;

  const load = useCallback(
    async (reset: boolean) => {
      if (reset) {
        cursor.current = undefined;
        done.current = false;
        request.current++;
      } else if (paging.current || done.current) {
        return;
      }
      const mine = request.current;
      paging.current = true;
      try {
        let shown: Post[] = [];
        // Keep going while the member's choices leave a whole page out, so the tab isn't empty by mistake.
        for (let i = 0; i <= EXTRA_PAGES && !done.current && !shown.length; i++) {
          const rows = await fetchReels(friends, cursor.current);
          if (mine !== request.current) return;
          // Paging follows what the server sent, not what is shown, or a short page would look like the end.
          if (rows.length < PAGE) done.current = true;
          if (rows.length) cursor.current = rows[rows.length - 1].created_at;
          shown = tuneFeed(rows, me, tasteRef.current, true);
        }
        const fresh = shown.map((p) => p.id);
        setIds((cur) => {
          if (reset) return [...new Set(fresh)];
          const have = new Set(cur);
          const more = fresh.filter((id) => !have.has(id));
          return more.length ? [...cur, ...more] : cur;
        });
        setStatus('ready');
      } catch (e) {
        if (mine !== request.current) return;
        // Only a first load shows the error. A page further on that didn't come leaves the Shorts already
        // here alone, and getting near the end again asks again.
        if (reset) {
          setError(errText(e));
          setStatus('error');
        }
      } finally {
        if (mine === request.current) paging.current = false;
      }
    },
    // `key` is here so new choices make a new loader, which the effect below runs from the top.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [friends, me, key],
  );

  /** From the top: the skeleton shows, and the list starts again at the first Short. */
  const reload = useCallback(() => {
    setStatus('loading');
    setCurrent(0);
    load(true);
  }, [load]);

  useEffect(() => {
    reload();
  }, [reload]);

  // Posts were added, deleted or hidden somewhere. A Short deleted from here simply makes way for the
  // next one; anything else loads afresh, now if Shorts is showing, or when it next is (never under a
  // finger halfway down the list).
  useEffect(
    () =>
      listen('feed', () => {
        const cur = idsRef.current;
        const kept = cur.filter((id) => getPostNow(id));
        if (kept.length && kept.length < cur.length) {
          setIds(kept);
          const last = kept.length - 1;
          if (currentRef.current > last) {
            setCurrent(last);
            list.current?.scrollToOffset({ offset: last * pageRef.current, animated: false });
          }
          return;
        }
        if (focusedRef.current) reload();
        else stale.current = true;
      }),
    [reload],
  );

  useFocusEffect(
    useCallback(() => {
      focusedRef.current = true;
      setFocused(true);
      if (stale.current) {
        stale.current = false;
        reload();
      }
      return () => {
        focusedRef.current = false;
        setFocused(false);
      };
    }, [reload]),
  );

  // Near the end, the next page is asked for (again, if the last try failed).
  useEffect(() => {
    if (status === 'ready' && ids.length && current >= ids.length - AHEAD) load(false);
  }, [status, current, ids.length, load]);

  // A new page height (the phone turned, a call bar came and went): keep the Short in view lined up.
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

  // Made again only when the clip in view (or the screen's size) changes; each Reel is memoised, so
  // only the two clips whose `active` flips draw again as the list snaps from one to the next.
  const bottomInset = Math.max(insets.bottom - 8, 10) + TAB_BAR + 4 + (podLoaded ? POD_BAR : 0);
  const renderClip = useCallback(
    ({ item, index }: { item: string; index: number }) => <Reel id={item} active={focused && index === current} width={width} height={page} bottomInset={bottomInset} />,
    [focused, current, width, page, bottomInset],
  );
  const clipLayout = useCallback((_: unknown, index: number) => ({ length: page, offset: page * index, index }), [page]);
  const onEnd = useCallback(() => load(false), [load]);

  // A screen was just opened from here: a second tap a moment later doesn't open it twice.
  const lastOpen = useRef(0);
  const go = (path: string) => {
    const at = Date.now();
    if (at - lastOpen.current < 700) return;
    lastOpen.current = at;
    router.push(path);
  };

  const create = () => {
    prefetchLibrary();
    go('/create?mode=shorts');
  };

  const choose = (f: boolean) => {
    if (f === friends) return;
    tap('select');
    setFriends(f);
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }} onLayout={onLayout}>
      <DarkStatusBar />
      {status === 'loading' ? (
        <ShortsSkeleton width={width} height={page} bottomInset={bottomInset} />
      ) : status === 'error' ? (
        <View style={{ flex: 1, justifyContent: 'center' }}><DarkErrorNote message={error} onRetry={reload} /></View>
      ) : ids.length === 0 ? (
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <DarkEmpty
            icon="reels"
            title={t(friends ? 'clips.emptyFriendsTitle' : 'clips.emptyTitle')}
            action={<Button small label={t('clips.shareClip')} onPress={create} style={{ marginTop: 8 }} />}
          />
        </View>
      ) : (
        <FlatList
          ref={list}
          data={ids}
          keyExtractor={keyOfClip}
          renderItem={renderClip}
          snapToInterval={page}
          snapToAlignment="start"
          disableIntervalMomentum
          decelerationRate="fast"
          showsVerticalScrollIndicator={false}
          scrollsToTop={false}
          getItemLayout={clipLayout}
          onViewableItemsChanged={onViewable}
          viewabilityConfig={viewConfig}
          onEndReached={onEnd}
          onEndReachedThreshold={1}
          // The Short before and the one after stay ready, so a swipe either way shows a picture at once.
          windowSize={3}
          initialNumToRender={2}
          maxToRenderPerBatch={2}
        />
      )}

      {/* Over the video: create on the left, the two feeds in the middle, Your feed on the right. */}
      <View style={{ position: 'absolute', top: insets.top, left: 0, right: 0, height: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8 }}>
        <View style={{ width: 48, alignItems: 'flex-start' }}>
          <IconButton name="plus" size={28} label={t('common.create')} color="#fff" onPress={create} />
        </View>
        <View accessibilityRole="tablist" style={{ flex: 1, flexDirection: 'row', justifyContent: 'center', gap: 22 }}>
          {[false, true].map((f) => {
            const on = friends === f;
            const label = t(f ? 'clips.friends' : 'tabs.clips');
            return (
              <Pressable key={f ? 'friends' : 'clips'} onPress={() => choose(f)} hitSlop={8} accessibilityRole="tab" accessibilityLabel={label} accessibilityState={{ selected: on }} style={({ pressed }) => ({ alignItems: 'center', paddingTop: 6, opacity: pressed ? 0.7 : 1 })}>
                <Text numberOfLines={1} style={{ color: '#fff', fontSize: 18, fontWeight: '800', opacity: on ? 1 : 0.6, textShadowColor: 'rgba(0,0,0,0.35)', textShadowRadius: 4, textShadowOffset: { width: 0, height: 1 } }}>{label}</Text>
                <View style={{ marginTop: 5, width: 18, height: 3, borderRadius: 2, backgroundColor: on ? '#fff' : 'transparent' }} />
              </Pressable>
            );
          })}
        </View>
        <View style={{ width: 48, alignItems: 'flex-end' }}>
          <IconButton name="sliders" size={26} label={t('clips.feedSettings')} color="#fff" onPress={() => go('/clips-settings')} />
        </View>
      </View>
    </View>
  );
}
