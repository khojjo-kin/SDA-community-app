import React, { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { useAuth, useSession as useClerkSession } from '@clerk/clerk-expo';
import { useFocusEffect, useRouter } from 'expo-router';
import type { IconName } from '../../src/components/Icon';
import { Divider, Empty, Row, Screen, ScreenHeader, SearchField, SectionLabel, useToast } from '../../src/components/ui';
import { countCloseFriends, listBlocked } from '../../src/lib/api';
import { useSession } from '../../src/lib/session';
import { C, errText } from '../../src/lib/theme';

type Item = { icon: IconName; title: string; sub?: string; value?: string; href: string; words?: string };
type Section = { label: string; items: Item[] };

const REPLIES = { everyone: 'Everyone', following: 'People you follow', off: 'Off' } as const;

/** "Settings and activity": everything about your account in one list, with a search box on top. */
export default function Settings() {
  const { signOut } = useAuth();
  const { session } = useClerkSession();
  const { me, profile } = useSession();
  const router = useRouter();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [friends, setFriends] = useState<number | null>(null);
  const [blocked, setBlocked] = useState<number | null>(null);

  useFocusEffect(
    useCallback(() => {
      countCloseFriends(me).then(setFriends).catch(() => {});
      listBlocked(me).then((b) => setBlocked(b.length)).catch(() => {});
    }, [me]),
  );

  const creator = profile?.account_type === 'creator';
  const admin = !!profile?.admin_role;
  const plusValue = profile?.plus ? 'Active' : profile?.verified ? 'Verified' : undefined;
  const sections: Section[] = [
    {
      label: 'Your account',
      items: [
        { icon: 'account', title: 'Account', sub: 'Email, phone, password, other accounts and deleting your account', href: '/account', words: 'email phone password security delete personal details profile add account switch' },
        { icon: 'verified', title: 'Community Plus', sub: 'The verified tick and more', value: plusValue, href: '/plus', words: 'subscribe subscription verified tick badge premium' },
      ],
    },
    {
      label: 'Church life',
      items: [
        { icon: 'bible', title: 'Bible', href: '/bible', words: 'scripture read verse chapter kjv' },
        { icon: 'hymnal', title: 'Hymnal', sub: 'The Seventh-day Adventist Hymnal', href: '/hymnal', words: 'hymns songs sing worship music' },
        { icon: 'lesson', title: 'Sabbath School', sub: "This week's lesson", href: '/sabbath-school', words: 'lesson quarterly study guide' },
        { icon: 'church', title: 'Churches', sub: 'Find churches near you and their members', value: profile?.church_name ?? undefined, href: '/churches', words: 'church near me members find location' },
        { icon: 'users', title: 'Communities and pages', sub: 'Join groups, follow ministries, or start your own', href: '/groups', words: 'groups community page ministry choir youth join create follow' },
        { icon: 'sparkle', title: 'Erha', sub: 'Your church assistant', href: '/erha', words: 'ai assistant help chat ask' },
      ],
    },
    ...(admin
      ? [
          {
            label: 'Admin',
            items: [{ icon: 'gavel' as IconName, title: 'Admin tools', sub: 'Reports, members, requests and admins', href: '/admin', words: 'admin moderation reports members verify suspend hymns churches' }],
          },
        ]
      : []),
    {
      label: 'How you use Community',
      items: [
        { icon: 'bookmark', title: 'Saved', href: '/saved', words: 'bookmarks' },
        { icon: 'archive', title: 'Archive', href: '/archive', words: 'stories old expired' },
        { icon: 'activity', title: 'Your activity', href: '/activity', words: 'likes comments reposts history' },
        { icon: 'bell', title: 'Notifications', href: '/notifications', words: 'likes follows comments' },
      ],
    },
    {
      label: 'Who can see your content',
      items: [
        { icon: 'star', title: 'Close friends', value: friends === null ? undefined : String(friends), href: '/close-friends', words: 'stories list' },
        { icon: 'block', title: 'Blocked', value: blocked === null ? undefined : String(blocked), href: '/blocked', words: 'block unblock accounts' },
        { icon: 'story', title: 'Story replies', value: REPLIES[profile?.story_replies ?? 'everyone'], href: '/story-settings', words: 'stories reply messages' },
      ],
    },
    {
      label: 'Your app and media',
      items: [{ icon: 'camera', title: 'Story and camera', href: '/camera-settings', words: 'camera roll photos front camera toolbar reels sound' }],
    },
    {
      label: 'Your insights and tools',
      items: creator
        ? [
            { icon: 'chart', title: 'Dashboard', href: '/dashboard', words: 'insights views followers analytics' },
            { icon: 'tag', title: 'Creator tools and controls', href: '/creator', words: 'saved reply faq questions view counts category account type' },
          ]
        : [{ icon: 'chart', title: 'Account type and tools', sub: 'Switch to a creator account for insights, saved replies and more', href: '/account-type', words: 'creator professional dashboard insights' }],
    },
    {
      label: 'More info and support',
      items: [{ icon: 'info', title: 'About', href: '/about', words: 'version privacy data help' }],
    },
  ];

  function logOut() {
    Alert.alert('Log out of Community?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      // Only this account: any other account signed in on this phone stays, and Clerk switches to it.
      { text: 'Log out', style: 'destructive', onPress: () => { signOut(session ? { sessionId: session.id } : undefined).catch((e: unknown) => toast(errText(e))); } },
    ]);
  }

  const needle = q.trim().toLowerCase();
  const matches = needle ? sections.flatMap((s) => s.items).filter((i) => `${i.title} ${i.sub ?? ''} ${i.words ?? ''}`.toLowerCase().includes(needle)) : [];
  const row = (i: Item) => <Row key={i.href} icon={i.icon} title={i.title} sub={i.sub} value={i.value} onPress={() => router.push(i.href as any)} />;

  return (
    <Screen>
      <ScreenHeader title="Settings and activity" />
      <View style={{ paddingTop: 4, paddingBottom: 4 }}>
        <SearchField value={q} onChangeText={setQ} label="Search settings" />
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
        {needle ? (
          matches.length ? (
            <View style={{ paddingTop: 8 }}>{matches.map(row)}</View>
          ) : (
            <Empty title="No settings found" body="Try a different word." />
          )
        ) : (
          <>
            {sections.map((s) => (
              <View key={s.label}>
                <SectionLabel>{s.label}</SectionLabel>
                {s.items.map(row)}
                <Divider />
              </View>
            ))}
            <SectionLabel>Login</SectionLabel>
            <Pressable onPress={logOut} accessibilityRole="button" style={({ pressed }) => ({ paddingHorizontal: 16, minHeight: 48, justifyContent: 'center', backgroundColor: pressed ? 'rgba(255,255,255,0.05)' : 'transparent' })}>
              <Text style={{ color: '#ff4d67', fontSize: 17.5 }}>Log out</Text>
            </Pressable>
            <Text style={{ color: C.fg3, fontSize: 13, paddingHorizontal: 16, paddingTop: 6 }}>Logged in as {profile?.username}</Text>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}
