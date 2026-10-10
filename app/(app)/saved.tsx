import React, { useCallback, useRef, useState } from 'react';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { PostGrid } from '../../src/components/Grid';
import { GridSkeleton } from '../../src/components/Skeleton';
import { Empty, ErrorNote, Screen, ScreenHeader, useToast } from '../../src/components/ui';
import { fetchLiked, fetchReposts, fetchSaved } from '../../src/lib/api';
import { useSession } from '../../src/lib/session';
import { errText } from '../../src/lib/theme';
import type { Post } from '../../src/lib/types';

export default function Saved() {
  const params = useLocalSearchParams<{ which?: string }>();
  const liked = params.which === 'liked';
  const reposts = params.which === 'reposts';
  const { me } = useSession();
  const toast = useToast();
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const shown = useRef(false);

  // Fetched again each time the screen comes back (a post unsaved meanwhile goes). What is showing
  // stays while it loads; if that fails the grid stays as it was (a pull to refresh says why).
  const load = useCallback(async (pulled?: boolean) => {
    try {
      const rows = await (liked ? fetchLiked(me) : reposts ? fetchReposts(me) : fetchSaved(me));
      shown.current = true;
      setPosts(rows);
      setError('');
    } catch (e) {
      if (!shown.current) setError(errText(e));
      else if (pulled) toast(errText(e));
    } finally {
      setRefreshing(false);
    }
  }, [me, liked, reposts, toast]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const title = liked ? 'Your likes' : reposts ? 'Your reposts' : 'Saved';
  return (
    <Screen>
      <ScreenHeader title={title} />
      {posts === null ? (
        error ? <ErrorNote message={error} onRetry={() => { setError(''); load(); }} /> : <GridSkeleton />
      ) : (
        <PostGrid
          posts={posts}
          subtitle={title}
          refreshing={refreshing}
          onRefresh={() => { setRefreshing(true); load(true); }}
          empty={liked ? <Empty icon="heart" title="No likes yet" /> : reposts ? <Empty icon="repost" title="No reposts yet" /> : <Empty icon="bookmark" title="Nothing saved yet" />}
        />
      )}
    </Screen>
  );
}
