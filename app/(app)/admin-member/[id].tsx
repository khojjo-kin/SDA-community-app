import React, { useCallback, useState } from 'react';
import { Alert, ScrollView, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { VerifiedTick } from '../../../src/components/Icon';
import { MemberTags } from '../../../src/components/MemberTags';
import { Avatar, Button, Divider, Empty, Loading, Row, Screen, ScreenHeader, SectionLabel, Toggle, useToast } from '../../../src/components/ui';
import { addAdmin, adminSetAccount, fetchMember, removeAdmin } from '../../../src/lib/api';
import { useSession } from '../../../src/lib/session';
import { C, dayLabel, errText } from '../../../src/lib/theme';
import type { MemberCard } from '../../../src/lib/types';

export default function AdminMember() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const userId = String(id);
  const { me, profile } = useSession();
  const router = useRouter();
  const toast = useToast();
  const [m, setM] = useState<MemberCard | null | undefined>(undefined);
  const [note, setNote] = useState('');

  const load = useCallback(() => {
    fetchMember(userId).then((x) => { setM(x); setNote(x?.admin_note ?? ''); }).catch((e) => { toast(errText(e)); setM(null); });
  }, [userId, toast]);
  useFocusEffect(load);

  if (m === undefined) return <Screen><ScreenHeader title="Member" /><Loading /></Screen>;
  if (!m) return <Screen><ScreenHeader title="Member" /><Empty icon="user" title="This account isn't available" /></Screen>;

  const owner = profile?.admin_role === 'owner';
  const self = userId === me;

  const set = (patch: Parameters<typeof adminSetAccount>[1], done: string) => {
    adminSetAccount(userId, patch).then(() => { toast(done); load(); }).catch((e) => toast(errText(e)));
  };

  function givePlus(months: number) {
    const from = m?.plus && m.plus_until ? new Date(m.plus_until) : new Date();
    from.setMonth(from.getMonth() + months);
    set({ plus_until: from.toISOString(), verified: true }, `Plus until ${dayLabel(from)}`);
  }

  function suspend(next: boolean) {
    if (!next) return set({ suspended: false }, 'Suspension lifted');
    Alert.alert(`Suspend @${m!.username}?`, 'They can still read, but cannot post, comment, share stories or send messages until an admin lifts it.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Suspend', style: 'destructive', onPress: () => set({ suspended: true }, 'Account suspended') },
    ]);
  }

  function admin(next: boolean) {
    if (next) {
      Alert.alert(`Make @${m!.username} an admin?`, 'They get the admin tools: reports, members, the tick and Plus, churches and the hymnal. Only you can add or remove admins.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Make admin', onPress: () => { addAdmin(me, userId).then(() => { toast('Now an admin'); load(); }).catch((e) => toast(errText(e))); } },
      ]);
    } else {
      removeAdmin(userId).then(() => { toast('No longer an admin'); load(); }).catch((e) => toast(errText(e)));
    }
  }

  return (
    <Screen>
      <ScreenHeader title="Member" />
      <ScrollView contentContainerStyle={{ paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
        <View style={{ alignItems: 'center', gap: 8, paddingVertical: 14 }}>
          <Avatar uri={m.avatar_url} name={m.full_name} size={88} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={{ color: C.fg, fontSize: 20, fontWeight: '800' }}>{m.full_name}</Text>
            {m.verified ? <VerifiedTick size={18} /> : null}
          </View>
          <Text style={{ color: C.fg2 }}>@{m.username}{m.church_name ? ` · ${m.church_name}` : ''}</Text>
          <MemberTags m={m} />
          <Button small kind="ghost" label="Open profile" onPress={() => router.push(`/user/${userId}`)} style={{ marginTop: 4 }} />
        </View>

        <SectionLabel>Standing</SectionLabel>
        <Row title="Verified tick" sub="Shown next to their name everywhere" right={<Toggle value={m.verified} label="Verified tick" onChange={(v) => set({ verified: v }, v ? 'Verified' : 'Tick removed')} />} />
        <Row title="Community Plus" sub={m.plus && m.plus_until ? `Active until ${dayLabel(new Date(m.plus_until))}` : 'Not active'} />
        <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 6 }}>
          <Button small label={m.plus ? 'Add a month' : 'Give a month'} onPress={() => givePlus(1)} />
          <Button small kind="ghost" label="Give a year" onPress={() => givePlus(12)} />
          {m.plus ? <Button small kind="ghost" label="End Plus" onPress={() => set({ plus_until: null }, 'Plus ended')} /> : null}
        </View>
        <Divider />

        <SectionLabel>Safety</SectionLabel>
        <Row title="Suspended" sub="Can read, but cannot post, comment, share stories or message" right={<Toggle value={m.suspended} label="Suspended" disabled={self} onChange={suspend} />} />
        <View style={{ paddingHorizontal: 16, paddingTop: 8, gap: 8 }}>
          <Text style={{ color: C.fg2, fontSize: 13.5 }}>Admin note — only admins see this</Text>
          <TextInput value={note} onChangeText={setNote} placeholder="Why this account was verified, suspended, or anything the next admin should know" placeholderTextColor={C.fg3} multiline maxLength={500} keyboardAppearance="dark" accessibilityLabel="Admin note" style={{ minHeight: 80, color: C.fg, fontSize: 15.5, padding: 12, borderRadius: 12, backgroundColor: C.surface, textAlignVertical: 'top' }} />
          {note !== (m.admin_note ?? '') ? <Button small label="Save note" onPress={() => set({ admin_note: note.trim() }, 'Note saved')} style={{ alignSelf: 'flex-start' }} /> : null}
        </View>
        <Divider />

        {owner && !self ? (
          <>
            <SectionLabel>Admin tools</SectionLabel>
            {m.admin_role === 'owner' ? (
              <Row title="App owner" sub="Owners cannot be changed from the app" />
            ) : (
              <Row title="Admin" sub="Reports, members, the tick and Plus, churches, the hymnal" right={<Toggle value={m.admin_role === 'admin'} label="Admin" onChange={admin} />} />
            )}
          </>
        ) : null}
      </ScrollView>
    </Screen>
  );
}
