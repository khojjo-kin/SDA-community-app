import React, { useCallback, useState } from 'react';
import { Alert, SectionList, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Icon } from '../../../src/components/Icon';
import { PersonRow } from '../../../src/components/PersonRow';
import { Avatar, Button, Empty, ErrorNote, IconButton, Loading, Screen, ScreenHeader, SectionLabel, Sheet, SheetRow, useToast } from '../../../src/components/ui';
import { approveMember, fetchGroup, fetchGroupMembers, removeMember, setMemberRole } from '../../../src/lib/api';
import { useSession } from '../../../src/lib/session';
import { C, errText, fmt } from '../../../src/lib/theme';
import type { Group, GroupMember } from '../../../src/lib/types';

type Section = { which: 'pending' | 'members'; title: string; data: GroupMember[] };

const nameOf = (m: GroupMember) => m.profile?.username ?? 'this account';

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
  const params = useLocalSearchParams<{ id: string }>();
  const id = String(params.id);
  const toast = useToast();
  const { me, profile } = useSession();
  const [group, setGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<GroupMember[] | null>(null);
  const [pending, setPending] = useState<GroupMember[]>([]);
  const [error, setError] = useState('');
  // The member whose sheet is open, and the one whose request is being decided (so its buttons show busy).
  const [target, setTarget] = useState<GroupMember | null>(null);
  const [deciding, setDeciding] = useState('');

  const appAdmin = !!profile?.admin_role;
  const manage = !!group && (group.my_standing === 'owner' || group.my_standing === 'admin' || appAdmin);
  const page = group?.kind === 'page';

  const load = useCallback(async () => {
    setError('');
    try {
      const g = await fetchGroup(id);
      const canManage = !!g && (g.my_standing === 'owner' || g.my_standing === 'admin' || appAdmin);
      // Requests are only fetched for managers; the database would refuse the rest anyway.
      const [people, waiting] = await Promise.all([fetchGroupMembers(id), canManage ? fetchGroupMembers(id, 'pending') : Promise.resolve([] as GroupMember[])]);
      setGroup(g);
      setMembers(people);
      setPending(waiting);
    } catch (e) {
      setError(errText(e));
    }
  }, [id, appAdmin]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  /** Runs a change, says so, and reloads so counts and roles are the database's, not a guess. */
  const run = (p: Promise<void>, said: string) => p.then(() => { toast(said); load(); }).catch((e) => toast(errText(e)));
  function decide(m: GroupMember, approve: boolean) {
    setDeciding(m.user_id);
    run(approve ? approveMember(id, m.user_id) : removeMember(id, m.user_id), approve ? `${nameOf(m)} is in` : 'Request declined').finally(() => setDeciding(''));
  }
  // Let the sheet slide away before an alert opens; iOS drops an alert shown while a modal is closing.
  const closeThen = (fn: (m: GroupMember) => void) => () => { const m = target; setTarget(null); if (m) setTimeout(() => fn(m), 380); };
  const toggleAdmin = closeThen((m) => run(setMemberRole(id, m.user_id, m.role === 'admin' ? 'member' : 'admin'), m.role === 'admin' ? `${nameOf(m)} is no longer an admin` : `${nameOf(m)} is now an admin`));
  const remove = closeThen((m) =>
    Alert.alert(`Remove ${nameOf(m)}?`, page ? 'They stop following this page. They can follow again later.' : 'They leave the community. They can ask to join again later.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => { run(removeMember(id, m.user_id), `Removed ${nameOf(m)}`); } },
    ]),
  );

  if (error && members === null) return <Screen><ScreenHeader title="Members" /><ErrorNote message={error} onRetry={load} /></Screen>;
  if (members === null) return <Screen><ScreenHeader title="Members" /><Loading /></Screen>;

  const word = page ? 'Followers' : 'Members';
  const all: Section[] = [
    { which: 'pending', title: `Requests · ${fmt(pending.length)}`, data: pending },
    { which: 'members', title: `${word} · ${fmt(members.length)}`, data: members },
  ];
  const sections = all.filter((s) => s.which === 'members' || s.data.length);

  function row(m: GroupMember, waiting: boolean) {
    // Owner and admin rows are marked; the owner, and you yourself, get no menu (you leave from the group's own screen).
    const right = waiting ? (
      <View style={{ flexDirection: 'row', gap: 6 }}>
        <Button small label="Approve" busy={deciding === m.user_id} onPress={() => decide(m, true)} />
        <Button small kind="ghost" label="Decline" disabled={deciding === m.user_id} onPress={() => decide(m, false)} />
      </View>
    ) : (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        {m.role !== 'member' ? <RoleTag role={m.role} /> : null}
        {manage && m.role !== 'owner' && m.user_id !== me ? <IconButton name="more" label={`Options for ${nameOf(m)}`} onPress={() => setTarget(m)} /> : null}
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
        ListEmptyComponent={<Empty icon="people" title={page ? 'No followers yet' : 'No members yet'} />}
        contentContainerStyle={{ paddingBottom: 40 }}
      />

      <Sheet visible={target !== null} onClose={() => setTarget(null)}>
        {target ? (
          <>
            <SheetRow first icon="shield" label={target.role === 'admin' ? 'Remove admin' : 'Make admin'} sub={target.role === 'admin' ? (page ? 'They stop posting and managing here' : 'They go back to being a member') : page ? 'They can post and manage followers' : 'They can approve requests and manage members'} onPress={toggleAdmin} />
            <SheetRow icon="trash" label={page ? 'Remove follower' : 'Remove from community'} danger onPress={remove} />
          </>
        ) : null}
      </Sheet>
    </Screen>
  );
}
