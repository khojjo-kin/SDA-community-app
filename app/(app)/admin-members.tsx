import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Icon, VerifiedTick } from '../../src/components/Icon';
import { MemberTags } from '../../src/components/MemberTags';
import { Avatar, Empty, ErrorNote, Loading, Screen, ScreenHeader, SearchField } from '../../src/components/ui';
import { fetchMembers } from '../../src/lib/api';
import { ago, C, errText } from '../../src/lib/theme';
import type { MemberCard } from '../../src/lib/types';

export default function AdminMembers() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [members, setMembers] = useState<MemberCard[] | null>(null);
  const [error, setError] = useState('');

  const load = useCallback((needle: string) => {
    fetchMembers(needle).then(setMembers).catch((e) => setError(errText(e)));
  }, []);
  useFocusEffect(useCallback(() => { load(q); }, [load, q]));
  useEffect(() => {
    const t = setTimeout(() => load(q), 250);
    return () => clearTimeout(t);
  }, [q, load]);

  return (
    <Screen>
      <ScreenHeader title="Members" />
      <View style={{ paddingBottom: 8 }}>
        <SearchField value={q} onChangeText={setQ} label="Search members" placeholder="Name or username" />
      </View>
      {members === null ? (
        error ? <ErrorNote message={error} onRetry={() => load(q)} /> : <Loading />
      ) : (
        <FlatList
          data={members}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={<Empty icon="people" title="No members found" body="Try another name." />}
          renderItem={({ item: m }) => (
            <Pressable onPress={() => router.push(`/admin-member/${m.id}`)} accessibilityRole="button" accessibilityLabel={`${m.full_name}, ${m.username}`} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 9, backgroundColor: pressed ? C.press : 'transparent' })}>
              <Avatar uri={m.avatar_url} name={m.full_name} size={50} />
              <View style={{ flex: 1, gap: 3 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Text numberOfLines={1} style={{ color: C.fg, fontWeight: '600', flexShrink: 1 }}>{m.full_name}</Text>
                  {m.verified ? <VerifiedTick size={14} /> : null}
                </View>
                <Text numberOfLines={1} style={{ color: C.fg2, fontSize: 13.5 }}>
                  @{m.username} · joined {ago(m.created_at)} · {m.posts_count} post{m.posts_count === 1 ? '' : 's'}{m.reports_count ? ` · ${m.reports_count} report${m.reports_count === 1 ? '' : 's'}` : ''}
                </Text>
                <MemberTags m={m} />
              </View>
              <Icon name="right" size={18} color={C.fg2} weight={2} />
            </Pressable>
          )}
        />
      )}
    </Screen>
  );
}
