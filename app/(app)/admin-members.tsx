import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { AdminFrame, PageSpinner, usePagedList } from '../../src/components/AdminFrame';
import { Icon, VerifiedTick } from '../../src/components/Icon';
import { MemberTags } from '../../src/components/MemberTags';
import { RowsSkeleton, SlowLine } from '../../src/components/Skeleton';
import { Avatar, Empty, ErrorNote, SearchField } from '../../src/components/ui';
import { fetchMember, fetchMembers } from '../../src/lib/api';
import { ago, C } from '../../src/lib/theme';
import type { MemberCard } from '../../src/lib/types';

const keyOfMember = (m: MemberCard) => m.id;

/** One member: face, name and tick, the facts an admin scans for, and their tags. */
const MemberRow = React.memo(function MemberRow({ m, onOpen }: { m: MemberCard; onOpen: (id: string) => void }) {
  return (
    <Pressable onPress={() => onOpen(m.id)} accessibilityRole="button" accessibilityLabel={`${m.full_name}, ${m.username}`} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 9, backgroundColor: pressed ? C.press : 'transparent' })}>
      <Avatar uri={m.avatar_url} name={m.full_name} size={50} />
      <View style={{ flex: 1, gap: 3 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Text numberOfLines={1} style={{ color: C.fg, fontWeight: '600', flexShrink: 1 }}>{m.full_name || m.username}</Text>
          {m.verified ? <VerifiedTick size={14} /> : null}
        </View>
        <Text numberOfLines={1} style={{ color: C.fg2, fontSize: 13.5 }}>
          @{m.username} · joined {ago(m.created_at)} · {m.posts_count} post{m.posts_count === 1 ? '' : 's'}
          {m.reports_count ? ` · ${m.reports_count} report${m.reports_count === 1 ? '' : 's'}` : ''}
        </Text>
        <MemberTags m={m} />
      </View>
      <Icon name="right" size={18} color={C.fg2} weight={2} />
    </Pressable>
  );
});

/** Everyone in the community, newest first, 50 at a time; search by name or username. */
export default function AdminMembers() {
  const router = useRouter();
  const [q, setQ] = useState('');
  // What the list was asked for: the search a moment after the last key.
  const [needle, setNeedle] = useState('');
  useEffect(() => {
    const wait = setTimeout(() => setNeedle(q.trim()), 250);
    return () => clearTimeout(wait);
  }, [q]);

  const fetchPage = useCallback((last: MemberCard | null) => fetchMembers(needle, last?.created_at), [needle]);
  const list = usePagedList(fetchPage, { pageSize: 50, keyOf: keyOfMember, swap: true });
  const { setItems } = list;

  // Coming back refreshes only the first page and keeps the rest, so the member just opened (and
  // perhaps verified, given Plus or suspended) is read again on its own wherever their row is.
  const opened = useRef('');
  useFocusEffect(
    useCallback(() => {
      const id = opened.current;
      if (!id) return;
      opened.current = '';
      fetchMember(id).then(
        (m) => setItems((cur) => (cur ? (m ? cur.map((x) => (x.id === id ? m : x)) : cur.filter((x) => x.id !== id)) : cur)),
        () => {},
      );
    }, [setItems]),
  );

  const open = useCallback(
    (id: string) => {
      opened.current = id;
      router.push(`/admin-member/${id}`);
    },
    [router],
  );
  const renderItem = useCallback(({ item }: { item: MemberCard }) => <MemberRow m={item} onOpen={open} />, [open]);

  return (
    <AdminFrame section="members" title="Members">
      <View style={{ paddingBottom: 8 }}>
        <SearchField value={q} onChangeText={setQ} label="Search members" placeholder="Name or username" />
      </View>
      <SlowLine active={list.slow} />
      {list.items === null ? (
        list.error ? <ErrorNote message={list.error} onRetry={list.retry} /> : <RowsSkeleton count={9} avatar={50} padY={9} />
      ) : (
        <FlatList
          data={list.items}
          keyExtractor={keyOfMember}
          renderItem={renderItem}
          initialNumToRender={12}
          windowSize={11}
          onEndReached={list.more}
          onEndReachedThreshold={0.6}
          ListFooterComponent={<PageSpinner active={list.paging} />}
          refreshControl={<RefreshControl refreshing={list.refreshing} onRefresh={list.refresh} tintColor={C.fg2} />}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={{ paddingBottom: 40 }}
          ListEmptyComponent={<Empty icon="people" title="No members found" />}
        />
      )}
    </AdminFrame>
  );
}
