import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, RefreshControl, SectionList, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { VerifiedTick } from '../../src/components/Icon';
import { RowsSkeleton } from '../../src/components/Skeleton';
import { Avatar, Button, Empty, ErrorNote, Screen, ScreenHeader, SectionLabel, useToast } from '../../src/components/ui';
import { fetchProfileViewers } from '../../src/lib/api';
import { useSession } from '../../src/lib/session';
import { ago, C, errText } from '../../src/lib/theme';
import type { ProfileViewer } from '../../src/lib/types';

type Bucket = 'Today' | 'This week' | 'Earlier';
const BUCKETS: Bucket[] = ['Today', 'This week', 'Earlier'];

function bucket(iso: string): Bucket {
  const d = new Date(iso);
  const now = new Date();
  if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()) return 'Today';
  if (now.getTime() - d.getTime() < 7 * 86400e3) return 'This week';
  return 'Earlier';
}

/** One person who looked. Memoised: the list draws again on every refresh, and a row only changes with its viewer. */
const ViewerRow = React.memo(function ViewerRow({ v, onOpen }: { v: ProfileViewer; onOpen: (id: string) => void }) {
  const name = v.username || v.full_name;
  return (
    <Pressable
      onPress={() => onOpen(v.viewer_id)}
      accessibilityRole="button"
      accessibilityLabel={`${v.full_name}, ${v.username}, viewed ${ago(v.viewed_at)} ago`}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: pressed ? C.press : 'transparent' })}>
      <Avatar uri={v.avatar_url} name={v.full_name || v.username} size={50} />
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Text numberOfLines={1} style={{ color: C.fg, fontWeight: '600', flexShrink: 1 }}>{name}</Text>
          {v.verified ? <VerifiedTick size={14} /> : null}
        </View>
        {v.full_name && v.username ? <Text numberOfLines={1} style={{ color: C.fg2, fontSize: 13.5 }}>{v.full_name}</Text> : null}
      </View>
      <Text style={{ color: C.fg2, fontSize: 13.5, fontVariant: ['tabular-nums'] }}>{ago(v.viewed_at)}</Text>
    </Pressable>
  );
});

const keyOf = (v: ProfileViewer) => v.viewer_id + v.viewed_at;

/** Who looked at my profile. A Community Plus perk: the database refuses the list to anyone else. */
export default function ProfileViewers() {
  const { me, profile } = useSession();
  const router = useRouter();
  const toast = useToast();
  const [list, setList] = useState<ProfileViewer[] | null>(null);
  // Whether a list is on screen, so a failed refresh says so in a toast instead of replacing it.
  const hasList = useRef(false);
  hasList.current = list !== null;
  const [error, setError] = useState('');
  const [gated, setGated] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);
  // One profile per tap, however quickly a row is tapped twice.
  const lastPush = useRef(0);
  const open = useCallback(
    (id: string) => {
      if (Date.now() - lastPush.current < 800) return;
      lastPush.current = Date.now();
      router.push(`/user/${id}`);
    },
    [router],
  );

  const load = useCallback(async () => {
    try {
      const rows = await fetchProfileViewers(me);
      if (!alive.current) return;
      setList(rows);
      setError('');
      setGated(!rows.length && !profile?.plus);
    } catch (e) {
      if (!alive.current) return;
      if ((e as any)?.code === '42501') {
        setGated(true);
        setList([]);
        setError('');
      } else if (hasList.current) {
        toast(errText(e));
      } else {
        setError(errText(e));
      }
    } finally {
      if (alive.current) setRefreshing(false);
    }
  }, [me, profile?.plus, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const sections = BUCKETS.map((title) => ({ title, data: (list ?? []).filter((v) => bucket(v.viewed_at) === title) })).filter((s) => s.data.length);
  const renderItem = useCallback(({ item }: { item: ProfileViewer }) => <ViewerRow v={item} onOpen={open} />, [open]);

  let body: React.ReactNode;
  if (list === null && error) body = <ErrorNote message={error} onRetry={() => { setError(''); load(); }} />;
  else if (list === null) body = <RowsSkeleton count={8} avatar={50} />;
  else if (gated) body = <Empty icon="eye" title="See who viewed your profile" action={<Button label="Get Community Plus" small style={{ marginTop: 8 }} onPress={() => router.push('/plus')} />} />;
  else
    body = (
      <SectionList
        sections={sections}
        keyExtractor={keyOf}
        renderSectionHeader={({ section }) => <SectionLabel>{section.title}</SectionLabel>}
        stickySectionHeadersEnabled={false}
        renderItem={renderItem}
        initialNumToRender={14}
        windowSize={7}
        ListEmptyComponent={<Empty icon="eye" title="Nobody yet" />}
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={C.fg2} />}
      />
    );

  return (
    <Screen>
      <ScreenHeader title="Profile viewers" />
      {body}
    </Screen>
  );
}
