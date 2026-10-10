import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityActionEvent, GestureResponderEvent, LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent, Pressable, ScrollView, Share, Text, useWindowDimensions, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useHideAssistiveButton } from '../../../src/components/AssistiveButton';
import { MARK_BAR_GAP, MARK_BAR_HEIGHT, MarkBar, markTint, NoteSheet } from '../../../src/components/BibleMarks';
import { Icon } from '../../../src/components/Icon';
import { Skeleton, SkeletonFrame } from '../../../src/components/Skeleton';
import { ErrorNote, RoundButton, Row, Screen, Sheet, useToast } from '../../../src/components/ui';
import { fetchBibleMarks, setBibleColor, setBibleNote } from '../../../src/lib/api';
import { BOOKS, BibleSettings, cachedMarks, Chapter, fetchChapter, keepMarks, loadBibleSettings, peekBibleSettings, peekChapter, peekMarks, saveBibleSettings, TRANSLATIONS, verseRef } from '../../../src/lib/bible';
import { tap } from '../../../src/lib/haptics';
import { useT } from '../../../src/lib/i18n';
import { useSession } from '../../../src/lib/session';
import { C, errText } from '../../../src/lib/theme';
import type { BibleMark, BibleMarkColor } from '../../../src/lib/types';

/** This chapter's marks by verse. `null` is a mark just taken off here, so a slower load doesn't bring it back. */
type Marks = Record<number, BibleMark | null>;

const byVerse = (rows: BibleMark[]): Marks => Object.fromEntries(rows.map((m) => [m.verse, m]));

type VerseProps = {
  verse: number;
  text: string;
  size: number;
  color: BibleMarkColor;
  note: boolean;
  on: boolean;
  flash: boolean;
  noteLabel: string;
  onToggle: (verse: number, pageY: number) => void;
  onNote: (verse: number) => void;
  /** Only on the verse opened from Highlights & notes: where it was laid out, to scroll to it. */
  onTarget?: (verse: number, y: number) => void;
};

/**
 * One verse. Drawn again only when its own words, colour, note or choice change, so choosing or
 * colouring a verse in a long chapter (Psalm 119 has 176) answers at once.
 */
const Verse = React.memo(function Verse({ verse, text, size, color, note, on, flash, noteLabel, onToggle, onNote, onTarget }: VerseProps) {
  return (
    <Pressable
      onPress={(e: GestureResponderEvent) => onToggle(verse, e.nativeEvent.pageY)}
      onLayout={onTarget ? (e: LayoutChangeEvent) => onTarget(verse, e.nativeEvent.layout.y) : undefined}
      accessibilityRole="button"
      accessibilityLabel={`${verse}. ${text}`}
      accessibilityState={{ selected: on }}
      // A screen reader can't reach the little note button inside the words, so the note opens as an action of the verse.
      accessibilityActions={note ? [{ name: 'note', label: noteLabel }] : undefined}
      onAccessibilityAction={note ? (e: AccessibilityActionEvent) => e.nativeEvent.actionName === 'note' && onNote(verse) : undefined}
      style={{ marginBottom: 6, borderRadius: 10, borderWidth: 1.5, borderColor: on || flash ? C.accent2 : 'transparent', backgroundColor: color ? markTint(color) : on ? C.accentSoft : 'transparent', paddingHorizontal: 6, marginHorizontal: -7.5, paddingVertical: 1 }}>
      <Text style={{ color: C.fg, fontSize: size, lineHeight: Math.round(size * 1.55) }}>
        <Text style={{ color: C.accent2, fontSize: Math.round(size * 0.72), fontWeight: '700' }}>{verse} </Text>
        {note ? (
          <Pressable onPress={() => onNote(verse)} hitSlop={10} accessibilityRole="button" accessibilityLabel={noteLabel} style={{ paddingRight: 5, transform: [{ translateY: 2 }] }}>
            <Icon name="compose" size={Math.round(size * 0.82)} color={C.accent2} weight={2.2} />
          </Pressable>
        ) : null}
        {text}
      </Text>
    </Pressable>
  );
});

/** Where the words will be while a chapter is on its way: the translation's name, then lines of verses. */
function ChapterSkeleton() {
  const { width } = useWindowDimensions();
  const w = width - 40;
  const lines = [0.92, 0.98, 0.6, 0.95, 0.88, 0.97, 0.42, 0.9, 0.96, 0.7, 0.93, 0.85, 0.5];
  return (
    <SkeletonFrame style={{ paddingHorizontal: 20, paddingTop: 8, gap: 14 }}>
      <Skeleton width={150} height={10} x={20} style={{ marginBottom: 6 }} />
      {lines.map((f, i) => (
        <Skeleton key={i} width={Math.round(w * f)} height={13} x={20} />
      ))}
    </SkeletonFrame>
  );
}

export default function BibleChapter() {
  const params = useLocalSearchParams<{ book: string; c?: string; v?: string }>();
  const router = useRouter();
  const toast = useToast();
  const t = useT();
  const { me } = useSession();
  const insets = useSafeAreaInsets();
  const { width: W, height: H } = useWindowDimensions();
  const book = BOOKS.find((b) => b.name === String(params.book)) ?? BOOKS[0];
  const firstChapter = Math.min(book.chapters, Math.max(1, parseInt(String(params.c ?? '1'), 10) || 1));
  const [chapter, setChapter] = useState(firstChapter);
  // What was read before in this session shows at once: the settings, the words and the marks.
  const [settings, setSettings] = useState<BibleSettings | null>(() => peekBibleSettings());
  const [text, setText] = useState<Chapter | null>(() => {
    const s = peekBibleSettings();
    return s ? peekChapter(book.name, firstChapter, s.translation) : null;
  });
  const [error, setError] = useState('');
  const [sheet, setSheet] = useState<'chapters' | 'options' | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [marks, setMarks] = useState<Marks>(() => byVerse(peekMarks(me, book.name, firstChapter) ?? []));
  const [noteFor, setNoteFor] = useState<number | null>(null);
  // Opened from Highlights & notes: scroll to that verse once it is laid out, and mark it for a moment.
  const target = useRef<{ chapter: number; verse: number } | null>(parseInt(String(params.v ?? ''), 10) > 0 ? { chapter: firstChapter, verse: parseInt(String(params.v), 10) } : null);
  const [flash, setFlash] = useState<number | null>(null);
  const scroll = useRef<ScrollView>(null);
  const picker = useRef<ScrollView>(null);
  const offset = useRef(0);
  // The chapter on screen now, for writes that finish after the reader has moved on.
  const showing = useRef(chapter);
  showing.current = chapter;
  // The latest of these, for work that finishes later than the draw that started it.
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const marksRef = useRef(marks);
  marksRef.current = marks;
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  /** Verses changed here since the chapter opened: they keep the change when the saved marks arrive. */
  const touched = useRef<Set<number>>(new Set());
  /** Only the latest chapter load may land: Next can be tapped faster than the network answers. */
  const ticket = useRef(0);

  // The verse bar sits along the bottom while verses are chosen; the floating button steps aside for it
  // (only while this screen is the one showing, not while another is opened over it).
  const [focused, setFocused] = useState(true);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );
  useHideAssistiveButton(selected.length > 0 && focused);

  useEffect(() => {
    if (settingsRef.current) return;
    loadBibleSettings().then(setSettings);
  }, []);

  const translation = settings?.translation;
  const load = useCallback(async () => {
    const s = settingsRef.current;
    if (!s) return;
    const mine = ++ticket.current;
    setError('');
    const ready = peekChapter(book.name, chapter, s.translation);
    setText((cur) => ready ?? (cur && cur.book === book.name && cur.chapter === chapter && cur.translation === s.translation ? cur : null));
    try {
      const c = ready ?? (await fetchChapter(book.name, chapter, s.translation));
      if (ticket.current !== mine) return;
      setText(c);
      // Read from the latest settings, so a text size changed while the chapter was loading isn't put back.
      const next = { ...(settingsRef.current ?? s), last: { book: book.name, chapter } };
      settingsRef.current = next;
      setSettings(next);
      saveBibleSettings(next);
    } catch (e) {
      if (ticket.current === mine) setError(errText(e));
    }
  }, [book.name, chapter, translation]);
  useEffect(() => {
    load();
  }, [load]);

  // The member's highlights and notes on this chapter: what this phone saw last at once, then the
  // server's copy. Changes made here before either arrives win.
  useEffect(() => {
    setSelected([]);
    touched.current = new Set();
    setMarks(byVerse(peekMarks(me, book.name, chapter) ?? []));
    if (!me) return;
    let live = true;
    let fromServer = false;
    const merge = (rows: BibleMark[]) => (mine: Marks): Marks => {
      const next = byVerse(rows);
      for (const v of touched.current) if (v in mine) next[v] = mine[v];
      return next;
    };
    cachedMarks(me, book.name, chapter).then((rows) => {
      if (live && !fromServer && rows.length) setMarks(merge(rows));
    });
    fetchBibleMarks(me, { book: book.name, chapter })
      .then((rows) => {
        if (!live) return;
        fromServer = true;
        setMarks(merge(rows));
        keepMarks(me, book.name, chapter, rows);
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
    const s = settingsRef.current;
    if (!s) return;
    const next = { ...s, ...patch };
    settingsRef.current = next;
    setSettings(next);
    saveBibleSettings(next);
  }

  /** Another chapter of this book, from its first verse. */
  function toChapter(n: number) {
    if (n === chapter) return;
    scroll.current?.scrollTo({ y: 0, animated: false });
    setChapter(n);
  }

  function go(delta: number) {
    tap('light');
    const at = BOOKS.findIndex((b) => b.name === book.name);
    if (chapter + delta >= 1 && chapter + delta <= book.chapters) {
      toChapter(chapter + delta);
      return;
    }
    const nextBook = BOOKS[at + delta];
    if (!nextBook) return;
    router.replace({ pathname: '/bible/[book]', params: { book: nextBook.name, c: String(delta > 0 ? 1 : nextBook.chapters) } } as any);
  }

  // The verse bar's top, from the top of the screen: a verse chosen under it is lifted into view.
  const barTop = H - insets.bottom - MARK_BAR_GAP - MARK_BAR_HEIGHT;
  const onToggle = useCallback(
    (verse: number, pageY: number) => {
      tap('select');
      const first = !selectedRef.current.length;
      setSelected((s) => (s.includes(verse) ? s.filter((x) => x !== verse) : [...s, verse]));
      // The bar rises as the first verse is chosen: if the finger is where it will be, bring the verse up above it.
      const hidden = pageY - (barTop - 56);
      if (first && hidden > 0) scroll.current?.scrollTo({ y: offset.current + hidden, animated: true });
    },
    [barTop],
  );
  const onOpenNote = useCallback((verse: number) => setNoteFor(verse), []);
  const onTarget = useCallback((verse: number, y: number) => {
    const want = target.current;
    if (!want || want.chapter !== showing.current || want.verse !== verse) return;
    target.current = null;
    setTimeout(() => scroll.current?.scrollTo({ y: Math.max(0, y - 120), animated: false }), 60);
    setFlash(verse);
  }, []);

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

  /** Once a change is saved: keep the chapter's marks on the phone, if it is still the one showing. */
  function keepIfShowing(from: number) {
    if (showing.current !== from) return;
    keepMarks(me, book.name, from, Object.values(marksRef.current).filter((m): m is BibleMark => !!m));
  }

  function colour(color: BibleMarkColor) {
    if (!settings || !selected.length) return;
    const verses = [...selected];
    const from = chapter;
    const undo = putBack(verses, from);
    const at = new Date().toISOString();
    verses.forEach((v) => touched.current.add(v));
    setMarks((m) => ({ ...m, ...Object.fromEntries(verses.map((v) => [v, patched(v, { color }, at)])) }));
    setSelected([]);
    setBibleColor(me, settings.translation, book.name, from, verses, color)
      .then(() => keepIfShowing(from))
      .catch((e) => {
        undo();
        toast(errText(e));
      });
  }

  function saveNote(verse: number, raw: string) {
    if (!settings) return;
    const note = raw.trim().slice(0, 2000);
    const from = chapter;
    const undo = putBack([verse], from);
    touched.current.add(verse);
    setMarks((m) => ({ ...m, [verse]: patched(verse, { note }, new Date().toISOString()) }));
    setNoteFor(null);
    setSelected([]);
    setBibleNote(me, settings.translation, book.name, from, verse, note)
      .then(() => {
        keepIfShowing(from);
        toast(note ? t('bibleMarks.noteSaved') : t('bibleMarks.noteDeleted'));
      })
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
  const shownText = text && text.book === book.name && text.chapter === chapter ? text : null;
  const noteLabel = t('bibleMarks.openNote');
  // The chapter picker opens with this chapter in view: rows of 52-wide buttons 8 apart, 52 tall with the gap.
  const perRow = Math.max(1, Math.floor((W - 32 + 8) / 60));
  const pickerY = Math.max(0, Math.floor((chapter - 1) / perRow) * 52 - 104);
  const step = (dir: -1 | 1, off: boolean) => (
    <Pressable onPress={() => go(dir)} disabled={off} hitSlop={8} accessibilityRole="button" accessibilityLabel={dir < 0 ? 'Previous chapter' : 'Next chapter'} accessibilityState={{ disabled: off }} style={({ pressed }) => ({ flexDirection: dir < 0 ? 'row' : 'row-reverse', alignItems: 'center', gap: 6, height: 40, paddingHorizontal: 14, borderRadius: 20, backgroundColor: C.surface, opacity: off ? 0.3 : pressed ? 0.6 : 1 })}>
      <Icon name={dir < 0 ? 'back' : 'right'} size={17} color={C.fg2} weight={2.2} />
      <Text style={{ color: C.fg, fontWeight: '600' }}>{dir < 0 ? 'Previous' : 'Next'}</Text>
    </Pressable>
  );

  return (
    <Screen>
      <View style={{ height: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, gap: 8 }}>
        <RoundButton name="back" label="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/bible'))} />
        <Pressable onPress={() => setSheet('chapters')} accessibilityRole="button" accessibilityLabel={`${book.name} chapter ${chapter}. Choose a chapter`} style={({ pressed }) => ({ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: pressed ? 0.6 : 1 })}>
          <Text numberOfLines={1} style={{ color: C.fg, fontSize: 19, fontWeight: '700', flexShrink: 1 }}>
            {book.name} {chapter}
          </Text>
          <Icon name="down" size={16} color={C.fg2} weight={2.4} />
        </Pressable>
        <RoundButton name="settings" label="Reading options" onPress={() => setSheet('options')} />
      </View>

      {error && !shownText ? (
        <ErrorNote message={error} onRetry={load} />
      ) : !shownText ? (
        <ChapterSkeleton />
      ) : (
        <ScrollView
          ref={scroll}
          scrollEventThrottle={16}
          onScroll={(e: NativeSyntheticEvent<NativeScrollEvent>) => {
            offset.current = e.nativeEvent.contentOffset.y;
          }}
          // Always room under the last verses for the verse bar, so nothing jumps when it comes and goes.
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 6, paddingBottom: insets.bottom + MARK_BAR_GAP + MARK_BAR_HEIGHT + 24 }}>
          <Text style={{ color: C.fg3, fontSize: 12.5, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 14 }}>{TRANSLATIONS.find((tr) => tr.id === shownText.translation)?.name}</Text>
          {shownText.verses.map((v) => {
            const m = marks[v.verse];
            const want = target.current;
            return (
              <Verse
                key={v.verse}
                verse={v.verse}
                text={v.text}
                size={size}
                color={m?.color ?? ''}
                note={!!m?.note}
                on={selected.includes(v.verse)}
                flash={flash === v.verse}
                noteLabel={noteLabel}
                onToggle={onToggle}
                onNote={onOpenNote}
                onTarget={want && want.chapter === chapter && want.verse === v.verse ? onTarget : undefined}
              />
            );
          })}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingTop: 26 }}>
            {step(-1, first)}
            {step(1, lastOfAll)}
          </View>
        </ScrollView>
      )}

      {selected.length && shownText ? (
        <MarkBar reference={verseRef(book.name, chapter, selected)} active={active} single={selected.length === 1} onColor={colour} onNote={note} onCopy={copy} onShare={share} onPost={post} onClose={() => setSelected([])} />
      ) : null}

      <NoteSheet visible={noteFor !== null} reference={noteFor === null ? '' : verseRef(book.name, chapter, [noteFor])} verseText={noteVerse?.text ?? ''} initial={noteFor === null ? '' : markOf(noteFor)?.note ?? ''} onClose={() => setNoteFor(null)} onSave={(n) => noteFor !== null && saveNote(noteFor, n)} />

      <Sheet visible={sheet === 'chapters'} onClose={() => setSheet(null)} title={book.name} tall>
        {/* Scrolled once its rows are laid out: unlike a starting offset, scrollTo stops at the end of the
            rows, so the last chapters of a long book don't open on empty space. */}
        <ScrollView ref={picker} onContentSizeChange={() => picker.current?.scrollTo({ y: pickerY, animated: false })} contentContainerStyle={{ paddingHorizontal: 16, flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingBottom: 20 }}>
          {Array.from({ length: book.chapters }, (_, i) => i + 1).map((n) => (
            <Pressable
              key={n}
              onPress={() => {
                tap('select');
                setSheet(null);
                toChapter(n);
              }}
              accessibilityRole="button"
              accessibilityLabel={`Chapter ${n}`}
              accessibilityState={{ selected: n === chapter }}
              style={({ pressed }) => ({ width: 52, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: n === chapter ? C.accent : pressed ? C.surface2 : C.surface })}>
              <Text style={{ color: n === chapter ? C.onAccent : C.fg, fontWeight: '600', fontSize: 16 }}>{n}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </Sheet>

      <Sheet visible={sheet === 'options'} onClose={() => setSheet(null)} title="Reading">
        <View style={{ paddingHorizontal: 20, gap: 16, paddingBottom: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ color: C.fg, fontSize: 17 }}>Text size</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {[
                { label: 'A−', a11y: 'Smaller text', delta: -2, off: size <= 14 },
                { label: 'A+', a11y: 'Larger text', delta: 2, off: size >= 30 },
              ].map((b) => (
                <Pressable
                  key={b.label}
                  onPress={() => {
                    tap('select');
                    update({ size: Math.min(30, Math.max(14, size + b.delta)) });
                  }}
                  disabled={b.off}
                  accessibilityRole="button"
                  accessibilityLabel={b.a11y}
                  accessibilityState={{ disabled: b.off }}
                  style={({ pressed }) => ({ width: 52, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? C.surface2 : C.surface, opacity: b.off ? 0.4 : 1 })}>
                  <Text style={{ color: C.fg, fontSize: b.delta < 0 ? 14 : 17, fontWeight: '700' }}>{b.label}</Text>
                </Pressable>
              ))}
            </View>
          </View>
          <Text style={{ color: C.fg, fontSize: 17 }}>Translation</Text>
          {TRANSLATIONS.map((tr) => (
            <Pressable
              key={tr.id}
              onPress={() => {
                tap('select');
                update({ translation: tr.id });
                setSheet(null);
              }}
              accessibilityRole="radio"
              accessibilityState={{ checked: settings?.translation === tr.id }}
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4, opacity: pressed ? 0.6 : 1 })}>
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
