import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { useAuth, useSession as useClerkSession } from '@clerk/clerk-expo';
import { useFocusEffect, useRouter } from 'expo-router';
import type { IconName } from '../../src/components/Icon';
import { Divider, Empty, Row, Screen, ScreenHeader, SearchField, SectionLabel, Toggle, useToast } from '../../src/components/ui';
import { countCloseFriends, listBlocked, updateProfile } from '../../src/lib/api';
import { fontById } from '../../src/lib/fonts';
import { usePrefs } from '../../src/lib/prefs';
import { useSession } from '../../src/lib/session';
import { C, errText } from '../../src/lib/theme';

/**
 * A line in the list. With `toggle`, it is a switch rather than a link; with `info`, it is only
 * words to read. `href` then only names it for the search. `plus` puts a small Plus label on it.
 */
type Item = { icon: IconName; title: string; sub?: string; value?: string; href: string; words?: string; toggle?: 'read_receipts' | 'streaks_enabled'; info?: boolean; plus?: boolean };
type Section = { label: string; items: Item[] };

/** The small label on a line that is a Community Plus perk. */
function PlusTag() {
  return (
    <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, backgroundColor: C.accent }}>
      <Text style={{ color: C.onAccent, fontSize: 11.5, fontWeight: '700' }}>Plus</Text>
    </View>
  );
}

const REPLIES = { everyone: 'Everyone', following: 'People you follow', off: 'Off' } as const;
const THEME_LABEL: Record<string, string> = { dark: 'Dark', white: 'White', green: 'Green' };

/** "Settings and activity": everything about your account in one list, with a search box on top. */
export default function Settings() {
  const { signOut } = useAuth();
  const { session } = useClerkSession();
  const { me, profile, refresh } = useSession();
  const router = useRouter();
  const toast = useToast();
  const { appFont, theme } = usePrefs();
  const [q, setQ] = useState('');
  const [friends, setFriends] = useState<number | null>(null);
  const [blocked, setBlocked] = useState<number | null>(null);
  // Read receipts: shown at once when tapped, then put back if the save fails.
  const [receipts, setReceipts] = useState(profile?.read_receipts ?? true);
  useEffect(() => { setReceipts(profile?.read_receipts ?? true); }, [profile?.read_receipts]);
  // Chat streaks, the same way.
  const [streaks, setStreaks] = useState(profile?.streaks_enabled ?? true);
  useEffect(() => { setStreaks(profile?.streaks_enabled ?? true); }, [profile?.streaks_enabled]);

  useFocusEffect(
    useCallback(() => {
      countCloseFriends(me).then(setFriends).catch(() => {});
      listBlocked(me).then((b) => setBlocked(b.length)).catch(() => {});
    }, [me]),
  );

  function setReadReceipts(next: boolean) {
    const before = receipts;
    setReceipts(next);
    updateProfile(me, { read_receipts: next }).then(refresh).catch((e) => { setReceipts(before); toast(errText(e)); });
  }

  function setStreaksEnabled(next: boolean) {
    const before = streaks;
    setStreaks(next);
    updateProfile(me, { streaks_enabled: next }).then(refresh).catch((e) => { setStreaks(before); toast(errText(e)); });
  }

  const creator = profile?.account_type === 'creator';
  const admin = !!profile?.admin_role;
  // Members under 14: no live broadcasts and no fundraisers, and a few things work differently.
  const restricted = profile?.restricted === true;
  const plusValue = profile?.plus ? 'Active' : profile?.verified ? 'Verified' : undefined;
  const sections: Section[] = [
    ...(restricted
      ? [
          {
            label: 'Safety',
            items: [
              {
                icon: 'shield' as IconName,
                title: 'Under-14 account',
                sub: "To keep you safe, your account stays private, sensitive posts are hidden, only people you follow can message you, you can only message people you follow, and Live and fundraisers aren't available.",
                href: '#under-14',
                words: 'under 14 age young child minor restricted safety private birthday',
                info: true,
              },
            ],
          },
        ]
      : []),
    {
      label: 'Your account',
      items: [
        { icon: 'account', title: 'Account', sub: 'Email, phone, password, other accounts and deleting your account', href: '/account', words: 'email phone password security delete personal details profile add account switch' },
        { icon: 'devices', title: 'Login activity', sub: "Where you're logged in", href: '/login-activity', words: 'sessions devices phones logged in log out security sign in where location' },
        { icon: 'crown', title: 'Community Plus', sub: 'Fonts, wallpapers, profile style and more', value: plusValue, href: '/plus', words: 'subscribe subscription premium plus fonts wallpaper profile style' },
        ...(profile?.verified ? [] : [{ icon: 'verified' as IconName, title: 'Request verification', sub: 'Get the blue tick with an ID check', href: '/verify', words: 'verify verified blue tick badge id identity check request' }]),
      ],
    },
    ...(profile?.plus
      ? [
          {
            label: 'Plus',
            items: [
              { icon: 'font' as IconName, title: 'App font', value: fontById(appFont).name, href: '/plus-font', words: 'typeface text nunito lora poppins' },
              { icon: 'wallpaper' as IconName, title: 'Chat wallpaper', href: '/chat-wallpaper', words: 'background messages chats theme' },
              { icon: 'eye' as IconName, title: 'Profile viewers', sub: 'Who looked at your profile', href: '/profile-viewers', words: 'views visitors who viewed' },
              { icon: 'lock' as IconName, title: 'Read receipts', sub: 'Let people see when you have read their messages', href: '/plus#read-receipts', words: 'seen messages chats privacy', toggle: 'read_receipts' as const },
            ],
          },
        ]
      : []),
    {
      label: 'Church life',
      items: [
        { icon: 'bible', title: 'Bible', href: '/bible', words: 'scripture read verse chapter kjv' },
        { icon: 'hymnal', title: 'Hymnal', sub: 'The Seventh-day Adventist Hymnal', href: '/hymnal', words: 'hymns songs sing worship music' },
        { icon: 'headphones', title: 'Pod', sub: 'Songs and podcasts', href: '/pod', words: 'music audio listen podcast episodes songs library' },
        { icon: 'lesson', title: 'Sabbath School', sub: "This week's lesson", href: '/sabbath-school', words: 'lesson quarterly study guide' },
        { icon: 'church', title: 'Churches', sub: 'Find churches near you and their members', value: profile?.church_name ?? undefined, href: '/churches', words: 'church near me members find location' },
        { icon: 'users', title: 'Communities and pages', sub: 'Join groups, follow ministries, or start your own', href: '/groups', words: 'groups community page ministry choir youth join create follow' },
      ],
    },
    ...(admin
      ? [
          {
            label: 'Admin',
            items: [
              { icon: 'gavel' as IconName, title: 'Admin tools', sub: 'Reports, members, requests and admins', href: '/admin', words: 'admin moderation reports members verify suspend hymns churches console overview' },
              { icon: 'receipt' as IconName, title: 'Transactions', sub: 'Plus payments, donations and refunds', href: '/admin-transactions', words: 'admin money income payments donations refunds' },
              { icon: 'pulse' as IconName, title: 'Activity', sub: 'What is happening across the community', href: '/admin-activity', words: 'admin timeline joined posts lives reports' },
              { icon: 'lifebuoy' as IconName, title: 'Support inbox', sub: 'Questions from members', href: '/admin-support', words: 'admin tickets help answer reply' },
            ],
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
        {
          icon: 'flame',
          title: 'Chat streaks',
          sub: 'Show how many days in a row you and a friend have chatted. If either of you turns this off, neither sees the streak.',
          href: '#chat-streaks',
          words: 'streak flame fire days messages chats in a row',
          toggle: 'streaks_enabled',
        },
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
      items: [
        { icon: 'sun', title: 'Theme', value: THEME_LABEL[theme] ?? 'Dark', href: '/theme', words: 'theme dark light white green colour color mode appearance look' },
        { icon: 'palette', title: 'Profile style', sub: 'Ring colour and profile theme', href: '/profile-style', words: 'ring colour color theme look profile style customise', plus: true },
        { icon: 'camera', title: 'Story and camera', href: '/camera-settings', words: 'camera roll photos front camera toolbar reels sound' },
      ],
    },
    {
      label: 'Your insights and tools',
      items: [
        ...(creator
          ? [
              { icon: 'chart' as IconName, title: 'Dashboard', href: '/dashboard', words: 'insights views followers analytics' },
              { icon: 'tag' as IconName, title: 'Creator tools and controls', href: '/creator', words: 'saved reply faq questions view counts category account type' },
            ]
          : [{ icon: 'chart' as IconName, title: 'Account type and tools', sub: 'Switch to a creator account for insights, saved replies and more', href: '/account-type', words: 'creator professional dashboard insights' }]),
        { icon: 'megaphone', title: 'Your ads', href: '/ads', words: 'ads advert advertising promote boost campaign sponsored' },
        // Fundraisers aren't available to members under 14.
        ...(restricted ? [] : [{ icon: 'gift' as IconName, title: 'Fundraisers and payouts', href: '/payouts', words: 'fundraiser donations giving money payout bank stripe raise' }]),
      ],
    },
    {
      label: 'More info and support',
      items: [
        { icon: 'lifebuoy', title: 'Help and support', sub: 'Common questions and quick support', href: '/help', words: 'help support contact questions faq ticket email problem' },
        { icon: 'info', title: 'About', href: '/about', words: 'version privacy data help' },
      ],
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
  const toggles = {
    read_receipts: { value: receipts, set: setReadReceipts },
    streaks_enabled: { value: streaks, set: setStreaksEnabled },
  };
  const row = (i: Item) =>
    i.toggle ? (
      <Row key={i.href} icon={i.icon} title={i.title} sub={i.sub} right={<Toggle value={toggles[i.toggle].value} onChange={toggles[i.toggle].set} label={i.title} />} />
    ) : i.info ? (
      <Row key={i.href} icon={i.icon} title={i.title} sub={i.sub} />
    ) : (
      <Row key={i.href} icon={i.icon} title={i.title} sub={i.sub} value={i.value} right={i.plus ? <PlusTag /> : undefined} onPress={() => router.push(i.href as any)} />
    );

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
            <Pressable onPress={logOut} accessibilityRole="button" style={({ pressed }) => ({ paddingHorizontal: 16, minHeight: 48, justifyContent: 'center', backgroundColor: pressed ? C.surface : 'transparent' })}>
              <Text style={{ color: C.danger, fontSize: 17.5 }}>Log out</Text>
            </Pressable>
            <Text style={{ color: C.fg3, fontSize: 13, paddingHorizontal: 16, paddingTop: 6 }}>Logged in as {profile?.username}</Text>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}
