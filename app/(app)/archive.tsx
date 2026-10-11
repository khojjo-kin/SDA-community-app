import React, { useCallback, useRef, useState } from 'react';
import { FlatList, Pressable, RefreshControl, Text, useWindowDimensions, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Icon } from '../../src/components/Icon';
import { StoryCanvas, StoryGridSkeleton } from '../../src/components/StoryCanvas';
import { Button, Empty, ErrorNote, Screen, ScreenHeader } from '../../src/components/ui';
import { fetchArchive } from '../../src/lib/api';
import { useSession } from '../../src/lib/session';
import { C, dayLabel, errText } from '../../src/lib/theme';
import type { ArchivedStory } from '../../src/lib/types';

const GAP = 2;
const keyOfStory = (s: ArchivedStory) => s.id;
const RowGap = () => <View style={{ height: GAP }} />;

/** One story in the grid: memoised, so a refresh only draws again the cells that changed. */
const ArchiveCell = React.memo(function ArchiveCell({ story, width, height, onOpen }: { story: ArchivedStory; width: number; height: number; onOpen: (id: string) => void }) {
  const day = dayLabel(new Date(story.created_at));
  const live = new Date(story.expires_at).getTime() > Date.now();
  return (
    <Pressable onPress={() => onOpen(story.id)} accessibilityRole="button" accessibilityLabel={`Story from ${day}`} style={({ pressed }) => ({ width, height, opacity: pressed ? 0.85 : 1 })}>
      <StoryCanvas item={story.item} width={width} height={height} />
      <View style={{ position: 'absolute', left: 6, top: 6, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8, backgroundColor: 'rgba(10,12,14,0.7)' }}>
        <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>{day}</Text>
      </View>
      {story.audience === 'close_friends' ? (
        <View style={{ position: 'absolute', right: 6, top: 6, width: 20, height: 20, borderRadius: 10, backgroundColor: C.close, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="star" size={12} color="#fff" fill />
        </View>
      ) : null}
      {live ? <Text style={{ position: 'absolute', left: 7, bottom: 6, color: '#fff', fontSize: 11.5, fontWeight: '700', textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 3, textShadowOffset: { width: 0, height: 1 } }}>On your story now</Text> : null}
    </Pressable>
  );
});

/** Every story you have shared. Only you can see this. */
export default function Archive() {
  const { me } = useSession();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [list, setList] = useState<ArchivedStory[] | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  // A story was just tapped: a second tap a moment later doesn't open it twice.
  const lastOpen = useRef(0);

  const load = useCallback(async () => {
    try {
      setError('');
      setList(await fetchArchive(me));
    } catch (e) {
      setError(errText(e));
      setList((cur) => cur ?? []);
    } finally {
      setRefreshing(false);
    }
  }, [me]);

  // Again each time it comes back into view, so a story deleted or shared again shows as it is now.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const cw = Math.floor((width - GAP * 2) / 3);
  const ch = Math.round((cw * 16) / 9);

  const open = useCallback(
    (id: string) => {
      const now = Date.now();
      if (now - lastOpen.current < 700) return;
      lastOpen.current = now;
      router.push(`/story-archive/${id}`);
    },
    [router],
  );
  const renderStory = useCallback(({ item }: { item: ArchivedStory }) => <ArchiveCell story={item} width={cw} height={ch} onOpen={open} />, [cw, ch, open]);

  return (
    <Screen>
      <ScreenHeader title="Archive" />
      {list === null ? (
        <StoryGridSkeleton gap={GAP} />
      ) : error && !list.length ? (
        <ErrorNote message={error} onRetry={load} />
      ) : (
        <FlatList
          data={list}
          keyExtractor={keyOfStory}
          numColumns={3}
          columnWrapperStyle={{ gap: GAP }}
          ItemSeparatorComponent={RowGap}
          ListEmptyComponent={<Empty icon="archive" title="No stories yet" action={<Button small label="Add to your story" onPress={() => router.push('/add-story')} style={{ marginTop: 8 }} />} />}
          contentContainerStyle={{ paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={C.fg2} />}
          renderItem={renderStory}
          initialNumToRender={9}
          windowSize={7}
        />
      )}
    </Screen>
  );
}
