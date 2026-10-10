import React, { useCallback, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Icon } from '../../src/components/Icon';
import { SABBATH_KINDS, sabbathPostsChanged, usePublishing } from '../../src/components/sabbath/publishers';
import { Button, Empty, ErrorNote, Field, Loading, Screen, ScreenHeader, useToast } from '../../src/components/ui';
import { createSabbathPost, fetchSabbathPost, updateSabbathPost, uploadImage, type SabbathPostInput } from '../../src/lib/api';
import { tap } from '../../src/lib/haptics';
import { useT } from '../../src/lib/i18n';
import { pickFromLibrary } from '../../src/lib/pick';
import { useSession } from '../../src/lib/session';
import { C, errText } from '../../src/lib/theme';
import type { Media, SabbathPost, SabbathPostKind } from '../../src/lib/types';

/** The same limits as the database. */
const MAX = { title: 140, ref: 80, body: 10000, link: 500, photos: 6 };

/** A photo already uploaded (`media`), or one just chosen, uploaded on save. */
type Photo = { key: string; uri: string; width?: number; media?: Media };

type Errors = { title?: string; ref?: string; body?: string; link?: string; form?: string };

/** "example.org/x" becomes "https://example.org/x"; anything with its own scheme is left for the check. */
function withScheme(raw: string): string {
  const s = raw.trim();
  return s && !/^[a-z][a-z0-9+.-]*:/i.test(s) ? `https://${s}` : s;
}

/** Writing a Sabbath School post, or editing one with `?id=`. Approved publishers and admins only. */
export default function SabbathPostEdit() {
  const params = useLocalSearchParams<{ id?: string }>();
  const editId = typeof params.id === 'string' ? params.id : '';
  const router = useRouter();
  const toast = useToast();
  const t = useT();
  const { me, profile } = useSession();
  const { height: screenH } = useWindowDimensions();
  const { publisher, canPublish, reload, error: publishingError } = usePublishing();

  const [existing, setExisting] = useState<SabbathPost | null>(null);
  const [loadError, setLoadError] = useState('');
  const [kind, setKind] = useState<SabbathPostKind>('study');
  const [title, setTitle] = useState('');
  const [lessonRef, setLessonRef] = useState('');
  const [body, setBody] = useState('');
  const [link, setLink] = useState('');
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const working = useRef(false);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);
  useEffect(() => { reload(); }, [reload]);

  const load = useCallback(async () => {
    if (!editId) return;
    setLoadError('');
    try {
      const p = await fetchSabbathPost(editId);
      if (!alive.current) return;
      if (!p) {
        setLoadError(t('ssPub.notFound'));
        return;
      }
      setExisting(p);
      setKind(p.kind);
      setTitle(p.title);
      setLessonRef(p.lesson_ref);
      setBody(p.body);
      setLink(p.link);
      setPhotos(p.media.filter((m) => m.type === 'image').map((m, i) => ({ key: `${i}:${m.url}`, uri: m.url, media: m })));
    } catch (e) {
      if (alive.current) setLoadError(errText(e));
    }
  }, [editId, t]);
  useEffect(() => { load(); }, [load]);

  async function addPhotos() {
    if (busy) return;
    const room = MAX.photos - photos.length;
    if (room <= 0) return;
    try {
      const picked = await pickFromLibrary({ multiple: true, limit: room });
      if (!alive.current || !picked.length) return;
      setPhotos((p) => [...p, ...picked.map((a, i) => ({ key: `${Date.now()}:${i}:${a.uri}`, uri: a.uri, width: a.width }))].slice(0, MAX.photos));
    } catch (e) {
      setErrors({ form: errText(e) });
    }
  }

  async function save() {
    if (working.current) return;
    const tt = title.trim();
    const ref = lessonRef.trim();
    const text = body.trim();
    const url = withScheme(link);
    const errs: Errors = {};
    if (!tt || tt.length > MAX.title) errs.title = t('ssPub.errTitle');
    if (ref.length > MAX.ref) errs.ref = t('ssPub.errRef');
    if (text.length > MAX.body) errs.body = t('ssPub.errBody');
    if (url && (!/^https:\/\/[^\s/]+\.[^\s]+$/i.test(url) || url.length > MAX.link)) errs.link = t('ssPub.errLink');
    setErrors(errs);
    if (Object.keys(errs).length) return;

    working.current = true;
    setBusy(true);
    try {
      // New photos are uploaded only now, in order, so backing out leaves nothing behind.
      const media: Media[] = [];
      for (const p of photos.slice(0, MAX.photos)) media.push(p.media ?? (await uploadImage(me, p.uri, p.width)));
      const input: SabbathPostInput = { kind, title: tt, body: text, lesson_ref: ref, media, link: url };
      if (existing) {
        await updateSabbathPost(existing.id, input);
        sabbathPostsChanged();
        if (!alive.current) return;
        toast(t('ssPub.saved'));
        router.back();
        return;
      }
      const id = await createSabbathPost(me, input);
      sabbathPostsChanged();
      if (!alive.current) return;
      toast(t('ssPub.published'));
      router.replace({ pathname: '/sabbath-post/[id]', params: { id } } as any);
    } catch (e) {
      if (alive.current) setErrors({ form: errText(e) });
    } finally {
      working.current = false;
      if (alive.current) setBusy(false);
    }
  }

  const admin = !!profile?.admin_role;
  let content: React.ReactNode;
  if (loadError) content = <ErrorNote message={loadError} onRetry={load} />;
  // Whether this member may publish couldn't be found out (no connection): say so, rather than "only publishers".
  else if (!admin && publisher === undefined && publishingError) content = <ErrorNote message={publishingError} onRetry={reload} />;
  else if ((editId && !existing) || (!admin && publisher === undefined)) content = <Loading />;
  else if (existing ? !((existing.mine && canPublish) || admin) : !canPublish) content = <Empty icon="lesson" title={t('ssPub.onlyPublishers')} />;
  else {
    content = (
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 6, paddingBottom: 48, gap: 16 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive">
          <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {SABBATH_KINDS.map((k) => {
              const on = kind === k.id;
              return (
                <Pressable
                  key={k.id}
                  onPress={() => {
                    if (on) return;
                    tap('select');
                    setKind(k.id);
                  }}
                  accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={t(k.label)} style={({ pressed }) => ({ height: 36, paddingHorizontal: 14, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? C.accent : pressed ? C.surface2 : C.surface })}>
                  <Text style={{ color: on ? C.onAccent : C.fg, fontWeight: '600', fontSize: 14 }}>{t(k.label)}</Text>
                </Pressable>
              );
            })}
          </View>

          <Field label={t('ssPub.title')} value={title} onChangeText={setTitle} placeholder={t('ssPub.titlePlaceholder')} maxLength={MAX.title} error={errors.title} />
          <Field label={t('ssPub.lessonRef')} value={lessonRef} onChangeText={setLessonRef} placeholder={t('ssPub.lessonRefPlaceholder')} maxLength={MAX.ref} error={errors.ref} />
          <View style={{ gap: 4 }}>
            {/* A long study scrolls inside the box, so the line being typed stays in view above the keyboard. */}
            <Field label={t('ssPub.body')} value={body} onChangeText={setBody} placeholder={t('ssPub.bodyPlaceholder')} maxLength={MAX.body} multiline scrollEnabled error={errors.body} style={{ minHeight: 200, maxHeight: Math.max(240, Math.round(screenH * 0.42)), textAlignVertical: 'top', lineHeight: 22 }} />
            {body.length > MAX.body - 1000 ? <Text style={{ color: C.fg3, fontSize: 12, textAlign: 'right' }}>{`${body.length.toLocaleString()} / ${MAX.body.toLocaleString()}`}</Text> : null}
          </View>

          <View style={{ gap: 8 }}>
            <Text style={{ color: C.fg2, fontSize: 12.5 }}>{`${t('ssPub.photos')} · ${photos.length}/${MAX.photos}`}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingTop: 6, paddingRight: 6 }}>
              {photos.map((p) => (
                <View key={p.key}>
                  <Image source={{ uri: p.uri }} contentFit="cover" style={{ width: 84, height: 84, borderRadius: 12, backgroundColor: C.surface }} accessibilityIgnoresInvertColors />
                  <Pressable onPress={busy ? undefined : () => setPhotos((all) => all.filter((x) => x.key !== p.key))} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('ssPub.removePhoto')} style={{ position: 'absolute', top: -6, right: -6, width: 24, height: 24, borderRadius: 12, backgroundColor: C.fg, alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="close" size={13} color={C.bg} weight={2.8} />
                  </Pressable>
                </View>
              ))}
              {photos.length < MAX.photos ? (
                <Pressable onPress={addPhotos} accessibilityRole="button" accessibilityLabel={t('ssPub.addPhotos')} style={({ pressed }) => ({ width: 84, height: 84, borderRadius: 12, backgroundColor: pressed ? C.surface2 : C.surface, alignItems: 'center', justifyContent: 'center', gap: 2 })}>
                  <Icon name="image" size={24} color={C.accent2} />
                  <Icon name="plus" size={14} color={C.accent2} weight={2.6} />
                </Pressable>
              ) : null}
            </ScrollView>
          </View>

          <Field label={t('ssPub.link')} value={link} onChangeText={setLink} placeholder="https://" maxLength={MAX.link} autoCapitalize="none" autoCorrect={false} keyboardType="url" error={errors.link} />

          {errors.form ? <Text style={{ color: C.like, lineHeight: 19 }}>{errors.form}</Text> : null}
          <Button label={existing ? t('ssPub.save') : t('ssPub.publish')} busy={busy} onPress={save} style={{ marginTop: 4 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  return (
    <Screen>
      <ScreenHeader title={editId ? t('ssPub.editPost') : t('ssPub.newPost')} onBack={busy ? () => undefined : undefined} />
      {content}
    </Screen>
  );
}
