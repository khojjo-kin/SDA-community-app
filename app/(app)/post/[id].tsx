import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, ViewToken } from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { SectionTitle } from '../../../src/components/Grid';
import { PostCard } from '../../../src/components/PostCard';
import { Empty, ErrorNote, Header, Loading, Screen } from '../../../src/components/ui';
import { fetchPost, fetchUserPosts, recordView } from '../../../src/lib/api';
import { getActivePost, setActivePost } from '../../../src/lib/autoplay';
import { useSession } from '../../../src/lib/session';
import { usePost } from '../../../src/lib/store';
import { errText } from '../../../src/lib/theme';

export default function PostScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const postId = String(id);
  const post = usePost(postId);
  const { me } = useSession();
  const [status, setStatus] = useState<'loading' | 'ready' | 'error' | 'missing'>(post ? 'ready' : 'loading');
  const [error, setError] = useState('');
  const [more, setMore] = useState<string[]>([]);
  // The post itself comes first in the list, so its video is tracked like the rest.
  const data = useMemo(() => [postId, ...more], [postId, more]);

  // The post most in view plays its video. Only while this screen is showing: a screen underneath leaves the choice alone.
  const inView = useRef<string | null>(null);
  const focused = useRef(false);
  const onViewable = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const top = viewableItems.find((v) => v.isViewable && typeof v.item === 'string');
    inView.current = top ? (top.item as string) : null;
    if (focused.current) setActivePost(inView.current);
  }).current;
  const viewConfig = useRef({ itemVisiblePercentThreshold: 50, minimumViewTime: 250 }).current;
  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      // Back on this screen: its own post in view plays again (null until the list has reported one).
      setActivePost(inView.current);
      return () => {
        focused.current = false;
        // Stop this screen's video, unless the next screen has already chosen its own.
        if (getActivePost() === inView.current) setActivePost(null);
      };
    }, []),
  );

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
          data={data}
          keyExtractor={(x) => x}
          renderItem={({ item, index }) =>
            index === 0 ? (
              <>
                <PostCard id={item} />
                {more.length ? <SectionTitle>{`More from ${post?.username ?? 'this account'}`}</SectionTitle> : null}
              </>
            ) : (
              <PostCard id={item} />
            )
          }
          extraData={post?.username}
          contentContainerStyle={{ paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          onViewableItemsChanged={onViewable}
          viewabilityConfig={viewConfig}
        />
      )}
    </Screen>
  );
}
