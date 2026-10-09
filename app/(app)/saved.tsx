import React, { useCallback, useState } from 'react';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { PostGrid } from '../../src/components/Grid';
import { Empty, ErrorNote, Header, Loading, Screen } from '../../src/components/ui';
import { fetchLiked, fetchReposts, fetchSaved } from '../../src/lib/api';
import { useSession } from '../../src/lib/session';
import { errText } from '../../src/lib/theme';
import type { Post } from '../../src/lib/types';

export default function Saved() {
  const params = useLocalSearchParams<{ which?: string }>();
  const liked = params.which === 'liked';
  const reposts = params.which === 'reposts';
  const { me } = useSession();
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setError('');
      setPosts(await (liked ? fetchLiked(me) : reposts ? fetchReposts(me) : fetchSaved(me)));
    } catch (e) {
      setError(errText(e));
      setPosts([]);
    }
  }, [me, liked, reposts]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return (
    <Screen>
      <Header title={liked ? 'Your likes' : reposts ? 'Your reposts' : 'Saved'} center />
      {posts === null ? (
        <Loading />
      ) : error ? (
        <ErrorNote message={error} onRetry={load} />
      ) : (
        <PostGrid posts={posts} empty={liked ? <Empty icon="heart" title="No likes yet" body="Double-tap a post to like it." /> : reposts ? <Empty icon="repost" title="No reposts yet" body="Posts you repost show on your profile and are listed here." /> : <Empty icon="bookmark" title="Nothing saved yet" body="Tap the bookmark on a post to keep it here. Only you can see what you save." />} />
      )}
    </Screen>
  );
}
