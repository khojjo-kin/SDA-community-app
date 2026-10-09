import React, { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, Pressable, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Icon } from '../../src/components/Icon';
import { Avatar, Button, Empty, Loading, Screen, ScreenHeader, SearchField, Sheet, useToast } from '../../src/components/ui';
import { addAdmin, listAdmins, removeAdmin, searchProfiles } from '../../src/lib/api';
import { useSession } from '../../src/lib/session';
import { C, errText } from '../../src/lib/theme';
import type { Profile } from '../../src/lib/types';

type AdminRow = Awaited<ReturnType<typeof listAdmins>>[number];

export default function AdminAdmins() {
  const { me, profile } = useSession();
  const router = useRouter();
  const toast = useToast();
  const [admins, setAdmins] = useState<AdminRow[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState('');
  const [found, setFound] = useState<Profile[]>([]);
  const owner = profile?.admin_role === 'owner';

  const load = useCallback(() => {
    listAdmins().then(setAdmins).catch((e) => toast(errText(e)));
  }, [toast]);
  useFocusEffect(load);

  useEffect(() => {
    if (!adding) return;
    const t = setTimeout(() => {
      if (q.trim().length < 2) return setFound([]);
      searchProfiles(q.trim()).then(setFound).catch(() => setFound([]));
    }, 250);
    return () => clearTimeout(t);
  }, [q, adding]);

  function appoint(p: Profile) {
    Alert.alert(`Make ${p.full_name} an admin?`, 'They get the admin tools. Only you can add or remove admins.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Make admin', onPress: () => { addAdmin(me, p.id).then(() => { toast(`${p.username} is now an admin`); setAdding(false); setQ(''); load(); }).catch((e) => toast(errText(e))); } },
    ]);
  }

  function remove(a: AdminRow) {
    Alert.alert(`Remove ${a.profile?.username ?? 'this admin'}?`, 'They keep their account; they just lose the admin tools.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => { removeAdmin(a.user_id).then(() => { toast('Removed'); load(); }).catch((e) => toast(errText(e))); } },
    ]);
  }

  return (
    <Screen>
      <ScreenHeader title="Admins" right={owner ? <Pressable onPress={() => setAdding(true)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Add an admin"><Icon name="pluscircle" size={28} color={C.fg} /></Pressable> : undefined} />
      {admins === null ? (
        <Loading />
      ) : (
        <FlatList
          data={admins}
          keyExtractor={(a) => a.user_id}
          contentContainerStyle={{ paddingBottom: 40 }}
          ListHeaderComponent={<Text style={{ color: C.fg2, paddingHorizontal: 16, paddingBottom: 10, lineHeight: 20 }}>{owner ? 'Admins see reports, manage members, approve the tick and Plus, and keep the churches and hymnal. Choose people you trust.' : 'The people who look after the app.'}</Text>}
          ListEmptyComponent={<Empty icon="shield" title="No admins yet" />}
          renderItem={({ item: a }) => (
            <Pressable onPress={() => router.push(`/user/${a.user_id}`)} accessibilityRole="button" style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 9, backgroundColor: pressed ? 'rgba(255,255,255,0.04)' : 'transparent' })}>
              <Avatar uri={a.profile?.avatar_url} name={a.profile?.full_name ?? '?'} size={50} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.fg, fontWeight: '600' }}>{a.profile?.full_name ?? 'Account not set up yet'}</Text>
                <Text style={{ color: C.fg2, fontSize: 13.5 }}>{a.profile ? `@${a.profile.username}` : a.user_id} · {a.role === 'owner' ? 'Owner' : 'Admin'}</Text>
              </View>
              {owner && a.role === 'admin' ? <Button small kind="ghost" label="Remove" onPress={() => remove(a)} /> : null}
            </Pressable>
          )}
        />
      )}

      <Sheet visible={adding} onClose={() => { setAdding(false); setQ(''); }} title="Add an admin" tall>
        <SearchField value={q} onChangeText={setQ} placeholder="Search by name or username" autoFocus />
        <FlatList
          data={found}
          keyExtractor={(p) => p.id}
          keyboardShouldPersistTaps="handled"
          style={{ marginTop: 10 }}
          ListEmptyComponent={q.trim().length >= 2 ? <Empty title="No one found" /> : null}
          renderItem={({ item: p }) => {
            const already = admins?.some((a) => a.user_id === p.id);
            return (
              <Pressable onPress={() => (already ? undefined : appoint(p))} disabled={already} accessibilityRole="button" accessibilityLabel={`${p.full_name}, ${p.username}`} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 8, opacity: already ? 0.5 : 1, backgroundColor: pressed ? 'rgba(255,255,255,0.04)' : 'transparent' })}>
                <Avatar uri={p.avatar_url} name={p.full_name} size={46} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: C.fg, fontWeight: '600' }}>{p.full_name}</Text>
                  <Text style={{ color: C.fg2, fontSize: 13.5 }}>@{p.username}{already ? ' · already an admin' : ''}</Text>
                </View>
              </Pressable>
            );
          }}
        />
      </Sheet>
    </Screen>
  );
}
