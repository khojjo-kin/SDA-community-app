import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { PublisherEntry, SabbathPostCard, usePublishing } from '../../src/components/sabbath/publishers';
import { Empty, ErrorNote, Loading, RoundButton, Screen, ScreenHeader } from '../../src/components/ui';
import { fetchSabbathPosts } from '../../src/lib/api';
import { useT } from '../../src/lib/i18n';
import { C, errText } from '../../src/lib/theme';
import type { SabbathPost } from '../../src/lib/types';

const PAGE = 20;

/** Everything the Sabbath School publishers have posted: pinned first, then newest. */
export default function SabbathPosts() {
  const router = useRouter();
  const t = useT();
  const { publisher, canPublish, reload } = usePublishing();
  const [posts, setPosts] = useState<SabbathPost[] | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [more, setMore] = useState(false);
  const [end, setEnd] = useState(false);
  const busy = useRef(false);

  const load = useCallback(async () => {
    setError('');
    try {
      const rows = await fetchSabbathPosts(0, PAGE);
      setPosts(rows);
      setEnd(rows.length < PAGE);
    } catch (e) {
      setError(errText(e));
    } finally {
      setRefreshing(false);
    }
  }, []);
  useFocusEffect(
    useCallback(() => {
      load();
      reload();
    }, [load, reload]),
  );

  async function next() {
    if (!posts || end || busy.current) return;
    busy.current = true;
    setMore(true);
    try {
      const rows = await fetchSabbathPosts(posts.length, PAGE);
      setPosts((p) => [...(p ?? []), ...rows.filter((r) => !(p ?? []).some((x) => x.id === r.id))]);
      setEnd(rows.length < PAGE);
    } catch {
      // Scrolling again tries again.
    } finally {
      busy.current = false;
      setMore(false);
    }
  }

  return (
    <Screen>
      <ScreenHeader title={t('ssPub.section')} right={canPublish ? <RoundButton name="plus" label={t('ssPub.publish')} onPress={() => router.push('/sabbath-post-edit' as any)} /> : undefined} />
      {posts === null ? (
        error ? <ErrorNote message={error} onRetry={load} /> : <Loading />
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ paddingTop: 6, paddingBottom: 48 }}
          onEndReached={next}
          onEndReachedThreshold={0.5}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); reload(); }} tintColor={C.fg2} />}
          ListEmptyComponent={<Empty icon="lesson" title={t('ssPub.empty')} />}
          ListFooterComponent={
            <View>
              {more ? <ActivityIndicator color={C.fg2} style={{ padding: 16 }} /> : null}
              {canPublish ? null : <PublisherEntry publisher={publisher} />}
            </View>
          }
          renderItem={({ item }) => <SabbathPostCard post={item} onPress={() => router.push({ pathname: '/sabbath-post/[id]', params: { id: item.id } } as any)} />}
        />
      )}
    </Screen>
  );
}
