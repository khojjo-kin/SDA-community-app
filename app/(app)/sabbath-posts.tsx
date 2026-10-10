import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { openOnce, PostCardsSkeleton, PublisherEntry, SabbathPostCard, usePublishing } from '../../src/components/sabbath/publishers';
import { Empty, ErrorNote, RoundButton, Screen, ScreenHeader, useToast } from '../../src/components/ui';
import { fetchSabbathPosts } from '../../src/lib/api';
import { useT } from '../../src/lib/i18n';
import { C, errText } from '../../src/lib/theme';
import type { SabbathPost } from '../../src/lib/types';

const PAGE = 20;

/** Everything the Sabbath School publishers have posted: pinned first, then newest. */
export default function SabbathPosts() {
  const router = useRouter();
  const t = useT();
  const toast = useToast();
  const { publisher, canPublish, reload } = usePublishing();
  const [posts, setPosts] = useState<SabbathPost[] | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [more, setMore] = useState(false);
  const [end, setEnd] = useState(false);
  const busy = useRef(false);
  const postsRef = useRef(posts);
  postsRef.current = posts;

  // On coming back (from a post just edited or deleted, say) as many as were showing are fetched again,
  // so the list is up to date without shrinking back to its first page under the finger.
  const load = useCallback(async () => {
    setError('');
    const count = Math.max(PAGE, postsRef.current?.length ?? 0);
    try {
      const rows = await fetchSabbathPosts(0, count);
      setPosts(rows);
      setEnd(rows.length < count);
    } catch (e) {
      // With the list already showing, a failed refresh keeps it and says why.
      if (postsRef.current) toast(errText(e));
      else setError(errText(e));
    } finally {
      setRefreshing(false);
    }
  }, [toast]);
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

  const open = useCallback((p: SabbathPost) => openOnce(() => router.push({ pathname: '/sabbath-post/[id]', params: { id: p.id } } as any)), [router]);
  const renderItem = useCallback(({ item }: { item: SabbathPost }) => <SabbathPostCard post={item} onPress={open} />, [open]);

  return (
    <Screen>
      <ScreenHeader title={t('ssPub.section')} right={canPublish ? <RoundButton name="plus" label={t('ssPub.publish')} onPress={() => openOnce(() => router.push('/sabbath-post-edit' as any))} /> : undefined} />
      {posts === null ? (
        error ? <ErrorNote message={error} onRetry={load} /> : <PostCardsSkeleton />
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ paddingTop: 6, paddingBottom: 48 }}
          initialNumToRender={6}
          windowSize={7}
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
          renderItem={renderItem}
        />
      )}
    </Screen>
  );
}
