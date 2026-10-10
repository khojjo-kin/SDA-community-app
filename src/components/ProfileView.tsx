import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, FlatList, Modal, Pressable, RefreshControl, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { BlurView } from 'expo-blur';
import * as Clipboard from 'expo-clipboard';
import { LinearGradient } from 'expo-linear-gradient';
import * as Linking from 'expo-linking';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { keepSame } from '../lib/cache';
import { explainCopyrightReport } from '../lib/copyright-report';
import { acceptFollowRequest, activeLabel, adminSetAccount, fetchFollowAlerts, fetchLives, fetchReposts, fetchStats, fetchUserPosts, fetchUserStories, allStoriesSeen, getProfile, isOnline, openThread, recordProfileView, removeFollowRequest, report, requestFollow, setBlock, setCloseFriend, setFollow, setFollowAlerts } from '../lib/api';
import { tap } from '../lib/haptics';
import { en, type Key, tSplit, useT } from '../lib/i18n';
import { useSession } from '../lib/session';
import { prefetchLibrary } from '../lib/library';
import { listen } from '../lib/store';
import { profileTheme, ringColors } from '../lib/styling';
import { C, errText, fmt, monthName } from '../lib/theme';
import type { GridSource } from '../lib/grid-open';
import type { FollowAlerts, Post, Profile } from '../lib/types';
import { AccountSwitcher } from './AccountSwitcher';
import { type Accent, AccentButton, DiscoverCarousel, prefetchSuggestions } from './DiscoverCarousel';
import { FundraiserCard } from './FundraiserCard';
import { DarkStatusBar } from './OnDark';
import { GridCell, useOpenFromGrid } from './Grid';
import { HighlightsRow } from './HighlightsRow';
import { ScheduledLiveCard } from './LiveSchedule';
import { Icon, IconName, VerifiedTick } from './Icon';
import { useLegalSheet } from './LegalDocument';
import { ProfileSkeleton } from './Skeleton';
import { Avatar, Button, Empty, ErrorNote, Header, IconButton, Screen, Sheet, SheetRow, Toggle, useChoices, useToast } from './ui';
import { WritingText } from './WritingText';

type Tab = 'grid' | 'reels' | 'reposts';
// Labels here and in ALERT_ROWS are keys, looked up as the profile draws, so they follow the app's language.
const TABS: { key: Tab; icon: IconName; label: Key }[] = [
  { key: 'grid', icon: 'grid', label: 'profile.tab.posts' },
  { key: 'reels', icon: 'reels', label: 'profile.tab.clips' },
  { key: 'reposts', icon: 'repost', label: 'profile.tab.reposts' },
];

// Whether "Discover people" is open on your own profile. A plain variable rather than storage: it
// should survive switching tabs and coming back, not a restart of the app.
let discoverOpen = false;

/** How far the theme's band reaches down the profile before it has faded into the page. */
const BAND_HEIGHT = 190;

/** A count under the name. Without `onPress` it is only words: no button, nothing happens on a touch. */
function Stat({ n, label, onPress, color }: { n: number; label: string; onPress?: () => void; color: string }) {
  const body = (
    <>
      <Text numberOfLines={1} style={{ color, fontSize: 18, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{fmt(n)}</Text>
      <Text numberOfLines={1} style={{ color, fontSize: 14 }}>{label}</Text>
    </>
  );
  if (!onPress) {
    return (
      <View style={{ flex: 1 }} accessible accessibilityLabel={`${n} ${label}`}>
        {body}
      </View>
    );
  }
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ flex: 1, opacity: pressed ? 0.6 : 1 })} accessibilityRole="button" accessibilityLabel={`${n} ${label}`}>
      {body}
    </Pressable>
  );
}

/** Where the bell sits on screen, so the menu can open just under it. */
type Anchor = { x: number; y: number; w: number; h: number };

const ALERT_ROWS: { key: keyof FollowAlerts; label: Key; icon: IconName }[] = [
  { key: 'posts', label: 'profile.alertsPosts', icon: 'grid' },
  { key: 'stories', label: 'profile.alertsStories', icon: 'story' },
  { key: 'clips', label: 'profile.alertsClips', icon: 'reels' },
  { key: 'live', label: 'profile.alertsLive', icon: 'live' },
];

/** Why a member can report an account. The English goes to the server, so admins read every report alike. */
const REPORT_REASONS: Key[] = ['profile.reportSpam', 'profile.reportPretending', 'profile.reportHarassment', 'report.copyright', 'profile.reportOther'];

/**
 * The bell's menu: a frosted card that grows out of the bell, with a switch for each kind of
 * notification from this person. Each change is saved straight away.
 */
function AlertsMenu({ anchor, targetId, username, onClose, onChange }: { anchor: Anchor | null; targetId: string; username: string; onClose: () => void; onChange: (anyOn: boolean) => void }) {
  const { me } = useSession();
  const toast = useToast();
  const t = useT();
  const { width } = useWindowDimensions();
  const [alerts, setAlerts] = useState<FollowAlerts | null>(null);
  const grow = useRef(new Animated.Value(0)).current;
  // Saves go one after another, so quick taps reach the server in the order they were made.
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  // The latest callbacks, so the loading effect needn't start again each time the profile redraws.
  const handlers = useRef({ onClose, onChange });
  handlers.current = { onClose, onChange };
  const visible = !!anchor;

  useEffect(() => {
    if (!visible) return;
    let live = true;
    setAlerts(null);
    fetchFollowAlerts(me, targetId)
      .then((a) => {
        if (live) setAlerts(a);
      })
      .catch((e) => {
        if (!live) return;
        toast(errText(e));
        handlers.current.onClose();
      });
    grow.setValue(0);
    const run = Animated.spring(grow, { toValue: 1, speed: 20, bounciness: 5, useNativeDriver: true });
    run.start();
    return () => {
      live = false;
      run.stop();
    };
  }, [visible, me, targetId, grow, toast]);

  function set(key: keyof FollowAlerts, value: boolean) {
    if (!alerts) return;
    tap('medium');
    const next = { ...alerts, [key]: value };
    setAlerts(next);
    handlers.current.onChange(Object.values(next).some(Boolean));
    queue.current = queue.current
      .then(() => setFollowAlerts(me, targetId, next))
      .catch(async (e) => {
        toast(errText(e));
        // Show what the server really has rather than guessing which change failed.
        try {
          const truth = await fetchFollowAlerts(me, targetId);
          setAlerts(truth);
          handlers.current.onChange(Object.values(truth).some(Boolean));
        } catch {
          // Still offline: the switches keep what was asked for and the profile reload sorts it out later.
        }
      });
  }

  const cardW = Math.min(300, width - 24);
  // Right-aligned with the bell, but never off the edge of the screen.
  const right = anchor ? Math.min(Math.max(12, width - (anchor.x + anchor.w) - 2), width - cardW - 12) : 12;
  const top = anchor ? anchor.y + anchor.h + 4 : 0;
  // The card grows from the point under the bell.
  const originX = anchor ? Math.min(cardW, Math.max(0, anchor.x + anchor.w / 2 - (width - right - cardW))) : cardW;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.16)' }]} onPress={onClose} accessibilityLabel={t('common.close')} />
      <Animated.View
        style={{
          position: 'absolute',
          top,
          right,
          width: cardW,
          borderRadius: 22,
          shadowColor: '#000',
          shadowOpacity: 0.28,
          shadowRadius: 22,
          shadowOffset: { width: 0, height: 10 },
          elevation: 12,
          opacity: grow.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' }),
          transformOrigin: [originX, 0, 0],
          transform: [{ scale: grow.interpolate({ inputRange: [0, 1], outputRange: [0.82, 1] }) }],
        }}>
        <View style={{ borderRadius: 22, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: C.hairline }}>
          <BlurView intensity={60} tint={C.blurTint} style={StyleSheet.absoluteFill} />
          <View style={{ backgroundColor: C.glass, paddingTop: 14, paddingBottom: 6 }}>
            <Text accessibilityRole="header" numberOfLines={2} style={{ color: C.fg, fontSize: 15.5, fontWeight: '700', paddingHorizontal: 18, paddingBottom: 8 }}>
              {t('profile.alertsTitle', { username })}
            </Text>
            {alerts ? (
              ALERT_ROWS.map((r) => {
                const label = t(r.label);
                return (
                  <Pressable key={r.key} onPress={() => set(r.key, !alerts[r.key])} accessibilityRole="switch" accessibilityLabel={label} accessibilityState={{ checked: alerts[r.key] }} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 18, minHeight: 50, backgroundColor: pressed ? C.press : 'transparent' })}>
                    <Icon name={r.icon} size={22} color={C.fg} />
                    <Text style={{ flex: 1, color: C.fg, fontSize: 16 }}>{label}</Text>
                    {/* The whole row is the switch for screen readers; this is the part you see and can also tap. */}
                    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                      <Toggle value={alerts[r.key]} onChange={(v) => set(r.key, v)} label={t('profile.alertsFrom', { what: label, username })} />
                    </View>
                  </Pressable>
                );
              })
            ) : (
              // The same height as the rows, so the card doesn't jump when they arrive.
              <View style={{ height: ALERT_ROWS.length * 50, alignItems: 'center', justifyContent: 'center' }}>
                <ActivityIndicator color={C.fg2} />
              </View>
            )}
          </View>
        </View>
      </Animated.View>
    </Modal>
  );
}

/** One line in About this account: a round icon, what it is, and the detail under it. */
function AboutRow({ icon, title, value }: { icon: React.ReactNode; title: string; value?: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingVertical: 9 }} accessible accessibilityLabel={value ? `${title}: ${value}` : title}>
      <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' }}>{icon}</View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: C.fg, fontSize: 16, fontWeight: '600' }}>{title}</Text>
        {value ? <Text style={{ color: C.fg2, fontSize: 14.5, marginTop: 1, lineHeight: 19 }}>{value}</Text> : null}
      </View>
    </View>
  );
}

/**
 * "Share your first photo or short" (and "Share your first short" on the Shorts tab): on your own empty
 * profile the words write themselves in the app's green (WritingText). A tap opens Create.
 */
function ShareFirst({ title, body, onPress }: { title: string; body: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={title} style={({ pressed }) => ({ paddingHorizontal: 32, paddingVertical: 36, alignItems: 'center', gap: 8, opacity: pressed ? 0.7 : 1 })}>
      <WritingText text={title} size={20} />
      <Text style={{ color: C.fg2, textAlign: 'center', lineHeight: 20 }}>{body}</Text>
    </Pressable>
  );
}

const GRID_GAP = 2;
const LIST_SOURCE: GridSource = { from: 'list' };
const GridGap = () => <View style={{ height: GRID_GAP }} />;
const keyOfPost = (p: Post) => p.id;

/** The profile's grid: the shared grid cells, with room after them for the subscriber-only card. */
function ProfileGrid({ posts, header, empty, footer, refreshing, onRefresh, source, subtitle }: { posts: Post[]; header: React.ReactElement; empty: React.ReactElement; footer: React.ReactElement | null; refreshing: boolean; onRefresh: () => void; source: GridSource; subtitle: string }) {
  const { width } = useWindowDimensions();
  const size = Math.floor((width - GRID_GAP * 2) / 3);
  // A post opens a feed of this tab's posts at that one; a Short opens the Shorts player (src/lib/grid-open.ts).
  const open = useOpenFromGrid(posts, source, subtitle);
  const renderCell = useCallback(({ item }: { item: Post }) => <GridCell post={item} size={size} onOpen={open} />, [size, open]);
  return (
    <FlatList
      data={posts}
      keyExtractor={keyOfPost}
      numColumns={3}
      columnWrapperStyle={{ gap: GRID_GAP }}
      ItemSeparatorComponent={GridGap}
      renderItem={renderCell}
      ListHeaderComponent={header}
      ListEmptyComponent={empty}
      ListFooterComponent={footer}
      contentContainerStyle={{ paddingBottom: 110 }}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.fg2} />}
    />
  );
}

export function ProfileView({ userId, isTab }: { userId: string; isTab?: boolean }) {
  const { me } = useSession();
  const router = useRouter();
  const toast = useToast();
  const t = useT();
  const insets = useSafeAreaInsets();
  // The Copyright policy, offered after a copyright report.
  const legal = useLegalSheet();
  // The reasons for a report: an alert on iPhone, a sheet on Android (whose alerts hold only three buttons).
  const choices = useChoices();
  const mine = userId === me;
  const [discover, setDiscover] = useState(discoverOpen);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [reposts, setReposts] = useState<Post[]>([]);
  const [tab, setTab] = useState<Tab>('grid');
  const [status, setStatus] = useState<'loading' | 'ready' | 'error' | 'missing'>('loading');
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [sheet, setSheet] = useState<'menu' | 'about' | 'accounts' | null>(null);
  // Where the bell is while its menu is open; null when it is shut.
  const [alertsAt, setAlertsAt] = useState<Anchor | null>(null);
  const bellRef = useRef<View>(null);
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
      // Reloaded each time the profile comes to the front: posts that haven't changed keep their
      // objects, so the grid's cells don't all draw again (often while it is being scrolled).
      setPosts((cur) => keepSame(cur, own));
      setReposts((cur) => keepSame(cur, rep));
      setStatus('ready');
      if (mine && p.account_type === 'creator') {
        fetchStats(new Date(Date.now() - 30 * 86400e3), new Date())
          .then((s) => setViews(s.views))
          .catch(() => {});
      }
      // Quietly, so "Discover people" opens full rather than with a spinner.
      if (mine) prefetchSuggestions(me);
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

  // Whether every story of theirs (or mine) has been watched: the ring turns grey as soon as it has.
  const [storiesSeen, setStoriesSeen] = useState(false);
  const hasStory = !!profile?.has_story;
  const checkStories = useCallback(() => {
    if (!hasStory) return;
    fetchUserStories(userId, me)
      .then((groups) => setStoriesSeen(allStoriesSeen(groups.flatMap((g) => g.stories), me)))
      .catch(() => {});
  }, [userId, me, hasStory]);
  useFocusEffect(checkStories);
  useEffect(() => listen('stories', checkStories), [checkStories]);

  // The bell goes when you stop following; its menu mustn't spring back open if you follow again.
  useEffect(() => {
    if (profile && (!profile.is_following || profile.is_blocked)) setAlertsAt(null);
  }, [profile]);

  async function follow() {
    if (!profile) return;
    tap();
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
      toast(t('profile.requestedToFollow', { username: profile.username }));
    } catch (e) {
      toast(errText(e));
    }
    load();
  }

  function withdraw() {
    if (!profile) return;
    Alert.alert(t('profile.withdrawQuestion'), t('profile.withdrawBody', { username: profile.username }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('profile.withdraw'),
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
      toast(accept ? t('common.nowFollowsYou', { username: profile.username }) : t('common.requestRemoved'));
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
    setSheet(null);
    setTimeout(fn, 380);
  };

  const copyLink = () => {
    Clipboard.setStringAsync(`community://user/${userId}`).then(() => toast(t('profile.linkCopied')));
  };

  function openAlerts() {
    tap();
    bellRef.current?.measureInWindow((x, y, w, h) => setAlertsAt({ x, y, w, h }));
  }

  /** Admins only: hide or show who follows them and whom they follow. The counts stay either way. */
  async function setHidden(next: boolean) {
    if (!profile) return;
    tap('medium');
    setProfile({ ...profile, hide_connections: next });
    try {
      await adminSetAccount(me, { hide_connections: next });
      toast(next ? t('profile.connectionsHidden') : t('profile.connectionsShown'));
    } catch (e) {
      setProfile((p) => (p ? { ...p, hide_connections: !next } : p));
      toast(errText(e));
    }
  }

  function toggleDiscover() {
    discoverOpen = !discover;
    setDiscover(discoverOpen);
  }

  // While the profile loads, or if it failed, the top bar still offers what it always does: Create and
  // the menu (Settings) on your own, the way back on anyone else's. Settings must never be out of reach.
  const bareBar = (
    <Header
      left={mine && isTab ? <IconButton name="plus" size={28} label={t('common.create')} onPress={() => { prefetchLibrary(); router.push('/create'); }} /> : undefined}
      right={mine ? <IconButton name="menu" size={26} label={t('settings.title')} onPress={() => router.push('/settings')} /> : undefined}
    />
  );
  if (status === 'loading') return <Screen>{bareBar}<ProfileSkeleton /></Screen>;
  if (status === 'error') return <Screen>{bareBar}<ErrorNote message={error} onRetry={() => { setStatus('loading'); load(); }} /></Screen>;
  if (status === 'missing' || !profile) return <Screen><Header /><Empty icon="user" title={t('profile.unavailable')} body={t('profile.unavailableBody')} /></Screen>;

  // A private account I do not follow: the stats show, the photos do not.
  const locked = !mine && profile.is_private && !profile.is_following;
  const listsHidden = !mine && profile.hide_connections;
  // Posts kept for subscribers, which this viewer can't see yet.
  const subscriberOnly = !mine && !profile.is_blocked && !locked && !profile.subscribed ? profile.subscriber_posts ?? 0 : 0;
  const showBell = !mine && profile.is_following && !profile.is_blocked;
  const joined = new Date(profile.created_at);
  const verifiedHow = profile.verified_via === 'notable' ? t('profile.verifiedNotable') : profile.verified_via === 'plus' ? t('profile.verifiedPlus') : t('common.verified');
  const verifiedWhy =
    profile.verified_via === 'notable' ? t('profile.verifiedWhyNotable') : profile.verified_via === 'plus' ? t('profile.verifiedWhyPlus') : t('profile.verifiedWhy');
  const lastActive = activeLabel(profile.active_at);
  const list = tab === 'grid' ? posts : tab === 'reels' ? posts.filter((p) => p.kind === 'reel') : reposts;
  const who = { username: profile.username };
  const emptyFor: Record<Tab, [string, string]> = {
    grid: mine ? [t('profile.emptyFirstPhoto'), t('profile.emptyFirstPhotoBody')] : [t('profile.emptyNoPosts'), t('profile.emptyNoPostsBody', who)],
    reels: mine ? [t('profile.emptyFirstClip'), t('profile.emptyFirstClipBody')] : [t('profile.emptyNoClips'), t('profile.emptyNoClipsBody', who)],
    reposts: [t('profile.emptyNoReposts'), mine ? t('profile.emptyMyRepostsBody') : t('profile.emptyTheirRepostsBody', who)],
  };
  const viewsWeek = t(profile.views_week === 1 ? 'profile.viewsWeekOne' : 'profile.viewsWeek', { count: fmt(profile.views_week) });
  const [wantsBefore, wantsAfter] = tSplit('profile.wantsToFollow', 'username');

  // Community Plus styling. The standard theme ('') leaves everything exactly as it always was.
  const theme = profileTheme(profile.profile_theme);
  // The themes' accents are made for a dark page; on the White app theme each has a deeper version that shows on white.
  const lightPage = C.statusBar === 'dark';
  const accent: Accent = theme.id ? (lightPage ? { bg: theme.lightAccent, fg: '#ffffff' } : { bg: theme.accent, fg: theme.onAccent }) : null;
  const link = accent ? accent.bg : C.accent2;
  const band = theme.band.length ? theme.band : null;
  // The bands are all deep colours, so what sits on them is white whatever the app's own theme is.
  const onBand = band ? '#ffffff' : C.fg;
  const onBand2 = band ? 'rgba(255,255,255,0.78)' : C.fg2;
  // The band holds its colour over the avatar row, then fades into the page.
  const bandColors = band ? ([...band, C.bg] as unknown as readonly [string, string, ...string[]]) : null;
  const bandStops = band ? ([...band.map((_, i) => (band.length === 1 ? 0.42 : (i / (band.length - 1)) * 0.42)), 1] as unknown as readonly [number, number, ...number[]]) : null;

  const head = (
    <View>
      {/* It scrolls away with the profile; the top bar keeps the band's first colour. */}
      {bandColors ? <LinearGradient pointerEvents="none" colors={bandColors} locations={bandStops} style={{ position: 'absolute', left: 0, right: 0, top: 0, height: BAND_HEIGHT }} /> : null}
      <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 22 }}>
          <Pressable
            onPress={() => (liveId ? router.push(`/live/${liveId}`) : profile.has_story ? router.push(`/story/${userId}`) : mine ? router.push('/add-story') : undefined)}
            disabled={!liveId && !profile.has_story && !mine}
            accessibilityRole={liveId || profile.has_story || mine ? 'button' : 'image'}
            accessibilityLabel={liveId ? t('profile.watchLive') : profile.has_story ? t('profile.viewStory') : mine ? t('profile.addToStory') : t('profile.photo')}>
            <Avatar uri={profile.avatar_url} name={profile.full_name} size={profile.has_story ? 82 : 88} ring={profile.has_story ? (storiesSeen ? 'seen' : 'new') : null} ringColors={ringColors(profile.ring_color)} online={!mine && isOnline(profile.active_at)} />
            {mine && !profile.has_story && !profile.is_live ? (
              <View style={{ position: 'absolute', right: -2, bottom: 0, width: 28, height: 28, borderRadius: 14, backgroundColor: C.fg, borderWidth: 3, borderColor: C.bg, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="plus" size={14} color={C.bg} weight={3} />
              </View>
            ) : null}
            {profile.is_live ? (
              <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: -4, alignItems: 'center' }}>
                <View style={{ height: 20, paddingHorizontal: 7, borderRadius: 6, backgroundColor: C.like, borderWidth: 2, borderColor: C.bg, justifyContent: 'center' }}>
                  <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800', letterSpacing: 0.6 }}>{t('common.live')}</Text>
                </View>
              </View>
            ) : null}
          </Pressable>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <Text numberOfLines={1} style={{ color: onBand, fontSize: 16, fontWeight: '700', flexShrink: 1 }}>{profile.full_name}</Text>
              {profile.verified ? <VerifiedTick /> : null}
              {profile.pronouns ? <Text numberOfLines={1} style={{ color: onBand2, fontSize: 14.5, flexShrink: 1 }}>{profile.pronouns}</Text> : null}
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Stat n={profile.posts_count} label={t('profile.stat.posts')} color={onBand} />
              {/* An admin who hides their lists: the numbers show, but they don't open for anyone else. */}
              <Stat n={profile.followers_count} label={t('profile.stat.followers')} color={onBand} onPress={listsHidden ? undefined : () => router.push(`/people?id=${userId}&which=followers`)} />
              <Stat n={profile.following_count} label={t('profile.stat.following')} color={onBand} onPress={listsHidden ? undefined : () => router.push(`/people?id=${userId}&which=following`)} />
            </View>
          </View>
        </View>
        {/* Who looked at your profile is a Plus perk: everyone else sees nothing here at all. */}
        {mine && profile.plus ? (
          <Pressable
            onPress={() => router.push('/profile-viewers')}
            accessibilityRole="button"
            accessibilityLabel={`${viewsWeek}. ${t('profile.seeWho')}`}
            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, opacity: pressed ? 0.6 : 1 })}>
            <Icon name="eye" size={15} color={C.fg2} weight={2} />
            <Text numberOfLines={1} style={{ color: C.fg2, fontSize: 14, flexShrink: 1 }}>
              {viewsWeek} · <Text style={{ color: link, fontWeight: '600' }}>{t('profile.seeWho')}</Text>
            </Text>
          </Pressable>
        ) : null}
        {profile.admin_role === 'admin' || profile.plus || (profile.account_type === 'creator' && profile.category) ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 }}>
            {profile.plus ? (
              <Pressable onPress={() => (mine ? router.push('/plus') : undefined)} accessibilityRole={mine ? 'button' : 'text'} accessibilityLabel={t('profile.plusMember')} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, height: 22, paddingHorizontal: 8, borderRadius: 11, backgroundColor: 'rgba(61,139,255,0.16)' }}>
                <Icon name="crown" size={13} color={C.close} weight={2.2} />
                <Text style={{ color: C.close, fontSize: 12.5, fontWeight: '700' }}>{t('common.plus')}</Text>
              </Pressable>
            ) : null}
            {/* The owner runs the app quietly: only appointed admins show a badge. */}
            {profile.admin_role === 'admin' ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, height: 22, paddingHorizontal: 8, borderRadius: 11, backgroundColor: C.accentSoft }}>
                <Icon name="shield" size={13} color={C.accent2} weight={2.2} />
                <Text style={{ color: C.accent2, fontSize: 12.5, fontWeight: '700' }}>{t('common.admin')}</Text>
              </View>
            ) : null}
            {profile.account_type === 'creator' && profile.category ? <Text style={{ color: C.fg2, fontSize: 15 }}>{profile.category}</Text> : null}
          </View>
        ) : null}
        {profile.bio ? <Text style={{ color: C.fg, marginTop: profile.admin_role === 'admin' || profile.plus || (profile.account_type === 'creator' && profile.category) ? 6 : 12, lineHeight: 20 }} selectable>{profile.bio}</Text> : null}
        {profile.church_name ? (
          <Pressable onPress={() => (profile.church_id ? router.push(`/church/${profile.church_id}`) : undefined)} accessibilityRole="button" accessibilityLabel={t('profile.church', { name: profile.church_name })} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }}>
            <Icon name="church" size={15} color={C.fg2} weight={2} />
            <Text numberOfLines={1} style={{ color: C.fg2, fontSize: 14.5, flexShrink: 1 }}>{profile.church_name}</Text>
          </Pressable>
        ) : null}
        {profile.website ? (
          <Text style={{ color: link, marginTop: 4 }} numberOfLines={1} onPress={() => Linking.openURL(/^https?:\/\//.test(profile.website) ? profile.website : `https://${profile.website}`).catch(() => toast(t('profile.linkFailed')))}>
            {profile.website.replace(/^https?:\/\//, '')}
          </Text>
        ) : null}
        {!mine && profile.follows_me ? <Text style={{ color: C.fg3, marginTop: 6, fontSize: 13 }}>{t('profile.followsYou')}</Text> : null}
        {/* Drawn bare: the card brings its own spacing, so nothing is left behind when there is no card. */}
        {profile.fundraiser_id ? <FundraiserCard fundraiserId={profile.fundraiser_id} /> : null}
        {/* The next planned live, if any: drawn bare like the fundraiser card. */}
        {profile.is_blocked || locked ? null : <ScheduledLiveCard userId={userId} mine={mine} refreshKey={refreshKey} />}

        {mine && profile.account_type === 'creator' ? (
          <Pressable onPress={() => router.push('/dashboard')} accessibilityRole="button" accessibilityLabel={t('profile.dashboard')} style={({ pressed }) => ({ marginTop: 14, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12, backgroundColor: pressed ? C.surface2 : C.surface })}>
            <Text style={{ color: C.fg, fontWeight: '700', fontSize: 15.5 }}>{t('profile.dashboard')}</Text>
            <Text style={{ color: C.fg2, marginTop: 2, fontSize: 14 }}>{views === null ? t('profile.dashboardSub') : t(views === 1 ? 'profile.dashboardViewsOne' : 'profile.dashboardViews', { count: fmt(views) })}</Text>
          </Pressable>
        ) : null}

        {!mine && !profile.is_blocked && profile.requests_me ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, backgroundColor: C.surface }}>
            <Text numberOfLines={2} style={{ flex: 1, color: C.fg, fontSize: 14.5, lineHeight: 19 }}>
              {wantsBefore}
              <Text style={{ fontWeight: '700' }}>{profile.username}</Text>
              {wantsAfter}
            </Text>
            <AccentButton label={t('common.accept')} accent={accent} onPress={() => answer(true)} />
            <Button small kind="ghost" label={t('common.decline')} onPress={() => answer(false)} />
          </View>
        ) : null}

        <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
          {mine ? (
            <>
              {/* With a theme, Edit profile wears its colours so the owner sees them too; otherwise it stays plain. */}
              {accent ? (
                <AccentButton label={t('profile.editProfile')} accent={accent} style={{ flex: 1 }} onPress={() => router.push('/edit-profile')} />
              ) : (
                <Button small kind="ghost" label={t('profile.editProfile')} style={{ flex: 1 }} onPress={() => router.push('/edit-profile')} />
              )}
              <Button small kind="ghost" label={t('profile.shareProfile')} style={{ flex: 1 }} onPress={() => Clipboard.setStringAsync(`community://user/${userId}`).then(() => toast(t('profile.linkCopied')))} />
              {/* Settings stay one tap away from the menu button in the top bar. */}
              <Pressable
                onPress={toggleDiscover}
                accessibilityRole="button"
                accessibilityLabel={discover ? t('profile.hideDiscoverPeople') : t('profile.discoverPeople')}
                accessibilityState={{ expanded: discover }}
                style={({ pressed }) => ({ width: 40, height: 32, borderRadius: 10, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.75 : 1 })}>
                <Icon name="adduser" size={19} color={discover ? link : C.fg} weight={2} />
              </Pressable>
            </>
          ) : profile.is_blocked ? (
            <Button small kind="ghost" label={t('profile.unblock')} style={{ flex: 1 }} onPress={() => setBlock(me, userId, false).then(() => { toast(t('profile.unblocked', who)); load(); }).catch((e) => toast(errText(e)))} />
          ) : (
            <>
              {profile.is_following ? (
                <Button small kind="ghost" label={t('common.following')} style={{ flex: 1 }} onPress={follow} />
              ) : profile.requested ? (
                <Button small kind="ghost" label={t('profile.requested')} style={{ flex: 1 }} onPress={withdraw} />
              ) : profile.is_private ? (
                <AccentButton label={t('profile.request')} accent={accent} style={{ flex: 1 }} onPress={request} />
              ) : (
                <AccentButton label={profile.follows_me ? t('common.followBack') : t('common.follow')} accent={accent} style={{ flex: 1 }} onPress={follow} />
              )}
              <Button small kind="ghost" label={t('profile.message')} style={{ flex: 1 }} onPress={message} />
              {profile.sub_price_pence ? (
                <Button small kind="ghost" label={profile.subscribed ? t('profile.subscribed') : t('profile.subscribe')} textColor={profile.subscribed ? undefined : link} style={{ flex: 1, paddingHorizontal: 8 }} onPress={() => router.push(`/subscribe/${userId}`)} />
              ) : null}
            </>
          )}
        </View>
        {!mine && !profile.is_blocked && (profile.contact_email || profile.contact_phone) ? (
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
            {profile.contact_email ? <Button small kind="ghost" label={t('profile.email')} style={{ flex: 1 }} onPress={() => Linking.openURL(`mailto:${profile.contact_email}`).catch(() => toast(t('profile.mailFailed')))} /> : null}
            {profile.contact_phone ? <Button small kind="ghost" label={t('profile.call')} style={{ flex: 1 }} onPress={() => Linking.openURL(`tel:${profile.contact_phone.replace(/\s+/g, '')}`).catch(() => toast(t('profile.phoneFailed')))} /> : null}
          </View>
        ) : null}
      </View>

      {mine ? <DiscoverCarousel open={discover} accent={accent} link={link} /> : null}

      {profile.is_blocked || locked ? null : <HighlightsRow userId={userId} mine={mine} refreshKey={refreshKey} ringColor={profile.ring_color} />}

      {locked ? (
        <View style={{ height: 14 }} />
      ) : (
        <View style={{ flexDirection: 'row', marginTop: 14 }} accessibilityRole="tablist">
          {TABS.map((tb) => (
            <Pressable key={tb.key} onPress={() => setTab(tb.key)} accessibilityRole="tab" accessibilityLabel={t(tb.label)} accessibilityState={{ selected: tab === tb.key }} style={{ flex: 1, height: 46, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 1.5, borderBottomColor: tab === tb.key ? C.fg : 'transparent' }}>
              <Icon name={tb.icon} color={tab === tb.key ? C.fg : C.fg3} />
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );

  // The same shape as Header, with room for a lock next to the username on a private account. Both
  // sides take the same width, so the username stays centred when one side holds two buttons.
  const side = mine || showBell ? 86 : 40;
  const left = mine && isTab ? <IconButton name="plus" size={28} color={onBand} label={t('common.create')} onPress={() => { prefetchLibrary(); router.push('/create'); }} /> : <IconButton name="back" color={onBand} label={t('common.back')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />;
  const right = mine ? (
    <>
      <IconButton name="more" color={onBand} label={t('profile.moreAboutYours')} onPress={() => setSheet('menu')} />
      {/* Settings stay one tap away, on the far right where they have always been. */}
      <IconButton name="menu" size={26} color={onBand} label={t('settings.title')} onPress={() => router.push('/settings')} />
    </>
  ) : (
    <>
      {showBell ? (
        // A plain wrapper the menu can measure, so the card opens right under the bell.
        <View ref={bellRef} collapsable={false}>
          <IconButton
            name="bell"
            fill={profile.alerts_on}
            color={profile.alerts_on ? link : onBand}
            label={profile.alerts_on ? t('profile.alertsOn', who) : t('profile.alertsTitle', who)}
            onPress={openAlerts}
          />
        </View>
      ) : null}
      <IconButton name="more" color={onBand} label={t('profile.moreOptions')} onPress={() => setSheet('menu')} />
    </>
  );

  const subOnlyCount = t(subscriberOnly === 1 ? 'profile.subOnlyOne' : 'profile.subOnly', { count: fmt(subscriberOnly) });
  const subOnlyHow = profile.sub_price_pence ? t('profile.subscribeToSee') : t('profile.onlySubscribers');
  const lockedCard =
    tab === 'grid' && subscriberOnly > 0 ? (
      <Pressable
        onPress={() => router.push(`/subscribe/${userId}`)}
        accessibilityRole="button"
        accessibilityLabel={`${subOnlyCount}. ${subOnlyHow}`}
        style={({ pressed }) => ({ marginHorizontal: 16, marginTop: list.length ? 14 : 0, borderRadius: 18, overflow: 'hidden', borderWidth: 1, borderColor: C.line, opacity: pressed ? 0.8 : 1 })}>
        <LinearGradient colors={[C.accentSoft, C.surface]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 16 }}>
          <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: C.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="lock" size={22} color={C.accent2} weight={2.2} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: C.fg, fontSize: 16, fontWeight: '700' }}>{subOnlyCount}</Text>
            <Text style={{ color: C.fg2, fontSize: 14, marginTop: 2 }}>{subOnlyHow}</Text>
          </View>
          <Icon name="right" size={18} color={C.fg2} weight={2} />
        </LinearGradient>
      </Pressable>
    ) : null;

  return (
    // The safe-area gap is drawn here rather than by Screen so a theme's band can run up behind the clock.
    <Screen edges={false}>
      {/* A theme's band is a deep colour behind the clock: keep the clock light on it, even on the White theme. */}
      {band && C.statusBar === 'dark' ? <DarkStatusBar /> : null}
      <View style={{ paddingTop: insets.top, backgroundColor: band ? band[0] : undefined }}>
        <View style={{ height: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, gap: 6 }}>
          <View style={{ width: side, flexDirection: 'row' }}>{left}</View>
          {/* On your own profile the username opens the account switcher, as on Instagram. */}
          <Pressable disabled={!mine} onPress={() => setSheet('accounts')} style={({ pressed }) => ({ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: pressed ? 0.6 : 1 })} accessible accessibilityRole={mine ? 'button' : 'header'} accessibilityHint={mine ? t('accounts.switchHint') : undefined} accessibilityLabel={profile.is_private ? t('profile.privateLabel', who) : profile.username}>
            {profile.is_private ? <Icon name="lock" size={15} color={onBand2} weight={2.2} /> : null}
            <Text numberOfLines={1} style={{ color: onBand, fontSize: 18, fontWeight: '700', flexShrink: 1 }}>{profile.username}</Text>
            {mine ? <Icon name="down" size={15} color={onBand} weight={2.6} /> : null}
          </Pressable>
          <View style={{ width: side, flexDirection: 'row', justifyContent: 'flex-end', gap: 6 }}>{right}</View>
        </View>
      </View>
      <ProfileGrid
        posts={profile.is_blocked || locked ? [] : list}
        // Reposts are other people's posts: that tab's feed is just what it shows.
        source={tab === 'reposts' ? LIST_SOURCE : { from: 'user', userId }}
        subtitle={profile.username}
        header={head}
        footer={lockedCard}
        refreshing={refreshing}
        onRefresh={() => { setRefreshing(true); setRefreshKey((k) => k + 1); load(); }}
        empty={
          profile.is_blocked ? (
            <Empty title={t('profile.youBlocked')} body={t('profile.youBlockedBody')} />
          ) : locked ? (
            <Empty icon="lock" title={t('profile.private')} body={t('profile.privateBody')} />
          ) : mine && tab !== 'reposts' ? (
            <ShareFirst title={emptyFor[tab][0]} body={emptyFor[tab][1]} onPress={() => { prefetchLibrary(); router.push(tab === 'reels' ? '/create?mode=shorts' : '/create?mode=post'); }} />
          ) : lockedCard ? (
            // Everything they've posted is for subscribers: the card below says so, rather than "No posts yet".
            <View style={{ height: 16 }} />
          ) : (
            <Empty title={emptyFor[tab][0]} body={emptyFor[tab][1]} />
          )
        }
      />

      {mine ? <AccountSwitcher visible={sheet === 'accounts'} onClose={() => setSheet(null)} /> : null}
      <Sheet visible={sheet === 'menu'} onClose={() => setSheet(null)}>
        {mine ? (
          <>
            <SheetRow first icon="info" label={t('profile.about')} onPress={later(() => setSheet('about'))} />
            <SheetRow icon="link" label={t('profile.copyLink')} onPress={later(copyLink)} />
            {profile.admin_role ? (
              <SheetRow
                icon="people"
                label={t('profile.hideConnections')}
               
                right={<Toggle value={profile.hide_connections} onChange={setHidden} label={t('profile.hideConnections')} />}
                onPress={() => setHidden(!profile.hide_connections)}
              />
            ) : null}
          </>
        ) : (
          <>
            <SheetRow first icon="link" label={t('profile.copyLink')} onPress={later(copyLink)} />
            <SheetRow icon="info" label={t('profile.about')} onPress={later(() => setSheet('about'))} />
            {profile.is_blocked ? null : (
              <SheetRow
                icon="star"
                label={profile.is_close_friend ? t('profile.removeCloseFriend') : t('profile.addCloseFriend')}
                onPress={later(() => {
                  const next = !profile.is_close_friend;
                  setCloseFriend(me, userId, next)
                    .then(() => {
                      setProfile({ ...profile, is_close_friend: next });
                      toast(next ? t('profile.nowCloseFriend', who) : t('profile.removedCloseFriend', who));
                    })
                    .catch((e) => toast(errText(e)));
                })}
              />
            )}
            <SheetRow
              icon="flag"
              label={t('profile.report')}
              danger
              onPress={later(() =>
                choices.ask({
                  title: t('profile.reportTitle'),
                  message: t('profile.reportWhy'),
                  icon: 'flag',
                  choices: REPORT_REASONS.map((r) => ({
                    label: t(r),
                    onPress: () => {
                      report(me, { userId }, en[r])
                        // A copyright report also says how to send a formal notice.
                        .then(() => (r === 'report.copyright' ? explainCopyrightReport().then((read) => { if (read) legal.open('copyright'); }) : toast(t('profile.reportThanks'))))
                        .catch((e) => toast(errText(e)));
                    },
                  })),
                }),
              )}
            />
            <SheetRow
              icon="block"
              label={profile.is_blocked ? t('profile.unblockUser', who) : t('profile.blockUser', who)}
              danger
              onPress={later(() => {
                if (profile.is_blocked) {
                  setBlock(me, userId, false).then(() => { toast(t('profile.unblocked', who)); load(); }).catch((e) => toast(errText(e)));
                  return;
                }
                Alert.alert(t('profile.blockQuestion', who), t('profile.blockBody'), [
                  { text: t('common.cancel'), style: 'cancel' },
                  { text: t('profile.block'), style: 'destructive', onPress: () => { setBlock(me, userId, true).then(() => { toast(t('profile.blocked', who)); load(); }).catch((e) => toast(errText(e))); } },
                ]);
              })}
            />
          </>
        )}
      </Sheet>

      {/* About this account: when it joined, where it's based, how it was verified and when it was last about. */}
      <Sheet visible={sheet === 'about'} onClose={() => setSheet(null)} title={t('profile.about')}>
        <View style={{ alignItems: 'center', paddingHorizontal: 24, paddingBottom: 14 }}>
          <Avatar uri={profile.avatar_url} name={profile.full_name || profile.username} size={76} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 10 }}>
            <Text numberOfLines={1} style={{ color: C.fg, fontSize: 17, fontWeight: '700', flexShrink: 1 }}>{profile.username}</Text>
            {profile.verified ? <VerifiedTick /> : null}
          </View>
        </View>
        {Number.isNaN(joined.getTime()) ? null : <AboutRow icon={<Icon name="calendar" size={21} color={C.fg} />} title={t('profile.dateJoined')} value={`${monthName(joined)} ${joined.getFullYear()}`} />}
        {profile.country ? <AboutRow icon={<Icon name="location" size={21} color={C.fg} />} title={t('profile.basedIn')} value={profile.country} /> : null}
        {profile.verified ? <AboutRow icon={<VerifiedTick size={22} />} title={verifiedHow} value={verifiedWhy} /> : null}
        {lastActive ? <AboutRow icon={<Icon name="clock" size={21} color={C.fg} />} title={t('profile.activeStatus')} value={lastActive} /> : null}
        <View style={{ height: 8 }} />
      </Sheet>

      {showBell ? (
        <AlertsMenu
          anchor={alertsAt}
          targetId={userId}
          username={profile.username}
          onClose={() => setAlertsAt(null)}
          onChange={(on) => setProfile((p) => (p ? { ...p, alerts_on: on } : p))}
        />
      ) : null}
      {choices.element}
      {legal.element}
    </Screen>
  );
}
