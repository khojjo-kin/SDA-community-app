import React, { useCallback, useEffect, useState } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Reel } from '../../../src/components/Reel';
import { Empty, IconButton, Loading } from '../../../src/components/ui';
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

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      {post ? <Reel id={postId} active={focused} width={width} height={height} bottomInset={insets.bottom + 8} /> : checked ? <View style={{ flex: 1, justifyContent: 'center' }}><Empty title="This video isn't available" body="It may have been deleted." /></View> : <View style={{ flex: 1, justifyContent: 'center' }}><Loading /></View>}
      <View style={{ position: 'absolute', top: insets.top + 4, left: 8 }}>
        <IconButton name="back" label="Back" color="#fff" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
      </View>
    </View>
  );
}
