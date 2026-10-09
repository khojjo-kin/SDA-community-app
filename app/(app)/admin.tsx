import React, { useCallback, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Divider, Empty, Row, Screen, ScreenHeader, SectionLabel } from '../../src/components/ui';
import { fetchAdminStats } from '../../src/lib/api';
import { useSession } from '../../src/lib/session';
import { C, errText, fmt } from '../../src/lib/theme';
import type { AdminStats } from '../../src/lib/types';

function Tile({ n, label, tone }: { n: number | undefined; label: string; tone?: 'warn' | 'ok' }) {
  const color = tone === 'warn' && n ? C.like : tone === 'ok' ? C.accent2 : C.fg;
  return (
    <View style={{ flexBasis: '31%', flexGrow: 1, padding: 14, borderRadius: 14, backgroundColor: C.surface, gap: 2 }}>
      <Text style={{ color, fontSize: 22, fontWeight: '800', fontVariant: ['tabular-nums'] }}>{n === undefined ? '–' : fmt(n)}</Text>
      <Text style={{ color: C.fg2, fontSize: 12.5 }}>{label}</Text>
    </View>
  );
}

/** The admin's desk: how the community is doing, and what needs a decision. */
export default function Admin() {
  const { profile } = useSession();
  const router = useRouter();
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

  return (
    <Screen>
      <ScreenHeader title="Admin tools" />
      <ScrollView contentContainerStyle={{ paddingBottom: 60 }}>
        <Text style={{ color: C.fg2, paddingHorizontal: 16, paddingTop: 4, lineHeight: 20 }}>
          {owner ? 'You own this app. Everything here is yours to decide, including who else gets these tools.' : 'You help look after the community. Decisions here are logged against your account.'}
        </Text>
        {error ? <Text style={{ color: C.like, paddingHorizontal: 16, paddingTop: 10 }}>{error}</Text> : null}

        <SectionLabel>This week</SectionLabel>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16 }}>
          <Tile n={stats?.members_week} label="New members" tone="ok" />
          <Tile n={stats?.posts_week} label="New posts" />
          <Tile n={stats?.messages_week} label="Messages" />
          <Tile n={stats?.reports_open} label="Open reports" tone="warn" />
          <Tile n={stats?.requests_open} label="Requests" tone="warn" />
          <Tile n={stats?.stories_live} label="Live stories" />
        </View>

        <SectionLabel>All time</SectionLabel>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16 }}>
          <Tile n={stats?.members} label="Members" />
          <Tile n={stats?.posts} label="Posts" />
          <Tile n={stats?.verified} label="Verified" />
          <Tile n={stats?.plus} label="Plus" />
          <Tile n={stats?.suspended} label="Suspended" tone="warn" />
          <Tile n={stats?.churches} label="Churches" />
        </View>

        <SectionLabel>Needs you</SectionLabel>
        <Row icon="flag" title="Reports" sub="What members have flagged" value={badge(stats?.reports_open)} onPress={() => router.push('/admin-reports')} />
        <Row icon="verified" title="Tick and Plus requests" sub="Approve or decline" value={badge(stats?.requests_open)} onPress={() => router.push('/admin-requests')} />
        <Divider />

        <SectionLabel>Members</SectionLabel>
        <Row icon="people" title="Members" sub="Find anyone; verify, give Plus, suspend" onPress={() => router.push('/admin-members')} />
        <Row icon="shield" title="Admins" sub={owner ? 'Choose who else has these tools' : 'Who looks after the app'} onPress={() => router.push('/admin-admins')} />
        <Divider />

        <SectionLabel>Content</SectionLabel>
        <Row icon="church" title="Churches" sub="Add and correct churches" onPress={() => router.push('/churches')} />
        <Row icon="hymnal" title="Hymnal" sub={`${stats?.hymns ?? '–'} hymns · add or edit`} onPress={() => router.push('/hymnal')} />
      </ScrollView>
    </Screen>
  );
}
