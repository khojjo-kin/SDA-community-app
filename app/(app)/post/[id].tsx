import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { SectionTitle } from '../../../src/components/Grid';
import { PostCard } from '../../../src/components/PostCard';
import { FeedSkeleton } from '../../../src/components/Skeleton';
import { Empty, ErrorNote, Header, Screen } from '../../../src/components/ui';
import { fetchPost, fetchUserPosts, recordView } from '../../../src/lib/api';
import { useFeedAutoplay } from '../../../src/lib/autoplay';
import { useT } from '../../../src/lib/i18n';
import { useSession } from '../../../src/lib/session';
import { usePost } from '../../../src/lib/store';
import { errText } from '../../../src/lib/theme';

const keyOfPost = (id: string) => id;

export default function PostScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const postId = String(id);
  const post = usePost(postId);
  const { me } = useSession();
  const t = useT();
  const [status, setStatus] = useState<'loading' | 'ready' | 'error' | 'missing'>(post ? 'ready' : 'loading');
  const [error, setError] = useState('');
  const [more, setMore] = useState<string[]>([]);
  // The post itself comes first in the list, so its video is tracked like the rest.
  const data = useMemo(() => [postId, ...more], [postId, more]);
  // The post most in view plays its video, only while this screen is showing.
  const viewabilityPairs = useFeedAutoplay();

  const load = useCallback(async () => {
    try {
      const p = await fetchPost(postId);
      if (!p) {
        setStatus('missing');
        return;
      }
      setStatus('ready');
      recordView(me, p);
      const others = await fetchUserPosts(p.user_id);
      setMore(others.filter((o) => o.id !== postId && o.kind === 'post').map((o) => o.id));
    } catch (e) {
      setError(errText(e));
      setStatus((s) => (s === 'ready' ? 'ready' : 'error'));
    }
  }, [postId, me]);

  useEffect(() => {
    load();
  }, [load]);

  const gone = status === 'missing' || (status === 'ready' && !post);
  const username = post?.username;
  const hasMore = more.length > 0;
  const renderItem = useCallback(
    ({ item, index }: { item: string; index: number }) =>
      index === 0 ? (
        <>
          <PostCard id={item} />
          {hasMore ? <SectionTitle>{`More from ${username ?? 'this account'}`}</SectionTitle> : null}
        </>
      ) : (
        <PostCard id={item} />
      ),
    [hasMore, username],
  );

  return (
    <Screen>
      <Header title="Post" center />
      {status === 'loading' ? (
        <FeedSkeleton count={1} />
      ) : status === 'error' ? (
        <ErrorNote message={error} onRetry={() => { setStatus('loading'); load(); }} />
      ) : gone ? (
        <Empty icon="image" title={t('gridFeed.unavailable')} />
      ) : (
        <FlatList
          data={data}
          keyExtractor={keyOfPost}
          renderItem={renderItem}
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
