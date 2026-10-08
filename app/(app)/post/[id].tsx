import React, { useCallback, useEffect, useState } from 'react';
import { FlatList } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { SectionTitle } from '../../../src/components/Grid';
import { PostCard } from '../../../src/components/PostCard';
import { Empty, ErrorNote, Header, Loading, Screen } from '../../../src/components/ui';
import { fetchPost, fetchUserPosts } from '../../../src/lib/api';
import { usePost } from '../../../src/lib/store';
import { errText } from '../../../src/lib/theme';

export default function PostScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const postId = String(id);
  const post = usePost(postId);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error' | 'missing'>(post ? 'ready' : 'loading');
  const [error, setError] = useState('');
  const [more, setMore] = useState<string[]>([]);

  const load = useCallback(async () => {
    try {
      const p = await fetchPost(postId);
      if (!p) {
        setStatus('missing');
        return;
      }
      setStatus('ready');
      const others = await fetchUserPosts(p.user_id);
      setMore(others.filter((o) => o.id !== postId && o.kind === 'post').map((o) => o.id));
    } catch (e) {
      setError(errText(e));
      setStatus((s) => (s === 'ready' ? 'ready' : 'error'));
    }
  }, [postId]);

  useEffect(() => {
    load();
  }, [load]);

  const gone = status === 'missing' || (status === 'ready' && !post);

  return (
    <Screen>
      <Header title="Post" center />
      {status === 'loading' ? (
        <Loading />
      ) : status === 'error' ? (
        <ErrorNote message={error} onRetry={() => { setStatus('loading'); load(); }} />
      ) : gone ? (
        <Empty title="This post isn't available" body="It may have been deleted." />
      ) : (
        <FlatList
          data={more}
          keyExtractor={(x) => x}
          renderItem={({ item }) => <PostCard id={item} />}
          ListHeaderComponent={
            <>
              <PostCard id={postId} />
              {more.length ? <SectionTitle>{`More from ${post?.username ?? 'this account'}`}</SectionTitle> : null}
            </>
          }
          contentContainerStyle={{ paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
        />
      )}
    </Screen>
  );
}
