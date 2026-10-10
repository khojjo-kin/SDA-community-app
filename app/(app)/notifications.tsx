import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, SectionList, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { SectionTitle } from '../../src/components/Grid';
import { Icon, IconName, VerifiedTick } from '../../src/components/Icon';
import { RowsSkeleton, SlowLine } from '../../src/components/Skeleton';
import { Avatar, Button, Empty, ErrorNote, Header, Row, Screen, useToast } from '../../src/components/ui';
import { acceptFollowRequest, fetchFollowRequests, fetchNotices, markNoticesRead, removeFollowRequest, setFollow } from '../../src/lib/api';
import { type Key, useT } from '../../src/lib/i18n';
import { useSession } from '../../src/lib/session';
import { ago, C, errText } from '../../src/lib/theme';
import type { Notice } from '../../src/lib/types';

/** What each kind of notice says after the person's name. Keys, looked up as the list draws. */
const VERB: Record<Notice['kind'], Key> = {
  like: 'notifications.like',
  comment: 'notifications.comment',
  follow: 'notifications.follow',
  repost: 'notifications.repost',
  request: 'notifications.request',
  accept: 'notifications.accept',
  new_post: 'notifications.newPost',
  new_clip: 'notifications.newClip',
  new_story: 'notifications.newStory',
  live: 'notifications.live',
  story_watch: 'notifications.storyWatch',
  subscriber: 'notifications.subscriber',
};

/** Where tapping a notification goes. Null when there is nothing more to open than the person. */
function targetOf(n: Notice): string | null {
  switch (n.kind) {
    case 'new_clip':
      // A clip opens full screen, the way clips are watched.
      return n.post_id ? `/watch/${n.post_id}` : null;
    case 'like':
    case 'comment':
    case 'repost':
    case 'new_post':
      return n.post_id ? `/post/${n.post_id}` : null;
    case 'new_story':
      return `/story/${n.actor_id}`;
    case 'story_watch':
      // The story they watched was yours, so their own story is the wrong place: open the person instead.
      return `/user/${n.actor_id}`;
    case 'live':
      // The live's id travels in the body. Without it, their profile shows whether they're still on.
      return n.body ? `/live/${n.body}` : `/user/${n.actor_id}`;
    default:
      return `/user/${n.actor_id}`;
  }
}

/** A round badge on the right of a row, for notices without a post to show. */
function Badge({ icon, color, bg, label }: { icon: IconName; color: string; bg: string; label: string }) {
  return (
    <View accessibilityLabel={label} style={{ width: 46, height: 46, borderRadius: 14, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={icon} size={22} color={color} weight={2.1} />
    </View>
  );
}

export default function Notifications() {
  const { me } = useSession();
  const router = useRouter();
  const toast = useToast();
  const t = useT();
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
      .then(() => toast(accept ? t('common.nowFollowsYou', { username: n.username }) : t('common.requestRemoved')))
      .catch((e) => toast(errText(e)))
      .finally(load);
  }

  /** What sits on the right of a row: the post, a badge, or a button to answer with. */
  function side(n: Notice, open: () => void): React.ReactNode {
    if (n.post_id) {
      const thumb = n.post_media ? (n.post_media.type === 'video' ? n.post_media.poster : n.post_media.url) : undefined;
      const video = n.kind === 'new_clip' || n.post_media?.type === 'video';
      return (
        <Pressable onPress={open} accessibilityRole="button" accessibilityLabel={n.kind === 'new_clip' ? t('notifications.watchClip') : t('notifications.openPost')}>
          <Image source={thumb ? { uri: thumb } : undefined} style={{ width: 46, height: 46, borderRadius: 8, backgroundColor: C.surface2 }} contentFit="cover" />
          {video ? (
            <View pointerEvents="none" style={{ position: 'absolute', right: 3, bottom: 3, width: 18, height: 18, borderRadius: 9, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="play" size={10} color="#fff" />
            </View>
          ) : null}
        </Pressable>
      );
    }
    switch (n.kind) {
      case 'follow':
        return <Button small label={n.is_following ? t('common.following') : t('common.followBack')} kind={n.is_following ? 'ghost' : 'primary'} onPress={n.is_following ? () => router.push(`/user/${n.actor_id}`) : () => follow(n)} />;
      case 'request':
        return pending.has(n.actor_id) ? (
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <Button small label={t('common.accept')} onPress={() => answer(n, true)} />
            <Button small kind="ghost" label={t('common.decline')} onPress={() => answer(n, false)} />
          </View>
        ) : null;
      case 'live':
        return (
          <View accessibilityLabel={t('notifications.liveBadge')} style={{ height: 24, paddingHorizontal: 8, borderRadius: 7, backgroundColor: C.like, justifyContent: 'center' }}>
            <Text style={{ color: '#fff', fontSize: 11, fontWeight: '800', letterSpacing: 0.8 }}>{t('common.live')}</Text>
          </View>
        );
      case 'new_story':
      case 'story_watch':
        return <Badge icon="story" color={C.accent2} bg={C.accentSoft} label={t('notifications.storyBadge')} />;
      case 'subscriber':
        return <Badge icon="crown" color={C.accent2} bg={C.accentSoft} label={t('notifications.subscriberBadge')} />;
      default:
        return null;
    }
  }

  const day = 86400e3;
  const fresh = list.filter((n) => Date.now() - new Date(n.created_at).getTime() < day);
  const older = list.filter((n) => Date.now() - new Date(n.created_at).getTime() >= day);
  const sections = [
    { title: t('notifications.sectionNew'), data: fresh },
    { title: t('notifications.sectionEarlier'), data: older },
  ].filter((s) => s.data.length);

  return (
    <Screen>
      <Header title={t('common.notifications')} />
      <SlowLine active={refreshing} />
      {status === 'loading' ? (
        <RowsSkeleton count={9} avatar={46} padY={8} trailing="square" />
      ) : status === 'error' ? (
        <ErrorNote message={error} onRetry={() => { setStatus('loading'); load(); }} />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(n) => n.id}
          renderSectionHeader={({ section }) => <SectionTitle>{section.title}</SectionTitle>}
          stickySectionHeadersEnabled={false}
          renderItem={({ item: n }) => {
            const target = targetOf(n);
            const open = () => router.push((target ?? `/user/${n.actor_id}`) as any);
            // A story or a live: the face wears a ring, as it does in the story tray.
            const ring = n.kind === 'new_story' ? 'new' : null;
            const verb = t(VERB[n.kind]);
            return (
              <Pressable onPress={open} accessibilityRole="button" accessibilityLabel={`${n.username} ${verb}`} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: pressed ? C.press : 'transparent' })}>
                <Pressable onPress={() => router.push(n.kind === 'new_story' ? `/story/${n.actor_id}` : `/user/${n.actor_id}`)} accessibilityLabel={t(n.kind === 'new_story' ? 'notifications.openStory' : 'notifications.openProfile', { username: n.username })}>
                  {n.kind === 'live' ? (
                    <View style={{ padding: 2, borderRadius: 30, borderWidth: 2, borderColor: C.like }}>
                      <Avatar uri={n.avatar_url} name={n.full_name} size={42} />
                    </View>
                  ) : (
                    <Avatar uri={n.avatar_url} name={n.full_name} size={ring ? 42 : 46} ring={ring} />
                  )}
                </Pressable>
                <Text style={{ flex: 1, color: C.fg, lineHeight: 20 }}>
                  <Text style={{ fontWeight: '600' }} onPress={() => router.push(`/user/${n.actor_id}`)}>{n.username}</Text>
                  {n.verified ? <Text> <VerifiedTick size={13} /></Text> : null} {verb}
                  {n.kind === 'comment' && n.body ? ` ${n.body}` : ''} <Text style={{ color: C.fg2 }}>{ago(n.created_at)}</Text>
                </Text>
                {side(n, open)}
              </Pressable>
            );
          }}
          ListHeaderComponent={
            pending.size ? (
              <View style={{ paddingTop: 4 }}>
                <Row icon="request" title={t('notifications.followRequests')} sub={t(pending.size === 1 ? 'notifications.requestsOne' : 'notifications.requests', { count: pending.size })} onPress={() => router.push('/follow-requests')} />
              </View>
            ) : null
          }
          ListEmptyComponent={<Empty icon="heart" title={t('notifications.emptyTitle')} body={t('notifications.emptyBody')} />}
          contentContainerStyle={{ paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={C.fg2} />}
        />
      )}
    </Screen>
  );
}
