import React, { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Icon, IconName } from '../../src/components/Icon';
import { Button, Field, Loading, Radio, Row, Screen, ScreenHeader, Sheet } from '../../src/components/ui';
import { createGroup, fetchChurches, handleFrom, uploadImage } from '../../src/lib/api';
import { pickFromLibrary } from '../../src/lib/pick';
import { useSession } from '../../src/lib/session';
import { C, errText } from '../../src/lib/theme';
import type { Church } from '../../src/lib/types';

type Kind = 'community' | 'page';
type Privacy = 'public' | 'private';
type Errors = { name?: string; handle?: string; form?: string };

/** Same rule as the database's check on handles. */
const HANDLE = /^[a-z0-9_.]{3,30}$/;

const KINDS: { kind: Kind; icon: IconName; title: string }[] = [
  { kind: 'community', icon: 'users', title: 'Community' },
  { kind: 'page', icon: 'crown', title: 'Page' },
];
const PRIVACY: { value: Privacy; title: string; body: string }[] = [
  { value: 'public', title: 'Public', body: 'Anyone can join and see what is posted.' },
  { value: 'private', title: 'Private', body: 'People ask to join, and an admin lets them in.' },
];

/** A taken handle comes back from Postgres as a unique violation; errText would only say "That already exists". */
function isTakenHandle(e: unknown): boolean {
  const anyE = e as { code?: string; message?: string } | null;
  return anyE?.code === '23505' || /duplicate key|unique/i.test(anyE?.message ?? '');
}

export default function GroupNew() {
  const router = useRouter();
  const { me } = useSession();
  const [kind, setKind] = useState<Kind | null>(null);
  const [name, setName] = useState('');
  const [handle, setHandle] = useState('');
  // Once the handle has been typed in by hand, the name stops rewriting it.
  const [handleTouched, setHandleTouched] = useState(false);
  const [description, setDescription] = useState('');
  const [privacy, setPrivacy] = useState<Privacy>('public');
  const [cover, setCover] = useState<{ uri: string; width: number } | null>(null);
  const [church, setChurch] = useState<Church | null>(null);
  const [churches, setChurches] = useState<Church[] | null>(null);
  const [pickingChurch, setPickingChurch] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  function changeName(v: string) {
    setName(v);
    if (!handleTouched) setHandle(v.trim() ? handleFrom(v) : '');
  }
  function changeHandle(v: string) {
    setHandleTouched(true);
    setHandle(v.toLowerCase().replace(/\s+/g, ''));
  }
  async function chooseCover() {
    try {
      const [a] = await pickFromLibrary();
      if (a) setCover({ uri: a.uri, width: a.width });
    } catch (e) {
      setErrors({ form: errText(e) });
    }
  }
  function openChurches() {
    setPickingChurch(true);
    if (churches === null) fetchChurches().then((l) => { if (alive.current) setChurches(l); }).catch((e) => setErrors({ form: errText(e) }));
  }

  async function save() {
    if (busy || !kind) return;
    const n = name.trim();
    const h = handle.trim().toLowerCase();
    const errs: Errors = {};
    if (n.length < 2 || n.length > 80) errs.name = 'Give it a name of 2 to 80 characters.';
    if (!HANDLE.test(h)) errs.handle = 'Handles use 3 to 30 lowercase letters, numbers, dots or underscores.';
    setErrors(errs);
    if (errs.name || errs.handle) return;
    setBusy(true);
    try {
      // The cover is uploaded only now, so backing out of the form leaves nothing behind in storage.
      const cover_url = cover ? (await uploadImage(me, cover.uri, cover.width)).url : '';
      const id = await createGroup({ kind, name: n, handle: h, description: description.trim(), privacy: kind === 'community' ? privacy : 'public', cover_url, church_id: church?.id ?? null });
      if (!alive.current) return;
      // Replace this form in the stack, so Back from the new group goes to the list rather than an empty form.
      router.replace({ pathname: '/group/[id]', params: { id } } as any);
    } catch (e) {
      if (!alive.current) return;
      setErrors(isTakenHandle(e) ? { handle: 'That @handle is taken. Try another.' } : { form: errText(e) });
      setBusy(false);
    }
  }

  if (!kind) {
    return (
      <Screen>
        <ScreenHeader title="Create" />
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 6, paddingBottom: 48, gap: 12 }}>
          {KINDS.map((k) => (
            <Pressable key={k.kind} onPress={() => setKind(k.kind)} accessibilityRole="button" accessibilityLabel={k.title} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 16, padding: 18, borderRadius: 18, backgroundColor: pressed ? C.surface2 : C.surface })}>
              <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: C.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name={k.icon} size={30} color={C.accent2} />
              </View>
              <Text style={{ flex: 1, color: C.fg, fontSize: 18, fontWeight: '700' }}>{k.title}</Text>
              <Icon name="right" size={18} color={C.fg2} weight={2} />
            </Pressable>
          ))}
        </ScrollView>
      </Screen>
    );
  }

  const page = kind === 'page';
  return (
    <Screen>
      {/* Back returns to the choice of kind, not to the previous screen, so a wrong pick is one tap to fix. */}
      <ScreenHeader title={page ? 'New page' : 'New community'} onBack={() => (busy ? undefined : setKind(null))} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 6, paddingBottom: 48, gap: 14 }} keyboardShouldPersistTaps="handled">
          <Pressable onPress={chooseCover} accessibilityRole="button" accessibilityLabel={cover ? 'Change cover photo' : 'Add a cover photo'} style={{ height: 150, borderRadius: 16, overflow: 'hidden', backgroundColor: C.accentSoft, alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            {cover ? <Image source={{ uri: cover.uri }} style={{ position: 'absolute', width: '100%', height: '100%' }} contentFit="cover" /> : null}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, height: 32, borderRadius: 10, backgroundColor: cover ? 'rgba(10,12,14,0.7)' : 'transparent' }}>
              <Icon name="image" size={20} color={cover ? '#fff' : C.accent2} />
              <Text style={{ color: cover ? '#fff' : C.accent2, fontWeight: '600', fontSize: 14 }}>{cover ? 'Change cover' : 'Add a cover photo'}</Text>
            </View>
            {cover ? null : <Text style={{ color: C.fg2, fontSize: 12.5 }}>Optional</Text>}
          </Pressable>
          <Field label="Name" value={name} onChangeText={changeName} placeholder={page ? 'e.g. Ebenezer Youth Choir' : 'e.g. Young Adults Bible Study'} maxLength={80} error={errors.name} autoFocus />
          <View style={{ gap: 6 }}>
            <Text style={{ color: C.fg2, fontSize: 12.5 }}>Handle</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', borderRadius: 12, backgroundColor: C.surface, paddingLeft: 14 }}>
              <Text style={{ color: C.fg2, fontSize: 16 }}>@</Text>
              <TextInput value={handle} onChangeText={changeHandle} placeholder="handle" placeholderTextColor={C.fg3} selectionColor={C.accent2} keyboardAppearance={C.blurTint} autoCapitalize="none" autoCorrect={false} maxLength={30} accessibilityLabel="Handle" style={{ flex: 1, color: C.fg, fontSize: 16, paddingLeft: 3, paddingRight: 14, paddingVertical: 13 }} />
            </View>
            <Text style={{ color: errors.handle ? C.like : C.fg3, fontSize: errors.handle ? 13 : 12.5 }}>{errors.handle ?? 'How people find it: letters, numbers, dots and underscores.'}</Text>
          </View>
          <Field label="Description" value={description} onChangeText={setDescription} placeholder="What is it for, and who is it for?" maxLength={500} multiline style={{ minHeight: 90, textAlignVertical: 'top' }} />
          {page ? null : (
            <View style={{ gap: 6 }}>
              <Text style={{ color: C.fg2, fontSize: 12.5 }}>Who can join</Text>
              {PRIVACY.map((p) => (
                <Pressable key={p.value} onPress={() => setPrivacy(p.value)} accessibilityRole="radio" accessibilityState={{ checked: privacy === p.value }} accessibilityLabel={`${p.title}. ${p.body}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 12, backgroundColor: C.surface }}>
                  <Icon name={p.value === 'private' ? 'lock' : 'users'} size={22} color={C.fg} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: C.fg, fontSize: 16 }}>{p.title}</Text>
                    <Text style={{ color: C.fg2, fontSize: 13.5, lineHeight: 18 }}>{p.body}</Text>
                  </View>
                  <Radio on={privacy === p.value} />
                </Pressable>
              ))}
            </View>
          )}
          <Pressable onPress={openChurches} accessibilityRole="button" accessibilityLabel={`Church, ${church?.name ?? 'none'}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 12, backgroundColor: C.surface }}>
            <Icon name="church" size={22} color={C.fg} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: C.fg, fontSize: 16 }}>Church</Text>
              <Text numberOfLines={1} style={{ color: C.fg2, fontSize: 13.5 }}>{church?.name ?? 'Optional: the church it belongs to'}</Text>
            </View>
            <Icon name="right" size={18} color={C.fg2} weight={2} />
          </Pressable>
          {errors.form ? <Text style={{ color: C.like, lineHeight: 19 }}>{errors.form}</Text> : null}
          <Button label={page ? 'Create page' : 'Create community'} busy={busy} onPress={save} style={{ marginTop: 6 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      <Sheet visible={pickingChurch} onClose={() => setPickingChurch(false)} title="Church" tall>
        {churches === null ? (
          <Loading />
        ) : (
          <ScrollView contentContainerStyle={{ paddingBottom: 8 }}>
            <Row icon="close" title="No church" onPress={() => { setChurch(null); setPickingChurch(false); }} right={<Radio on={church === null} />} chevron={false} />
            {churches.map((c) => (
              <Row key={c.id} icon="church" title={c.name} sub={[c.city, c.country].map((s) => s.trim()).filter(Boolean).join(', ') || undefined} onPress={() => { setChurch(c); setPickingChurch(false); }} right={<Radio on={church?.id === c.id} />} chevron={false} />
            ))}
            {churches.length === 0 ? <Text style={{ color: C.fg2, paddingHorizontal: 16, paddingTop: 12, lineHeight: 20 }}>No churches are listed yet.</Text> : null}
          </ScrollView>
        )}
      </Sheet>
    </Screen>
  );
}
