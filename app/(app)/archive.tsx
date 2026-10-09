import React, { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, Text, useWindowDimensions, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Icon } from '../../src/components/Icon';
import { StoryCanvas } from '../../src/components/StoryCanvas';
import { Button, Empty, ErrorNote, Loading, Screen, ScreenHeader } from '../../src/components/ui';
import { fetchArchive } from '../../src/lib/api';
import { useSession } from '../../src/lib/session';
import { C, dayLabel, errText } from '../../src/lib/theme';
import type { ArchivedStory } from '../../src/lib/types';

/** Every story you have shared. Only you can see this. */
export default function Archive() {
  const { me } = useSession();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [list, setList] = useState<ArchivedStory[] | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

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

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const gap = 2;
  const cw = Math.floor((width - gap * 2) / 3);
  const ch = Math.round((cw * 16) / 9);

  return (
    <Screen>
      <ScreenHeader title="Archive" />
      {list === null ? (
        <Loading />
      ) : error && !list.length ? (
        <ErrorNote message={error} onRetry={load} />
      ) : (
        <FlatList
          data={list}
          keyExtractor={(s) => s.id}
          numColumns={3}
          columnWrapperStyle={{ gap }}
          ItemSeparatorComponent={() => <View style={{ height: gap }} />}
          ListHeaderComponent={list.length ? <Text style={{ color: C.fg2, paddingHorizontal: 16, paddingBottom: 14, lineHeight: 20 }}>Your stories are kept here after they disappear from your profile. Only you can see them.</Text> : null}
          ListEmptyComponent={<Empty icon="archive" title="No stories yet" body="Stories you share are saved here automatically, so you can add them to highlights later." action={<Button small label="Add to your story" onPress={() => router.push('/add-story')} style={{ marginTop: 8 }} />} />}
          contentContainerStyle={{ paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={C.fg2} />}
          renderItem={({ item: s }) => {
            const live = new Date(s.expires_at).getTime() > Date.now();
            return (
              <Pressable onPress={() => router.push(`/story-archive/${s.id}`)} accessibilityRole="button" accessibilityLabel={`Story from ${dayLabel(new Date(s.created_at))}`} style={{ width: cw, height: ch }}>
                <StoryCanvas item={s.item} width={cw} height={ch} />
                <View style={{ position: 'absolute', left: 6, top: 6, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8, backgroundColor: 'rgba(10,12,14,0.7)' }}>
                  <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>{dayLabel(new Date(s.created_at))}</Text>
                </View>
                {s.audience === 'close_friends' ? (
                  <View style={{ position: 'absolute', right: 6, top: 6, width: 20, height: 20, borderRadius: 10, backgroundColor: C.green, alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="star" size={12} color="#fff" fill />
                  </View>
                ) : null}
                {live ? <Text style={{ position: 'absolute', left: 7, bottom: 6, color: '#fff', fontSize: 11.5, fontWeight: '700', textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 3, textShadowOffset: { width: 0, height: 1 } }}>On your story now</Text> : null}
              </Pressable>
            );
          }}
        />
      )}
    </Screen>
  );
}
