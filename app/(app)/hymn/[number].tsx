import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { WebView } from 'react-native-webview';
import { Icon } from '../../../src/components/Icon';
import { Button, ErrorNote, Field, IconButton, Loading, RoundButton, Screen, Sheet, useToast } from '../../../src/components/ui';
import { fetchHymn, saveHymn } from '../../../src/lib/api';
import { clampHymn, HYMN_COUNT, HymnalSettings, loadFavourites, loadHymnalSettings, saveHymnalSettings, splitVerses, toggleFavourite } from '../../../src/lib/hymnal';
import { useSession } from '../../../src/lib/session';
import { C, errText } from '../../../src/lib/theme';
import type { Hymn } from '../../../src/lib/types';

type Form = { title: string; author: string; section: string; lyrics: string };

export default function HymnPage() {
  const params = useLocalSearchParams<{ number: string }>();
  const router = useRouter();
  const toast = useToast();
  const { me, profile } = useSession();
  const admin = !!profile?.admin_role;
  const [n, setN] = useState(clampHymn(parseInt(String(params.number ?? '1'), 10)));
  // undefined while loading; null when the hymn is not in the table yet (hymnary.org still shows it).
  const [hymn, setHymn] = useState<Hymn | null | undefined>(undefined);
  const [error, setError] = useState('');
  const [favourites, setFavourites] = useState<number[]>([]);
  const [settings, setSettings] = useState<HymnalSettings | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadFavourites().then(setFavourites);
    loadHymnalSettings().then(setSettings);
  }, []);

  const load = useCallback(async () => {
    setHymn(undefined);
    setError('');
    try {
      setHymn(await fetchHymn(n));
    } catch (e) {
      setError(errText(e));
    }
  }, [n]);
  useEffect(() => {
    load();
  }, [load]);

  /** Previous/Next wrap around the ends of the book, so the number can never leave 1–695. */
  const go = (delta: number) => setN(((n - 1 + delta + HYMN_COUNT) % HYMN_COUNT) + 1);
  const starred = favourites.includes(n);
  const size = settings?.size ?? 18;

  function setSize(next: number) {
    const s = { ...(settings ?? { size }), size: Math.min(30, Math.max(14, next)) };
    setSettings(s);
    saveHymnalSettings(s);
  }

  async function save() {
    if (!form || saving) return;
    const title = form.title.trim();
    if (!title) {
      toast('Give the hymn a title.');
      return;
    }
    setSaving(true);
    try {
      await saveHymn(me, { number: n, title, author: form.author.trim(), section: form.section.trim(), lyrics: form.lyrics.trim() });
      setForm(null);
      toast('Saved');
      load();
    } catch (e) {
      toast(errText(e));
    } finally {
      setSaving(false);
    }
  }

  const title = hymn?.title ?? `Hymn ${n}`;
  const verses = hymn?.lyrics.trim() ? splitVerses(hymn.lyrics) : [];

  const heading = (
    <View style={{ paddingHorizontal: 20, paddingTop: 6, paddingBottom: 14 }}>
      {hymn?.section ? <Text style={{ color: C.fg3, fontSize: 12.5, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 10 }}>{hymn.section}</Text> : null}
      <Text accessibilityRole="header" style={{ color: C.fg, fontSize: 26, fontWeight: '800', lineHeight: 32 }}>{title}</Text>
      {hymn?.author ? <Text style={{ color: C.fg2, fontSize: 15, marginTop: 6 }}>{hymn.author}</Text> : null}
    </View>
  );

  const nav = (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 18 }}>
      <Pressable onPress={() => go(-1)} accessibilityRole="button" accessibilityLabel="Previous hymn" style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Icon name="back" size={18} color={C.fg2} weight={2.2} />
        <Text style={{ color: C.fg2, fontWeight: '600' }}>Previous</Text>
      </Pressable>
      <Pressable onPress={() => go(1)} accessibilityRole="button" accessibilityLabel="Next hymn" style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Text style={{ color: C.fg2, fontWeight: '600' }}>Next</Text>
        <Icon name="right" size={18} color={C.fg2} weight={2.2} />
      </Pressable>
    </View>
  );

  return (
    <Screen>
      <View style={{ height: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, gap: 4 }}>
        <RoundButton name="back" label="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/hymnal' as any))} />
        <Text numberOfLines={1} accessibilityRole="header" style={{ flex: 1, color: C.fg, fontSize: 20.5, fontWeight: '700', textAlign: 'center', paddingHorizontal: 8 }}>
          Hymn {n}
        </Text>
        {admin ? <IconButton name="compose" label="Edit lyrics" onPress={() => setForm({ title: hymn?.title ?? '', author: hymn?.author ?? '', section: hymn?.section ?? '', lyrics: hymn?.lyrics ?? '' })} /> : null}
        <IconButton name="heart" label={starred ? 'Remove from favourites' : 'Add to favourites'} fill={starred} color={starred ? C.like : C.fg} onPress={() => toggleFavourite(n).then(setFavourites)} />
      </View>

      {error ? (
        <ErrorNote message={error} onRetry={load} />
      ) : hymn === undefined ? (
        <Loading />
      ) : verses.length ? (
        <ScrollView contentContainerStyle={{ paddingBottom: 30 }}>
          {heading}
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, paddingHorizontal: 20, paddingBottom: 12 }}>
            {[
              { label: 'A−', a11y: 'Smaller text', delta: -2 },
              { label: 'A+', a11y: 'Larger text', delta: 2 },
            ].map((b) => (
              <Pressable key={b.label} onPress={() => setSize(size + b.delta)} accessibilityRole="button" accessibilityLabel={b.a11y} style={({ pressed }) => ({ height: 32, paddingHorizontal: 14, borderRadius: 16, backgroundColor: pressed ? C.surface2 : C.surface, justifyContent: 'center' })}>
                <Text style={{ color: C.fg, fontSize: 13.5, fontWeight: '600' }}>{b.label}</Text>
              </Pressable>
            ))}
          </View>
          <View style={{ paddingHorizontal: 20, gap: size }}>
            {verses.map((v, i) => {
              const refrain = /^(refrain|chorus)\b/i.test(v);
              return (
                <Text key={i} selectable style={{ color: C.fg, fontSize: size, lineHeight: size * 1.5, fontStyle: refrain ? 'italic' : 'normal' }}>
                  {refrain ? null : <Text style={{ color: C.accent2, fontSize: size * 0.72, fontWeight: '700' }}>{i + 1}  </Text>}
                  {v}
                </Text>
              );
            })}
          </View>
          {nav}
        </ScrollView>
      ) : (
        <View style={{ flex: 1 }}>
          {heading}
          <WebView
            source={{ uri: `https://hymnary.org/hymn/SDAH1985/${n}` }}
            style={{ flex: 1, backgroundColor: C.bg }}
            startInLoadingState
            renderLoading={() => <Loading />}
            forceDarkOn
            accessibilityLabel={`Words of hymn ${n} on hymnary.org`}
          />
          <Text style={{ color: C.fg3, fontSize: 12.5, textAlign: 'center', paddingTop: 8 }}>Words shown from hymnary.org</Text>
          {nav}
        </View>
      )}

      <Sheet visible={!!form} onClose={() => (saving ? undefined : setForm(null))} title={`Edit hymn ${n}`} tall footer={<View style={{ paddingHorizontal: 20, paddingTop: 12 }}><Button label="Save" busy={saving} onPress={save} /></View>}>
        {form ? (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 20, gap: 14, paddingBottom: 10 }} keyboardShouldPersistTaps="handled">
            <Field label="Title" value={form.title} onChangeText={(t) => setForm({ ...form, title: t })} autoCapitalize="words" maxLength={160} />
            <Field label="Author" value={form.author} onChangeText={(t) => setForm({ ...form, author: t })} autoCapitalize="words" maxLength={160} />
            <Field label="Section" value={form.section} onChangeText={(t) => setForm({ ...form, section: t })} autoCapitalize="words" maxLength={80} />
            <Field label="Lyrics (leave a blank line between verses)" value={form.lyrics} onChangeText={(t) => setForm({ ...form, lyrics: t })} multiline maxLength={20000} style={{ minHeight: 220, textAlignVertical: 'top' }} />
          </ScrollView>
        ) : null}
      </Sheet>
    </Screen>
  );
}
