import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, SectionList, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { VerifiedTick } from '../../src/components/Icon';
import { Avatar, Button, Empty, ErrorNote, Loading, Screen, ScreenHeader, SectionLabel } from '../../src/components/ui';
import { fetchProfileViewers } from '../../src/lib/api';
import { useSession } from '../../src/lib/session';
import { ago, C, errText } from '../../src/lib/theme';
import type { ProfileViewer } from '../../src/lib/types';

type Bucket = 'Today' | 'This week' | 'Earlier';

function bucket(iso: string): Bucket {
  const d = new Date(iso);
  const now = new Date();
  if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()) return 'Today';
  if (now.getTime() - d.getTime() < 7 * 86400e3) return 'This week';
  return 'Earlier';
}

/** Who looked at my profile. A Community Plus perk: the database refuses the list to anyone else. */
export default function ProfileViewers() {
  const { me, profile } = useSession();
  const router = useRouter();
  const [list, setList] = useState<ProfileViewer[] | null>(null);
  const [error, setError] = useState('');
  const [gated, setGated] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      const rows = await fetchProfileViewers(me);
      setList(rows);
      setGated(!rows.length && !profile?.plus);
    } catch (e) {
      if ((e as any)?.code === '42501') {
        setGated(true);
        setList([]);
      } else {
        setError(errText(e));
        setList([]);
      }
    } finally {
      setRefreshing(false);
    }
  }, [me, profile?.plus]);

  useEffect(() => {
    load();
  }, [load]);

  const sections = (['Today', 'This week', 'Earlier'] as Bucket[])
    .map((title) => ({ title, data: (list ?? []).filter((v) => bucket(v.viewed_at) === title) }))
    .filter((s) => s.data.length);

  return (
    <Screen>
      <ScreenHeader title="Profile viewers" />
      {list === null ? (
        <Loading />
      ) : error ? (
        <ErrorNote message={error} onRetry={load} />
      ) : gated ? (
        <Empty icon="eye" title="See who viewed your profile" body="Seeing who has looked at your profile is part of Community Plus." action={<Button label="Get Community Plus" small style={{ marginTop: 8 }} onPress={() => router.push('/plus')} />} />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(v) => v.viewer_id + v.viewed_at}
          renderSectionHeader={({ section }) => <SectionLabel>{section.title}</SectionLabel>}
          stickySectionHeadersEnabled={false}
          renderItem={({ item: v }) => (
            <Pressable
              onPress={() => router.push(`/user/${v.viewer_id}`)}
              accessibilityRole="button"
              accessibilityLabel={`${v.full_name}, ${v.username}, viewed ${ago(v.viewed_at)} ago`}
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: pressed ? 'rgba(255,255,255,0.04)' : 'transparent' })}>
              <Avatar uri={v.avatar_url} name={v.full_name} size={50} />
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Text numberOfLines={1} style={{ color: C.fg, fontWeight: '600', flexShrink: 1 }}>{v.username}</Text>
                  {v.verified ? <VerifiedTick size={14} /> : null}
                </View>
                <Text numberOfLines={1} style={{ color: C.fg2, fontSize: 13.5 }}>{v.full_name}</Text>
              </View>
              <Text style={{ color: C.fg2, fontSize: 13.5, fontVariant: ['tabular-nums'] }}>{ago(v.viewed_at)}</Text>
            </Pressable>
          )}
          ListEmptyComponent={<Empty icon="eye" title="Nobody yet" body="People who look at your profile will appear here." />}
          contentContainerStyle={{ paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={C.fg2} />}
        />
      )}
    </Screen>
  );
}
