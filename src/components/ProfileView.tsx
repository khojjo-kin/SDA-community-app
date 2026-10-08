import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import { useFocusEffect, useRouter } from 'expo-router';
import { fetchReposts, fetchUserPosts, getProfile, openThread, report, setBlock, setFollow } from '../lib/api';
import { useSession } from '../lib/session';
import { listen } from '../lib/store';
import { C, errText, fmt } from '../lib/theme';
import type { Post, Profile } from '../lib/types';
import { PostGrid } from './Grid';
import { Icon, IconName } from './Icon';
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
  const [menu, setMenu] = useState(false);

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
    } catch (e) {
      setError(errText(e));
      setStatus((s) => (s === 'ready' ? 'ready' : 'error'));
    } finally {
      setRefreshing(false);
    }
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );
  useEffect(() => listen('profile', () => { load(); }), [load]);

  async function follow() {
    if (!profile) return;
    const next = !profile.is_following;
    setProfile({ ...profile, is_following: next, followers_count: Math.max(0, profile.followers_count + (next ? 1 : -1)) });
    try {
      await setFollow(me, userId, next);
    } catch (e) {
      toast(errText(e));
      load();
    }
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
            onPress={() => (profile.has_story ? router.push(`/story/${userId}`) : mine ? router.push('/create?mode=story') : undefined)}
            disabled={!profile.has_story && !mine}
            accessibilityRole={profile.has_story || mine ? 'button' : 'image'}
            accessibilityLabel={profile.has_story ? 'View story' : mine ? 'Add to your story' : 'Profile photo'}>
            <Avatar uri={profile.avatar_url} name={profile.full_name} size={profile.has_story ? 82 : 88} ring={profile.has_story ? 'new' : null} />
            {mine && !profile.has_story ? (
              <View style={{ position: 'absolute', right: -2, bottom: 0, width: 28, height: 28, borderRadius: 14, backgroundColor: C.fg, borderWidth: 3, borderColor: C.bg, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="plus" size={14} color={C.bg} weight={3} />
              </View>
            ) : null}
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={{ color: C.fg, fontSize: 16, fontWeight: '700', marginBottom: 8 }}>{profile.full_name}</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Stat n={profile.posts_count} label="posts" />
              <Stat n={profile.followers_count} label="followers" onPress={() => router.push(`/people?id=${userId}&which=followers`)} />
              <Stat n={profile.following_count} label="following" onPress={() => router.push(`/people?id=${userId}&which=following`)} />
            </View>
          </View>
        </View>
        {profile.bio ? <Text style={{ color: C.fg2, marginTop: 12, lineHeight: 20 }} selectable>{profile.bio}</Text> : null}
        {profile.website ? (
          <Text style={{ color: C.accent2, marginTop: 4 }} numberOfLines={1} onPress={() => Linking.openURL(/^https?:\/\//.test(profile.website) ? profile.website : `https://${profile.website}`).catch(() => toast('That link could not be opened'))}>
            {profile.website.replace(/^https?:\/\//, '')}
          </Text>
        ) : null}
        {!mine && profile.follows_me ? <Text style={{ color: C.fg3, marginTop: 6, fontSize: 13 }}>Follows you</Text> : null}
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
          {mine ? (
            <>
              <Button small kind="ghost" label="Edit profile" style={{ flex: 1 }} onPress={() => router.push('/edit-profile')} />
              <Button small kind="ghost" label="Share profile" style={{ flex: 1 }} onPress={() => Clipboard.setStringAsync(`community://user/${userId}`).then(() => toast('Profile link copied'))} />
            </>
          ) : profile.is_blocked ? (
            <Button small kind="ghost" label="Unblock" style={{ flex: 1 }} onPress={() => setBlock(me, userId, false).then(() => { toast(`Unblocked ${profile.username}`); load(); }).catch((e) => toast(errText(e)))} />
          ) : (
            <>
              <Button small kind={profile.is_following ? 'ghost' : 'primary'} label={profile.is_following ? 'Following' : profile.follows_me ? 'Follow back' : 'Follow'} style={{ flex: 1 }} onPress={follow} />
              <Button small kind="ghost" label="Message" style={{ flex: 1 }} onPress={message} />
            </>
          )}
        </View>
      </View>
      <View style={{ flexDirection: 'row', marginTop: 14 }} accessibilityRole="tablist">
        {TABS.map((t) => (
          <Pressable key={t.key} onPress={() => setTab(t.key)} accessibilityRole="tab" accessibilityLabel={t.label} accessibilityState={{ selected: tab === t.key }} style={{ flex: 1, height: 46, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 1.5, borderBottomColor: tab === t.key ? C.fg : 'transparent' }}>
            <Icon name={t.icon} color={tab === t.key ? C.fg : C.fg3} />
          </Pressable>
        ))}
      </View>
    </View>
  );

  return (
    <Screen>
      <Header
        title={profile.username}
        center
        left={mine && isTab ? <IconButton name="plus" size={28} label="New post" onPress={() => router.push('/create')} /> : undefined}
        right={mine ? <IconButton name="menu" size={26} label="Menu" onPress={() => setMenu(true)} /> : <IconButton name="more" label="More options" onPress={() => setMenu(true)} />}
      />
      <PostGrid posts={profile.is_blocked ? [] : list} header={head} refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} empty={profile.is_blocked ? <Empty title="You blocked this account" body="Unblock them to see their posts." /> : <Empty title={emptyFor[tab][0]} body={emptyFor[tab][1]} />} />

      <Sheet visible={menu} onClose={() => setMenu(false)}>
        {mine ? (
          <>
            <SheetRow icon="bookmark" label="Saved" onPress={later(() => router.push('/saved'))} />
            <SheetRow icon="heart" label="Your likes" onPress={later(() => router.push('/saved?which=liked'))} />
            <SheetRow icon="settings" label="Settings" sub="Log out, blocked accounts, delete account" onPress={later(() => router.push('/settings'))} />
          </>
        ) : (
          <>
            <SheetRow icon="link" label="Copy profile link" onPress={later(() => { Clipboard.setStringAsync(`community://user/${userId}`).then(() => toast('Profile link copied')); })} />
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
          </>
        )}
      </Sheet>
    </Screen>
  );
}
