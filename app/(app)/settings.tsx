import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import type { IconName } from '../../src/components/Icon';
import { Divider, Empty, Row, Screen, ScreenHeader, SearchField, SectionLabel, Toggle, useToast } from '../../src/components/ui';
import { useLogOut } from '../../src/lib/accounts';
import { countCloseFriends, listBlocked, setTickHidden, updateProfile } from '../../src/lib/api';
import { fontById } from '../../src/lib/fonts';
import { tap } from '../../src/lib/haptics';
import { en, type Key, languageCode, languageName, useT } from '../../src/lib/i18n';
import { setPrefs, usePrefs } from '../../src/lib/prefs';
import { useSession } from '../../src/lib/session';
import { C, errText } from '../../src/lib/theme';

/**
 * A line in the list. With `toggle`, it is a switch rather than a link; with `info`, it is only
 * words to read. `href` then only names it for the search. `plus` puts a small Plus label on it.
 * `title` and `sub` are keys (src/lib/i18n/en.ts), looked up as the list draws; `words` are extra
 * English search terms, kept in English so they work in every language.
 */
type Item = { icon: IconName; title: Key; sub?: Key; value?: string; href: string; words?: string; toggle?: ToggleKey; info?: boolean; plus?: boolean };
/** Switches saved on the account (the first four) or only on this phone (the rest). */
type ToggleKey = 'read_receipts' | 'streaks_enabled' | 'show_activity' | 'tick' | 'haptics' | 'captions' | 'readQuietly';
type Section = { label: Key; items: Item[] };

/** The small label on a line that is a Community Plus perk. */
function PlusTag() {
  const t = useT();
  return (
    <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, backgroundColor: C.accent }}>
      <Text style={{ color: C.onAccent, fontSize: 11.5, fontWeight: '700' }}>{t('common.plus')}</Text>
    </View>
  );
}

const REPLIES: Record<string, Key> = { everyone: 'settings.repliesEveryone', following: 'settings.repliesFollowing', off: 'settings.repliesOff' };
const THEME_LABEL: Record<string, Key> = { dark: 'theme.dark', white: 'theme.white' };

/**
 * A switch saved on the account. It moves at once and stays where it was put while the save goes
 * through, however fast it is tapped: saves go one at a time and only the last position is saved, and
 * the profile reloading meanwhile with an older answer doesn't flick it back. Once the account agrees,
 * it follows the account again. If saving fails it goes back to what the account has, and says why.
 */
function useAccountSwitch(saved: boolean, save: (next: boolean) => Promise<unknown>): [boolean, (next: boolean) => void] {
  const toast = useToast();
  // Where the member put the switch, until the account says the same; null when it simply shows the account.
  const [wanted, setWanted] = useState<boolean | null>(null);
  const latest = useRef<boolean | null>(null);
  const running = useRef(false);
  const saveRef = useRef(save);
  saveRef.current = save;
  const savedRef = useRef(saved);
  savedRef.current = saved;
  useEffect(() => {
    if (wanted !== null && saved === wanted && !running.current) setWanted(null);
  }, [saved, wanted]);
  const set = useCallback(
    (next: boolean) => {
      setWanted(next);
      latest.current = next;
      if (running.current) return;
      running.current = true;
      (async () => {
        while (latest.current !== null) {
          const value = latest.current;
          latest.current = null;
          try {
            await saveRef.current(value);
          } catch (e) {
            latest.current = null;
            setWanted(null);
            toast(errText(e));
            break;
          }
        }
        running.current = false;
        setWanted((w) => (w !== null && w === savedRef.current ? null : w));
      })();
    },
    [toast],
  );
  return [wanted ?? saved, set];
}

/** "Settings and activity": everything about your account in one list, with a search box on top. */
export default function Settings() {
  const signOutHere = useLogOut();
  const { me, profile } = useSession();
  const router = useRouter();
  const toast = useToast();
  const prefs = usePrefs();
  const t = useT();
  const { appFont, theme } = prefs;
  const [q, setQ] = useState('');
  const [friends, setFriends] = useState<number | null>(null);
  const [blocked, setBlocked] = useState<number | null>(null);
  // Switches saved on the account. Each save announces the change, so the profile loads again by itself.
  const [receipts, setReadReceipts] = useAccountSwitch(profile?.read_receipts ?? true, (next) => updateProfile(me, { read_receipts: next }));
  const [streaks, setStreaksEnabled] = useAccountSwitch(profile?.streaks_enabled ?? true, (next) => updateProfile(me, { streaks_enabled: next }));
  const [activity, setShowActivity] = useAccountSwitch(profile?.show_activity ?? true, (next) => updateProfile(me, { show_activity: next }));
  // The blue tick (Plus members may hide it): on means it shows.
  const [tick, setShowTick] = useAccountSwitch(!profile?.tick_hidden, (next) => setTickHidden(!next));

  useFocusEffect(
    useCallback(() => {
      countCloseFriends(me).then(setFriends).catch(() => {});
      listBlocked(me).then((b) => setBlocked(b.length)).catch(() => {});
    }, [me]),
  );

  // Phone-only choices are saved at once and can't fail. The switch itself gives the haptic tap.
  function setHaptics(next: boolean) {
    setPrefs({ haptics: next });
    // Turning taps on is the one time the switch couldn't give one (they were off as it was pressed), so give it now.
    if (next) tap('select');
  }

  const creator = profile?.account_type === 'creator';
  const admin = !!profile?.admin_role;
  // Members under 14: no live broadcasts and no fundraisers, and a few things work differently.
  const restricted = profile?.restricted === true;
  // A verified member who has hidden the tick shows as not verified on their own card, so both count.
  const hasTick = !!profile?.verified || !!profile?.tick_hidden;
  const sections: Section[] = [
    ...(restricted
      ? [
          {
            label: 'settings.section.safety',
            items: [
              {
                icon: 'shield' as IconName,
                title: 'settings.under14',
                sub: 'settings.under14Sub',
                href: '#under-14',
                words: 'under 14 age young child minor restricted safety private birthday',
                info: true,
              },
            ],
          } satisfies Section,
        ]
      : []),
    {
      label: 'settings.section.account',
      items: [
        { icon: 'account', title: 'settings.account', sub: 'settings.accountSub', href: '/account', words: 'email phone password security delete personal details profile add account switch' },
        { icon: 'devices', title: 'settings.loginActivity', sub: 'settings.loginActivitySub', href: '/login-activity', words: 'sessions devices phones logged in log out security sign in where location' },
        // Saved cards, Community Plus and creator subscriptions, and every payment made (Plus is managed from there).
        {
          icon: 'card',
          title: 'payments.title',
          href: '/payments',
          words: 'subscribe subscription subscriptions community plus premium card cards credit debit payment payments payment methods wallet apple pay transactions history receipts billing refunds donations renew cancel',
        },
        ...(hasTick ? [] : [{ icon: 'verified' as IconName, title: 'settings.requestVerification', sub: 'settings.requestVerificationSub', href: '/verify', words: 'verify verified blue tick badge id identity check request' } satisfies Item]),
      ],
    },
    ...(profile?.plus
      ? [
          {
            label: 'common.plus',
            items: [
              { icon: 'font' as IconName, title: 'settings.appFont', value: fontById(appFont).name, href: '/plus-font', words: 'typeface text nunito lora poppins' },
              { icon: 'wallpaper' as IconName, title: 'settings.chatWallpaper', href: '/chat-wallpaper', words: 'background messages chats theme' },
              { icon: 'eye' as IconName, title: 'settings.profileViewers', sub: 'settings.profileViewersSub', href: '/profile-viewers', words: 'views visitors who viewed' },
              { icon: 'lock' as IconName, title: 'settings.readReceipts', sub: 'settings.readReceiptsSub', href: '/plus#read-receipts', words: 'seen messages chats privacy', toggle: 'read_receipts' as const },
              { icon: 'chatdots' as IconName, title: 'settings.readQuietly', sub: 'settings.readQuietlySub', href: '#read-quietly', words: 'seen read receipts quiet private messages chats ghost', toggle: 'readQuietly' as const },
              ...(hasTick ? [{ icon: 'verified' as IconName, title: 'settings.showTick', sub: 'settings.showTickSub', href: '#show-tick', words: 'verified blue tick badge hide show', toggle: 'tick' as const } satisfies Item] : []),
              { icon: 'bell' as IconName, title: 'settings.storyAlerts', sub: 'settings.storyAlertsSub', href: '/story-alerts', words: 'stories notifications alerts notify people' },
            ],
          } satisfies Section,
        ]
      : []),
    ...(admin
      ? [
          {
            label: 'settings.section.admin',
            items: [
              { icon: 'gavel' as IconName, title: 'settings.adminTools', sub: 'settings.adminToolsSub', href: '/admin', words: 'admin moderation reports members verify suspend hymns churches console overview' },
              { icon: 'receipt' as IconName, title: 'settings.transactions', sub: 'settings.transactionsSub', href: '/admin-transactions', words: 'admin money income payments donations refunds' },
              { icon: 'pulse' as IconName, title: 'settings.activity', sub: 'settings.activitySub', href: '/admin-activity', words: 'admin timeline joined posts lives reports' },
              { icon: 'lifebuoy' as IconName, title: 'settings.supportChats', sub: 'settings.supportChatsSub', href: '/admin-support', words: 'admin support inbox tickets help answer reply chat live' },
              { icon: 'star' as IconName, title: 'settings.feedback', sub: 'settings.feedbackSub', href: '/admin-feedback', words: 'admin feedback reviews ratings stars ideas problems bugs suggestions' },
            ],
          } satisfies Section,
        ]
      : []),
    {
      label: 'settings.section.howYouUse',
      items: [
        { icon: 'bookmark', title: 'settings.saved', href: '/saved', words: 'bookmarks' },
        { icon: 'archive', title: 'settings.archive', href: '/archive', words: 'stories old expired' },
        { icon: 'activity', title: 'settings.yourActivity', href: '/activity', words: 'likes comments reposts history' },
        { icon: 'bell', title: 'common.notifications', href: '/notifications', words: 'likes follows comments' },
        { icon: 'sliders', title: 'settings.yourFeed', sub: 'settings.yourFeedSub', href: '/clips-settings', words: 'feed for you shorts clips reels interests topics more less sensitive recommendations' },
        {
          icon: 'flame',
          title: 'settings.chatStreaks',
          sub: 'settings.chatStreaksSub',
          href: '#chat-streaks',
          words: 'streak flame fire days messages chats in a row',
          toggle: 'streaks_enabled',
        },
      ],
    },
    {
      label: 'settings.section.whoCanSee',
      items: [
        { icon: 'star', title: 'settings.closeFriends', value: friends === null ? undefined : String(friends), href: '/close-friends', words: 'stories list' },
        { icon: 'block', title: 'settings.blocked', value: blocked === null ? undefined : String(blocked), href: '/blocked', words: 'block unblock accounts' },
        { icon: 'story', title: 'settings.storyReplies', value: t(REPLIES[profile?.story_replies ?? 'everyone'] ?? 'settings.repliesEveryone'), href: '/story-settings', words: 'stories reply messages' },
        {
          icon: 'eye',
          title: 'settings.activityStatus',
          sub: 'settings.activityStatusSub',
          href: '#activity-status',
          words: 'active now online last seen status presence green dot',
          toggle: 'show_activity',
        },
        { icon: 'location', title: 'settings.liveLocation', sub: 'settings.liveLocationSub', href: '/map', words: 'map location share where friends nearby gps' },
      ],
    },
    {
      label: 'settings.section.appAndMedia',
      items: [
        { icon: 'sun', title: 'theme.title', value: t(THEME_LABEL[theme] ?? 'theme.dark'), href: '/theme', words: 'theme dark light white colour color mode appearance look' },
        { icon: 'palette', title: 'settings.profileStyle', sub: 'settings.profileStyleSub', href: '/profile-style', words: 'ring colour color theme look profile style customise', plus: true },
        { icon: 'camera', title: 'settings.storyCamera', href: '/camera-settings', words: 'camera roll photos front camera toolbar shorts reels sound' },
        { icon: 'globe', title: 'language.title', value: languageName(languageCode()), href: '/language', words: 'language translate english spanish french words' },
        { icon: 'text', title: 'settings.captions', sub: 'settings.captionsSub', href: '#captions', words: 'captions subtitles shorts clips reels words deaf hearing accessibility', toggle: 'captions' },
        // Named by the same list as the Language screen and Your feed (i18n's LANGUAGES), so the names can't drift apart.
        { icon: 'globe', title: 'settings.captionLanguage', value: prefs.captionLang ? languageName(prefs.captionLang) : t('settings.appLanguage'), href: '/clips-settings', words: 'captions subtitles translate language shorts clips reels' },
        { icon: 'pulse', title: 'settings.haptics', sub: 'settings.hapticsSub', href: '#haptics', words: 'haptics vibration vibrate tap feel touch buzz', toggle: 'haptics' },
      ],
    },
    {
      label: 'settings.section.insights',
      items: [
        ...(creator
          ? [
              { icon: 'chart' as IconName, title: 'settings.dashboard', href: '/dashboard', words: 'insights views followers analytics' } satisfies Item,
              { icon: 'tag' as IconName, title: 'settings.creatorTools', href: '/creator', words: 'saved reply faq questions view counts category account type' } satisfies Item,
            ]
          : [{ icon: 'chart' as IconName, title: 'settings.accountType', sub: 'settings.accountTypeSub', href: '/account-type', words: 'creator professional dashboard insights' } satisfies Item]),
        { icon: 'megaphone', title: 'settings.yourAds', href: '/ads', words: 'ads advert advertising promote boost campaign sponsored' },
        { icon: 'crown', title: 'settings.subscriptions', sub: 'settings.subscriptionsSub', href: '/creator-subscriptions', words: 'subscriptions subscribe subscribers creator monthly price cancel exclusive' },
        // Fundraisers aren't available to members under 14.
        ...(restricted ? [] : [{ icon: 'gift' as IconName, title: 'settings.fundraisers', href: '/payouts', words: 'fundraiser donations giving money payout bank stripe raise' } satisfies Item]),
      ],
    },
    {
      label: 'settings.section.support',
      items: [
        { icon: 'lifebuoy', title: 'help.title', sub: 'settings.helpSub', href: '/help', words: 'help support contact chat questions faq problem feedback review rate idea suggest bug' },
        { icon: 'info', title: 'settings.about', href: '/about', words: 'version privacy data help terms legal policy copyright dmca trademark child safety community guidelines rules' },
      ],
    },
  ];

  function logOut() {
    Alert.alert(t('settings.logOutQuestion'), undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      // Only this account: any other account signed in on this phone stays, and the app moves to it (at Home).
      { text: t('settings.logOut'), style: 'destructive', onPress: () => { signOutHere().catch((e: unknown) => toast(errText(e))); } },
    ]);
  }

  const needle = q.trim().toLowerCase();
  // Searched in the app's language and in English (with the English search words), so either finds a line.
  const haystack = (i: Item) => `${t(i.title)} ${i.sub ? t(i.sub) : ''} ${en[i.title]} ${i.sub ? en[i.sub] : ''} ${i.words ?? ''}`;
  const matches = needle ? sections.flatMap((s) => s.items).filter((i) => haystack(i).toLowerCase().includes(needle)) : [];
  const toggles: Record<ToggleKey, { value: boolean; set: (next: boolean) => void }> = {
    read_receipts: { value: receipts, set: setReadReceipts },
    streaks_enabled: { value: streaks, set: setStreaksEnabled },
    show_activity: { value: activity, set: setShowActivity },
    tick: { value: tick, set: setShowTick },
    haptics: { value: prefs.haptics, set: setHaptics },
    captions: { value: prefs.captions, set: (next) => setPrefs({ captions: next }) },
    readQuietly: { value: prefs.readQuietly, set: (next) => setPrefs({ readQuietly: next }) },
  };
  const row = (i: Item) => {
    const title = t(i.title);
    // Only a notice (under 14) keeps its line of words; the others are searched by them but show just the title.
    const sub = i.info && i.sub ? t(i.sub) : undefined;
    return i.toggle ? (
      <Row key={i.href + i.title} icon={i.icon} title={title} sub={sub} right={<Toggle value={toggles[i.toggle].value} onChange={toggles[i.toggle].set} label={title} />} />
    ) : i.info ? (
      <Row key={i.href + i.title} icon={i.icon} title={title} sub={sub} />
    ) : (
      // Two lines can open the same screen (Your feed and Caption language), so the title is part of the key.
      <Row key={i.href + i.title} icon={i.icon} title={title} sub={sub} value={i.value} right={i.plus ? <PlusTag /> : undefined} onPress={() => router.push(i.href as any)} />
    );
  };

  return (
    <Screen>
      <ScreenHeader title={t('settings.title')} />
      <View style={{ paddingTop: 4, paddingBottom: 4 }}>
        <SearchField value={q} onChangeText={setQ} label={t('settings.search')} />
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: 60 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        {needle ? (
          matches.length ? (
            <View style={{ paddingTop: 8 }}>{matches.map(row)}</View>
          ) : (
            <Empty title={t('settings.noneFound')} />
          )
        ) : (
          <>
            {sections.map((s) => (
              <View key={s.label}>
                <SectionLabel>{t(s.label)}</SectionLabel>
                {s.items.map(row)}
                <Divider />
              </View>
            ))}
            <SectionLabel>{t('settings.section.login')}</SectionLabel>
            <Pressable onPress={logOut} accessibilityRole="button" style={({ pressed }) => ({ paddingHorizontal: 16, minHeight: 48, justifyContent: 'center', backgroundColor: pressed ? C.press : 'transparent' })}>
              <Text style={{ color: C.danger, fontSize: 17.5 }}>{t('settings.logOut')}</Text>
            </Pressable>
            <Text style={{ color: C.fg3, fontSize: 13, paddingHorizontal: 16, paddingTop: 6 }}>{t('settings.loggedInAs', { username: profile?.username ?? '' })}</Text>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}
