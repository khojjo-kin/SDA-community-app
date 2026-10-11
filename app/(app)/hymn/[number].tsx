import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { WebView } from 'react-native-webview';
import { Icon } from '../../../src/components/Icon';
import { Skeleton, SkeletonFrame } from '../../../src/components/Skeleton';
import { Button, ErrorNote, Field, IconButton, Loading, RoundButton, Screen, Sheet, useToast } from '../../../src/components/ui';
import { fetchHymn, saveHymn } from '../../../src/lib/api';
import { tap } from '../../../src/lib/haptics';
import { cachedHymn, clampHymn, HYMN_COUNT, HymnalSettings, keepHymn, loadFavourites, loadHymnalSettings, peekHymn, saveHymnalSettings, splitVerses, toggleFavourite } from '../../../src/lib/hymnal';
import { useSession } from '../../../src/lib/session';
import { C, errText } from '../../../src/lib/theme';
import type { Hymn } from '../../../src/lib/types';

type Form = { title: string; author: string; section: string; lyrics: string };

/** The title and two verses' worth of lines while the words are on their way. */
function LyricsSkeleton() {
  const { width } = useWindowDimensions();
  const w = width - 40;
  return (
    <SkeletonFrame style={{ paddingHorizontal: 20, paddingTop: 10, gap: 12 }}>
      <Skeleton width={90} height={10} x={20} />
      <Skeleton width={Math.round(w * 0.7)} height={24} radius={8} x={20} style={{ marginBottom: 18 }} />
      {[0.86, 0.78, 0.9, 0.62, -1, 0.84, 0.74, 0.88, 0.56].map((f, i) => (f < 0 ? <View key={i} style={{ height: 10 }} /> : <Skeleton key={i} width={Math.round(w * f)} height={14} x={20} />))}
    </SkeletonFrame>
  );
}

export default function HymnPage() {
  const params = useLocalSearchParams<{ number: string }>();
  const router = useRouter();
  const toast = useToast();
  const { me, profile } = useSession();
  const admin = !!profile?.admin_role;
  const [n, setN] = useState(clampHymn(parseInt(String(params.number ?? '1'), 10)));
  // undefined while loading; null when the hymn is not in the table yet (hymnary.org still shows it).
  // One opened before in this session shows at once.
  const [hymn, setHymn] = useState<Hymn | null | undefined>(() => peekHymn(n));
  const [error, setError] = useState('');
  const [favourites, setFavourites] = useState<number[]>([]);
  const [settings, setSettings] = useState<HymnalSettings | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [saving, setSaving] = useState(false);
  const scroll = useRef<ScrollView>(null);
  /** Only the latest hymn's answer may land: Next can be tapped faster than the network answers. */
  const showing = useRef(n);
  showing.current = n;

  useEffect(() => {
    loadFavourites().then(setFavourites);
    loadHymnalSettings().then(setSettings);
  }, []);

  const load = useCallback(async () => {
    setError('');
    // What this phone kept shows straight away; the server's copy (an admin may have changed the words) follows.
    const known = peekHymn(n) !== undefined ? peekHymn(n) : await cachedHymn(n);
    if (showing.current !== n) return;
    setHymn(known);
    try {
      const fresh = await fetchHymn(n);
      keepHymn(n, fresh);
      if (showing.current === n) setHymn(fresh);
    } catch (e) {
      if (showing.current === n && known === undefined) setError(errText(e));
    }
  }, [n]);
  useEffect(() => {
    load();
  }, [load]);

  /** Previous/Next wrap around the ends of the book, so the number can never leave 1–695. */
  const go = (delta: number) => {
    tap('light');
    const next = ((n - 1 + delta + HYMN_COUNT) % HYMN_COUNT) + 1;
    scroll.current?.scrollTo({ y: 0, animated: false });
    // The next hymn's words if this session has them, else its loading shapes: never the last hymn's words under the new number.
    setHymn(peekHymn(next));
    setError('');
    setN(next);
  };
  const starred = favourites.includes(n);
  const size = settings?.size ?? 18;

  function heart() {
    // The heart turns at once; the list kept on the phone follows.
    setFavourites((f) => (f.includes(n) ? f.filter((x) => x !== n) : [...f, n].sort((a, b) => a - b)));
    toggleFavourite(n).then(setFavourites);
  }

  function setSize(next: number) {
    tap('select');
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

  const step = (dir: -1 | 1) => (
    <Pressable onPress={() => go(dir)} hitSlop={8} accessibilityRole="button" accessibilityLabel={dir < 0 ? 'Previous hymn' : 'Next hymn'} style={({ pressed }) => ({ flexDirection: dir < 0 ? 'row' : 'row-reverse', alignItems: 'center', gap: 6, height: 40, paddingHorizontal: 14, borderRadius: 20, backgroundColor: C.surface, opacity: pressed ? 0.6 : 1 })}>
      <Icon name={dir < 0 ? 'back' : 'right'} size={17} color={C.fg2} weight={2.2} />
      <Text style={{ color: C.fg, fontWeight: '600' }}>{dir < 0 ? 'Previous' : 'Next'}</Text>
    </Pressable>
  );
  const nav = (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 18 }}>
      {step(-1)}
      {step(1)}
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
        <IconButton name="heart" label={starred ? 'Remove from favourites' : 'Add to favourites'} fill={starred} color={starred ? C.like : C.fg} onPress={heart} />
      </View>

      {error ? (
        <ErrorNote message={error} onRetry={load} />
      ) : hymn === undefined ? (
        <LyricsSkeleton />
      ) : verses.length ? (
        <ScrollView ref={scroll} contentContainerStyle={{ paddingBottom: 30 }}>
          {heading}
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, paddingHorizontal: 20, paddingBottom: 12 }}>
            {[
              { label: 'A−', a11y: 'Smaller text', delta: -2, off: size <= 14 },
              { label: 'A+', a11y: 'Larger text', delta: 2, off: size >= 30 },
            ].map((b) => (
              <Pressable key={b.label} onPress={() => setSize(size + b.delta)} disabled={b.off} accessibilityRole="button" accessibilityLabel={b.a11y} accessibilityState={{ disabled: b.off }} style={({ pressed }) => ({ height: 32, paddingHorizontal: 14, borderRadius: 16, backgroundColor: pressed ? C.surface2 : C.surface, justifyContent: 'center', opacity: b.off ? 0.4 : 1 })}>
                <Text style={{ color: C.fg, fontSize: 13.5, fontWeight: '600' }}>{b.label}</Text>
              </Pressable>
            ))}
          </View>
          <View style={{ paddingHorizontal: 20, gap: size }}>
            {verses.map((v, i) => {
              const refrain = /^(refrain|chorus)\b/i.test(v);
              return (
                <Text key={i} selectable style={{ color: C.fg, fontSize: size, lineHeight: Math.round(size * 1.5), fontStyle: refrain ? 'italic' : 'normal' }}>
                  {refrain ? null : <Text style={{ color: C.accent2, fontSize: Math.round(size * 0.72), fontWeight: '700' }}>{i + 1}  </Text>}
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
