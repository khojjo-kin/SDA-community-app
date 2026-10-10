import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import { useFocusEffect, useRouter } from 'expo-router';
import { acceptFollowRequest, fetchLives, fetchReposts, fetchStats, fetchUserPosts, getProfile, openThread, recordProfileView, removeFollowRequest, report, requestFollow, setBlock, setCloseFriend, setFollow } from '../lib/api';
import { useSession } from '../lib/session';
import { prefetchLibrary } from '../lib/library';
import { listen } from '../lib/store';
import { C, errText, fmt } from '../lib/theme';
import type { Post, Profile } from '../lib/types';
import { PostGrid } from './Grid';
import { HighlightsRow } from './HighlightsRow';
import { Icon, IconName, VerifiedTick } from './Icon';
import { Avatar, Button, Empty, ErrorNote, Header, IconButton, Loading, Screen, Sheet, SheetRow, useToast } from './ui';

type Tab = 'grid' | 'reels' | 'reposts';
const TABS: { key: Tab; icon: IconName; label: string }[] = [
  { key: 'grid', icon: 'grid', label: 'Posts' },
  { key: 'reels', icon: 'reels', label: 'Reels' },
  { key: 'reposts', icon: 'repost', label: 'Reposts' },
];

function Stat({ n, label, onPress }: { n: number; label: string; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ flex: 1 }} accessibilityRole={onPress ? 'button' : undefined} accessibilityLabel={`${n} ${label}`}>
      <Text style={{ color: C.fg, fontSize: 18, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{fmt(n)}</Text>
      <Text style={{ color: C.fg, fontSize: 14 }}>{label}</Text>
    </Pressable>
  );
}

export function ProfileView({ userId, isTab }: { userId: string; isTab?: boolean }) {
  const { me } = useSession();
  const router = useRouter();
  const toast = useToast();
  const mine = userId === me;
  const [profile, setProfile] = useState<Profile | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [reposts, setReposts] = useState<Post[]>([]);
  const [tab, setTab] = useState<Tab>('grid');
  const [status, setStatus] = useState<'loading' | 'ready' | 'error' | 'missing'>('loading');
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [menu, setMenu] = useState(false);
  const [views, setViews] = useState<number | null>(null);
  /** The broadcast to open when the avatar is tapped while this person is live. */
  const [liveId, setLiveId] = useState<string | null>(null);
  // A look at someone else's profile is noted once per visit, after it has loaded.
  const viewed = useRef(false);

  const load = useCallback(async () => {
    try {
      const [p, own, rep] = await Promise.all([getProfile(userId), fetchUserPosts(userId), fetchReposts(userId)]);
      if (!p) {
        setStatus('missing');
        return;
      }
      setProfile(p);
      setPosts(own);
      setReposts(rep);
      setStatus('ready');
      if (mine && p.account_type === 'creator') {
        fetchStats(new Date(Date.now() - 30 * 86400e3), new Date())
          .then((s) => setViews(s.views))
          .catch(() => {});
      }
      if (!mine && !viewed.current) {
        viewed.current = true;
        recordProfileView(me, userId);
      }
      if (p.is_live) {
        fetchLives()
          .then((cards) => setLiveId(cards.find((c) => c.user_id === userId && !c.ended_at)?.id ?? null))
          .catch(() => setLiveId(null));
      } else {
        setLiveId(null);
      }
    } catch (e) {
      setError(errText(e));
      setStatus((s) => (s === 'ready' ? 'ready' : 'error'));
    } finally {
      setRefreshing(false);
    }
  }, [userId, mine, me]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );
  useEffect(() => listen('profile', () => { load(); }), [load]);

  async function follow() {
    if (!profile) return;
    const next = !profile.is_following;
    if (next && profile.is_private) return request();
    setProfile({ ...profile, is_following: next, followers_count: Math.max(0, profile.followers_count + (next ? 1 : -1)) });
    try {
      await setFollow(me, userId, next);
    } catch (e) {
      toast(errText(e));
      load();
    }
  }

  /** Asks a private account to let me follow. */
  async function request() {
    if (!profile) return;
    setProfile({ ...profile, requested: true });
    try {
      await requestFollow(me, userId);
      toast(`Requested to follow ${profile.username}`);
    } catch (e) {
      toast(errText(e));
    }
    load();
  }

  function withdraw() {
    if (!profile) return;
    Alert.alert('Withdraw your request?', `${profile.username} will no longer see that you asked to follow them.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Withdraw',
        style: 'destructive',
        onPress: async () => {
          setProfile((p) => (p ? { ...p, requested: false } : p));
          try {
            await removeFollowRequest(me, userId);
          } catch (e) {
            toast(errText(e));
          }
          load();
        },
      },
    ]);
  }

  /** Answers this person's request to follow me. */
  async function answer(accept: boolean) {
    if (!profile) return;
    setProfile({ ...profile, requests_me: false, follows_me: accept || profile.follows_me });
    try {
      if (accept) await acceptFollowRequest(userId);
      else await removeFollowRequest(userId, me);
      toast(accept ? `${profile.username} now follows you` : 'Request removed');
    } catch (e) {
      toast(errText(e));
    }
    load();
  }

  async function message() {
    try {
      const tid = await openThread(userId);
      router.push(`/chat/${tid}`);
    } catch (e) {
      toast(errText(e));
    }
  }

  const later = (fn: () => void) => () => {
    setMenu(false);
    setTimeout(fn, 380);
  };

  if (status === 'loading') return <Screen>{isTab ? null : <Header />}<Loading /></Screen>;
  if (status === 'error') return <Screen>{isTab ? null : <Header />}<ErrorNote message={error} onRetry={() => { setStatus('loading'); load(); }} /></Screen>;
  if (status === 'missing' || !profile) return <Screen><Header /><Empty icon="user" title="This account isn't available" body="It may have been deleted." /></Screen>;

  // A private account I do not follow: the stats show, the photos do not.
  const locked = !mine && profile.is_private && !profile.is_following;
  const list = tab === 'grid' ? posts : tab === 'reels' ? posts.filter((p) => p.kind === 'reel') : reposts;
  const emptyFor: Record<Tab, [string, string]> = {
    grid: mine ? ['Share your first photo', 'Tap + to add a post to your profile.'] : ['No posts yet', `When ${profile.username} posts, it will show up here.`],
    reels: mine ? ['Share your first reel', 'Videos you post appear here.'] : ['No reels yet', `Videos from ${profile.username} will show up here.`],
    reposts: ['No reposts yet', mine ? 'Posts you repost appear here.' : `Posts ${profile.username} reposts will show up here.`],
  };

  const head = (
    <View>
      <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 22 }}>
          <Pressable
            onPress={() => (liveId ? router.push(`/live/${liveId}`) : profile.has_story ? router.push(`/story/${userId}`) : mine ? router.push('/add-story') : undefined)}
            disabled={!liveId && !profile.has_story && !mine}
            accessibilityRole={liveId || profile.has_story || mine ? 'button' : 'image'}
            accessibilityLabel={liveId ? 'Watch live' : profile.has_story ? 'View story' : mine ? 'Add to your story' : 'Profile photo'}>
            <Avatar uri={profile.avatar_url} name={profile.full_name} size={profile.has_story ? 82 : 88} ring={profile.has_story ? 'new' : null} />
            {mine && !profile.has_story && !profile.is_live ? (
              <View style={{ position: 'absolute', right: -2, bottom: 0, width: 28, height: 28, borderRadius: 14, backgroundColor: C.fg, borderWidth: 3, borderColor: C.bg, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="plus" size={14} color={C.bg} weight={3} />
              </View>
            ) : null}
            {profile.is_live ? (
              <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: -4, alignItems: 'center' }}>
                <View style={{ height: 20, paddingHorizontal: 7, borderRadius: 6, backgroundColor: C.like, borderWidth: 2, borderColor: C.bg, justifyContent: 'center' }}>
                  <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800', letterSpacing: 0.6 }}>LIVE</Text>
                </View>
              </View>
            ) : null}
          </Pressable>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <Text numberOfLines={1} style={{ color: C.fg, fontSize: 16, fontWeight: '700', flexShrink: 1 }}>{profile.full_name}</Text>
              {profile.verified ? <VerifiedTick size={17} /> : null}
              {profile.pronouns ? <Text numberOfLines={1} style={{ color: C.fg2, fontSize: 14.5, flexShrink: 1 }}>{profile.pronouns}</Text> : null}
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Stat n={profile.posts_count} label="posts" />
              <Stat n={profile.followers_count} label="followers" onPress={() => router.push(`/people?id=${userId}&which=followers`)} />
              <Stat n={profile.following_count} label="following" onPress={() => router.push(`/people?id=${userId}&which=following`)} />
            </View>
          </View>
        </View>
        {mine ? (
          <Pressable
            onPress={() => {
              if (profile.plus) router.push('/profile-viewers');
              else {
                toast('Seeing who viewed your profile is part of Community Plus');
                router.push('/plus');
              }
            }}
            accessibilityRole="button"
            accessibilityLabel={`${fmt(profile.views_week)} profile ${profile.views_week === 1 ? 'view' : 'views'} this week. See who`}
            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, opacity: pressed ? 0.6 : 1 })}>
            <Icon name="eye" size={15} color={C.fg2} weight={2} />
            <Text numberOfLines={1} style={{ color: C.fg2, fontSize: 14, flexShrink: 1 }}>
              {fmt(profile.views_week)} profile {profile.views_week === 1 ? 'view' : 'views'} this week · <Text style={{ color: C.accent2, fontWeight: '600' }}>See who</Text>
            </Text>
          </Pressable>
        ) : null}
        {profile.admin_role === 'admin' || profile.plus || (profile.account_type === 'creator' && profile.category) ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 }}>
            {profile.plus ? (
              <Pressable onPress={() => (mine ? router.push('/plus') : undefined)} accessibilityRole={mine ? 'button' : 'text'} accessibilityLabel="Community Plus member" style={{ flexDirection: 'row', alignItems: 'center', gap: 4, height: 22, paddingHorizontal: 8, borderRadius: 11, backgroundColor: 'rgba(61,139,255,0.16)' }}>
                <Icon name="crown" size={13} color={C.close} weight={2.2} />
                <Text style={{ color: C.close, fontSize: 12.5, fontWeight: '700' }}>Plus</Text>
              </Pressable>
            ) : null}
            {/* The owner runs the app quietly: only appointed admins show a badge. */}
            {profile.admin_role === 'admin' ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, height: 22, paddingHorizontal: 8, borderRadius: 11, backgroundColor: 'rgba(31,191,90,0.16)' }}>
                <Icon name="shield" size={13} color={C.accent2} weight={2.2} />
                <Text style={{ color: C.accent2, fontSize: 12.5, fontWeight: '700' }}>Admin</Text>
              </View>
            ) : null}
            {profile.account_type === 'creator' && profile.category ? <Text style={{ color: C.fg2, fontSize: 15 }}>{profile.category}</Text> : null}
          </View>
        ) : null}
        {profile.bio ? <Text style={{ color: C.fg, marginTop: profile.admin_role === 'admin' || profile.plus || (profile.account_type === 'creator' && profile.category) ? 6 : 12, lineHeight: 20 }} selectable>{profile.bio}</Text> : null}
        {profile.church_name ? (
          <Pressable onPress={() => (profile.church_id ? router.push(`/church/${profile.church_id}`) : undefined)} accessibilityRole="button" accessibilityLabel={`Church: ${profile.church_name}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }}>
            <Icon name="church" size={15} color={C.fg2} weight={2} />
            <Text numberOfLines={1} style={{ color: C.fg2, fontSize: 14.5, flexShrink: 1 }}>{profile.church_name}</Text>
          </Pressable>
        ) : null}
        {profile.website ? (
          <Text style={{ color: C.accent2, marginTop: 4 }} numberOfLines={1} onPress={() => Linking.openURL(/^https?:\/\//.test(profile.website) ? profile.website : `https://${profile.website}`).catch(() => toast('That link could not be opened'))}>
            {profile.website.replace(/^https?:\/\//, '')}
          </Text>
        ) : null}
        {!mine && profile.follows_me ? <Text style={{ color: C.fg3, marginTop: 6, fontSize: 13 }}>Follows you</Text> : null}

        {mine && profile.account_type === 'creator' ? (
          <Pressable onPress={() => router.push('/dashboard')} accessibilityRole="button" accessibilityLabel="Your dashboard" style={({ pressed }) => ({ marginTop: 14, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12, backgroundColor: pressed ? C.surface2 : C.surface })}>
            <Text style={{ color: C.fg, fontWeight: '700', fontSize: 15.5 }}>Your dashboard</Text>
            <Text style={{ color: C.fg2, marginTop: 2, fontSize: 14 }}>{views === null ? 'Views, followers and your tools.' : `${fmt(views)} ${views === 1 ? 'view' : 'views'} in the last 30 days.`}</Text>
          </Pressable>
        ) : null}

        {!mine && !profile.is_blocked && profile.requests_me ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, backgroundColor: C.surface }}>
            <Text numberOfLines={2} style={{ flex: 1, color: C.fg, fontSize: 14.5, lineHeight: 19 }}>
              <Text style={{ fontWeight: '700' }}>{profile.username}</Text> wants to follow you
            </Text>
            <Button small label="Accept" onPress={() => answer(true)} />
            <Button small kind="ghost" label="Decline" onPress={() => answer(false)} />
          </View>
        ) : null}

        <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
          {mine ? (
            <>
              <Button small kind="ghost" label="Edit profile" style={{ flex: 1 }} onPress={() => router.push('/edit-profile')} />
              <Button small kind="ghost" label="Share profile" style={{ flex: 1 }} onPress={() => Clipboard.setStringAsync(`community://user/${userId}`).then(() => toast('Profile link copied'))} />
              <Pressable
                onPress={() => router.push('/settings')}
                accessibilityRole="button"
                accessibilityLabel="Settings and activity"
                style={({ pressed }) => ({ width: 40, height: 32, borderRadius: 10, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.75 : 1 })}>
                <Icon name="settings" size={19} color={C.fg} weight={2} />
              </Pressable>
            </>
          ) : profile.is_blocked ? (
            <Button small kind="ghost" label="Unblock" style={{ flex: 1 }} onPress={() => setBlock(me, userId, false).then(() => { toast(`Unblocked ${profile.username}`); load(); }).catch((e) => toast(errText(e)))} />
          ) : (
            <>
              {profile.is_following ? (
                <Button small kind="ghost" label="Following" style={{ flex: 1 }} onPress={follow} />
              ) : profile.requested ? (
                <Button small kind="ghost" label="Requested" style={{ flex: 1 }} onPress={withdraw} />
              ) : profile.is_private ? (
                <Button small label="Request" style={{ flex: 1 }} onPress={request} />
              ) : (
                <Button small label={profile.follows_me ? 'Follow back' : 'Follow'} style={{ flex: 1 }} onPress={follow} />
              )}
              <Button small kind="ghost" label="Message" style={{ flex: 1 }} onPress={message} />
            </>
          )}
        </View>
        {!mine && !profile.is_blocked && (profile.contact_email || profile.contact_phone) ? (
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
            {profile.contact_email ? <Button small kind="ghost" label="Email" style={{ flex: 1 }} onPress={() => Linking.openURL(`mailto:${profile.contact_email}`).catch(() => toast('Mail could not be opened'))} /> : null}
            {profile.contact_phone ? <Button small kind="ghost" label="Call" style={{ flex: 1 }} onPress={() => Linking.openURL(`tel:${profile.contact_phone.replace(/\s+/g, '')}`).catch(() => toast('The phone could not be opened'))} /> : null}
          </View>
        ) : null}
      </View>

      {profile.is_blocked || locked ? null : <HighlightsRow userId={userId} mine={mine} refreshKey={refreshKey} />}

      {locked ? (
        <View style={{ height: 14 }} />
      ) : (
        <View style={{ flexDirection: 'row', marginTop: 14 }} accessibilityRole="tablist">
          {TABS.map((t) => (
            <Pressable key={t.key} onPress={() => setTab(t.key)} accessibilityRole="tab" accessibilityLabel={t.label} accessibilityState={{ selected: tab === t.key }} style={{ flex: 1, height: 46, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 1.5, borderBottomColor: tab === t.key ? C.fg : 'transparent' }}>
              <Icon name={t.icon} color={tab === t.key ? C.fg : C.fg3} />
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );

  // The same shape as Header, with room for a lock next to the username on a private account.
  const left = mine && isTab ? <IconButton name="plus" size={28} label="Create" onPress={() => { prefetchLibrary(); router.push('/create'); }} /> : <IconButton name="back" label="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />;
  const right = mine ? <IconButton name="menu" size={26} label="Settings and activity" onPress={() => router.push('/settings')} /> : <IconButton name="more" label="More options" onPress={() => setMenu(true)} />;

  return (
    <Screen>
      <View style={{ height: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, gap: 6 }}>
        {left}
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }} accessible accessibilityRole="header" accessibilityLabel={profile.is_private ? `${profile.username}, private account` : profile.username}>
          {profile.is_private ? <Icon name="lock" size={15} color={C.fg2} weight={2.2} /> : null}
          <Text numberOfLines={1} style={{ color: C.fg, fontSize: 18, fontWeight: '700', flexShrink: 1 }}>{profile.username}</Text>
        </View>
        {right}
      </View>
      <PostGrid
        posts={profile.is_blocked || locked ? [] : list}
        header={head}
        refreshing={refreshing}
        onRefresh={() => { setRefreshing(true); setRefreshKey((k) => k + 1); load(); }}
        empty={
          profile.is_blocked ? (
            <Empty title="You blocked this account" body="Unblock them to see their posts." />
          ) : locked ? (
            <Empty icon="lock" title="This account is private" body="Follow to see their photos and videos" />
          ) : (
            <Empty title={emptyFor[tab][0]} body={emptyFor[tab][1]} />
          )
        }
      />

      <Sheet visible={menu} onClose={() => setMenu(false)}>
        <SheetRow first icon="link" label="Copy profile link" onPress={later(() => { Clipboard.setStringAsync(`community://user/${userId}`).then(() => toast('Profile link copied')); })} />
        {profile.is_blocked ? null : (
          <SheetRow
            icon="star"
            label={profile.is_close_friend ? 'Remove from close friends' : 'Add to close friends'}
            onPress={later(() => {
              const next = !profile.is_close_friend;
              setCloseFriend(me, userId, next)
                .then(() => {
                  setProfile({ ...profile, is_close_friend: next });
                  toast(next ? `${profile.username} is now a close friend` : `Removed ${profile.username} from close friends`);
                })
                .catch((e) => toast(errText(e)));
            })}
          />
        )}
        <SheetRow
          icon="flag"
          label="Report"
          danger
          onPress={later(() =>
            Alert.alert('Report this account', 'Why are you reporting it?', [
              ...['Spam', 'Pretending to be someone else', 'Harassment or hate', 'Something else'].map((r) => ({ text: r, onPress: () => { report(me, { userId }, r).then(() => toast('Thanks. We will review this account.')).catch((e) => toast(errText(e))); } })),
              { text: 'Cancel', style: 'cancel' as const },
            ]),
          )}
        />
        <SheetRow
          icon="block"
          label={profile.is_blocked ? `Unblock ${profile.username}` : `Block ${profile.username}`}
          danger
          onPress={later(() => {
            if (profile.is_blocked) {
              setBlock(me, userId, false).then(() => { toast(`Unblocked ${profile.username}`); load(); }).catch((e) => toast(errText(e)));
              return;
            }
            Alert.alert(`Block ${profile.username}?`, 'You will stop seeing their posts, stories and comments. They are not told.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Block', style: 'destructive', onPress: () => { setBlock(me, userId, true).then(() => { toast(`Blocked ${profile.username}`); load(); }).catch((e) => toast(errText(e))); } },
            ]);
          })}
        />
      </Sheet>
    </Screen>
  );
}
