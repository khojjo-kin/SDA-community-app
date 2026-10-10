import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Icon } from '../../src/components/Icon';
import { Button, Divider, Empty, ErrorNote, NewPill, RoundButton, Row, Screen, ScreenHeader, SectionLabel } from '../../src/components/ui';
import { fetchStats } from '../../src/lib/api';
import { useSession } from '../../src/lib/session';
import { C, dayLabel, errText, fmt } from '../../src/lib/theme';
import type { Stats } from '../../src/lib/types';

const DAYS = 30;

function StatRow({ title, value, before, onPress }: { title: string; value: number | null; before: number | null; onPress: () => void }) {
  const up = value !== null && before !== null && value > before;
  const down = value !== null && before !== null && value < before;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${title}: ${value === null ? 'loading' : fmt(value)}${up ? ', up on the 30 days before' : down ? ', down on the 30 days before' : ''}`} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, minHeight: 52, backgroundColor: pressed ? C.press : 'transparent' })}>
      <Text style={{ flex: 1, color: C.fg, fontSize: 17.5 }}>{title}</Text>
      {up ? <Icon name="up" size={18} color={C.ok} weight={2.2} /> : down ? <Icon name="dip" size={18} color={C.danger} weight={2.2} /> : null}
      <Text style={{ color: value === null ? C.fg3 : C.fg, fontSize: 19, fontVariant: ['tabular-nums'] }}>{value === null ? '–' : fmt(value)}</Text>
      <Icon name="right" size={18} color={C.fg2} weight={2} />
    </Pressable>
  );
}

export default function Dashboard() {
  const { profile } = useSession();
  const router = useRouter();
  const [now, setNow] = useState<Stats | null>(null);
  const [before, setBefore] = useState<Stats | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [range, setRange] = useState(() => {
    const to = new Date();
    return { from: new Date(to.getTime() - DAYS * 86400e3), to };
  });
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);
  // One screen per tap, however quickly a row is tapped twice.
  const lastPush = useRef(0);
  const open = (href: string) => {
    if (Date.now() - lastPush.current < 800) return;
    lastPush.current = Date.now();
    router.push(href);
  };

  const load = useCallback(async () => {
    const to = new Date();
    const from = new Date(to.getTime() - DAYS * 86400e3);
    const earlier = new Date(from.getTime() - DAYS * 86400e3);
    try {
      setError('');
      const [a, b] = await Promise.all([fetchStats(from, to), fetchStats(earlier, from)]);
      if (!alive.current) return;
      // The dates change with the numbers, so the two always match.
      setRange({ from, to });
      setNow(a);
      setBefore(b);
    } catch (e) {
      if (alive.current) setError(errText(e));
    } finally {
      if (alive.current) setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (profile?.account_type !== 'creator') {
    return (
      <Screen>
        <ScreenHeader title="Your dashboard" />
        <Empty icon="chart" title="The dashboard comes with a creator account" action={<Button small label="Switch account type" onPress={() => open('/account-type')} style={{ marginTop: 8 }} />} />
      </Screen>
    );
  }

  const shared = now ? now.posts + now.reels + now.stories : null;
  const sharedBefore = before ? before.posts + before.reels + before.stories : null;

  return (
    <Screen>
      <ScreenHeader title="Your dashboard" right={<RoundButton name="settings" label="Creator tools and controls" onPress={() => open('/creator')} />} />
      <ScrollView contentContainerStyle={{ paddingBottom: 60 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={C.fg2} />}>
        <SectionLabel strong right={<Text style={{ color: C.fg2, fontSize: 16.5, fontWeight: '600' }}>{dayLabel(range.from)} – {dayLabel(range.to)}</Text>}>
          Insights
        </SectionLabel>
        {error && !now ? (
          <ErrorNote message={error} onRetry={load} />
        ) : (
          <>
            <StatRow title="Views" value={now?.views ?? null} before={before?.views ?? null} onPress={() => open('/insights?kind=views')} />
            <StatRow title="New followers" value={now?.new_followers ?? null} before={before?.new_followers ?? null} onPress={() => open('/insights?kind=followers')} />
            <StatRow title="Content you shared" value={shared} before={sharedBefore} onPress={() => open('/insights?kind=content')} />
          </>
        )}
        <View style={{ height: 14 }} />
        <Divider thin />

        <SectionLabel strong right={<Text onPress={() => open('/creator')} accessibilityRole="link" style={{ color: C.accent2, fontSize: 17, fontWeight: '600' }}>See all</Text>}>
          Your tools
        </SectionLabel>
        <Row icon="archive" title="Monthly recap" right={<NewPill />} onPress={() => open('/recap')} />
        <Row icon="cap" title="Best practices" onPress={() => open('/best-practices')} />
        <Row icon="bulb" title="Inspiration" onPress={() => open('/inspiration')} />
        <Row icon="reply" title="Saved replies" onPress={() => open('/saved-replies')} />
        <Row icon="question" title="Frequently asked questions" value={profile.faq_enabled ? 'On' : 'Off'} onPress={() => open('/faq')} />
      </ScrollView>
    </Screen>
  );
}
