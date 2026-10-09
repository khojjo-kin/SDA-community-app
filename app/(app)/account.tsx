import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { useAuth, useSession as useClerkSession, useUser } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import { Button, Divider, Field, Row, Screen, ScreenHeader, SectionLabel, useToast } from '../../src/components/ui';
import { deleteAccount } from '../../src/lib/api';
import { useSession } from '../../src/lib/session';
import { C, errText } from '../../src/lib/theme';

/** Clerk refuses sensitive changes unless the person proved who they are in the last few minutes. */
const needsFresh = (e: any) => !!e?.errors?.some((x: any) => x?.code === 'session_reverification_required');

function ask(title: string, message: string, secure: boolean): Promise<string | null> {
  return new Promise((resolve) =>
    Alert.prompt(
      title,
      message,
      [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
        { text: 'Continue', onPress: (value?: string) => resolve(value ?? '') },
      ],
      secure ? 'secure-text' : 'plain-text',
      '',
      secure ? 'default' : 'number-pad',
    ),
  );
}

export default function Account() {
  const { signOut } = useAuth();
  const { user } = useUser();
  const { session } = useClerkSession();
  const { me, profile } = useSession();
  const router = useRouter();
  const toast = useToast();
  const [changing, setChanging] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);

  /** Proves it is still you, with your password or a code sent to your email. False means you cancelled. */
  async function confirmIdentity(knownPassword?: string): Promise<boolean> {
    if (!session || !user) return false;
    const check = await session.startVerification({ level: 'first_factor' });
    if (check.status === 'complete') return true;
    const factors = check.supportedFirstFactors ?? [];
    if (user.passwordEnabled && factors.some((f) => f.strategy === 'password')) {
      const password = knownPassword ?? (await ask("Confirm it's you", 'Enter your password to continue.', true));
      if (!password) return false;
      await session.attemptFirstFactorVerification({ strategy: 'password', password });
      return true;
    }
    const email = factors.find((f) => f.strategy === 'email_code');
    if (!email || email.strategy !== 'email_code') throw new Error('Log out, log back in, and try again.');
    await session.prepareFirstFactorVerification({ strategy: 'email_code', emailAddressId: email.emailAddressId });
    const code = await ask("Confirm it's you", `Enter the code we sent to ${email.safeIdentifier}.`, false);
    if (!code) return false;
    await session.attemptFirstFactorVerification({ strategy: 'email_code', code: code.trim() });
    return true;
  }

  async function savePassword() {
    if (busy || !user) return;
    if (next.length < 8) return setErr('Use a new password with at least 8 characters.');
    setBusy(true);
    setErr('');
    try {
      const change = () => user.updatePassword({ currentPassword: current, newPassword: next, signOutOfOtherSessions: true });
      try {
        await change();
      } catch (e) {
        if (!needsFresh(e)) throw e;
        if (!(await confirmIdentity(current))) return;
        await change();
      }
      setChanging(false);
      setCurrent('');
      setNext('');
      toast('Password changed');
    } catch (e) {
      setErr(errText(e));
    } finally {
      setBusy(false);
    }
  }

  async function reallyDelete() {
    if (!user || deleting) return;
    if (user.deleteSelfEnabled === false) {
      Alert.alert('Deleting is turned off', 'Accounts cannot be deleted from the app at the moment.');
      return;
    }
    setDeleting(true);
    try {
      // The sign-in can only be removed right after you have proved who you are.
      // Do that first, before anything is deleted, so the two halves cannot come apart.
      const minutes = session?.factorVerificationAge?.[0];
      if (minutes == null || minutes < 0 || minutes >= 8) {
        if (!(await confirmIdentity())) {
          setDeleting(false);
          return;
        }
      }
      await deleteAccount(me);
      try {
        try {
          await user.delete();
        } catch (e) {
          if (!needsFresh(e) || !(await confirmIdentity())) throw e;
          await user.delete();
        }
      } catch {
        // The profile and everything shared are already gone. Only the sign-in itself is left.
        Alert.alert('Almost done', 'Your profile and everything you shared were deleted, but your sign-in could not be removed just now. Log in again and choose Delete account once more to finish.');
      }
      await signOut();
    } catch (e) {
      toast(errText(e));
      setDeleting(false);
    }
  }

  function removeAccount() {
    Alert.alert('Delete your account?', 'This permanently deletes your profile, posts, stories, highlights, comments and messages. You cannot undo it.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete account', style: 'destructive', onPress: reallyDelete },
    ]);
  }

  return (
    <Screen>
      <ScreenHeader title="Account" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
          <SectionLabel>Personal details</SectionLabel>
          <Row icon="user" title={profile?.full_name ?? ''} sub={`@${profile?.username ?? ''}`} onPress={() => router.push('/edit-profile')} />
          <Row icon="mail" title="Email" sub={user?.primaryEmailAddress?.emailAddress ?? 'No email on this account'} />
          <Divider />

          <SectionLabel>Password and security</SectionLabel>
          {changing ? (
            <View style={{ paddingHorizontal: 16, gap: 12, paddingBottom: 6 }}>
              <Field label="Current password" value={current} onChangeText={setCurrent} secureTextEntry textContentType="password" autoCapitalize="none" />
              <Field label="New password" value={next} onChangeText={setNext} secureTextEntry textContentType="newPassword" autoCapitalize="none" error={err} onSubmitEditing={savePassword} returnKeyType="go" />
              <Text style={{ color: C.fg2, fontSize: 13.5, lineHeight: 19 }}>Changing your password logs you out on your other devices.</Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Button label="Cancel" kind="ghost" style={{ flex: 1 }} onPress={() => { setChanging(false); setErr(''); setCurrent(''); setNext(''); }} />
                <Button label="Save password" style={{ flex: 1 }} busy={busy} disabled={!current || !next} onPress={savePassword} />
              </View>
            </View>
          ) : (
            <Row icon="key" title="Change password" onPress={() => setChanging(true)} />
          )}
          <Divider />

          <SectionLabel>Delete account</SectionLabel>
          <View style={{ paddingHorizontal: 16, gap: 12 }}>
            <Text style={{ color: C.fg2, lineHeight: 20 }}>Deleting your account removes your profile and everything you have shared. This cannot be undone.</Text>
            <Button label="Delete account" kind="danger" onPress={removeAccount} busy={deleting} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
