import React, { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { PostGrid } from '../../src/components/Grid';
import { GridSkeleton } from '../../src/components/Skeleton';
import { Empty, ErrorNote, Screen, ScreenHeader, useToast } from '../../src/components/ui';
import { fetchTopPosts } from '../../src/lib/api';
import { useSession } from '../../src/lib/session';
import { errText } from '../../src/lib/theme';
import type { Post } from '../../src/lib/types';

/** What other people's most liked posts look like right now. */
export default function Inspiration() {
  const { me } = useSession();
  const toast = useToast();
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const shown = useRef(false);
  shown.current = !!posts?.length;

  const load = useCallback(async () => {
    try {
      setError('');
      setPosts(await fetchTopPosts(me));
    } catch (e) {
      // With posts already showing, a failed refresh keeps them and says why.
      if (shown.current) toast(errText(e));
      else {
        setError(errText(e));
        setPosts((cur) => cur ?? []);
      }
    } finally {
      setRefreshing(false);
    }
  }, [me, toast]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return (
    <Screen>
      <ScreenHeader title="Inspiration" />
      {posts === null ? (
        <GridSkeleton />
      ) : error && !posts.length ? (
        <ErrorNote
          message={error}
          onRetry={() => {
            // The loading shapes while it tries again, not a moment of "nothing to show".
            setPosts(null);
            load();
          }}
        />
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
