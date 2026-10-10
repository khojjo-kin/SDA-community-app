import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, Share, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import { Icon, IconName } from '../../src/components/Icon';
import { Row, RoundButton, Screen, ScreenHeader, SearchField, SectionLabel, Sheet, SheetRow, Toggle, useToast } from '../../src/components/ui';
import { BOOKS, fetchChapter, loadBibleSettings, parseReference, type TranslationId } from '../../src/lib/bible';
import { useT } from '../../src/lib/i18n';
import { setPrefs, usePrefs } from '../../src/lib/prefs';
import { C } from '../../src/lib/theme';

/* ---------- verse of the day ---------- */

/** Well-loved, encouraging verses: [book, chapter, first verse, last verse]. Book names as in BOOKS. */
const DAILY: [string, number, number, number?][] = [
  ['John', 3, 16],
  ['Jeremiah', 29, 11],
  ['Philippians', 4, 13],
  ['Psalms', 23, 1, 3],
  ['Isaiah', 41, 10],
  ['Romans', 8, 28],
  ['Proverbs', 3, 5, 6],
  ['Exodus', 20, 8],
  ['Joshua', 1, 9],
  ['Matthew', 11, 28, 29],
  ['Isaiah', 40, 31],
  ['Psalms', 46, 1],
  ['Romans', 15, 13],
  ['2 Corinthians', 5, 17],
  ['Lamentations', 3, 22, 23],
  ['Psalms', 119, 105],
  ['Matthew', 6, 33],
  ['Hebrews', 11, 1],
  ['Mark', 2, 27],
  ['Galatians', 5, 22, 23],
  ['Ephesians', 2, 8, 9],
  ['Psalms', 27, 1],
  ['Philippians', 4, 6, 7],
  ['Psalms', 34, 18],
  ['Psalms', 37, 4],
  ['John', 14, 1, 3],
  ['Psalms', 55, 22],
  ['Psalms', 91, 1, 2],
  ['Psalms', 121, 1, 2],
  ['Psalms', 139, 14],
  ['Proverbs', 18, 10],
  ['Isaiah', 26, 3],
  ['Isaiah', 43, 2],
  ['Micah', 6, 8],
  ['Zephaniah', 3, 17],
  ['Matthew', 5, 16],
  ['Revelation', 14, 12],
  ['John', 14, 27],
  ['John', 16, 33],
  ['Romans', 5, 8],
  ['Romans', 12, 2],
  ['Romans', 12, 12],
  ['2 Corinthians', 12, 9],
  ['Galatians', 6, 9],
  ['Ephesians', 3, 20],
  ['Philippians', 1, 6],
  ['Colossians', 3, 23],
  ['1 Thessalonians', 5, 16, 18],
  ['2 Timothy', 1, 7],
  ['Hebrews', 13, 8],
  ['James', 1, 5],
  ['1 Peter', 5, 7],
  ['1 John', 1, 9],
  ['Revelation', 21, 4],
  ['Deuteronomy', 31, 6],
  ['Numbers', 6, 24, 26],
  ['Nahum', 1, 7],
  ['Psalms', 30, 5],
  ['Isaiah', 40, 8],
  ['Psalms', 46, 10],
  ['1 Corinthians', 13, 13],
  ['Matthew', 28, 20],
];

type DailyVerse = { book: string; chapter: number; from: number; to: number; ref: string };

/** Today's verse: the same for everyone on the same calendar day, a different one each day. */
function verseFor(date: Date): DailyVerse {
  // Whole days since 1970 for the local calendar date, so it changes at the member's own midnight.
  const day = Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400e3);
  const [book, chapter, from, to = from] = DAILY[day % DAILY.length];
  // "Psalm 23", as people say it, though the book is Psalms.
  const name = book === 'Psalms' ? 'Psalm' : book;
  return { book, chapter, from, to, ref: `${name} ${chapter}:${from}${to > from ? `–${to}` : ''}` };
}

/** A serif the phone already has, so the verse reads like a printed Bible without waiting on a font. */
const SERIF = Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' });

function VerseCard({ onOpen }: { onOpen: (book: string, chapter: number) => void }) {
  const toast = useToast();
  const t = useT();
  // Worked out each time the page is shown, so coming back the next day brings the next verse, and a
  // translation chosen in the reader meanwhile is picked up.
  const [shownAt, setShownAt] = useState(() => Date.now());
  useFocusEffect(
    useCallback(() => {
      setShownAt(Date.now());
    }, []),
  );
  const verse = verseFor(new Date(shownAt));
  const [state, setState] = useState<{ key: string; text: string; translation: TranslationId } | null>(null);
  const [failed, setFailed] = useState(false);
  const [menu, setMenu] = useState(false);
  const key = verse.ref;
  // Hiding waits for the menu to slide away (the card, and the menu with it, then goes); leaving the page sooner hides it at once.
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (!hideTimer.current) return;
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
      setPrefs({ dailyVerse: false });
    },
    [],
  );

  // The words come from the app's own Bible (kept on the phone once fetched), in the member's translation.
  useEffect(() => {
    let live = true;
    setFailed(false);
    (async () => {
      const { translation } = await loadBibleSettings();
      const chapter = await fetchChapter(verse.book, verse.chapter, translation);
      const text = chapter.verses
        .filter((v) => v.verse >= verse.from && v.verse <= verse.to)
        .map((v) => v.text)
        .join(' ')
        .trim();
      if (!text) throw new Error('missing');
      if (live) setState({ key, text, translation });
    })().catch(() => {
      if (live) setFailed(true);
    });
    return () => {
      live = false;
    };
  }, [key, shownAt, verse.book, verse.chapter, verse.from, verse.to]);

  const ready = state?.key === key ? state : null;
  const share = () => {
    if (!ready) return;
    Share.share({ message: `“${ready.text}” — ${verse.ref} (${ready.translation.toUpperCase()})` }).catch(() => {});
  };
  const hide = () => {
    setMenu(false);
    toast(t('bible.hidden'));
    if (hideTimer.current) return;
    hideTimer.current = setTimeout(() => {
      hideTimer.current = null;
      setPrefs({ dailyVerse: false });
    }, 320);
  };

  const pill = (icon: IconName, label: string, onPress: () => void, disabled?: boolean) => (
    <Pressable onPress={disabled ? undefined : onPress} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: !!disabled }} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 7, height: 36, paddingHorizontal: 14, borderRadius: 18, backgroundColor: pressed ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.18)', opacity: disabled ? 0.5 : 1 })}>
      <Icon name={icon} size={17} color="#ffffff" weight={2} />
      <Text style={{ color: '#ffffff', fontSize: 14, fontWeight: '700' }}>{label}</Text>
    </Pressable>
  );

  return (
    <>
      {/* Deep green into teal: the colours of the app, at their quietest. */}
      <LinearGradient colors={['#0a3d24', '#0c5a45', '#0f766e']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ marginHorizontal: 16, marginTop: 8, borderRadius: 22, padding: 18, gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ color: 'rgba(255,255,255,0.78)', fontSize: 12, fontWeight: '800', letterSpacing: 1.2 }}>{t('bible.verseOfDay').toLocaleUpperCase()}</Text>
          <Pressable onPress={() => setMenu(true)} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('bible.verseOptions')} style={({ pressed }) => ({ width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? 'rgba(255,255,255,0.18)' : 'transparent' })}>
            <Icon name="more" size={20} color="rgba(255,255,255,0.85)" />
          </Pressable>
        </View>
        <Text selectable style={{ color: '#ffffff', fontFamily: SERIF, fontSize: 20.5, lineHeight: 30 }}>
          {ready ? `“${ready.text}”` : failed ? t('bible.openToRead') : '…'}
        </Text>
        <Text style={{ color: 'rgba(255,255,255,0.86)', fontSize: 14.5, fontWeight: '700' }}>
          {verse.ref}
          {ready ? <Text style={{ fontWeight: '500', color: 'rgba(255,255,255,0.65)' }}>{`  ${ready.translation.toUpperCase()}`}</Text> : null}
        </Text>
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          {pill('share', t('common.share'), share, !ready)}
          {pill('book', t('bible.readChapter'), () => onOpen(verse.book, verse.chapter))}
        </View>
      </LinearGradient>

      <Sheet visible={menu} onClose={() => setMenu(false)}>
        <SheetRow first icon="close" label={t('bible.hideVerse')} onPress={hide} />
      </Sheet>
    </>
  );
}

/* ---------- the page ---------- */

export default function Bible() {
  const router = useRouter();
  const { dailyVerse } = usePrefs();
  const t = useT();
  const [q, setQ] = useState('');
  const [last, setLast] = useState<{ book: string; chapter: number } | null>(null);
  const [menu, setMenu] = useState(false);

  useFocusEffect(
    useCallback(() => {
      loadBibleSettings().then((s) => setLast(s.last ?? null));
    }, []),
  );

  const open = (book: string, chapter = 1) => router.push({ pathname: '/bible/[book]', params: { book, c: String(chapter) } } as any);
  const needle = q.trim().toLowerCase();
  const ref = needle ? parseReference(q) : null;
  const matches = needle ? BOOKS.filter((b) => b.name.toLowerCase().includes(needle)) : [];

  const list = (testament: 'old' | 'new') => (
    <View style={{ paddingHorizontal: 12, flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {BOOKS.filter((b) => b.testament === testament).map((b) => (
        <Pressable key={b.name} onPress={() => open(b.name)} accessibilityRole="button" accessibilityLabel={`${b.name}, ${b.chapters} chapters`} style={({ pressed }) => ({ paddingHorizontal: 14, height: 40, borderRadius: 20, backgroundColor: pressed ? C.surface2 : C.surface, justifyContent: 'center' })}>
          <Text style={{ color: C.fg, fontSize: 15.5 }}>{b.name}</Text>
        </Pressable>
      ))}
    </View>
  );

  return (
    <Screen>
      <ScreenHeader title={t('churchApps.bible')} right={<RoundButton name="more" label={t('bible.options')} onPress={() => setMenu(true)} />} />
      <View style={{ paddingBottom: 6 }}>
        <SearchField value={q} onChangeText={setQ} placeholder="Book, or a reference like John 3" label="Search the Bible" />
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
        {needle ? (
          <View style={{ paddingTop: 8 }}>
            {ref ? (
              <Pressable onPress={() => open(ref.book, ref.chapter)} accessibilityRole="button" style={({ pressed }) => ({ marginHorizontal: 16, marginBottom: 10, padding: 14, borderRadius: 14, backgroundColor: pressed ? C.surface2 : C.surface, flexDirection: 'row', alignItems: 'center', gap: 12 })}>
                <Icon name="book" size={24} color={C.accent2} />
                <Text style={{ color: C.fg, fontSize: 17, fontWeight: '700', flex: 1 }}>Open {ref.book} {ref.chapter}</Text>
                <Icon name="right" size={18} color={C.fg2} weight={2} />
              </Pressable>
            ) : null}
            {matches.map((b) => (
              <Pressable key={b.name} onPress={() => open(b.name)} accessibilityRole="button" style={({ pressed }) => ({ paddingHorizontal: 16, minHeight: 48, justifyContent: 'center', backgroundColor: pressed ? C.press : 'transparent' })}>
                <Text style={{ color: C.fg, fontSize: 17 }}>{b.name}</Text>
                <Text style={{ color: C.fg2, fontSize: 13 }}>{b.chapters} chapters</Text>
              </Pressable>
            ))}
            {!ref && !matches.length ? <Text style={{ color: C.fg2, textAlign: 'center', padding: 24 }}>Try a book name, or a reference like Psalm 23.</Text> : null}
          </View>
        ) : (
          <>
            {dailyVerse ? <VerseCard onOpen={open} /> : null}
            {last ? (
              <Pressable onPress={() => open(last.book, last.chapter)} accessibilityRole="button" style={({ pressed }) => ({ marginHorizontal: 16, marginTop: dailyVerse ? 12 : 8, padding: 14, borderRadius: 14, backgroundColor: pressed ? C.surface2 : C.surface, flexDirection: 'row', alignItems: 'center', gap: 12 })}>
                <Icon name="bookmark" size={22} color={C.accent2} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: C.fg2, fontSize: 13 }}>Continue reading</Text>
                  <Text style={{ color: C.fg, fontSize: 17, fontWeight: '700' }}>{last.book} {last.chapter}</Text>
                </View>
                <Icon name="right" size={18} color={C.fg2} weight={2} />
              </Pressable>
            ) : null}
            <SectionLabel>Old Testament</SectionLabel>
            {list('old')}
            <SectionLabel>New Testament</SectionLabel>
            {list('new')}
            <Text style={{ color: C.fg3, fontSize: 12.5, textAlign: 'center', paddingTop: 24, paddingHorizontal: 24, lineHeight: 17 }}>King James Version and World English Bible, both public domain. Chapters stay on your phone once you have opened them.</Text>
          </>
        )}
      </ScrollView>

      {/* The page's menu: for now, the verse of the day, so a hidden card can be brought back. */}
      <Sheet visible={menu} onClose={() => setMenu(false)} title={t('churchApps.bible')}>
        <Row icon="sparkle" title={t('bible.verseOfDay')} right={<Toggle value={dailyVerse} onChange={(next) => setPrefs({ dailyVerse: next })} label={t('bible.verseOfDay')} />} />
      </Sheet>
    </Screen>
  );
}
