import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button, Divider, Field, Row, Screen, ScreenHeader, SectionLabel, useToast } from '../../src/components/ui';
import { deleteAccount } from '../../src/lib/api';
import { useSession } from '../../src/lib/session';
import { supabase } from '../../src/lib/supabase';
import { C, errText } from '../../src/lib/theme';

export default function Account() {
  const { me, email, profile, signOut } = useSession();
  const router = useRouter();
  const toast = useToast();
  const [changing, setChanging] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function savePassword() {
    if (busy) return;
    if (next.length < 8) return setErr('Use a new password with at least 8 characters.');
    setBusy(true);
    setErr('');
    try {
      // Prove it's still you before the password changes hands.
      const check = await supabase.auth.signInWithPassword({ email, password: current });
      if (check.error) throw new Error('Your current password is wrong. If you signed up with Apple or Google, use "Forgot password" to set one first.');
      const { error } = await supabase.auth.updateUser({ password: next });
      if (error) throw error;
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
    if (deleting) return;
    setDeleting(true);
    try {
      // Photos, videos and the profile row go first; every table cascades from the profile.
      await deleteAccount(me);
      // Then the sign-in itself, through a database function that may remove its own user.
      const { error } = await supabase.rpc('community_delete_me');
      if (error) {
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
          <Row icon="mail" title="Email" sub={email || 'No email on this account'} />
          <Divider />

          <SectionLabel>Password and security</SectionLabel>
          {changing ? (
            <View style={{ paddingHorizontal: 16, gap: 12, paddingBottom: 6 }}>
              <Field label="Current password" value={current} onChangeText={setCurrent} secureTextEntry textContentType="password" autoCapitalize="none" />
              <Field label="New password" value={next} onChangeText={setNext} secureTextEntry textContentType="newPassword" autoCapitalize="none" error={err} onSubmitEditing={savePassword} returnKeyType="go" />
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
