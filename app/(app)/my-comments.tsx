import React, { useCallback, useState } from 'react';
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

  const load = useCallback(async () => {
    try {
      setError('');
      setList(await fetchMyComments(me));
    } catch (e) {
      setError(errText(e));
      setList([]);
    }
  }, [me]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return (
    <Screen>
      <ScreenHeader title="Comments" />
      {list === null ? (
        <Loading />
      ) : error ? (
        <ErrorNote message={error} onRetry={load} />
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
              <Pressable onPress={() => router.push(`/comments/${c.post_id}`)} accessibilityRole="button" accessibilityLabel={`Your comment: ${c.text}`} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: pressed ? C.press : 'transparent' })}>
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={3} style={{ color: C.fg, fontSize: 15.5, lineHeight: 21 }}>{c.text}</Text>
                  <Text style={{ color: C.fg2, fontSize: 13, marginTop: 2 }}>{post ? `On ${post.username}'s post · ` : ''}{agoLong(c.created_at)}</Text>
                </View>
                <Image source={thumb ? { uri: thumb } : undefined} style={{ width: 48, height: 48, borderRadius: 8, backgroundColor: C.surface2 }} contentFit="cover" />
              </Pressable>
            );
          }}
        />
      )}
    </Screen>
  );
}
