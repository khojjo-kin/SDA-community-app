import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, SectionList, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { SectionTitle } from '../../src/components/Grid';
import { Avatar, Button, Empty, ErrorNote, Header, Loading, Screen, useToast } from '../../src/components/ui';
import { fetchNotices, markNoticesRead, setFollow } from '../../src/lib/api';
import { useSession } from '../../src/lib/session';
import { ago, C, errText } from '../../src/lib/theme';
import type { Notice } from '../../src/lib/types';

const VERB: Record<Notice['kind'], string> = { like: 'liked your post.', comment: 'commented:', follow: 'started following you.', repost: 'reposted your post.' };

export default function Notifications() {
  const { me } = useSession();
  const router = useRouter();
  const toast = useToast();
  const [list, setList] = useState<Notice[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setList(await fetchNotices());
      setStatus('ready');
      markNoticesRead(me);
    } catch (e) {
      setError(errText(e));
      setStatus((s) => (s === 'ready' ? 'ready' : 'error'));
    } finally {
      setRefreshing(false);
    }
  }, [me]);

  useEffect(() => {
    load();
  }, [load]);

  function follow(n: Notice) {
    setList((cur) => cur.map((x) => (x.actor_id === n.actor_id ? { ...x, is_following: true } : x)));
    setFollow(me, n.actor_id, true).catch((e) => {
      toast(errText(e));
      load();
    });
  }

  const day = 86400e3;
  const fresh = list.filter((n) => Date.now() - new Date(n.created_at).getTime() < day);
  const older = list.filter((n) => Date.now() - new Date(n.created_at).getTime() >= day);
  const sections = [
    { title: 'New', data: fresh },
    { title: 'Earlier', data: older },
  ].filter((s) => s.data.length);

  return (
    <Screen>
      <Header title="Notifications" />
      {status === 'loading' ? (
        <Loading />
      ) : status === 'error' ? (
        <ErrorNote message={error} onRetry={() => { setStatus('loading'); load(); }} />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(n) => n.id}
          renderSectionHeader={({ section }) => <SectionTitle>{section.title}</SectionTitle>}
          stickySectionHeadersEnabled={false}
          renderItem={({ item: n }) => {
            const thumb = n.post_media ? (n.post_media.type === 'video' ? n.post_media.poster : n.post_media.url) : undefined;
            return (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 8 }}>
                <Pressable onPress={() => router.push(`/user/${n.actor_id}`)} accessibilityLabel={`Open ${n.username}'s profile`}>
                  <Avatar uri={n.avatar_url} name={n.full_name} size={46} />
                </Pressable>
                <Text style={{ flex: 1, color: C.fg, lineHeight: 20 }}>
                  <Text style={{ fontWeight: '600' }} onPress={() => router.push(`/user/${n.actor_id}`)}>{n.username}</Text> {VERB[n.kind]}
                  {n.kind === 'comment' && n.body ? ` ${n.body}` : ''} <Text style={{ color: C.fg2 }}>{ago(n.created_at)}</Text>
                </Text>
                {n.post_id ? (
                  <Pressable onPress={() => router.push(`/post/${n.post_id}`)} accessibilityRole="button" accessibilityLabel="Open post">
                    <Image source={thumb ? { uri: thumb } : undefined} style={{ width: 46, height: 46, borderRadius: 8, backgroundColor: C.surface2 }} contentFit="cover" />
                  </Pressable>
                ) : n.kind === 'follow' ? (
                  <Button small label={n.is_following ? 'Following' : 'Follow back'} kind={n.is_following ? 'ghost' : 'primary'} onPress={n.is_following ? () => router.push(`/user/${n.actor_id}`) : () => follow(n)} />
                ) : null}
              </View>
            );
          }}
          ListEmptyComponent={<Empty icon="heart" title="Activity on your posts" body="When someone likes, comments on or reposts your posts, or follows you, you'll see it here." />}
          contentContainerStyle={{ paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={C.fg2} />}
        />
      )}
    </Screen>
  );
}
