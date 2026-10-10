import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Share, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MarkBar, markTint, NoteSheet } from '../../../src/components/BibleMarks';
import { Icon } from '../../../src/components/Icon';
import { ErrorNote, IconButton, Loading, RoundButton, Row, Screen, Sheet, useToast } from '../../../src/components/ui';
import { fetchBibleMarks, setBibleColor, setBibleNote } from '../../../src/lib/api';
import { BOOKS, BibleSettings, Chapter, fetchChapter, loadBibleSettings, saveBibleSettings, TRANSLATIONS, verseRef } from '../../../src/lib/bible';
import { useT } from '../../../src/lib/i18n';
import { useSession } from '../../../src/lib/session';
import { C, errText } from '../../../src/lib/theme';
import type { BibleMark, BibleMarkColor } from '../../../src/lib/types';

/** This chapter's marks by verse. `null` is a mark just taken off here, so a slower load doesn't bring it back. */
type Marks = Record<number, BibleMark | null>;

export default function BibleChapter() {
  const params = useLocalSearchParams<{ book: string; c?: string; v?: string }>();
  const router = useRouter();
  const toast = useToast();
  const t = useT();
  const { me } = useSession();
  const book = BOOKS.find((b) => b.name === String(params.book)) ?? BOOKS[0];
  const [chapter, setChapter] = useState(Math.min(book.chapters, Math.max(1, parseInt(String(params.c ?? '1'), 10) || 1)));
  const [settings, setSettings] = useState<BibleSettings | null>(null);
  const [text, setText] = useState<Chapter | null>(null);
  const [error, setError] = useState('');
  const [sheet, setSheet] = useState<'chapters' | 'options' | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [marks, setMarks] = useState<Marks>({});
  const [noteFor, setNoteFor] = useState<number | null>(null);
  // Opened from Highlights & notes: scroll to that verse once it is laid out, and mark it for a moment.
  const target = useRef<{ chapter: number; verse: number } | null>(parseInt(String(params.v ?? ''), 10) > 0 ? { chapter, verse: parseInt(String(params.v), 10) } : null);
  const [flash, setFlash] = useState<number | null>(null);
  const scroll = useRef<ScrollView>(null);
  // The chapter on screen now, for writes that finish after the reader has moved on.
  const showing = useRef(chapter);
  showing.current = chapter;

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

  // The member's highlights and notes on this chapter. Changes made before they arrive win.
  useEffect(() => {
    setSelected([]);
    setMarks({});
    if (!me) return;
    let live = true;
    fetchBibleMarks(me, { book: book.name, chapter })
      .then((rows) => {
        if (live) setMarks((mine) => ({ ...Object.fromEntries(rows.map((m) => [m.verse, m])), ...mine }));
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [me, book.name, chapter]);

  useEffect(() => {
    if (flash === null) return;
    const timer = setTimeout(() => setFlash(null), 1800);
    return () => clearTimeout(timer);
  }, [flash]);

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

  const toggle = (verse: number) => setSelected((s) => (s.includes(verse) ? s.filter((x) => x !== verse) : [...s, verse]));

  const markOf = (verse: number) => marks[verse] ?? null;

  /** A mark as it will be after a change, or null when it has neither a colour nor a note. */
  function patched(verse: number, patch: { color?: BibleMarkColor; note?: string }, at: string): BibleMark | null {
    const old = markOf(verse);
    const color = patch.color ?? old?.color ?? '';
    const note = patch.note ?? old?.note ?? '';
    if (!color && !note) return null;
    return { user_id: me, translation: settings?.translation ?? '', book: book.name, chapter, verse, color, note, updated_at: at };
  }

  /**
   * After a write fails: those verses as they were before it, and nothing else, so other changes made
   * meanwhile stay. Skipped once another chapter is showing, where those verse numbers mean other verses.
   */
  function putBack(verses: number[], from: number) {
    const prior = verses.map((v) => [v, marks[v]] as const);
    return () => {
      if (showing.current !== from) return;
      setMarks((m) => {
        const next = { ...m };
        for (const [v, old] of prior) {
          // A verse with nothing here yet is left for the chapter's marks to fill in when they arrive.
          if (old === undefined) delete next[v];
          else next[v] = old;
        }
        return next;
      });
    };
  }

  function colour(color: BibleMarkColor) {
    if (!settings || !selected.length) return;
    const verses = [...selected];
    const undo = putBack(verses, chapter);
    const at = new Date().toISOString();
    setMarks((m) => ({ ...m, ...Object.fromEntries(verses.map((v) => [v, patched(v, { color }, at)])) }));
    setSelected([]);
    setBibleColor(me, settings.translation, book.name, chapter, verses, color).catch((e) => {
      undo();
      toast(errText(e));
    });
  }

  function saveNote(verse: number, raw: string) {
    if (!settings) return;
    const note = raw.trim().slice(0, 2000);
    const undo = putBack([verse], chapter);
    setMarks((m) => ({ ...m, [verse]: patched(verse, { note }, new Date().toISOString()) }));
    setNoteFor(null);
    setSelected([]);
    setBibleNote(me, settings.translation, book.name, chapter, verse, note)
      .then(() => toast(note ? t('bibleMarks.noteSaved') : t('bibleMarks.noteDeleted')))
      .catch((e) => {
        undo();
        toast(errText(e));
      });
  }

  /** The chosen verses as a quotation with its reference. */
  function quote(): string {
    const words = (text?.verses ?? [])
      .filter((v) => selected.includes(v.verse))
      .map((v) => v.text)
      .join(' ');
    return `“${words}” — ${verseRef(book.name, chapter, selected)} (${(settings?.translation ?? '').toUpperCase()})`;
  }

  function copy() {
    const q = quote();
    setSelected([]);
    Clipboard.setStringAsync(q)
      .then(() => toast(t('bibleMarks.copied')))
      .catch(() => {});
  }

  function share() {
    const q = quote();
    setSelected([]);
    Share.share({ message: q }).catch(() => {});
  }

  function post() {
    const q = quote();
    setSelected([]);
    router.push({ pathname: '/create', params: { text: q } } as any);
  }

  function note() {
    if (selected.length !== 1) {
      toast(t('bibleMarks.oneVerse'));
      return;
    }
    setNoteFor(selected[0]);
  }

  // The colour all the chosen verses share, if they do, so the bar can show it as chosen.
  const shared = selected.length ? markOf(selected[0])?.color ?? '' : '';
  const active: BibleMarkColor | null = shared && selected.every((v) => markOf(v)?.color === shared) ? shared : null;

  const size = settings?.size ?? 18;
  const first = BOOKS[0].name === book.name && chapter === 1;
  const lastOfAll = BOOKS[BOOKS.length - 1].name === book.name && chapter === book.chapters;
  const noteVerse = noteFor === null ? null : text?.verses.find((v) => v.verse === noteFor) ?? null;

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
        <ScrollView ref={scroll} contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 6, paddingBottom: selected.length ? 200 : 40 }}>
          <Text style={{ color: C.fg3, fontSize: 12.5, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 14 }}>{TRANSLATIONS.find((tr) => tr.id === text.translation)?.name}</Text>
          {text.verses.map((v) => {
            const m = markOf(v.verse);
            const on = selected.includes(v.verse);
            return (
              <Pressable
                key={v.verse}
                onPress={() => toggle(v.verse)}
                onLayout={(e) => {
                  const want = target.current;
                  if (!want || want.chapter !== chapter || want.verse !== v.verse) return;
                  target.current = null;
                  const y = e.nativeEvent.layout.y;
                  setTimeout(() => scroll.current?.scrollTo({ y: Math.max(0, y - 120), animated: false }), 60);
                  setFlash(v.verse);
                }}
                accessibilityRole="button"
                accessibilityLabel={`Verse ${v.verse}`}
                accessibilityState={{ selected: on }}
                style={{ marginBottom: 6, borderRadius: 10, borderWidth: 1.5, borderColor: on || flash === v.verse ? C.accent2 : 'transparent', backgroundColor: m?.color ? markTint(m.color) : on ? C.accentSoft : 'transparent', paddingHorizontal: 6, marginHorizontal: -7.5, paddingVertical: 1 }}>
                <Text style={{ color: C.fg, fontSize: size, lineHeight: size * 1.55 }}>
                  <Text style={{ color: C.accent2, fontSize: size * 0.72, fontWeight: '700' }}>{v.verse} </Text>
                  {m?.note ? (
                    <Pressable onPress={() => setNoteFor(v.verse)} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('bibleMarks.openNote')} style={{ paddingRight: 5, transform: [{ translateY: 2 }] }}>
                      <Icon name="compose" size={Math.round(size * 0.82)} color={C.accent2} weight={2.2} />
                    </Pressable>
                  ) : null}
                  {v.text}
                </Text>
              </Pressable>
            );
          })}
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

      {selected.length && text ? (
        <MarkBar reference={verseRef(book.name, chapter, selected)} active={active} single={selected.length === 1} onColor={colour} onNote={note} onCopy={copy} onShare={share} onPost={post} onClose={() => setSelected([])} />
      ) : null}

      <NoteSheet visible={noteFor !== null} reference={noteFor === null ? '' : verseRef(book.name, chapter, [noteFor])} verseText={noteVerse?.text ?? ''} initial={noteFor === null ? '' : markOf(noteFor)?.note ?? ''} onClose={() => setNoteFor(null)} onSave={(n) => noteFor !== null && saveNote(noteFor, n)} />

      <Sheet visible={sheet === 'chapters'} onClose={() => setSheet(null)} title={book.name} tall>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingBottom: 20 }}>
          {Array.from({ length: book.chapters }, (_, i) => i + 1).map((n) => (
            <Pressable key={n} onPress={() => { setSheet(null); setChapter(n); }} accessibilityRole="button" accessibilityLabel={`Chapter ${n}`} style={{ width: 52, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: n === chapter ? C.accent : C.surface }}>
              <Text style={{ color: n === chapter ? C.onAccent : C.fg, fontWeight: '600', fontSize: 16 }}>{n}</Text>
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
          {TRANSLATIONS.map((tr) => (
            <Pressable key={tr.id} onPress={() => { update({ translation: tr.id }); setSheet(null); }} accessibilityRole="radio" accessibilityState={{ checked: settings?.translation === tr.id }} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 }}>
              <View>
                <Text style={{ color: C.fg, fontSize: 16 }}>{tr.name}</Text>
                <Text style={{ color: C.fg2, fontSize: 13 }}>{tr.short} · public domain</Text>
              </View>
              {settings?.translation === tr.id ? <Icon name="check" size={22} color={C.accent2} weight={2.4} /> : null}
            </Pressable>
          ))}
        </View>
        <Row icon="compose" title={t('bibleMarks.title')} onPress={() => { setSheet(null); router.push('/bible-marks' as any); }} />
      </Sheet>
    </Screen>
  );
}
