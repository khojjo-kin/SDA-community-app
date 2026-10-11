import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { AdminFrame } from '../../src/components/AdminFrame';
import { RowsSkeleton } from '../../src/components/Skeleton';
import { Avatar, Button, Empty, ErrorNote, RoundButton, SearchField, Sheet, useToast } from '../../src/components/ui';
import { addAdmin, listAdmins, removeAdmin, searchProfiles } from '../../src/lib/api';
import { tap } from '../../src/lib/haptics';
import { useSession } from '../../src/lib/session';
import { C, errText } from '../../src/lib/theme';
import type { Profile } from '../../src/lib/types';

type AdminRow = Awaited<ReturnType<typeof listAdmins>>[number];

/** Who has the admin tools. The owner adds people here and takes the tools away again. */
export default function AdminAdmins() {
  const { me, profile } = useSession();
  const router = useRouter();
  const toast = useToast();
  const [admins, setAdmins] = useState<AdminRow[] | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState('');
  const [found, setFound] = useState<Profile[]>([]);
  const [searching, setSearching] = useState(false);
  // The person being added or removed: their row shows it, and a second tap does nothing.
  const [working, setWorking] = useState('');
  const workingNow = useRef(false);
  const shown = useRef<AdminRow[] | null>(null);
  shown.current = admins;
  const asked = useRef(0);
  const owner = profile?.admin_role === 'owner';

  const load = useCallback(
    (pull = false) => {
      if (pull) setRefreshing(true);
      listAdmins()
        .then((rows) => {
          setAdmins(rows);
          setError('');
        })
        .catch((e) => {
          if (shown.current === null) setError(errText(e));
          else if (pull) toast(errText(e));
        })
        .finally(() => {
          if (pull) setRefreshing(false);
        });
    },
    [toast],
  );
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  // Finds people a moment after the last key; only the latest search may fill the list.
  useEffect(() => {
    if (!adding) return;
    const needle = q.trim();
    const n = ++asked.current;
    if (needle.length < 2) {
      setFound([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const wait = setTimeout(() => {
      searchProfiles(needle)
        .then((list) => {
          if (n === asked.current) setFound(list);
        })
        .catch(() => {
          if (n === asked.current) setFound([]);
        })
        .finally(() => {
          if (n === asked.current) setSearching(false);
        });
    }, 250);
    return () => clearTimeout(wait);
  }, [q, adding]);

  function closeSheet() {
    setAdding(false);
    setQ('');
    setFound([]);
  }

  function appoint(p: Profile) {
    if (workingNow.current) return;
    Alert.alert(`Make ${p.full_name || p.username} an admin?`, undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Make admin',
        onPress: () => {
          if (workingNow.current) return;
          workingNow.current = true;
          setWorking(p.id);
          addAdmin(me, p.id)
            .then(() => {
              tap('success');
              toast(`${p.username} is now an admin`);
              setAdmins((list) => (list && !list.some((a) => a.user_id === p.id) ? [...list, { user_id: p.id, role: 'admin', profile: p }] : list));
              closeSheet();
            })
            .catch((e) => toast(errText(e)))
            .finally(() => {
              workingNow.current = false;
              setWorking('');
            });
        },
      },
    ]);
  }

  function remove(a: AdminRow) {
    if (workingNow.current) return;
    Alert.alert(`Remove ${a.profile?.username ? `@${a.profile.username}` : 'this admin'}?`, 'They keep their account.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          if (workingNow.current) return;
          workingNow.current = true;
          setWorking(a.user_id);
          removeAdmin(a.user_id)
            .then(() => {
              toast('Removed');
              setAdmins((list) => (list ? list.filter((x) => x.user_id !== a.user_id) : list));
            })
            .catch((e) => toast(errText(e)))
            .finally(() => {
              workingNow.current = false;
              setWorking('');
            });
        },
      },
    ]);
  }

  return (
    <AdminFrame section="admins" title="Admins" right={owner ? <RoundButton name="plus" label="Add an admin" onPress={() => setAdding(true)} /> : undefined}>
      {admins === null ? (
        error ? <ErrorNote message={error} onRetry={() => { setError(''); load(); }} /> : <RowsSkeleton count={3} avatar={50} padY={9} trailing={owner ? 'button' : undefined} />
      ) : (
        <FlatList
          data={admins}
          keyExtractor={(a) => a.user_id}
          contentContainerStyle={{ paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={C.fg2} />}
          ListEmptyComponent={<Empty icon="shield" title="No admins yet" />}
          renderItem={({ item: a }) => (
            <Pressable onPress={() => router.push(`/admin-member/${a.user_id}`)} accessibilityRole="button" accessibilityLabel={`${a.profile?.full_name || a.profile?.username || 'Admin'}, ${a.role === 'owner' ? 'owner' : 'admin'}`} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 9, backgroundColor: pressed ? C.press : 'transparent' })}>
              <Avatar uri={a.profile?.avatar_url} name={a.profile?.full_name ?? '?'} size={50} />
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={{ color: C.fg, fontWeight: '600' }}>{a.profile?.full_name || a.profile?.username || 'Account not set up yet'}</Text>
                <Text numberOfLines={1} style={{ color: C.fg2, fontSize: 13.5 }}>{a.profile ? `@${a.profile.username}` : a.user_id} · {a.role === 'owner' ? 'Owner' : 'Admin'}</Text>
              </View>
              {owner && a.role === 'admin' ? <Button small kind="ghost" label="Remove" busy={working === a.user_id} onPress={() => remove(a)} /> : null}
            </Pressable>
          )}
        />
      )}

      <Sheet visible={adding} onClose={closeSheet} title="Add an admin" tall>
        <SearchField value={q} onChangeText={setQ} placeholder="Name or username" label="Search people" autoFocus />
        <FlatList
          data={found}
          keyExtractor={(p) => p.id}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          style={{ marginTop: 10 }}
          ListEmptyComponent={searching ? <ActivityIndicator color={C.fg2} style={{ padding: 24 }} /> : q.trim().length >= 2 ? <Empty title="No one found" /> : null}
          renderItem={({ item: p }) => {
            const already = !!admins?.some((a) => a.user_id === p.id);
            return (
              <Pressable onPress={already ? undefined : () => appoint(p)} disabled={already} accessibilityRole="button" accessibilityLabel={`${p.full_name}, ${p.username}${already ? ', already an admin' : ''}`} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 8, opacity: already ? 0.5 : 1, backgroundColor: pressed ? C.press : 'transparent' })}>
                <Avatar uri={p.avatar_url} name={p.full_name} size={46} />
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={{ color: C.fg, fontWeight: '600' }}>{p.full_name || p.username}</Text>
                  <Text numberOfLines={1} style={{ color: C.fg2, fontSize: 13.5 }}>@{p.username}{already ? ' · admin' : ''}</Text>
                </View>
                {working === p.id ? <ActivityIndicator color={C.fg2} /> : null}
              </Pressable>
            );
          }}
        />
      </Sheet>
    </AdminFrame>
  );
}
