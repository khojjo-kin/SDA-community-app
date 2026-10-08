import React, { useCallback, useEffect, useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { useAuth, useUser } from '@clerk/clerk-expo';
import Constants from 'expo-constants';
import { SectionTitle } from '../../src/components/Grid';
import { PersonRow } from '../../src/components/PersonRow';
import { Button, Header, Screen, useToast } from '../../src/components/ui';
import { deleteAccount, listBlocked, setBlock } from '../../src/lib/api';
import { useSession } from '../../src/lib/session';
import { C, errText } from '../../src/lib/theme';
import type { Profile } from '../../src/lib/types';

export default function Settings() {
  const { signOut } = useAuth();
  const { user } = useUser();
  const { me, profile } = useSession();
  const toast = useToast();
  const [blocked, setBlocked] = useState<Profile[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    listBlocked(me).then(setBlocked).catch(() => {});
  }, [me]);
  useEffect(load, [load]);

  function logOut() {
    Alert.alert('Log out of Community?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log out', style: 'destructive', onPress: () => { signOut().catch((e) => toast(errText(e))); } },
    ]);
  }

  async function reallyDelete() {
    setBusy(true);
    try {
      await deleteAccount(me);
      try {
        await user?.delete();
      } catch {
        // The profile and everything shared are already gone. Only the sign-in record is left.
        Alert.alert('Almost done', 'Your profile and everything you shared were deleted, but the sign-in record could not be removed. Contact support to finish removing it.');
      }
      await signOut();
    } catch (e) {
      toast(errText(e));
      setBusy(false);
    }
  }

  function removeAccount() {
    Alert.alert('Delete your account?', 'This permanently deletes your profile, posts, stories, comments and messages. You cannot undo it.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete account', style: 'destructive', onPress: reallyDelete },
    ]);
  }

  return (
    <Screen>
      <Header title="Settings" />
      <ScrollView contentContainerStyle={{ paddingBottom: 60 }}>
        <SectionTitle>Account</SectionTitle>
        <View style={{ paddingHorizontal: 16, gap: 4 }}>
          <Text style={{ color: C.fg }}>{profile?.username}</Text>
          <Text style={{ color: C.fg2 }}>{user?.primaryEmailAddress?.emailAddress ?? ''}</Text>
        </View>
        <View style={{ paddingHorizontal: 16, paddingTop: 16, gap: 10 }}>
          <Button label="Log out" kind="ghost" onPress={logOut} />
        </View>

        <SectionTitle>Blocked accounts</SectionTitle>
        {blocked.length ? (
          blocked.map((p) => <PersonRow key={p.id} person={p} right={<Button small kind="ghost" label="Unblock" onPress={() => setBlock(me, p.id, false).then(() => { toast(`Unblocked ${p.username}`); load(); }).catch((e) => toast(errText(e)))} />} />)
        ) : (
          <Text style={{ color: C.fg2, paddingHorizontal: 16 }}>You haven't blocked anyone.</Text>
        )}

        <SectionTitle>Delete account</SectionTitle>
        <View style={{ paddingHorizontal: 16, gap: 10 }}>
          <Text style={{ color: C.fg2, lineHeight: 20 }}>Deleting your account removes your profile and everything you have shared. This cannot be undone.</Text>
          <Button label="Delete account" kind="danger" onPress={removeAccount} busy={busy} />
        </View>

        <Text style={{ color: C.fg3, textAlign: 'center', marginTop: 32, fontSize: 12.5 }}>Community {Constants.expoConfig?.version ?? ''}</Text>
      </ScrollView>
    </Screen>
  );
}
