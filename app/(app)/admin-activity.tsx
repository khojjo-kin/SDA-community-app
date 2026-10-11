import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, RefreshControl, SectionList, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { AdminFrame, PageSpinner } from '../../src/components/AdminFrame';
import { Icon, IconName } from '../../src/components/Icon';
import { RowsSkeleton } from '../../src/components/Skeleton';
import { Empty, ErrorNote, SectionLabel, useToast } from '../../src/components/ui';
import { fetchAdminActivity } from '../../src/lib/api';
import { C, dayLabel, errText } from '../../src/lib/theme';
import type { ActivityRow } from '../../src/lib/types';

/** How many lines come first, and the most the server gives. */
const FIRST = 100;
const MOST = 300;

const ICON: Record<ActivityRow['kind'], IconName> = {
  joined: 'user',
  post: 'image',
  reel: 'reels',
  live: 'live',
  report: 'flag',
  transaction: 'receipt',
  support: 'lifebuoy',
  plus_request: 'crown',
  group: 'users',
};

const WORD: Record<ActivityRow['kind'], string> = {
  joined: 'joined',
  post: 'posted',
  reel: 'shared a short',
  live: 'went live',
  report: 'reported',
  transaction: 'transaction',
  support: 'wrote to support',
  plus_request: 'asked for Plus',
  group: 'group',
};

/** A function, not a table, so the colours are read from the theme in use when it is drawn. */
function tone(kind: ActivityRow['kind']): string | undefined {
  const tones: Partial<Record<ActivityRow['kind'], string>> = { report: C.like, live: C.accent2, transaction: C.accent2, plus_request: C.close, joined: C.accent2 };
  return tones[kind];
}

const pad = (n: number) => String(n).padStart(2, '0');
const time = (iso: string) => {
  const d = new Date(iso);
  return pad(d.getHours()) + ':' + pad(d.getMinutes());
};

/** "Today", "Yesterday", or "9 Sep". */
function dayTitle(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOf(now) - startOf(d)) / 86400e3);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return dayLabel(d) + (d.getFullYear() === now.getFullYear() ? '' : ' ' + d.getFullYear());
}

const ActivityLine = React.memo(function ActivityLine({ r, onOpen }: { r: ActivityRow; onOpen: (userId: string) => void }) {
  const color = tone(r.kind) ?? C.fg2;
  const who = r.username ? `@${r.username}` : 'Someone';
  const detail = r.detail?.trim() || WORD[r.kind];
  const body = (
    <>
      <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={ICON[r.kind] ?? 'pulse'} size={19} color={color} weight={2} />
      </View>
      <View style={{ flex: 1 }}>
        <Text numberOfLines={2} style={{ color: C.fg, fontSize: 15, lineHeight: 20 }}>
          <Text style={{ fontWeight: '700' }}>{who}</Text>
          <Text style={{ color: C.fg2 }}> · {detail}</Text>
        </Text>
      </View>
      <Text style={{ color: C.fg3, fontSize: 12.5, fontVariant: ['tabular-nums'] }}>{time(r.at)}</Text>
    </>
  );
  const style = { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12, paddingHorizontal: 16, paddingVertical: 8 };
  if (!r.user_id) return <View style={style}>{body}</View>;
  const id = r.user_id;
  return (
    <Pressable onPress={() => onOpen(id)} accessibilityRole="button" accessibilityLabel={`${who}, ${detail}, ${time(r.at)}`} style={({ pressed }) => [style, { backgroundColor: pressed ? C.press : 'transparent' }]}>
      {body}
    </Pressable>
  );
});

/** Everything that happened across the community, newest first, a day at a time. */
export default function AdminActivity() {
  const router = useRouter();
  const toast = useToast();
  const [rows, setRows] = useState<ActivityRow[] | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [paging, setPaging] = useState(false);
  // How many lines are asked for: more as the list is scrolled to its end, up to the server's most.
  const limit = useRef(FIRST);
  const shown = useRef<ActivityRow[] | null>(null);
  shown.current = rows;
  const asked = useRef(0);

  const load = useCallback(
    (how: 'quiet' | 'pull' | 'more' = 'quiet') => {
      const n = ++asked.current;
      if (how === 'pull') setRefreshing(true);
      if (how === 'more') setPaging(true);
      fetchAdminActivity(limit.current)
        .then((list) => {
          if (n !== asked.current) return;
          setRows(list);
          setError('');
        })
        .catch((e) => {
          if (n !== asked.current) return;
          if (shown.current === null) setError(errText(e));
          else if (how !== 'quiet') toast(errText(e));
        })
        .finally(() => {
          if (how === 'pull') setRefreshing(false);
          if (how === 'more') setPaging(false);
        });
    },
    [toast],
  );
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  function more() {
    // A full answer means there may be more; the server gives at most MOST lines.
    if (!rows || paging || rows.length < limit.current || limit.current >= MOST) return;
    limit.current = MOST;
    load('more');
  }

  const sections = useMemo(() => {
    const out: { title: string; data: ActivityRow[] }[] = [];
    for (const r of rows ?? []) {
      const title = dayTitle(r.at);
      const last = out[out.length - 1];
      if (last && last.title === title) last.data.push(r);
      else out.push({ title, data: [r] });
    }
    return out;
  }, [rows]);

  const open = useCallback((userId: string) => router.push(`/admin-member/${userId}`), [router]);
  const renderItem = useCallback(({ item }: { item: ActivityRow }) => <ActivityLine r={item} onOpen={open} />, [open]);

  return (
    <AdminFrame section="activity" title="Activity">
      {rows === null ? (
        error ? <ErrorNote message={error} onRetry={() => { setError(''); load(); }} /> : <RowsSkeleton count={10} avatar={36} padY={8} />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(r, i) => r.at + r.kind + (r.user_id ?? '') + i}
          stickySectionHeadersEnabled={false}
          renderSectionHeader={({ section }) => <SectionLabel>{section.title}</SectionLabel>}
          renderItem={renderItem}
          initialNumToRender={20}
          onEndReached={more}
          onEndReachedThreshold={0.5}
          contentContainerStyle={{ paddingBottom: 40 }}
          ListFooterComponent={<PageSpinner active={paging} />}
          ListEmptyComponent={<Empty icon="pulse" title="Nothing yet" />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load('pull')} tintColor={C.fg2} />}
        />
      )}
    </AdminFrame>
  );
}
