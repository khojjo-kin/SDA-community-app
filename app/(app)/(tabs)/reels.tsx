import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, Text, useWindowDimensions, View, ViewToken } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Reel } from '../../../src/components/Reel';
import { Button, Empty, ErrorNote, IconButton, Loading } from '../../../src/components/ui';
import { fetchReels } from '../../../src/lib/api';
import { listen } from '../../../src/lib/store';
import { errText } from '../../../src/lib/theme';

export default function Reels() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [friends, setFriends] = useState(false);
  const [ids, setIds] = useState<string[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [current, setCurrent] = useState(0);
  const [focused, setFocused] = useState(false);
  const cursor = useRef<string | undefined>(undefined);
  const done = useRef(false);
  const request = useRef(0);

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
        const page = await fetchReels(friends, cursor.current);
        if (mine !== request.current) return;
        if (page.length < 10) done.current = true;
        if (page.length) cursor.current = page[page.length - 1].created_at;
        setIds((cur) => (reset ? page.map((p) => p.id) : [...cur, ...page.map((p) => p.id).filter((id) => !cur.includes(id))]));
        setStatus('ready');
      } catch (e) {
        setError(errText(e));
        setStatus('error');
      }
    },
    [friends],
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

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      {status === 'loading' ? (
        <View style={{ flex: 1, justifyContent: 'center' }}><Loading /></View>
      ) : status === 'error' ? (
        <View style={{ flex: 1, justifyContent: 'center' }}><ErrorNote message={error} onRetry={() => { setStatus('loading'); load(true); }} /></View>
      ) : ids.length === 0 ? (
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <Empty icon="reels" title={friends ? 'No reels from people you follow yet' : 'No reels yet'} body={friends ? 'Follow more people to see their videos here.' : 'Share a video and it will show up here for everyone.'} action={<Button small label="Share a video" onPress={() => router.push('/create')} style={{ marginTop: 8 }} />} />
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
      <View style={{ position: 'absolute', top: insets.top, left: 0, right: 0, height: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8 }}>
        <IconButton name="plus" size={28} label="New post" color="#fff" onPress={() => router.push('/create')} />
        <View style={{ flexDirection: 'row', gap: 16, paddingLeft: 8, flex: 1 }}>
          {[false, true].map((f) => (
            <Pressable key={String(f)} onPress={() => setFriends(f)} accessibilityRole="tab" accessibilityState={{ selected: friends === f }}>
              <Text style={{ color: '#fff', fontSize: 23, fontWeight: '800', opacity: friends === f ? 1 : 0.55 }}>{f ? 'Friends' : 'Reels'}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    </View>
  );
}
