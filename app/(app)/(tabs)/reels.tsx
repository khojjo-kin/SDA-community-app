import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, Text, useWindowDimensions, View, ViewToken } from 'react-native';
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
import { useSession } from '../../../src/lib/session';
import { listen } from '../../../src/lib/store';
import { errText } from '../../../src/lib/theme';
import type { Post } from '../../../src/lib/types';
import { tasteKey, tasteOf, tuneFeed } from '../clips-settings';

/** How many clips the server sends at a time (see fetchReels). */
const PAGE = 10;
/** When the member's choices leave a whole page out, look this many pages further before giving up. */
const EXTRA_PAGES = 3;

export default function Reels() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const { me, profile } = useSession();
  const t = useT();
  const [friends, setFriends] = useState(false);
  const [ids, setIds] = useState<string[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [current, setCurrent] = useState(0);
  const [focused, setFocused] = useState(false);
  const cursor = useRef<string | undefined>(undefined);
  const done = useRef(false);
  const request = useRef(0);

  // What the member wants more and less of (Your feed). The key changes only when the choices do,
  // and a change loads the clips again with them.
  const taste = tasteOf(profile);
  const key = tasteKey(taste);
  const tasteRef = useRef(taste);
  tasteRef.current = taste;

  const load = useCallback(
    async (reset: boolean) => {
      try {
        if (reset) {
          cursor.current = undefined;
          done.current = false;
          request.current++;
        }
        if (done.current) return;
        const mine = request.current;
        let shown: Post[] = [];
        // Keep going while the member's choices leave a whole page out, so the tab isn't empty by mistake.
        for (let i = 0; i <= EXTRA_PAGES && !done.current && !shown.length; i++) {
          const page = await fetchReels(friends, cursor.current);
          if (mine !== request.current) return;
          // Paging follows what the server sent, not what is shown, or a short page would look like the end.
          if (page.length < PAGE) done.current = true;
          if (page.length) cursor.current = page[page.length - 1].created_at;
          shown = tuneFeed(page, me, tasteRef.current, true);
        }
        setIds((cur) => (reset ? shown.map((p) => p.id) : [...cur, ...shown.map((p) => p.id).filter((id) => !cur.includes(id))]));
        setStatus('ready');
      } catch (e) {
        setError(errText(e));
        setStatus('error');
      }
    },
    // `key` is here so new choices make a new loader, which the effect below runs from the top.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [friends, me, key],
  );

  useEffect(() => {
    setStatus('loading');
    setCurrent(0);
    load(true);
  }, [load]);
  useEffect(() => listen('feed', () => { load(true); }), [load]);

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

  const create = () => {
    prefetchLibrary();
    router.push('/create?mode=post');
  };

  const choose = (f: boolean) => {
    if (f === friends) return;
    tap('select');
    setFriends(f);
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <DarkStatusBar />
      {status === 'loading' ? (
        <ShortsSkeleton width={width} height={height} bottomInset={Math.max(insets.bottom - 8, 10) + 68} />
      ) : status === 'error' ? (
        <View style={{ flex: 1, justifyContent: 'center' }}><DarkErrorNote message={error} onRetry={() => { setStatus('loading'); load(true); }} /></View>
      ) : ids.length === 0 ? (
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <DarkEmpty
            icon="reels"
            title={t(friends ? 'clips.emptyFriendsTitle' : 'clips.emptyTitle')}
            body={t(friends ? 'clips.emptyFriendsBody' : 'clips.emptyBody')}
            action={<Button small label={t('clips.shareClip')} onPress={create} style={{ marginTop: 8 }} />}
          />
        </View>
      ) : (
        <FlatList
          data={ids}
          keyExtractor={(id) => id}
          renderItem={({ item, index }) => <Reel id={item} active={focused && index === current} width={width} height={height} bottomInset={Math.max(insets.bottom - 8, 10) + 68} />}
          snapToInterval={height}
          snapToAlignment="start"
          disableIntervalMomentum
          decelerationRate="fast"
          showsVerticalScrollIndicator={false}
          getItemLayout={(_, index) => ({ length: height, offset: height * index, index })}
          onViewableItemsChanged={onViewable}
          viewabilityConfig={viewConfig}
          onEndReached={() => load(false)}
          onEndReachedThreshold={1}
          windowSize={3}
          initialNumToRender={1}
          maxToRenderPerBatch={2}
          removeClippedSubviews
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
              <Pressable key={f ? 'friends' : 'clips'} onPress={() => choose(f)} hitSlop={8} accessibilityRole="tab" accessibilityLabel={label} accessibilityState={{ selected: on }} style={{ alignItems: 'center', paddingTop: 6 }}>
                <Text style={{ color: '#fff', fontSize: 18, fontWeight: '800', opacity: on ? 1 : 0.6, textShadowColor: 'rgba(0,0,0,0.35)', textShadowRadius: 4, textShadowOffset: { width: 0, height: 1 } }}>{label}</Text>
                <View style={{ marginTop: 5, width: 18, height: 3, borderRadius: 2, backgroundColor: on ? '#fff' : 'transparent' }} />
              </Pressable>
            );
          })}
        </View>
        <View style={{ width: 48, alignItems: 'flex-end' }}>
          <IconButton name="sliders" size={26} label={t('clips.feedSettings')} color="#fff" onPress={() => router.push('/clips-settings')} />
        </View>
      </View>
    </View>
  );
}
