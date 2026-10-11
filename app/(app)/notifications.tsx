import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, RefreshControl, SectionList, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { SectionTitle } from '../../src/components/Grid';
import { Icon, IconName, VerifiedTick } from '../../src/components/Icon';
import { RowsSkeleton, SlowLine } from '../../src/components/Skeleton';
import { Avatar, Button, Empty, ErrorNote, Header, Row, Screen, useToast } from '../../src/components/ui';
import { acceptFollowRequest, fetchFollowRequests, fetchNotices, followOrRequest, markNoticesRead, removeFollowRequest } from '../../src/lib/api';
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
  tag: 'notifications.tag',
  live_soon: 'notifications.liveSoon',
};

/** The groups, as on Instagram: what hadn't been seen before this visit, then by when it came. */
type Group = 'new' | 'today' | 'yesterday' | 'week' | 'month' | 'earlier';
const GROUPS: readonly { key: Group; title: Key }[] = [
  { key: 'new', title: 'notifications.sectionNew' },
  { key: 'today', title: 'notifications.sectionToday' },
  { key: 'yesterday', title: 'notifications.sectionYesterday' },
  { key: 'week', title: 'notifications.sectionThisWeek' },
  { key: 'month', title: 'notifications.sectionThisMonth' },
  { key: 'earlier', title: 'notifications.sectionEarlier' },
];

/** Where tapping a notification goes. Null when there is nothing more to open than the person. */
function targetOf(n: Notice): string | null {
  switch (n.kind) {
    case 'new_clip':
      // A clip opens full screen, the way clips are watched.
      return n.post_id ? `/watch/${n.post_id}` : null;
    case 'comment':
      // A comment opens where it was written, ready to answer.
      return n.post_id ? `/comments/${n.post_id}` : null;
    case 'like':
    case 'repost':
    case 'new_post':
    case 'tag':
      return n.post_id ? `/post/${n.post_id}` : null;
    case 'new_story':
      return `/story/${n.actor_id}`;
    case 'story_watch':
      // The story they watched was yours, so their own story is the wrong place: open the person instead.
      return `/user/${n.actor_id}`;
    case 'live':
    case 'live_soon':
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
  /** People asked to follow from here (their account is private): their button says Requested. */
  const [requested, setRequested] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const statusRef = useRef(status);
  statusRef.current = status;
  // What hadn't been seen when it arrived on this screen: it stays under New for this visit.
  const unseen = useRef(new Set<string>());
  // A follow on its way, so a second tap can't send another.
  const following = useRef(new Set<string>());

  const load = useCallback(async () => {
    try {
      const [notices, requests] = await Promise.all([fetchNotices(), fetchFollowRequests(me).catch(() => [])]);
      for (const n of notices) if (!n.read_at) unseen.current.add(n.id);
      setList(notices);
      setPending(new Set(requests.map((r) => r.id)));
      setStatus('ready');
      markNoticesRead(me).catch(() => {});
    } catch (e) {
      // Already showing the list: it stays, and the toast says the refresh didn't work.
      if (statusRef.current === 'ready') toast(errText(e));
      else {
        setError(errText(e));
        setStatus('error');
      }
    } finally {
      setRefreshing(false);
    }
  }, [me, toast]);

  useEffect(() => {
    load();
  }, [load]);

  // One tap, one screen: a second tap while the first screen is still opening is ignored.
  const lastOpen = useRef(0);
  const go = (href: string) => {
    const now = Date.now();
    if (now - lastOpen.current < 600) return;
    lastOpen.current = now;
    router.push(href as any);
  };

  const markFollowing = (actor: string, on: boolean) => setList((cur) => cur.map((x) => (x.actor_id === actor ? { ...x, is_following: on } : x)));

  function follow(n: Notice) {
    if (following.current.has(n.actor_id)) return;
    following.current.add(n.actor_id);
    // Following at once; a private account turns it into a request.
    markFollowing(n.actor_id, true);
    followOrRequest(me, n.actor_id)
      .then((now) => {
        if (now !== 'requested') return;
        markFollowing(n.actor_id, false);
        setRequested((cur) => new Set(cur).add(n.actor_id));
      })
      .catch((e) => {
        markFollowing(n.actor_id, false);
        toast(errText(e));
      })
      .finally(() => following.current.delete(n.actor_id));
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
      // A comment's row opens the comments; its picture opens the post itself.
      const openThumb = n.kind === 'comment' ? () => go(`/post/${n.post_id}`) : open;
      return (
        <Pressable onPress={openThumb} accessibilityRole="button" accessibilityLabel={n.kind === 'new_clip' ? t('notifications.watchClip') : t('notifications.openPost')} style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1 })}>
          <Image source={thumb ? { uri: thumb } : undefined} style={{ width: 46, height: 46, borderRadius: 8, backgroundColor: C.surface2 }} contentFit="cover" transition={120} cachePolicy="memory-disk" recyclingKey={n.id} />
          {video ? (
            <View pointerEvents="none" style={{ position: 'absolute', right: 3, bottom: 3, width: 18, height: 18, borderRadius: 9, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="play" size={10} color="#fff" />
            </View>
          ) : null}
        </Pressable>
      );
    }
    switch (n.kind) {
      case 'follow': {
        const asked = !n.is_following && requested.has(n.actor_id);
        const on = n.is_following || asked;
        return <Button small label={n.is_following ? t('common.following') : asked ? t('profile.requested') : t('common.followBack')} kind={on ? 'ghost' : 'primary'} onPress={on ? () => go(`/user/${n.actor_id}`) : () => follow(n)} />;
      }
      case 'request':
        return pending.has(n.actor_id) ? (
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <Button small label={t('common.accept')} onPress={() => answer(n, true)} />
            <Button small kind="ghost" label={t('common.decline')} onPress={() => answer(n, false)} />
          </View>
        ) : null;
      case 'live':
      case 'live_soon':
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

  // Grouped once per list (each date read once), not on every draw: answering requests draws this again.
  const sections = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const day = 86400e3;
    const groups = new Map<Group, Notice[]>();
    for (const n of list) {
      const at = new Date(n.created_at).getTime();
      const g: Group = unseen.current.has(n.id) ? 'new' : at >= today ? 'today' : at >= today - day ? 'yesterday' : at >= today - 6 * day ? 'week' : at >= today - 29 * day ? 'month' : 'earlier';
      const into = groups.get(g);
      if (into) into.push(n);
      else groups.set(g, [n]);
    }
    return GROUPS.filter((g) => groups.has(g.key)).map((g) => ({ key: g.key, title: t(g.title), data: groups.get(g.key) as Notice[] }));
  }, [list, t]);

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
            const open = () => go(target ?? `/user/${n.actor_id}`);
            // A story or a live: the face wears a ring, as it does in the story tray.
            const ring = n.kind === 'new_story' ? 'new' : null;
            // A kind this version of the app doesn't know yet shows just the name, rather than "undefined".
            const verb = VERB[n.kind] ? t(VERB[n.kind]) : '';
            return (
              <Pressable onPress={open} accessibilityRole="button" accessibilityLabel={`${n.username} ${verb}`} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: pressed ? C.press : 'transparent' })}>
                {/* One width for every face, ringed or not, so the words all start in the same place. */}
                <Pressable onPress={() => go(n.kind === 'new_story' ? `/story/${n.actor_id}` : `/user/${n.actor_id}`)} accessibilityLabel={t(n.kind === 'new_story' ? 'notifications.openStory' : 'notifications.openProfile', { username: n.username })} style={{ width: 52, height: 52, alignItems: 'center', justifyContent: 'center' }}>
                  {n.kind === 'live' || n.kind === 'live_soon' ? (
                    <View style={{ padding: 2, borderRadius: 30, borderWidth: 2, borderColor: C.like }}>
                      <Avatar uri={n.avatar_url} name={n.full_name} size={42} />
                    </View>
                  ) : (
                    <Avatar uri={n.avatar_url} name={n.full_name} size={ring ? 42 : 46} ring={ring} />
                  )}
                </Pressable>
                <Text numberOfLines={4} style={{ flex: 1, color: C.fg, fontSize: 14.5, lineHeight: 20 }}>
                  <Text style={{ fontWeight: '600' }} onPress={() => go(`/user/${n.actor_id}`)}>{n.username}</Text>
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
                <Row icon="request" title={t('notifications.followRequests')} sub={t(pending.size === 1 ? 'notifications.requestsOne' : 'notifications.requests', { count: pending.size })} onPress={() => go('/follow-requests')} />
              </View>
            ) : null
          }
          ListEmptyComponent={<Empty icon="heart" title={t('notifications.emptyTitle')} />}
          contentContainerStyle={{ paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={C.fg2} />}
        />
      )}
    </Screen>
  );
}
