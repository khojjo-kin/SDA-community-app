import React, { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { PostGrid } from '../../src/components/Grid';
import { Empty, ErrorNote, Loading, Screen, ScreenHeader } from '../../src/components/ui';
import { fetchTopPosts } from '../../src/lib/api';
import { useSession } from '../../src/lib/session';
import { errText } from '../../src/lib/theme';
import type { Post } from '../../src/lib/types';

/** What other people's most liked posts look like right now. */
export default function Inspiration() {
  const { me } = useSession();
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setError('');
      setPosts(await fetchTopPosts(me));
    } catch (e) {
      setError(errText(e));
      setPosts((cur) => cur ?? []);
    } finally {
      setRefreshing(false);
    }
  }, [me]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return (
    <Screen>
      <ScreenHeader title="Inspiration" />
      {posts === null ? (
        <Loading />
      ) : error && !posts.length ? (
        <ErrorNote message={error} onRetry={load} />
      ) : (
        <PostGrid
          posts={posts}
          refreshing={refreshing}
          onRefresh={() => { setRefreshing(true); load(); }}
          empty={<Empty icon="bulb" title="Nothing to show yet" />}
        />
      )}
    </Screen>
  );
}
