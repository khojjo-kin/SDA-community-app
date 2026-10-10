import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, SectionList, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { SectionTitle } from '../../src/components/Grid';
import { VerifiedTick } from '../../src/components/Icon';
import { Avatar, Button, Empty, ErrorNote, Header, Loading, Row, Screen, useToast } from '../../src/components/ui';
import { acceptFollowRequest, fetchFollowRequests, fetchNotices, markNoticesRead, removeFollowRequest, setFollow } from '../../src/lib/api';
import { useSession } from '../../src/lib/session';
import { ago, C, errText } from '../../src/lib/theme';
import type { Notice } from '../../src/lib/types';

const VERB: Record<Notice['kind'], string> = {
  like: 'liked your post.',
  comment: 'commented:',
  follow: 'started following you.',
  repost: 'reposted your post.',
  request: 'wants to follow you.',
  accept: 'accepted your follow request.',
};

export default function Notifications() {
  const { me } = useSession();
  const router = useRouter();
  const toast = useToast();
  const [list, setList] = useState<Notice[]>([]);
  /** Who is still waiting for an answer, so a request notice only offers Accept and Decline while it is open. */
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [notices, requests] = await Promise.all([fetchNotices(), fetchFollowRequests(me).catch(() => [])]);
      setList(notices);
      setPending(new Set(requests.map((r) => r.id)));
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

  function answer(n: Notice, accept: boolean) {
    setPending((cur) => {
      const next = new Set(cur);
      next.delete(n.actor_id);
      return next;
    });
    (accept ? acceptFollowRequest(n.actor_id) : removeFollowRequest(n.actor_id, me))
      .then(() => toast(accept ? `${n.username} now follows you` : 'Request removed'))
      .catch((e) => toast(errText(e)))
      .finally(load);
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
                  <Text style={{ fontWeight: '600' }} onPress={() => router.push(`/user/${n.actor_id}`)}>{n.username}</Text>
                  {n.verified ? <Text> <VerifiedTick size={13} /></Text> : null} {VERB[n.kind]}
                  {n.kind === 'comment' && n.body ? ` ${n.body}` : ''} <Text style={{ color: C.fg2 }}>{ago(n.created_at)}</Text>
                </Text>
                {n.post_id ? (
                  <Pressable onPress={() => router.push(`/post/${n.post_id}`)} accessibilityRole="button" accessibilityLabel="Open post">
                    <Image source={thumb ? { uri: thumb } : undefined} style={{ width: 46, height: 46, borderRadius: 8, backgroundColor: C.surface2 }} contentFit="cover" />
                  </Pressable>
                ) : n.kind === 'follow' ? (
                  <Button small label={n.is_following ? 'Following' : 'Follow back'} kind={n.is_following ? 'ghost' : 'primary'} onPress={n.is_following ? () => router.push(`/user/${n.actor_id}`) : () => follow(n)} />
                ) : n.kind === 'request' && pending.has(n.actor_id) ? (
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    <Button small label="Accept" onPress={() => answer(n, true)} />
                    <Button small kind="ghost" label="Decline" onPress={() => answer(n, false)} />
                  </View>
                ) : null}
              </View>
            );
          }}
          ListHeaderComponent={
            pending.size ? (
              <View style={{ paddingTop: 4 }}>
                <Row icon="request" title="Follow requests" sub={`${pending.size} ${pending.size === 1 ? 'request' : 'requests'}`} onPress={() => router.push('/follow-requests')} />
              </View>
            ) : null
          }
          ListEmptyComponent={<Empty icon="heart" title="Activity on your posts" body="When someone likes, comments on or reposts your posts, or follows you, you'll see it here." />}
          contentContainerStyle={{ paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={C.fg2} />}
        />
      )}
    </Screen>
  );
}
