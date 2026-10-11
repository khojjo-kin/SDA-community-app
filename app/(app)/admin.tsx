import React, { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { AdminFrame, money, useWide } from '../../src/components/AdminFrame';
import { Icon, IconName } from '../../src/components/Icon';
import { Skeleton } from '../../src/components/Skeleton';
import { Divider, Empty, Row, Screen, ScreenHeader, SectionLabel } from '../../src/components/ui';
import { countPendingPublishers, fetchAdminQueue, fetchAdminStats } from '../../src/lib/api';
import { t } from '../../src/lib/i18n';
import { useSession } from '../../src/lib/session';
import { supabase } from '../../src/lib/supabase';
import { C, count, errText, fmt } from '../../src/lib/theme';
import type { AdminQueue, AdminStats } from '../../src/lib/types';

/**
 * One number on the console's desk. With `href` it opens the section the number comes from. While
 * the numbers are on their way a soft block stands in for each; `x` is where it sits, for the shine.
 */
function Tile({ value, label, tone, icon, href, wide, loading, x }: { value: string | undefined; label: string; tone?: 'warn' | 'ok'; icon?: IconName; href?: string; wide?: boolean; loading?: boolean; x?: number }) {
  const router = useRouter();
  const color = tone === 'warn' && value && value !== '0' ? C.like : tone === 'ok' ? C.accent2 : C.fg;
  const body = (
    <>
      {icon ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Icon name={icon} size={18} color={C.fg3} weight={2} />
          {href ? <Icon name="right" size={14} color={C.fg3} weight={2.2} /> : null}
        </View>
      ) : null}
      {value === undefined && loading ? (
        <Skeleton width={52} height={22} x={x} base={C.surface2} style={{ marginTop: icon ? 8 : 2, marginBottom: 3 }} />
      ) : (
        <Text numberOfLines={1} adjustsFontSizeToFit style={{ color, fontSize: 22, fontWeight: '800', fontVariant: ['tabular-nums'], marginTop: icon ? 6 : 0 }}>{value ?? '–'}</Text>
      )}
      <Text style={{ color: C.fg2, fontSize: 12.5 }}>{label}</Text>
    </>
  );
  const base = { flexBasis: wide ? '23%' : '31%', flexGrow: 1, padding: 14, borderRadius: 14, backgroundColor: C.surface, gap: 2 } as const;
  if (!href) return <View style={base}>{body}</View>;
  return (
    <Pressable onPress={() => router.push(href as any)} accessibilityRole="button" accessibilityLabel={`${label}, ${value ?? 'not loaded yet'}`} style={({ pressed }) => [base, { opacity: pressed ? 0.7 : 1 }]}>
      {body}
    </Pressable>
  );
}

/** The admin's desk: how the community is doing, and what needs a decision. */
export default function Admin() {
  const { profile } = useSession();
  const router = useRouter();
  const wide = useWide();
  const { width } = useWindowDimensions();
  const [stats, setStats] = useState<AdminStats | null>(null);
  // What is waiting: churches to approve, identity checks, running ads and fundraisers.
  const [queue, setQueue] = useState<AdminQueue | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  // Open support chats. The stats' support_open counts the old tickets, so chats are counted here.
  const [chatsOpen, setChatsOpen] = useState<number | undefined>(undefined);
  const [publishersPending, setPublishersPending] = useState<number | undefined>(undefined);
  const admin = !!profile?.admin_role;

  // Resolves once the numbers that matter (stats and the queue) have come back, or failed.
  const load = useCallback((): Promise<void> => {
    if (!admin) return Promise.resolve();
    countPendingPublishers().then(setPublishersPending, () => {});
    supabase
      .from('community_support_chats')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'open')
      .then(
        ({ count: n, error: err }) => {
          if (!err) setChatsOpen(n ?? 0);
        },
        () => {},
      );
    return Promise.all([fetchAdminStats().then(setStats), fetchAdminQueue().then(setQueue)])
      .then(() => setError(''))
      .catch((e) => setError(errText(e)));
  }, [admin]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  function pull() {
    setRefreshing(true);
    load().finally(() => setRefreshing(false));
  }

  if (!admin || !profile) {
    return (
      <Screen>
        <ScreenHeader title="Admin tools" />
        <Empty icon="shield" title="Admins only" />
      </Screen>
    );
  }

  const num = (n?: number) => (n === undefined ? undefined : fmt(n));
  const grid = { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 8, paddingHorizontal: 16 };
  // Plus requests are whatever is open that is not an identity check; only known once both have loaded.
  const plusOpen = stats && queue ? Math.max(0, stats.requests_open - queue.verifications_pending) : undefined;
  const loading = !stats && !error;
  // Where each tile's number sits from the left, so the loading shine sweeps across the grid as one.
  const cols = wide ? 4 : 3;
  const area = wide ? Math.min(width - 240, 880) : width;
  const left = wide ? 240 + Math.max(0, (width - 240 - 880) / 2) : 0;
  const tileW = (area - 32 - (cols - 1) * 8) / cols;
  const tile = (i: number) => ({ wide, loading, x: Math.round(left + 30 + (i % cols) * (tileW + 8)) });

  return (
    <AdminFrame section="overview" title="Admin tools">
      <ScrollView contentContainerStyle={{ paddingBottom: 60 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={pull} tintColor={C.fg2} />}>
        {error ? <Text style={{ color: C.like, paddingHorizontal: 16, paddingTop: 4, lineHeight: 20 }}>{error}</Text> : null}

        <SectionLabel>Right now</SectionLabel>
        <View style={grid}>
          <Tile {...tile(0)} icon="people" value={num(stats?.members)} label="Members" href="/admin-members" />
          <Tile {...tile(1)} icon="image" value={num(stats?.posts)} label="Posts" href="/admin-activity" />
          <Tile {...tile(2)} icon="live" value={num(stats?.lives_now)} label="Live now" tone="ok" href="/admin-activity" />
          <Tile {...tile(3)} icon="crown" value={num(stats?.plus)} label="Plus members" href="/admin-members" />
          <Tile {...tile(4)} icon="card" value={stats ? money(stats.income_month_pence) : undefined} label="Income this month" tone="ok" href="/admin-transactions" />
          <Tile {...tile(5)} icon="flag" value={num(stats?.reports_open)} label="Open reports" tone="warn" href="/admin-reports" />
          <Tile {...tile(6)} icon="verified" value={num(stats?.requests_open)} label="Open requests" tone="warn" href="/admin-requests" />
          <Tile {...tile(7)} icon="lifebuoy" value={num(chatsOpen)} label="Open support chats" tone="warn" href="/admin-support" />
        </View>

        <SectionLabel>This week</SectionLabel>
        <View style={grid}>
          <Tile {...tile(0)} value={num(stats?.members_week)} label="New members" tone="ok" />
          <Tile {...tile(1)} value={num(stats?.posts_week)} label="New posts" />
          <Tile {...tile(2)} value={num(stats?.messages_week)} label="Messages" />
          <Tile {...tile(3)} value={num(stats?.stories_live)} label="Live stories" />
        </View>

        <SectionLabel>All time</SectionLabel>
        <View style={grid}>
          <Tile {...tile(0)} value={num(stats?.verified)} label="Verified" />
          <Tile {...tile(1)} value={num(stats?.suspended)} label="Suspended" tone="warn" />
          <Tile {...tile(2)} value={num(stats?.deactivated)} label="Deactivated" />
          <Tile {...tile(3)} value={num(stats?.churches)} label="Churches" href="/churches" />
          <Tile {...tile(4)} value={num(stats?.groups)} label="Communities and pages" href="/groups" />
          <Tile {...tile(5)} value={num(stats?.pod_items)} label="On Pod" href="/pod" />
          {/* Income is the server's sum of Plus, ads and other payments, less their refunds. Gifts to
              fundraisers go to their organisers' own Stripe accounts, so they are counted apart. */}
          <Tile {...tile(6)} value={stats ? money(stats.income_pence) : undefined} label="Income all time" href="/admin-transactions" />
          {stats && stats.donations_pence === undefined ? null : (
            <Tile {...tile(7)} value={stats?.donations_pence === undefined ? undefined : money(stats.donations_pence)} label="Given to fundraisers" href="/admin-ads" />
          )}
        </View>

        <SectionLabel>Needs you</SectionLabel>
        <Row icon="flag" title="Reports" badge={stats?.reports_open} onPress={() => router.push('/admin-reports')} />
        <Row icon="idcard" title="Identity checks" badge={queue?.verifications_pending} onPress={() => router.push('/admin-requests')} />
        <Row icon="crown" title="Plus requests" badge={plusOpen} onPress={() => router.push('/admin-requests?kind=plus' as any)} />
        <Row icon="lesson" title={t('adminPub.title')} badge={publishersPending} onPress={() => router.push('/admin-publishers' as any)} />
        <Row icon="church" title="Churches to approve" badge={queue?.churches_pending} onPress={() => router.push('/admin-churches' as any)} />
        <Row icon="lifebuoy" title="Support chats" badge={chatsOpen} onPress={() => router.push('/admin-support')} />
        <Row icon="star" title="Feedback and reviews" onPress={() => router.push('/admin-feedback' as any)} />
        <Divider />

        <SectionLabel>Members</SectionLabel>
        <Row icon="people" title="Members" value={num(stats?.members)} onPress={() => router.push('/admin-members')} />
        <Row icon="shield" title="Admins" onPress={() => router.push('/admin-admins')} />
        <Divider />

        <SectionLabel>Money and activity</SectionLabel>
        <Row icon="receipt" title="Transactions" value={stats ? money(stats.income_month_pence) : undefined} onPress={() => router.push('/admin-transactions')} />
        <Row icon="megaphone" title="Ads and fundraisers" sub={queue ? `${count(queue.ads_active, 'ad')} running · ${count(queue.fundraisers_active, 'fundraiser')}` : undefined} onPress={() => router.push('/admin-ads' as any)} />
        <Row icon="pulse" title="Activity" onPress={() => router.push('/admin-activity')} />
        <Divider />

        <SectionLabel>Content</SectionLabel>
        <Row icon="church" title="Churches" value={num(stats?.churches)} onPress={() => router.push('/churches')} />
        <Row icon="hymnal" title="Hymnal" value={num(stats?.hymns)} onPress={() => router.push('/hymnal')} />
        <Row icon="headphones" title="Pod" value={num(stats?.pod_items)} onPress={() => router.push('/pod' as any)} />
        <Row icon="users" title="Communities and pages" value={num(stats?.groups)} onPress={() => router.push('/groups')} />
        <Row icon="gavel" title="Offensive words" onPress={() => router.push('/admin-words' as any)} />
      </ScrollView>
    </AdminFrame>
  );
}
