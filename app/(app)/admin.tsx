import React, { useCallback, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { AdminFrame, money, useWide } from '../../src/components/AdminFrame';
import { Icon, IconName } from '../../src/components/Icon';
import { Divider, Empty, Row, Screen, ScreenHeader, SectionLabel } from '../../src/components/ui';
import { fetchAdminStats } from '../../src/lib/api';
import { useSession } from '../../src/lib/session';
import { C, errText, fmt } from '../../src/lib/theme';
import type { AdminStats } from '../../src/lib/types';

/** One number on the console's desk. With `href` it opens the section the number comes from. */
function Tile({ value, label, tone, icon, href, wide }: { value: string | undefined; label: string; tone?: 'warn' | 'ok'; icon?: IconName; href?: string; wide?: boolean }) {
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
      <Text numberOfLines={1} adjustsFontSizeToFit style={{ color, fontSize: 22, fontWeight: '800', fontVariant: ['tabular-nums'], marginTop: icon ? 6 : 0 }}>{value ?? '–'}</Text>
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
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [error, setError] = useState('');

  useFocusEffect(
    useCallback(() => {
      if (!profile?.admin_role) return;
      fetchAdminStats().then(setStats).catch((e) => setError(errText(e)));
    }, [profile?.admin_role]),
  );

  if (!profile?.admin_role) {
    return (
      <Screen>
        <ScreenHeader title="Admin tools" />
        <Empty icon="shield" title="Admins only" body="The app owner can make you an admin from their admin tools." />
      </Screen>
    );
  }

  const owner = profile.admin_role === 'owner';
  const badge = (n?: number) => (n ? String(n) : undefined);
  const num = (n?: number) => (n === undefined ? undefined : fmt(n));
  const grid = { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 8, paddingHorizontal: 16 };

  return (
    <AdminFrame section="overview" title="Admin tools">
      <ScrollView contentContainerStyle={{ paddingBottom: 60 }}>
        <Text style={{ color: C.fg2, paddingHorizontal: 16, paddingTop: 4, lineHeight: 20 }}>
          {owner ? 'You own this app. Everything here is yours to decide, including who else gets these tools.' : 'You help look after the community. Decisions here are logged against your account.'}
        </Text>
        {error ? <Text style={{ color: C.like, paddingHorizontal: 16, paddingTop: 10 }}>{error}</Text> : null}

        <SectionLabel>Right now</SectionLabel>
        <View style={grid}>
          <Tile wide={wide} icon="people" value={num(stats?.members)} label="Members" href="/admin-members" />
          <Tile wide={wide} icon="image" value={num(stats?.posts)} label="Posts" href="/admin-activity" />
          <Tile wide={wide} icon="live" value={num(stats?.lives_now)} label="Live now" tone="ok" href="/admin-activity" />
          <Tile wide={wide} icon="crown" value={num(stats?.plus)} label="Plus members" href="/admin-members" />
          <Tile wide={wide} icon="card" value={stats ? money(stats.income_month_pence) : undefined} label="Income this month" tone="ok" href="/admin-transactions" />
          <Tile wide={wide} icon="flag" value={num(stats?.reports_open)} label="Open reports" tone="warn" href="/admin-reports" />
          <Tile wide={wide} icon="verified" value={num(stats?.requests_open)} label="Open requests" tone="warn" href="/admin-requests" />
          <Tile wide={wide} icon="lifebuoy" value={num(stats?.support_open)} label="Open support" tone="warn" href="/admin-support" />
        </View>

        <SectionLabel>This week</SectionLabel>
        <View style={grid}>
          <Tile wide={wide} value={num(stats?.members_week)} label="New members" tone="ok" />
          <Tile wide={wide} value={num(stats?.posts_week)} label="New posts" />
          <Tile wide={wide} value={num(stats?.messages_week)} label="Messages" />
          <Tile wide={wide} value={num(stats?.stories_live)} label="Live stories" />
        </View>

        <SectionLabel>All time</SectionLabel>
        <View style={grid}>
          <Tile wide={wide} value={num(stats?.verified)} label="Verified" />
          <Tile wide={wide} value={num(stats?.suspended)} label="Suspended" tone="warn" />
          <Tile wide={wide} value={num(stats?.deactivated)} label="Deactivated" />
          <Tile wide={wide} value={num(stats?.churches)} label="Churches" href="/churches" />
          <Tile wide={wide} value={num(stats?.groups)} label="Communities and pages" href="/groups" />
          <Tile wide={wide} value={num(stats?.pod_items)} label="On Pod" href="/pod" />
          <Tile wide={wide} value={stats ? money(stats.income_pence) : undefined} label="Income all time" href="/admin-transactions" />
        </View>

        <SectionLabel>Needs you</SectionLabel>
        <Row icon="flag" title="Reports" sub="What members have flagged" value={badge(stats?.reports_open)} onPress={() => router.push('/admin-reports')} />
        <Row icon="verified" title="Tick and Plus requests" sub="Approve or decline" value={badge(stats?.requests_open)} onPress={() => router.push('/admin-requests')} />
        <Row icon="lifebuoy" title="Support inbox" sub="Questions from members, answered in the app" value={badge(stats?.support_open)} onPress={() => router.push('/admin-support')} />
        <Divider />

        <SectionLabel>Members</SectionLabel>
        <Row icon="people" title="Members" sub="Find anyone; verify, give Plus, suspend" onPress={() => router.push('/admin-members')} />
        <Row icon="shield" title="Admins" sub={owner ? 'Choose who else has these tools' : 'Who looks after the app'} onPress={() => router.push('/admin-admins')} />
        <Divider />

        <SectionLabel>Money and activity</SectionLabel>
        <Row icon="receipt" title="Transactions" sub="Plus payments, donations and refunds" value={stats ? money(stats.income_month_pence) : undefined} onPress={() => router.push('/admin-transactions')} />
        <Row icon="pulse" title="Activity" sub="Who joined, posted, went live or wrote in" onPress={() => router.push('/admin-activity')} />
        <Divider />

        <SectionLabel>Content</SectionLabel>
        <Row icon="church" title="Churches" sub="Add and correct churches" onPress={() => router.push('/churches')} />
        <Row icon="hymnal" title="Hymnal" sub={`${stats?.hymns ?? '–'} hymns · add or edit`} onPress={() => router.push('/hymnal')} />
        <Row icon="headphones" title="Pod" sub="Songs and podcasts shared by members" onPress={() => router.push('/pod' as any)} />
        <Row icon="users" title="Communities and pages" sub="Groups and the ministries people follow" onPress={() => router.push('/groups')} />
      </ScrollView>
    </AdminFrame>
  );
}
