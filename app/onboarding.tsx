import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { Redirect } from 'expo-router';
import { AuthShell, DARK_FIELD } from '../src/components/AuthShell';
import { DarkStatusBar } from '../src/components/OnDark';
import { BirthDateInput, BirthParts, checkBirthDate, EMPTY_BIRTH, noteBirthDateSaved } from '../src/components/BirthDateForm';
import { Avatar, Button, Field } from '../src/components/ui';
import { createProfile, setBirthDate, uploadImage } from '../src/lib/api';
import { pickFromLibrary } from '../src/lib/pick';
import { useSession } from '../src/lib/session';
import { DARK, errText } from '../src/lib/theme';

export default function Onboarding() {
  const { isSignedIn, signOut } = useAuth();
  const { user } = useUser();
  const { me, profile, loading, refresh } = useSession();
  const guess = (user?.primaryEmailAddress?.emailAddress ?? '').split('@')[0].toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 30);
  const [name, setName] = useState(user?.fullName ?? '');
  const [username, setUsername] = useState(guess.length >= 3 ? guess : '');
  const [photo, setPhoto] = useState<{ uri: string; width: number } | null>(null);
  const [birth, setBirth] = useState<BirthParts>(EMPTY_BIRTH);
  const [birthErr, setBirthErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  if (!isSignedIn) return <Redirect href="/sign-in" />;
  if (loading) return <View style={{ flex: 1, backgroundColor: DARK.bg }} />;
  if (profile) return <Redirect href="/" />;

  async function choose() {
    try {
      const [a] = await pickFromLibrary({ square: true });
      if (a) setPhoto({ uri: a.uri, width: a.width });
    } catch (e) {
      setErr(errText(e));
    }
  }

  async function save() {
    if (busy) return;
    const u = username.trim().toLowerCase();
    if (!name.trim()) return setErr('Add your name.');
    if (!/^[a-z0-9_]{3,30}$/.test(u)) return setErr('Usernames use 3 to 30 lowercase letters, numbers or underscores.');
    setErr('');
    const born = checkBirthDate(birth);
    if ('error' in born) return setBirthErr(born.error);
    setBirthErr('');
    setBusy(true);
    try {
      let avatar_url = '';
      if (photo) avatar_url = (await uploadImage(me, photo.uri, photo.width, 480)).url;
      await createProfile({ id: me, username: u, full_name: name.trim().slice(0, 80), avatar_url });
      // The birthday is kept apart from the profile, and only once the profile exists. If it doesn't
      // save, the app asks for it again before anything else, so the new profile is never left stuck.
      try {
        await setBirthDate(me, born.iso);
        // Under 14, the app then says once what that means for the account.
        noteBirthDateSaved(me, born.age);
      } catch {
        // asked for again by the birthday step
      }
      await refresh();
    } catch (e) {
      setErr(errText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title="Set up your profile. You can change your photo, name and username later."
      footer={
        <Pressable onPress={() => signOut()}>
          <Text style={{ color: DARK.accent2, fontWeight: '600' }}>Log out</Text>
        </Pressable>
      }>
      {/* The sign-up pages sit on a photo and stay dark in every theme. */}
      <DarkStatusBar />
      <Pressable onPress={choose} accessibilityRole="button" accessibilityLabel="Choose a profile photo" style={{ alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <Avatar uri={photo?.uri} name={name || username} size={92} />
        <Text style={{ color: DARK.accent2, fontWeight: '600' }}>{photo ? 'Change photo' : 'Add a photo'}</Text>
      </Pressable>
      <View style={{ gap: 6 }}>
        <Text style={{ color: DARK.fg2, fontSize: 12.5 }}>Name</Text>
        <Field {...DARK_FIELD} keyboardAppearance="dark" value={name} onChangeText={setName} placeholder="Your name" maxLength={80} textContentType="name" accessibilityLabel="Name" />
      </View>
      <View style={{ gap: 6 }}>
        <Text style={{ color: DARK.fg2, fontSize: 12.5 }}>Username</Text>
        <Field {...DARK_FIELD} keyboardAppearance="dark" value={username} onChangeText={(t) => setUsername(t.toLowerCase())} placeholder="username" autoCapitalize="none" autoCorrect={false} maxLength={30} error={err} accessibilityLabel="Username" />
      </View>
      <View style={{ gap: 6 }}>
        <Text style={{ color: DARK.fg2, fontSize: 12.5 }}>Birthday</Text>
        <BirthDateInput dark value={birth} onChange={(b) => { setBirth(b); if (birthErr) setBirthErr(''); }} error={birthErr} editable={!busy} />
      </View>
      <View style={{ height: 2 }} />
      <Button label="Continue" onPress={save} busy={busy} />
    </AuthShell>
  );
}
