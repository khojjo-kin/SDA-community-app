import React, { useCallback, useEffect, useState } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DarkEmpty, DarkErrorNote, DarkLoading, DarkStatusBar } from '../../../src/components/OnDark';
import { Reel } from '../../../src/components/Reel';
import { IconButton } from '../../../src/components/ui';
import { fetchPost } from '../../../src/lib/api';
import { usePost } from '../../../src/lib/store';
import { errText } from '../../../src/lib/theme';

export default function Watch() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const postId = String(id);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const post = usePost(postId);
  // 'missing': the server says there is no such post (deleted, or not for this account). 'error': it couldn't be asked.
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'error'>(post ? 'ready' : 'loading');
  const [error, setError] = useState('');
  const [focused, setFocused] = useState(false);

  const load = useCallback(() => {
    let live = true;
    fetchPost(postId)
      .then((p) => {
        if (live) setState(p ? 'ready' : 'missing');
      })
      .catch((e) => {
        if (!live) return;
        setError(errText(e));
        // A copy already on screen stays; only an empty screen says it didn't load.
        setState((cur) => (cur === 'ready' ? cur : 'error'));
      });
    return () => {
      live = false;
    };
  }, [postId]);

  useEffect(() => load(), [load]);

  // Captions are made in the background after a clip is shared. While they're on their way, look again
  // now and then (a few times at most), so they appear without leaving and coming back.
  const captionsPending = post?.captions_status === 'pending';
  useEffect(() => {
    if (!captionsPending || !focused) return;
    let tries = 0;
    const timer = setInterval(() => {
      tries++;
      fetchPost(postId).catch(() => {});
      if (tries >= 6) clearInterval(timer);
    }, 10000);
    return () => clearInterval(timer);
  }, [captionsPending, focused, postId]);

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <DarkStatusBar />
      {post ? (
        <Reel id={postId} active={focused} width={width} height={height} bottomInset={insets.bottom + 8} />
      ) : (
        <View style={{ flex: 1, justifyContent: 'center' }}>
          {state === 'missing' ? (
            <DarkEmpty icon="video" title="This video isn't available" />
          ) : state === 'error' ? (
            <DarkErrorNote
              message={error}
              onRetry={() => {
                setState('loading');
                load();
              }}
            />
          ) : (
            <DarkLoading />
          )}
        </View>
      )}
      <View style={{ position: 'absolute', top: insets.top + 4, left: 8 }}>
        <IconButton name="back" label="Back" color="#fff" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
      </View>
    </View>
  );
}
