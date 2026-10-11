import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, RefreshControl, SectionList, Text, useWindowDimensions, View } from 'react-native';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { Icon } from '../../src/components/Icon';
import { Skeleton, SkeletonFrame } from '../../src/components/Skeleton';
import { Button, Empty, ErrorNote, RoundButton, Screen, ScreenHeader, SearchField, SectionLabel, useToast } from '../../src/components/ui';
import { fetchGroups, fetchMyGroups, joinGroup } from '../../src/lib/api';
import { tap } from '../../src/lib/haptics';
import { t } from '../../src/lib/i18n';
import { useSession } from '../../src/lib/session';
import { C, errText, fmt } from '../../src/lib/theme';
import type { Group } from '../../src/lib/types';

type Segment = 'yours' | 'discover';

/** "Community · 240 members" or "Page · 1.2K followers". */
function groupSub(g: Group): string {
  const word = g.kind === 'page' ? 'follower' : 'member';
  return `${g.kind === 'page' ? 'Page' : 'Community'} · ${fmt(g.member_count)} ${word}${g.member_count === 1 ? '' : 's'}`;
}

/** What the pill on a Discover row says. Tapping a ghost pill opens the group, where Leave lives behind a confirm. */
function pillOf(g: Group): { label: string; kind: 'primary' | 'ghost' } {
  if (!g.my_standing) return { label: g.kind === 'page' ? 'Follow' : 'Join', kind: 'primary' };
  if (g.my_standing === 'pending') return { label: 'Requested', kind: 'ghost' };
  return { label: g.kind === 'page' ? 'Following' : 'Joined', kind: 'ghost' };
}

/** The list while it loads: a rounded cover, a name and a line, as GroupRow draws them. */
function GroupsSkeleton() {
  const { width } = useWindowDimensions();
  const room = width - 16 - 52 - 14 - 16;
  return (
    <SkeletonFrame style={{ paddingTop: 4 }}>
      {[0.5, 0.36, 0.6, 0.42, 0.54, 0.3, 0.46].map((w, i) => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, minHeight: 68 }}>
          <Skeleton width={52} height={52} radius={12} x={16} />
          <View style={{ gap: 8 }}>
            <Skeleton width={Math.round(room * w)} height={12} x={82} />
            <Skeleton width={Math.round(room * 0.4)} height={10} x={82} />
          </View>
        </View>
      ))}
    </SkeletonFrame>
  );
}

/** One community or page in a list: cover, name, kind and size, plus whatever goes on the right. */
const GroupRow = React.memo(function GroupRow({ group, right, onOpen }: { group: Group; right?: React.ReactNode; onOpen: (g: Group) => void }) {
  const mine = group.my_standing === 'owner' || group.my_standing === 'admin';
  return (
    <Pressable onPress={() => onOpen(group)} accessibilityRole="button" accessibilityLabel={[group.name, groupSub(group), mine && (group.my_standing === 'owner' ? 'you own it' : 'you are an admin')].filter(Boolean).join(', ')} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, minHeight: 68, backgroundColor: pressed ? C.press : 'transparent' })}>
      {group.cover_url ? (
        <Image source={{ uri: group.cover_url }} style={{ width: 52, height: 52, borderRadius: 12, backgroundColor: C.surface }} contentFit="cover" transition={120} cachePolicy="memory-disk" recyclingKey={group.id} />
      ) : (
        <View style={{ width: 52, height: 52, borderRadius: 12, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={group.kind === 'page' ? 'crown' : 'users'} size={26} color={C.fg2} />
        </View>
      )}
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text numberOfLines={1} style={{ color: C.fg, fontSize: 16.5, fontWeight: '600', flexShrink: 1 }}>{group.name}</Text>
          {group.privacy === 'private' ? <Icon name="lock" size={13} color={C.fg2} weight={2.2} /> : null}
          {group.my_standing === 'owner' ? <Icon name="crown" size={15} color={C.accent2} weight={2.2} /> : null}
          {group.my_standing === 'admin' ? (
            <View style={{ height: 20, paddingHorizontal: 7, borderRadius: 10, backgroundColor: C.accentSoft, justifyContent: 'center' }}>
              <Text style={{ color: C.accent2, fontSize: 12, fontWeight: '700' }}>Admin</Text>
            </View>
          ) : null}
        </View>
        <Text numberOfLines={1} style={{ color: C.fg2, fontSize: 13.5, marginTop: 1 }}>{groupSub(group)}</Text>
      </View>
      {right ?? <Icon name="right" size={18} color={C.fg2} weight={2} />}
    </Pressable>
  );
});

export default function Groups() {
  const router = useRouter();
  const toast = useToast();
  const { me } = useSession();
  const [segment, setSegment] = useState<Segment>('yours');
  const [q, setQ] = useState('');
  const [mine, setMine] = useState<Group[] | null>(null);
  const [found, setFound] = useState<Group[] | null>(null);
  // Each list has its own error: one arriving must not clear the other's and leave it loading forever.
  const [mineError, setMineError] = useState('');
  const [foundError, setFoundError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  // Groups being joined from the list: a second tap before the row has flipped does nothing.
  const joining = useRef(new Set<string>());
  // The search the Discover list currently shows (or is fetching), so a slow older search cannot overwrite a newer one.
  const loadedFor = useRef<string | null>(null);
  const needle = q.trim();

  const loadMine = useCallback(async () => {
    try {
      setMine(await fetchMyGroups(me));
      setMineError('');
    } catch (e) {
      setMineError(errText(e));
    }
  }, [me]);
  const loadFound = useCallback(async (text: string) => {
    loadedFor.current = text;
    try {
      const list = await fetchGroups(text);
      if (loadedFor.current !== text) return;
      setFound(list);
      setFoundError('');
    } catch (e) {
      if (loadedFor.current === text) setFoundError(errText(e));
    }
  }, []);
  // Reload on every focus so a group created, joined or left on another screen shows up.
  useFocusEffect(
    useCallback(() => {
      loadMine();
      loadFound(loadedFor.current ?? '');
    }, [loadMine, loadFound]),
  );
  // Discover searches a moment after the last key. The focus load above already covers the current text.
  useEffect(() => {
    if (loadedFor.current === needle) return;
    const wait = setTimeout(() => loadFound(needle), 250);
    return () => clearTimeout(wait);
  }, [needle, loadFound]);

  function pull() {
    setRefreshing(true);
    Promise.all([loadMine(), loadFound(needle)]).finally(() => setRefreshing(false));
  }

  const open = useCallback((g: Group) => router.push({ pathname: '/group/[id]', params: { id: g.id } } as any), [router]);
  const create = () => router.push('/group-new' as any);
  const patch = (id: string, p: Partial<Group>) => setFound((l) => l && l.map((g) => (g.id === id ? { ...g, ...p } : g)));

  /** Join or follow straight from the list. The row flips at once and flips back if the request fails. */
  async function join(g: Group) {
    if (joining.current.has(g.id)) return;
    joining.current.add(g.id);
    const pending = g.privacy === 'private';
    patch(g.id, { my_standing: pending ? 'pending' : 'member', member_count: g.member_count + (pending ? 0 : 1) });
    try {
      await joinGroup(me, g);
      tap('success');
      toast(pending ? t('groups.requestSent') : g.kind === 'page' ? `Following ${g.name}` : `Joined ${g.name}`);
      loadMine();
    } catch (e) {
      patch(g.id, { my_standing: g.my_standing, member_count: g.member_count });
      toast(errText(e));
    } finally {
      joining.current.delete(g.id);
    }
  }

  const lower = needle.toLowerCase();
  const yours = (mine ?? []).filter((g) => !lower || g.name.toLowerCase().includes(lower) || g.handle.includes(lower));
  // No empty sections: a SectionList counts a section's header and footer as rows, so with one left
  // in, the loading shapes and the empty state would never show.
  const sections =
    segment === 'yours'
      ? yours.length
        ? [{ title: '', data: yours }]
        : []
      : [
          { title: 'Communities', data: (found ?? []).filter((g) => g.kind === 'community') },
          { title: 'Pages', data: (found ?? []).filter((g) => g.kind === 'page') },
        ].filter((s) => s.data.length);
  const list = segment === 'yours' ? mine : found;
  const error = segment === 'yours' ? mineError : foundError;

  const empty =
    list === null ? (
      <GroupsSkeleton />
    ) : needle ? (
      <Empty icon="search" title="Nothing matches" />
    ) : segment === 'yours' ? (
      <Empty icon="users" title="You're not in any yet" action={<Button small label="Discover" onPress={() => setSegment('discover')} style={{ marginTop: 8 }} />} />
    ) : (
      <Empty icon="users" title="Nothing here yet" action={<Button small label="Create" onPress={create} style={{ marginTop: 8 }} />} />
    );

  return (
    <Screen>
      <ScreenHeader title="Communities and pages" right={<RoundButton name="plus" label="Create" onPress={create} />} />
      <SearchField value={q} onChangeText={setQ} placeholder="Name or @handle" label="Search communities and pages" />
      <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 6 }} accessibilityRole="tablist">
        {(['yours', 'discover'] as Segment[]).map((s) => (
          <Pressable
            key={s}
            onPress={segment === s ? undefined : () => { tap('select'); setSegment(s); }}
            accessibilityRole="tab"
            accessibilityState={{ selected: segment === s }}
            style={({ pressed }) => ({ paddingHorizontal: 16, height: 34, borderRadius: 17, backgroundColor: segment === s ? C.fg : C.surface, justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}>
            <Text style={{ color: segment === s ? C.bg : C.fg, fontWeight: '600' }}>{s === 'yours' ? 'Yours' : 'Discover'}</Text>
          </Pressable>
        ))}
      </View>
      {error && list === null ? (
        <ErrorNote
          message={error}
          onRetry={() => {
            if (segment === 'yours') {
              setMineError('');
              loadMine();
            } else {
              setFoundError('');
              loadFound(needle);
            }
          }}
        />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(g) => g.id}
          renderSectionHeader={({ section }) => (section.title ? <SectionLabel>{section.title}</SectionLabel> : null)}
          stickySectionHeadersEnabled={false}
          renderItem={({ item }) => {
            if (segment === 'yours') return <GroupRow group={item} onOpen={open} />;
            const pill = pillOf(item);
            return <GroupRow group={item} onOpen={open} right={<Button small label={pill.label} kind={pill.kind} onPress={pill.kind === 'primary' ? () => join(item) : () => open(item)} />} />;
          }}
          ListEmptyComponent={empty}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={pull} tintColor={C.fg2} />}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          initialNumToRender={12}
          contentContainerStyle={{ paddingBottom: 40 }}
        />
      )}
    </Screen>
  );
}
