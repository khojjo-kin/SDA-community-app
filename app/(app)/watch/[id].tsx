import React, { useCallback, useEffect, useState } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DarkEmpty, DarkLoading, DarkStatusBar } from '../../../src/components/OnDark';
import { Reel } from '../../../src/components/Reel';
import { IconButton } from '../../../src/components/ui';
import { fetchPost } from '../../../src/lib/api';
import { usePost } from '../../../src/lib/store';

export default function Watch() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const postId = String(id);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const post = usePost(postId);
  const [checked, setChecked] = useState(!!post);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    fetchPost(postId).catch(() => {}).finally(() => setChecked(true));
  }, [postId]);

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
      {post ? <Reel id={postId} active={focused} width={width} height={height} bottomInset={insets.bottom + 8} /> : checked ? <View style={{ flex: 1, justifyContent: 'center' }}><DarkEmpty title="This video isn't available" body="It may have been deleted." /></View> : <View style={{ flex: 1, justifyContent: 'center' }}><DarkLoading /></View>}
      <View style={{ position: 'absolute', top: insets.top + 4, left: 8 }}>
        <IconButton name="back" label="Back" color="#fff" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
      </View>
    </View>
  );
}
