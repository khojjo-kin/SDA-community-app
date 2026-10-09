import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Share, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Icon } from '../../../src/components/Icon';
import { ErrorNote, IconButton, Loading, RoundButton, Screen, Sheet, useToast } from '../../../src/components/ui';
import { BOOKS, BibleSettings, Chapter, fetchChapter, loadBibleSettings, saveBibleSettings, TRANSLATIONS } from '../../../src/lib/bible';
import { C, errText } from '../../../src/lib/theme';

export default function BibleChapter() {
  const params = useLocalSearchParams<{ book: string; c?: string }>();
  const router = useRouter();
  const toast = useToast();
  const book = BOOKS.find((b) => b.name === String(params.book)) ?? BOOKS[0];
  const [chapter, setChapter] = useState(Math.min(book.chapters, Math.max(1, parseInt(String(params.c ?? '1'), 10) || 1)));
  const [settings, setSettings] = useState<BibleSettings | null>(null);
  const [text, setText] = useState<Chapter | null>(null);
  const [error, setError] = useState('');
  const [sheet, setSheet] = useState<'chapters' | 'options' | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const scroll = useRef<ScrollView>(null);

  useEffect(() => {
    loadBibleSettings().then(setSettings);
  }, []);

  const load = useCallback(async () => {
    if (!settings) return;
    setText(null);
    setError('');
    try {
      const c = await fetchChapter(book.name, chapter, settings.translation);
      setText(c);
      scroll.current?.scrollTo({ y: 0, animated: false });
      const next = { ...settings, last: { book: book.name, chapter } };
      setSettings(next);
      saveBibleSettings(next);
    } catch (e) {
      setError(errText(e));
    }
    // Settings are read once; re-running on every settings change would loop on the `last` write above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book.name, chapter, settings?.translation]);
  useEffect(() => {
    load();
  }, [load]);

  function update(patch: Partial<BibleSettings>) {
    if (!settings) return;
    const next = { ...settings, ...patch };
    setSettings(next);
    saveBibleSettings(next);
  }

  function go(delta: number) {
    const at = BOOKS.findIndex((b) => b.name === book.name);
    if (chapter + delta >= 1 && chapter + delta <= book.chapters) {
      setChapter(chapter + delta);
      return;
    }
    const nextBook = BOOKS[at + delta];
    if (!nextBook) return;
    router.replace({ pathname: '/bible/[book]', params: { book: nextBook.name, c: String(delta > 0 ? 1 : nextBook.chapters) } } as any);
  }

  function share(v: { verse: number; text: string }) {
    Share.share({ message: `"${v.text}" — ${book.name} ${chapter}:${v.verse} (${settings?.translation.toUpperCase()})` }).catch(() => {});
  }

  const size = settings?.size ?? 18;
  const first = BOOKS[0].name === book.name && chapter === 1;
  const lastOfAll = BOOKS[BOOKS.length - 1].name === book.name && chapter === book.chapters;

  return (
    <Screen>
      <View style={{ height: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, gap: 8 }}>
        <RoundButton name="back" label="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/bible'))} />
        <Pressable onPress={() => setSheet('chapters')} accessibilityRole="button" accessibilityLabel={`${book.name} chapter ${chapter}. Choose a chapter`} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <Text numberOfLines={1} style={{ color: C.fg, fontSize: 19, fontWeight: '700' }}>{book.name} {chapter}</Text>
          <Icon name="down" size={16} color={C.fg2} weight={2.4} />
        </Pressable>
        <RoundButton name="settings" label="Reading options" onPress={() => setSheet('options')} />
      </View>

      {error ? (
        <ErrorNote message={error} onRetry={load} />
      ) : !text ? (
        <Loading />
      ) : (
        <ScrollView ref={scroll} contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 6, paddingBottom: 40 }}>
          <Text style={{ color: C.fg3, fontSize: 12.5, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 14 }}>{TRANSLATIONS.find((t) => t.id === text.translation)?.name}</Text>
          {text.verses.map((v) => (
            <Pressable key={v.verse} onPress={() => setPicked(picked === v.verse ? null : v.verse)} accessibilityRole="button" accessibilityLabel={`Verse ${v.verse}`} style={{ marginBottom: 6, borderRadius: 10, backgroundColor: picked === v.verse ? 'rgba(31,191,90,0.12)' : 'transparent', paddingHorizontal: 6, marginHorizontal: -6, paddingVertical: 2 }}>
              <Text selectable style={{ color: C.fg, fontSize: size, lineHeight: size * 1.55 }}>
                <Text style={{ color: C.accent2, fontSize: size * 0.72, fontWeight: '700' }}>{v.verse} </Text>
                {v.text}
              </Text>
              {picked === v.verse ? (
                <View style={{ flexDirection: 'row', gap: 8, paddingTop: 8 }}>
                  <Pressable onPress={() => share(v)} accessibilityRole="button" accessibilityLabel="Share this verse" style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 32, paddingHorizontal: 12, borderRadius: 16, backgroundColor: C.surface }}>
                    <Icon name="send" size={15} color={C.fg} />
                    <Text style={{ color: C.fg, fontSize: 13.5, fontWeight: '600' }}>Share</Text>
                  </Pressable>
                  <Pressable onPress={() => { router.push({ pathname: '/create', params: { text: `"${v.text}" — ${book.name} ${chapter}:${v.verse}` } } as any); }} accessibilityRole="button" accessibilityLabel="Post this verse" style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 32, paddingHorizontal: 12, borderRadius: 16, backgroundColor: C.surface }}>
                    <Icon name="plus" size={15} color={C.fg} />
                    <Text style={{ color: C.fg, fontSize: 13.5, fontWeight: '600' }}>Post</Text>
                  </Pressable>
                </View>
              ) : null}
            </Pressable>
          ))}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingTop: 26 }}>
            <Pressable onPress={() => go(-1)} disabled={first} accessibilityRole="button" accessibilityLabel="Previous chapter" style={{ flexDirection: 'row', alignItems: 'center', gap: 6, opacity: first ? 0.3 : 1 }}>
              <Icon name="back" size={18} color={C.fg2} weight={2.2} />
              <Text style={{ color: C.fg2, fontWeight: '600' }}>Previous</Text>
            </Pressable>
            <Pressable onPress={() => go(1)} disabled={lastOfAll} accessibilityRole="button" accessibilityLabel="Next chapter" style={{ flexDirection: 'row', alignItems: 'center', gap: 6, opacity: lastOfAll ? 0.3 : 1 }}>
              <Text style={{ color: C.fg2, fontWeight: '600' }}>Next</Text>
              <Icon name="right" size={18} color={C.fg2} weight={2.2} />
            </Pressable>
          </View>
        </ScrollView>
      )}

      <Sheet visible={sheet === 'chapters'} onClose={() => setSheet(null)} title={book.name} tall>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingBottom: 20 }}>
          {Array.from({ length: book.chapters }, (_, i) => i + 1).map((n) => (
            <Pressable key={n} onPress={() => { setSheet(null); setChapter(n); }} accessibilityRole="button" accessibilityLabel={`Chapter ${n}`} style={{ width: 52, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: n === chapter ? C.accent : C.surface }}>
              <Text style={{ color: C.fg, fontWeight: '600', fontSize: 16 }}>{n}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </Sheet>

      <Sheet visible={sheet === 'options'} onClose={() => setSheet(null)} title="Reading">
        <View style={{ paddingHorizontal: 20, gap: 16, paddingBottom: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ color: C.fg, fontSize: 17 }}>Text size</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <IconButton name="down" label="Smaller text" onPress={() => update({ size: Math.max(14, size - 2) })} bg={C.surface} />
              <Text style={{ color: C.fg2, width: 32, textAlign: 'center' }}>{size}</Text>
              <IconButton name="plus" label="Larger text" onPress={() => update({ size: Math.min(30, size + 2) })} bg={C.surface} />
            </View>
          </View>
          <Text style={{ color: C.fg, fontSize: 17 }}>Translation</Text>
          {TRANSLATIONS.map((t) => (
            <Pressable key={t.id} onPress={() => { update({ translation: t.id }); setSheet(null); }} accessibilityRole="radio" accessibilityState={{ checked: settings?.translation === t.id }} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 }}>
              <View>
                <Text style={{ color: C.fg, fontSize: 16 }}>{t.name}</Text>
                <Text style={{ color: C.fg2, fontSize: 13 }}>{t.short} · public domain</Text>
              </View>
              {settings?.translation === t.id ? <Icon name="check" size={22} color={C.accent2} weight={2.4} /> : null}
            </Pressable>
          ))}
        </View>
      </Sheet>
    </Screen>
  );
}
