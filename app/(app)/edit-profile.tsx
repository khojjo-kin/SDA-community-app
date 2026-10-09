import React, { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Avatar, Field, IconButton, Screen, useToast } from '../../src/components/ui';
import { updateProfile, uploadImage } from '../../src/lib/api';
import { pickFromLibrary } from '../../src/lib/pick';
import { useSession } from '../../src/lib/session';
import { C, errText } from '../../src/lib/theme';

export default function EditProfile() {
  const { me, profile, refresh } = useSession();
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState(profile?.full_name ?? '');
  const [username, setUsername] = useState(profile?.username ?? '');
  const [bio, setBio] = useState(profile?.bio ?? '');
  const [website, setWebsite] = useState(profile?.website ?? '');
  const [photo, setPhoto] = useState<{ uri: string; width: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

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
    setBusy(true);
    setErr('');
    try {
      const patch: any = { full_name: name.trim().slice(0, 80), username: u, bio: bio.trim().slice(0, 500), website: website.trim().slice(0, 500) };
      if (photo) patch.avatar_url = (await uploadImage(me, photo.uri, photo.width, 480)).url;
      await updateProfile(me, patch);
      await refresh();
      toast('Profile saved');
      if (alive.current) router.back();
    } catch (e) {
      if (!alive.current) return toast(errText(e));
      setErr(errText(e));
      setBusy(false);
    }
  }

  return (
    <Screen>
      <View style={{ height: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8 }}>
        <IconButton name="close" label="Cancel" onPress={() => router.back()} />
        <Text style={{ flex: 1, color: C.fg, fontSize: 18, fontWeight: '700', textAlign: 'center' }}>Edit profile</Text>
        <Pressable onPress={save} disabled={busy} hitSlop={8} style={{ width: 56, alignItems: 'flex-end', paddingRight: 8 }} accessibilityRole="button">
          <Text style={{ color: C.accent2, fontWeight: '700', opacity: busy ? 0.4 : 1 }}>{busy ? 'Saving' : 'Done'}</Text>
        </Pressable>
      </View>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <Pressable onPress={choose} accessibilityRole="button" accessibilityLabel="Change profile photo" style={{ alignItems: 'center', gap: 10, paddingVertical: 8 }}>
            <Avatar uri={photo?.uri ?? profile?.avatar_url} name={name} size={92} />
            <Text style={{ color: C.accent2, fontWeight: '600' }}>Change photo</Text>
          </Pressable>
          <Field label="Name" value={name} onChangeText={setName} maxLength={80} />
          <Field label="Username" value={username} onChangeText={(t) => setUsername(t.toLowerCase())} autoCapitalize="none" autoCorrect={false} maxLength={30} />
          <Field label="Bio" value={bio} onChangeText={setBio} multiline maxLength={500} style={{ minHeight: 84, textAlignVertical: 'top' }} />
          <Field label="Website" value={website} onChangeText={setWebsite} autoCapitalize="none" autoCorrect={false} keyboardType="url" maxLength={500} error={err} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
