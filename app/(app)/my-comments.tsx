import React, { useCallback, useRef, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { thumbOf } from '../../src/components/Grid';
import { Empty, ErrorNote, Loading, Screen, ScreenHeader } from '../../src/components/ui';
import { fetchMyComments } from '../../src/lib/api';
import { useSession } from '../../src/lib/session';
import { getPostNow } from '../../src/lib/store';
import { agoLong, C, errText } from '../../src/lib/theme';
import type { Comment } from '../../src/lib/types';

export default function MyComments() {
  const { me } = useSession();
  const router = useRouter();
  const [list, setList] = useState<Comment[] | null>(null);
  const [error, setError] = useState('');

  // Fetched again each time the screen comes back; what is showing stays if that fails.
  const load = useCallback(async () => {
    try {
      const rows = await fetchMyComments(me);
      setList(rows);
      setError('');
    } catch (e) {
      setError(errText(e));
    }
  }, [me]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  // One tap, one screen: a second tap while the first screen is still opening is ignored.
  const lastOpen = useRef(0);
  const open = (postId: string) => {
    const now = Date.now();
    if (now - lastOpen.current < 600) return;
    lastOpen.current = now;
    router.push(`/comments/${postId}`);
  };

  return (
    <Screen>
      <ScreenHeader title="Comments" />
      {list === null ? (
        error ? <ErrorNote message={error} onRetry={() => { setError(''); load(); }} /> : <Loading />
      ) : (
        <FlatList
          data={list}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ paddingBottom: 40 }}
          ListEmptyComponent={<Empty icon="comment" title="No comments yet" />}
          renderItem={({ item: c }) => {
            const post = getPostNow(c.post_id);
            const thumb = post ? thumbOf(post) : undefined;
            return (
              <Pressable onPress={() => open(c.post_id)} accessibilityRole="button" accessibilityLabel={`Your comment: ${c.text}`} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: pressed ? C.press : 'transparent' })}>
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={3} style={{ color: C.fg, fontSize: 15, lineHeight: 21 }}>{c.text}</Text>
                  <Text numberOfLines={1} style={{ color: C.fg2, fontSize: 13, marginTop: 2 }}>{post ? `On ${post.username}'s post · ` : ''}{agoLong(c.created_at)}</Text>
                </View>
                <Image source={thumb ? { uri: thumb } : undefined} style={{ width: 48, height: 48, borderRadius: 8, backgroundColor: C.surface2 }} contentFit="cover" transition={120} cachePolicy="memory-disk" recyclingKey={c.id} />
              </Pressable>
            );
          }}
        />
      )}
    </Screen>
  );
}
