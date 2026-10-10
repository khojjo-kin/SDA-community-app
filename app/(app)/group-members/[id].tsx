import React, { useCallback, useRef, useState } from 'react';
import { Alert, RefreshControl, SectionList, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Icon } from '../../../src/components/Icon';
import { PersonRow } from '../../../src/components/PersonRow';
import { RowsSkeleton } from '../../../src/components/Skeleton';
import { Avatar, Button, Empty, ErrorNote, IconButton, Loading, Screen, ScreenHeader, SectionLabel, Sheet, SheetRow, useToast } from '../../../src/components/ui';
import { approveMember, fetchGroup, fetchGroupMembers, removeMember, setMemberRole } from '../../../src/lib/api';
import { tap } from '../../../src/lib/haptics';
import { useSession } from '../../../src/lib/session';
import { C, errText, fmt } from '../../../src/lib/theme';
import type { Group, GroupMember } from '../../../src/lib/types';

type Section = { which: 'pending' | 'members'; title: string; data: GroupMember[] };
type Decision = 'approve' | 'decline';

/** fetchGroupMembers' page: a shorter page is the last one. */
const PAGE = 60;

const nameOf = (m: GroupMember) => m.profile?.username ?? 'this account';
/** The newest join time in a list: where the next page starts (pages are oldest first, then sorted by role). */
const edgeOf = (list: GroupMember[]) => list.reduce((at, m) => (m.created_at > at ? m.created_at : at), '');

/** "Owner" with a crown, or "Admin": the same green tag the profile uses for app admins. */
function RoleTag({ role }: { role: 'owner' | 'admin' }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, height: 22, paddingHorizontal: 8, borderRadius: 11, backgroundColor: C.accentSoft }} accessibilityLabel={role === 'owner' ? 'Owner' : 'Admin'}>
      {role === 'owner' ? <Icon name="crown" size={13} color={C.accent2} weight={2.2} /> : null}
      <Text style={{ color: C.accent2, fontSize: 12.5, fontWeight: '700' }}>{role === 'owner' ? 'Owner' : 'Admin'}</Text>
    </View>
  );
}

export default function GroupMembers() {
  const params = useLocalSearchParams<{ id: string; kind?: string }>();
  const id = String(params.id);
  const toast = useToast();
  const { me, profile } = useSession();
  const [group, setGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<GroupMember[] | null>(null);
  const [pending, setPending] = useState<GroupMember[]>([]);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [paging, setPaging] = useState(false);
  // The member whose sheet is open (kept while it slides away, so it doesn't empty as it goes), and
  // the requests being decided (so their buttons show busy).
  const [target, setTarget] = useState<GroupMember | null>(null);
  const [menu, setMenu] = useState(false);
  const [deciding, setDeciding] = useState<Record<string, Decision>>({});
  const decidingNow = useRef(new Set<string>());
  const done = useRef(false);
  const pagingNow = useRef(false);
  // Where the next page starts: the newest join time among the pages fetched (not among rows added here).
  const cursor = useRef('');
  const asked = useRef(0);
  const shown = useRef<GroupMember[] | null>(null);
  shown.current = members;

  const appAdmin = !!profile?.admin_role;
  const manage = !!group && (group.my_standing === 'owner' || group.my_standing === 'admin' || appAdmin);
  // The group page passes its kind along, so the title is right before the group has loaded.
  const page = (group?.kind ?? params.kind) === 'page';

  /** The group, its first page of members and (for managers) its requests. Pages already scrolled through are kept. */
  const load = useCallback(
    async (pull = false) => {
      const n = ++asked.current;
      if (pull) setRefreshing(true);
      try {
        const g = await fetchGroup(id);
        const canManage = !!g && (g.my_standing === 'owner' || g.my_standing === 'admin' || appAdmin);
        // Requests are only fetched for managers; the database would refuse the rest anyway.
        const [people, waiting] = await Promise.all([fetchGroupMembers(id), canManage ? fetchGroupMembers(id, 'pending') : Promise.resolve([] as GroupMember[])]);
        if (n !== asked.current) return;
        setGroup(g);
        setPending(waiting);
        setError('');
        const cur = shown.current;
        const edge = edgeOf(people);
        if (!cur || people.length < PAGE) {
          done.current = people.length < PAGE;
          cursor.current = edge;
          setMembers(people);
        } else {
          const seen = new Set(people.map((m) => m.user_id));
          if (edge > cursor.current) cursor.current = edge;
          // Anyone who joined since sits after the pages kept: the end of the list looks again.
          done.current = false;
          setMembers([...people, ...cur.filter((m) => m.created_at > edge && !seen.has(m.user_id))]);
        }
      } catch (e) {
        if (n !== asked.current) return;
        if (shown.current === null) setError(errText(e));
        else if (pull) toast(errText(e));
      } finally {
        if (pull) setRefreshing(false);
      }
    },
    [id, appAdmin, toast],
  );
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  function more() {
    const cur = shown.current;
    if (!cur || !cur.length || done.current || pagingNow.current) return;
    const n = asked.current;
    pagingNow.current = true;
    setPaging(true);
    fetchGroupMembers(id, 'member', cursor.current || edgeOf(cur))
      .then((next) => {
        if (n !== asked.current) return;
        if (next.length < PAGE) done.current = true;
        const edge = edgeOf(next);
        if (edge > cursor.current) cursor.current = edge;
        setMembers((list) => {
          if (!list) return list;
          const seen = new Set(list.map((m) => m.user_id));
          return [...list, ...next.filter((m) => !seen.has(m.user_id))];
        });
      })
      .catch((e) => toast(errText(e)))
      .finally(() => {
        pagingNow.current = false;
        setPaging(false);
      });
  }

  /** Lets someone in, or turns their request down. Their row moves (or goes) at once. */
  function decide(m: GroupMember, approve: boolean) {
    if (decidingNow.current.has(m.user_id)) return;
    decidingNow.current.add(m.user_id);
    setDeciding((d) => ({ ...d, [m.user_id]: approve ? 'approve' : 'decline' }));
    (approve ? approveMember(id, m.user_id) : removeMember(id, m.user_id))
      .then(() => {
        tap(approve ? 'success' : 'light');
        toast(approve ? `${nameOf(m)} is in` : 'Request declined');
        setPending((p) => p.filter((x) => x.user_id !== m.user_id));
        // In the list at once when every page is shown, or when they asked before the newest member
        // fetched so far (pages after those start later, so it would never bring them); otherwise
        // they come with their page.
        if (approve && (done.current || m.created_at <= cursor.current)) setMembers((list) => (list && !list.some((x) => x.user_id === m.user_id) ? [...list, { ...m, status: 'member' }] : list));
        setGroup((g) => g && { ...g, pending_count: Math.max(0, g.pending_count - 1), member_count: g.member_count + (approve ? 1 : 0) });
      })
      .catch((e) => toast(errText(e)))
      .finally(() => {
        decidingNow.current.delete(m.user_id);
        setDeciding((d) => {
          const next = { ...d };
          delete next[m.user_id];
          return next;
        });
      });
  }

  // Let the sheet slide away before an alert opens; iOS drops an alert shown while a modal is closing.
  const closeThen = (fn: (m: GroupMember) => void) => () => {
    const m = target;
    setMenu(false);
    if (m) setTimeout(() => fn(m), 380);
  };
  const toggleAdmin = closeThen((m) => {
    const next = m.role === 'admin' ? 'member' : 'admin';
    const swap = (role: GroupMember['role']) => setMembers((list) => (list ? list.map((x) => (x.user_id === m.user_id ? { ...x, role } : x)) : list));
    swap(next);
    setMemberRole(id, m.user_id, next)
      .then(() => toast(next === 'admin' ? `${nameOf(m)} is now an admin` : `${nameOf(m)} is no longer an admin`))
      .catch((e) => {
        swap(m.role);
        toast(errText(e));
      });
  });
  const remove = closeThen((m) =>
    Alert.alert(`Remove ${nameOf(m)}?`, undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          removeMember(id, m.user_id)
            .then(() => {
              toast(`Removed ${nameOf(m)}`);
              setMembers((list) => (list ? list.filter((x) => x.user_id !== m.user_id) : list));
              setGroup((g) => g && { ...g, member_count: Math.max(0, g.member_count - 1) });
            })
            .catch((e) => toast(errText(e)));
        },
      },
    ]),
  );

  const word = page ? 'Followers' : 'Members';
  if (error && members === null) return <Screen><ScreenHeader title={word} /><ErrorNote message={error} onRetry={() => { setError(''); load(); }} /></Screen>;
  if (members === null) return <Screen><ScreenHeader title={word} /><RowsSkeleton count={8} avatar={50} padY={8} /></Screen>;

  const all: Section[] = [
    { which: 'pending', title: `Requests · ${fmt(pending.length)}`, data: pending },
    { which: 'members', title: group ? `${word} · ${fmt(group.member_count)}` : word, data: members },
  ];
  // No empty sections: a SectionList counts a section's header and footer as rows, so the empty state would never show.
  const sections = all.filter((s) => s.data.length);

  function row(m: GroupMember, waiting: boolean) {
    // Owner and admin rows are marked; the owner, and you yourself, get no menu (you leave from the group's own screen).
    const busy = deciding[m.user_id];
    const right = waiting ? (
      <View style={{ flexDirection: 'row', gap: 6 }}>
        <Button small label="Approve" busy={busy === 'approve'} disabled={busy === 'decline'} onPress={() => decide(m, true)} />
        <Button small kind="ghost" label="Decline" busy={busy === 'decline'} disabled={busy === 'approve'} onPress={() => decide(m, false)} />
      </View>
    ) : (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        {m.role !== 'member' ? <RoleTag role={m.role} /> : null}
        {manage && m.role !== 'owner' && m.user_id !== me ? (
          <IconButton
            name="more"
            label={`Options for ${nameOf(m)}`}
            onPress={() => {
              setTarget(m);
              setMenu(true);
            }}
          />
        ) : null}
      </View>
    );
    if (m.profile) return <PersonRow person={m.profile} hideFollow right={right} />;
    // The account is gone or hidden, but the row still exists so a manager can clear it out.
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 8 }}>
        <Avatar name="?" size={50} />
        <Text style={{ flex: 1, color: C.fg2 }}>Account unavailable</Text>
        {right}
      </View>
    );
  }

  return (
    <Screen>
      <ScreenHeader title={word} />
      <SectionList
        sections={sections}
        keyExtractor={(m) => m.status + m.user_id}
        renderSectionHeader={({ section }) => <SectionLabel>{section.title}</SectionLabel>}
        stickySectionHeadersEnabled={false}
        renderItem={({ item, section }) => row(item, section.which === 'pending')}
        extraData={deciding}
        initialNumToRender={14}
        onEndReached={more}
        onEndReachedThreshold={0.6}
        ListFooterComponent={paging ? <Loading /> : null}
        ListEmptyComponent={<Empty icon="people" title={page ? 'No followers yet' : 'No members yet'} />}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={C.fg2} />}
        contentContainerStyle={{ paddingBottom: 40 }}
      />

      <Sheet visible={menu} onClose={() => setMenu(false)}>
        {target ? (
          <>
            <SheetRow first icon="shield" label={target.role === 'admin' ? 'Remove admin' : 'Make admin'} onPress={toggleAdmin} />
            <SheetRow icon="trash" label={page ? 'Remove follower' : 'Remove from community'} danger onPress={remove} />
          </>
        ) : null}
      </Sheet>
    </Screen>
  );
}
