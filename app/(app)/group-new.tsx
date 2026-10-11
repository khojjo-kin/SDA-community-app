import React, { useEffect, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Icon, IconName } from '../../src/components/Icon';
import { Button, ErrorNote, Field, Loading, Radio, Row, Screen, ScreenHeader, Sheet } from '../../src/components/ui';
import { createGroup, fetchChurches, handleFrom, uploadImage } from '../../src/lib/api';
import { tap } from '../../src/lib/haptics';
import { t } from '../../src/lib/i18n';
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
const PRIVACY: { value: Privacy; title: string }[] = [
  { value: 'public', title: 'Public' },
  { value: 'private', title: 'Private' },
];

/** A taken handle comes back from Postgres as a unique violation; errText would only say "That already exists". */
function isTakenHandle(e: unknown): boolean {
  const anyE = e as { code?: string; message?: string } | null;
  return anyE?.code === '23505' || /duplicate key|unique/i.test(anyE?.message ?? '');
}

const churchPlace = (c: Church) => [c.city, c.country].map((s) => (s ?? '').trim()).filter(Boolean).join(', ') || undefined;

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
  const [churchError, setChurchError] = useState('');
  const [pickingChurch, setPickingChurch] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  // Set the moment Create is tapped, so a second tap before the button shows it is busy does nothing.
  const busyNow = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  function changeName(v: string) {
    setName(v);
    if (errors.name) setErrors((e) => ({ ...e, name: undefined }));
    if (!handleTouched) setHandle(v.trim() ? handleFrom(v) : '');
  }
  function changeHandle(v: string) {
    setHandleTouched(true);
    setHandle(v.toLowerCase().replace(/\s+/g, ''));
    if (errors.handle) setErrors((e) => ({ ...e, handle: undefined }));
  }
  async function chooseCover() {
    try {
      const [a] = await pickFromLibrary();
      if (a) setCover({ uri: a.uri, width: a.width });
    } catch (e) {
      setErrors({ form: errText(e) });
    }
  }
  function loadChurches() {
    setChurchError('');
    fetchChurches()
      .then((l) => {
        // A church an admin turned down is never offered.
        if (alive.current) setChurches(l.filter((c) => c.status !== 'rejected'));
      })
      .catch((e) => {
        if (alive.current) setChurchError(errText(e));
      });
  }
  function openChurches() {
    setPickingChurch(true);
    if (churches === null) loadChurches();
  }

  async function save() {
    if (busyNow.current || !kind) return;
    const n = name.trim();
    const h = handle.trim().toLowerCase();
    const errs: Errors = {};
    if (n.length < 2 || n.length > 80) errs.name = 'Give it a name of 2 to 80 characters.';
    if (!HANDLE.test(h)) errs.handle = 'Handles use 3 to 30 lowercase letters, numbers, dots or underscores.';
    setErrors(errs);
    if (errs.name || errs.handle) return;
    busyNow.current = true;
    setBusy(true);
    try {
      // The cover is uploaded only now, so backing out of the form leaves nothing behind in storage.
      const cover_url = cover ? (await uploadImage(me, cover.uri, cover.width)).url : '';
      const id = await createGroup({ kind, name: n, handle: h, description: description.trim(), privacy: kind === 'community' ? privacy : 'public', cover_url, church_id: church?.id ?? null });
      if (!alive.current) return;
      tap('success');
      // Replace this form in the stack, so Back from the new group goes to the list rather than an empty form.
      router.replace({ pathname: '/group/[id]', params: { id } } as any);
    } catch (e) {
      busyNow.current = false;
      if (!alive.current) return;
      setErrors(isTakenHandle(e) ? { handle: 'That @handle is taken. Try another.' } : { form: errText(e) });
      setBusy(false);
    }
  }

  if (!kind) {
    return (
      <Screen>
        <ScreenHeader title="Create" close />
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 6, paddingBottom: 48, gap: 12 }}>
          {KINDS.map((k) => (
            <Pressable key={k.kind} onPress={() => { tap('select'); setKind(k.kind); }} accessibilityRole="button" accessibilityLabel={k.title} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 16, padding: 18, borderRadius: 18, backgroundColor: pressed ? C.surface2 : C.surface })}>
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
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 6, paddingBottom: 48, gap: 14 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive">
          <Pressable onPress={chooseCover} accessibilityRole="button" accessibilityLabel={cover ? 'Change cover photo' : 'Add a cover photo'} style={({ pressed }) => ({ height: 150, borderRadius: 16, overflow: 'hidden', backgroundColor: C.accentSoft, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.85 : 1 })}>
            {cover ? <Image source={{ uri: cover.uri }} style={{ position: 'absolute', width: '100%', height: '100%' }} contentFit="cover" /> : null}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, height: 32, borderRadius: 10, backgroundColor: cover ? 'rgba(10,12,14,0.7)' : 'transparent' }}>
              <Icon name="image" size={20} color={cover ? '#fff' : C.accent2} />
              <Text style={{ color: cover ? '#fff' : C.accent2, fontWeight: '600', fontSize: 14 }}>{cover ? 'Change cover' : 'Add a cover photo'}</Text>
            </View>
          </Pressable>
          <Field label="Name" value={name} onChangeText={changeName} placeholder={page ? 'e.g. Ebenezer Youth Choir' : 'e.g. Young Adults Bible Study'} maxLength={80} error={errors.name} autoFocus />
          <View style={{ gap: 6 }}>
            <Text style={{ color: C.fg2, fontSize: 12.5 }}>Handle</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', borderRadius: 12, backgroundColor: C.surface, paddingLeft: 14 }}>
              <Text style={{ color: C.fg2, fontSize: 16 }}>@</Text>
              <TextInput value={handle} onChangeText={changeHandle} placeholder="handle" placeholderTextColor={C.fg3} selectionColor={C.accent2} keyboardAppearance={C.blurTint} autoCapitalize="none" autoCorrect={false} maxLength={30} accessibilityLabel="Handle" style={{ flex: 1, color: C.fg, fontSize: 16, paddingLeft: 3, paddingRight: 14, paddingVertical: 13 }} />
            </View>
            {errors.handle ? <Text style={{ color: C.like, fontSize: 13 }}>{errors.handle}</Text> : null}
          </View>
          <Field label="Description" value={description} onChangeText={setDescription} placeholder={t('groups.addDescription')} maxLength={500} multiline style={{ minHeight: 90, textAlignVertical: 'top' }} />
          {page ? null : (
            <View style={{ gap: 6 }}>
              <Text style={{ color: C.fg2, fontSize: 12.5 }}>Who can join</Text>
              {PRIVACY.map((p) => (
                <Pressable key={p.value} onPress={() => setPrivacy(p.value)} accessibilityRole="radio" accessibilityState={{ checked: privacy === p.value }} accessibilityLabel={p.title} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, minHeight: 50, borderRadius: 12, backgroundColor: C.surface, opacity: pressed ? 0.75 : 1 })}>
                  <Icon name={p.value === 'private' ? 'lock' : 'users'} size={22} color={C.fg} />
                  <Text style={{ flex: 1, color: C.fg, fontSize: 16 }}>{p.title}</Text>
                  <Radio on={privacy === p.value} />
                </Pressable>
              ))}
            </View>
          )}
          <Pressable onPress={openChurches} accessibilityRole="button" accessibilityLabel={`Church, ${church?.name ?? 'none'}`} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, minHeight: 50, borderRadius: 12, backgroundColor: C.surface, opacity: pressed ? 0.75 : 1 })}>
            <Icon name="church" size={22} color={C.fg} />
            <Text style={{ color: C.fg, fontSize: 16 }}>Church</Text>
            <Text numberOfLines={1} style={{ flex: 1, textAlign: 'right', color: C.fg2, fontSize: 15 }}>{church?.name ?? t('groups.none')}</Text>
            <Icon name="right" size={18} color={C.fg2} weight={2} />
          </Pressable>
          {errors.form ? <Text style={{ color: C.like, lineHeight: 19 }}>{errors.form}</Text> : null}
          <Button label={page ? 'Create page' : 'Create community'} busy={busy} onPress={save} style={{ marginTop: 6 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      <Sheet visible={pickingChurch} onClose={() => setPickingChurch(false)} title="Church" tall>
        {churches === null ? (
          churchError ? <ErrorNote message={churchError} onRetry={loadChurches} /> : <Loading />
        ) : (
          <FlatList
            data={churches}
            keyExtractor={(c) => c.id}
            contentContainerStyle={{ paddingBottom: 8 }}
            initialNumToRender={14}
            ListHeaderComponent={<Row icon="close" title="No church" onPress={() => { setChurch(null); setPickingChurch(false); }} right={<Radio on={church === null} />} chevron={false} />}
            renderItem={({ item: c }) => <Row icon="church" title={c.name} sub={churchPlace(c)} onPress={() => { setChurch(c); setPickingChurch(false); }} right={<Radio on={church?.id === c.id} />} chevron={false} />}
          />
        )}
      </Sheet>
    </Screen>
  );
}
