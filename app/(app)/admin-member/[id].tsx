import React, { useCallback, useRef, useState } from 'react';
import { Alert, ScrollView, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { AdminFrame } from '../../../src/components/AdminFrame';
import { VerifiedTick } from '../../../src/components/Icon';
import { MemberTags } from '../../../src/components/MemberTags';
import { Skeleton, SkeletonFrame } from '../../../src/components/Skeleton';
import { Avatar, Button, Divider, Empty, ErrorNote, Row, SectionLabel, Toggle, useToast } from '../../../src/components/ui';
import { addAdmin, adminSetAccount, fetchMember, removeAdmin } from '../../../src/lib/api';
import { tap } from '../../../src/lib/haptics';
import { useSession } from '../../../src/lib/session';
import { C, dayLabel, errText } from '../../../src/lib/theme';
import type { MemberCard } from '../../../src/lib/types';

type Patch = Parameters<typeof adminSetAccount>[1];

/** "9 Sep" this year, "9 Sep 2027" otherwise. */
function until(iso: string): string {
  const d = new Date(iso);
  return dayLabel(d) + (d.getFullYear() === new Date().getFullYear() ? '' : ' ' + d.getFullYear());
}

/** The shape of the page while the member loads: the face, the name, the button, a few rows. */
function MemberSkeleton() {
  const { width } = useWindowDimensions();
  const mid = (w: number) => Math.round((width - w) / 2);
  return (
    <SkeletonFrame style={{ alignItems: 'center', paddingTop: 14, gap: 10 }}>
      <Skeleton width={88} height={88} radius={44} x={mid(88)} />
      <Skeleton width={150} height={16} x={mid(150)} />
      <Skeleton width={110} height={11} x={mid(110)} />
      <Skeleton width={112} height={32} radius={10} x={mid(112)} style={{ marginTop: 8 }} />
      <View style={{ alignSelf: 'stretch', paddingHorizontal: 16, paddingTop: 28, gap: 22 }}>
        {[0.34, 0.46, 0.3].map((w, i) => (
          <Skeleton key={i} width={Math.round((width - 32) * w)} height={14} x={16} />
        ))}
      </View>
    </SkeletonFrame>
  );
}

/** One member, from the admin's side: the tick, Plus, suspension, a private note, and (for the owner) admin rights. */
export default function AdminMember() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const userId = String(id);
  const { me, profile } = useSession();
  const router = useRouter();
  const toast = useToast();
  // undefined while loading, null when the account is gone.
  const [m, setM] = useState<MemberCard | null | undefined>(undefined);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  // Which Plus button is working, and whether the note is being saved.
  const [plusBusy, setPlusBusy] = useState<'month' | 'year' | 'end' | ''>('');
  const [noteBusy, setNoteBusy] = useState(false);
  // Changes on their way, by what they change: a second tap waits for the first.
  const working = useRef(new Set<string>());
  // Once the admin starts typing a note, coming back to the screen doesn't overwrite it.
  const typed = useRef(false);

  const load = useCallback(() => {
    fetchMember(userId)
      .then((x) => {
        setM(x);
        setError('');
        if (!typed.current) setNote(x?.admin_note ?? '');
      })
      .catch((e) => setError(errText(e)));
  }, [userId]);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (m === undefined) {
    return (
      <AdminFrame section="members" title="Member">
        {error ? <ErrorNote message={error} onRetry={() => { setError(''); load(); }} /> : <MemberSkeleton />}
      </AdminFrame>
    );
  }
  if (!m) {
    return (
      <AdminFrame section="members" title="Member">
        <Empty icon="user" title="This account isn't available" />
      </AdminFrame>
    );
  }

  const member = m;
  const owner = profile?.admin_role === 'owner';
  const self = userId === me;

  /**
   * Shows a change at once and saves it; if the server says no, the screen goes back to how it was.
   * `what` names the change, so a second tap on the same thing waits for the first.
   */
  async function save(what: string, patch: Patch, shown: Partial<MemberCard>, done: string): Promise<boolean> {
    if (working.current.has(what)) return false;
    working.current.add(what);
    const before: Partial<MemberCard> = {};
    for (const k of Object.keys(shown) as (keyof MemberCard)[]) (before as Record<string, unknown>)[k] = member[k];
    setM((cur) => (cur ? { ...cur, ...shown } : cur));
    try {
      await adminSetAccount(userId, patch);
      toast(done);
      return true;
    } catch (e) {
      setM((cur) => (cur ? { ...cur, ...before } : cur));
      toast(errText(e));
      return false;
    } finally {
      working.current.delete(what);
    }
  }

  // Plus on its own: the tick comes only from an identity check, or from the switch above.
  async function givePlus(months: number, which: 'month' | 'year') {
    if (plusBusy || working.current.has('plus')) return;
    const now = Date.now();
    const from = member.plus_until && new Date(member.plus_until).getTime() > now ? new Date(member.plus_until) : new Date(now);
    from.setMonth(from.getMonth() + months);
    const iso = from.toISOString();
    setPlusBusy(which);
    if (await save('plus', { plus_until: iso }, { plus: true, plus_until: iso }, `Plus until ${until(iso)}`)) tap('success');
    setPlusBusy('');
  }
  function endPlus() {
    if (plusBusy || working.current.has('plus')) return;
    Alert.alert(`End Plus for @${member.username}?`, undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'End Plus',
        style: 'destructive',
        onPress: async () => {
          setPlusBusy('end');
          await save('plus', { plus_until: null }, { plus: false, plus_until: null }, 'Plus ended');
          setPlusBusy('');
        },
      },
    ]);
  }

  function suspend(next: boolean) {
    if (!next) {
      save('suspended', { suspended: false }, { suspended: false }, 'Suspension lifted');
      return;
    }
    Alert.alert(`Suspend @${member.username}?`, "They can still read, but can't post, comment or message.", [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Suspend', style: 'destructive', onPress: () => { save('suspended', { suspended: true }, { suspended: true }, 'Account suspended'); } },
    ]);
  }

  async function saveNote() {
    if (noteBusy || working.current.has('note')) return;
    const text = note.trim();
    setNoteBusy(true);
    if (await save('note', { admin_note: text }, { admin_note: text }, 'Note saved')) {
      typed.current = false;
      setNote(text);
    }
    setNoteBusy(false);
  }

  /** Owner only: give or take away the admin tools. Both are confirmed. */
  function setAdmin(next: boolean) {
    const go = () => {
      if (working.current.has('admin')) return;
      working.current.add('admin');
      const before = member.admin_role;
      setM((cur) => (cur ? { ...cur, admin_role: next ? 'admin' : null } : cur));
      (next ? addAdmin(me, userId) : removeAdmin(userId))
        .then(() => toast(next ? 'Now an admin' : 'No longer an admin'))
        .catch((e) => {
          setM((cur) => (cur ? { ...cur, admin_role: before } : cur));
          toast(errText(e));
        })
        .finally(() => working.current.delete('admin'));
    };
    if (next) {
      Alert.alert(`Make @${member.username} an admin?`, undefined, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Make admin', onPress: go },
      ]);
    } else {
      Alert.alert(`Remove @${member.username} as an admin?`, undefined, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: go },
      ]);
    }
  }

  const noteChanged = note.trim() !== (member.admin_note ?? '').trim();

  return (
    <AdminFrame section="members" title="Member">
      {/* Lifts the note above the keyboard on iPhone; Android resizes the window itself. */}
      <ScrollView contentContainerStyle={{ paddingBottom: 60 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" automaticallyAdjustKeyboardInsets>
        <View style={{ alignItems: 'center', gap: 8, paddingVertical: 14, paddingHorizontal: 16 }}>
          <Avatar uri={member.avatar_url} name={member.full_name} size={88} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: '100%' }}>
            <Text numberOfLines={1} style={{ color: C.fg, fontSize: 20, fontWeight: '800', flexShrink: 1 }}>{member.full_name || member.username}</Text>
            {member.verified ? <VerifiedTick size={18} /> : null}
          </View>
          <Text numberOfLines={2} style={{ color: C.fg2, textAlign: 'center' }}>@{member.username}{member.church_name ? ` · ${member.church_name}` : ''}</Text>
          <MemberTags m={member} />
          <Button small kind="ghost" label="Open profile" onPress={() => router.push(`/user/${userId}`)} style={{ marginTop: 4 }} />
        </View>

        <SectionLabel>Standing</SectionLabel>
        <Row title="Verified tick" right={<Toggle value={member.verified} label="Verified tick" onChange={(v) => { save('verified', { verified: v }, { verified: v }, v ? 'Verified' : 'Tick removed'); }} />} />
        <Row title="Community Plus" value={member.plus && member.plus_until ? `Until ${until(member.plus_until)}` : 'Off'} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, paddingTop: 4, paddingBottom: 6 }}>
          <Button small label={member.plus ? 'Add a month' : 'Give a month'} busy={plusBusy === 'month'} disabled={!!plusBusy && plusBusy !== 'month'} onPress={() => givePlus(1, 'month')} />
          <Button small kind="ghost" label="Give a year" busy={plusBusy === 'year'} disabled={!!plusBusy && plusBusy !== 'year'} onPress={() => givePlus(12, 'year')} />
          {member.plus ? <Button small kind="ghost" label="End Plus" busy={plusBusy === 'end'} disabled={!!plusBusy && plusBusy !== 'end'} onPress={endPlus} /> : null}
        </View>
        <Divider />

        <SectionLabel>Safety</SectionLabel>
        <Row title="Suspended" right={<Toggle value={member.suspended} label="Suspended" disabled={self} onChange={suspend} />} />
        <View style={{ paddingHorizontal: 16, paddingTop: 10, gap: 8 }}>
          <Text style={{ color: C.fg2, fontSize: 13.5, fontWeight: '600' }}>Admin note</Text>
          <TextInput
            value={note}
            onChangeText={(v) => {
              typed.current = true;
              setNote(v);
            }}
            placeholder="Add a note"
            placeholderTextColor={C.fg3}
            selectionColor={C.accent2}
            multiline
            maxLength={500}
            keyboardAppearance={C.blurTint}
            accessibilityLabel="Admin note"
            style={{ minHeight: 80, color: C.fg, fontSize: 15.5, padding: 12, paddingTop: 12, borderRadius: 12, backgroundColor: C.surface, textAlignVertical: 'top' }}
          />
          {noteChanged ? <Button small label="Save note" busy={noteBusy} onPress={saveNote} style={{ alignSelf: 'flex-start' }} /> : null}
        </View>

        {owner && !self ? (
          <>
            <Divider />
            <SectionLabel>Admin tools</SectionLabel>
            {member.admin_role === 'owner' ? <Row title="App owner" /> : <Row title="Admin" right={<Toggle value={member.admin_role === 'admin'} label="Admin" onChange={setAdmin} />} />}
          </>
        ) : null}
      </ScrollView>
    </AdminFrame>
  );
}
