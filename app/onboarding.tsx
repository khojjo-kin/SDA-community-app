import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { Redirect } from 'expo-router';
import { AuthShell } from '../src/components/AuthShell';
import { Avatar, Button, Field } from '../src/components/ui';
import { createProfile, uploadImage } from '../src/lib/api';
import { pickFromLibrary } from '../src/lib/pick';
import { useSession } from '../src/lib/session';
import { C, errText } from '../src/lib/theme';

export default function Onboarding() {
  const { isSignedIn, signOut } = useAuth();
  const { user } = useUser();
  const { me, profile, loading, refresh } = useSession();
  const guess = (user?.primaryEmailAddress?.emailAddress ?? '').split('@')[0].toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 30);
  const [name, setName] = useState(user?.fullName ?? '');
  const [username, setUsername] = useState(guess.length >= 3 ? guess : '');
  const [photo, setPhoto] = useState<{ uri: string; width: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  if (!isSignedIn) return <Redirect href="/sign-in" />;
  if (loading) return <View style={{ flex: 1, backgroundColor: C.bg }} />;
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
    const u = username.trim().toLowerCase();
    if (!name.trim()) return setErr('Add your name.');
    if (!/^[a-z0-9_]{3,30}$/.test(u)) return setErr('Usernames use 3 to 30 lowercase letters, numbers or underscores.');
    setBusy(true);
    setErr('');
    try {
      let avatar_url = '';
      if (photo) avatar_url = (await uploadImage(me, photo.uri, photo.width, 480)).url;
      await createProfile({ id: me, username: u, full_name: name.trim().slice(0, 80), avatar_url });
      await refresh();
    } catch (e) {
      setErr(errText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title="Set up your profile. You can change all of this later."
      footer={
        <Pressable onPress={() => signOut()}>
          <Text style={{ color: C.accent2, fontWeight: '600' }}>Log out</Text>
        </Pressable>
      }>
      <Pressable onPress={choose} accessibilityRole="button" accessibilityLabel="Choose a profile photo" style={{ alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <Avatar uri={photo?.uri} name={name || username} size={92} />
        <Text style={{ color: C.accent2, fontWeight: '600' }}>{photo ? 'Change photo' : 'Add a photo'}</Text>
      </Pressable>
      <Field label="Name" value={name} onChangeText={setName} placeholder="Your name" maxLength={80} textContentType="name" />
      <Field label="Username" value={username} onChangeText={(t) => setUsername(t.toLowerCase())} placeholder="username" autoCapitalize="none" autoCorrect={false} maxLength={30} error={err} />
      <View style={{ height: 2 }} />
      <Button label="Continue" onPress={save} busy={busy} />
    </AuthShell>
  );
}
