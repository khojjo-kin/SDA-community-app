import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, SectionList, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { Icon } from '../../src/components/Icon';
import { Button, Empty, ErrorNote, Loading, RoundButton, Screen, ScreenHeader, SearchField, SectionLabel, useToast } from '../../src/components/ui';
import { fetchGroups, fetchMyGroups, joinGroup } from '../../src/lib/api';
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

/** One community or page in a list: cover, name, kind and size, plus whatever goes on the right. */
function GroupRow({ group, right, onPress }: { group: Group; right?: React.ReactNode; onPress: () => void }) {
  const mine = group.my_standing === 'owner' || group.my_standing === 'admin';
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={[group.name, groupSub(group), mine && (group.my_standing === 'owner' ? 'you own it' : 'you are an admin')].filter(Boolean).join(', ')} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, minHeight: 68, backgroundColor: pressed ? C.press : 'transparent' })}>
      {group.cover_url ? (
        <Image source={{ uri: group.cover_url }} style={{ width: 52, height: 52, borderRadius: 12, backgroundColor: C.surface }} contentFit="cover" transition={120} />
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
}

export default function Groups() {
  const router = useRouter();
  const toast = useToast();
  const { me } = useSession();
  const [segment, setSegment] = useState<Segment>('yours');
  const [q, setQ] = useState('');
  const [mine, setMine] = useState<Group[] | null>(null);
  const [found, setFound] = useState<Group[] | null>(null);
  const [error, setError] = useState('');
  // The search the Discover list currently shows (or is fetching), so a slow older search cannot overwrite a newer one.
  const loadedFor = useRef<string | null>(null);
  const needle = q.trim();

  const loadMine = useCallback(async () => {
    try {
      setMine(await fetchMyGroups(me));
      setError('');
    } catch (e) {
      setError(errText(e));
    }
  }, [me]);
  const loadFound = useCallback(async (text: string) => {
    loadedFor.current = text;
    try {
      const list = await fetchGroups(text);
      if (loadedFor.current !== text) return;
      setFound(list);
      setError('');
    } catch (e) {
      setError(errText(e));
    }
  }, []);
  // Reload on every focus so a group created, joined or left on another screen shows up.
  useFocusEffect(useCallback(() => { loadMine(); loadFound(loadedFor.current ?? ''); }, [loadMine, loadFound]));
  // Discover searches a moment after the last key. The focus load above already covers the current text.
  useEffect(() => {
    if (loadedFor.current === needle) return;
    const t = setTimeout(() => loadFound(needle), 250);
    return () => clearTimeout(t);
  }, [needle, loadFound]);

  const open = (g: Group) => router.push({ pathname: '/group/[id]', params: { id: g.id } } as any);
  const create = () => router.push('/group-new' as any);
  const patch = (id: string, p: Partial<Group>) => setFound((l) => l && l.map((g) => (g.id === id ? { ...g, ...p } : g)));

  /** Join or follow straight from the list. The row flips at once and flips back if the request fails. */
  async function join(g: Group) {
    const pending = g.privacy === 'private';
    patch(g.id, { my_standing: pending ? 'pending' : 'member', member_count: g.member_count + (pending ? 0 : 1) });
    try {
      await joinGroup(me, g);
      toast(pending ? 'Request sent' : g.kind === 'page' ? `Following ${g.name}` : `Joined ${g.name}`);
      loadMine();
    } catch (e) {
      patch(g.id, { my_standing: g.my_standing, member_count: g.member_count });
      toast(errText(e));
    }
  }

  const lower = needle.toLowerCase();
  const yours = (mine ?? []).filter((g) => !lower || g.name.toLowerCase().includes(lower) || g.handle.includes(lower));
  const sections =
    segment === 'yours'
      ? [{ title: '', data: yours }]
      : [
          { title: 'Communities', data: (found ?? []).filter((g) => g.kind === 'community') },
          { title: 'Pages', data: (found ?? []).filter((g) => g.kind === 'page') },
        ].filter((s) => s.data.length);
  const list = segment === 'yours' ? mine : found;

  const empty =
    list === null ? (
      <Loading />
    ) : needle ? (
      <Empty icon="search" title="Nothing matches" body="Try another name or @handle." />
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
          <Pressable key={s} onPress={() => setSegment(s)} accessibilityRole="tab" accessibilityState={{ selected: segment === s }} style={{ paddingHorizontal: 16, height: 34, borderRadius: 17, backgroundColor: segment === s ? C.fg : C.surface, justifyContent: 'center' }}>
            <Text style={{ color: segment === s ? C.bg : C.fg, fontWeight: '600' }}>{s === 'yours' ? 'Yours' : 'Discover'}</Text>
          </Pressable>
        ))}
      </View>
      {error && list === null ? (
        <ErrorNote message={error} onRetry={() => (segment === 'yours' ? loadMine() : loadFound(needle))} />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(g) => g.id}
          renderSectionHeader={({ section }) => (section.title ? <SectionLabel>{section.title}</SectionLabel> : null)}
          stickySectionHeadersEnabled={false}
          renderItem={({ item }) => {
            if (segment === 'yours') return <GroupRow group={item} onPress={() => open(item)} />;
            const pill = pillOf(item);
            return <GroupRow group={item} onPress={() => open(item)} right={<Button small label={pill.label} kind={pill.kind} onPress={pill.kind === 'primary' ? () => join(item) : () => open(item)} />} />;
          }}
          ListEmptyComponent={empty}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={{ paddingBottom: 40 }}
        />
      )}
    </Screen>
  );
}
