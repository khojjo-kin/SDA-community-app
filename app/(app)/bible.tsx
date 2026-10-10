import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, Share, Text, useWindowDimensions, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import { Icon, IconName } from '../../src/components/Icon';
import { Skeleton, SkeletonFrame } from '../../src/components/Skeleton';
import { Empty, Row, RoundButton, Screen, ScreenHeader, SearchField, SectionLabel, Sheet, SheetRow, Toggle, useToast } from '../../src/components/ui';
import { localDay } from '../../src/lib/api';
import { BOOKS, fetchChapter, loadBibleSettings, loadStreak, parseReference, peekBibleSettings, peekStreak, type TranslationId } from '../../src/lib/bible';
import { useLanguage, useT } from '../../src/lib/i18n';
import { setPrefs, usePrefs } from '../../src/lib/prefs';
import { useSession } from '../../src/lib/session';
import { C } from '../../src/lib/theme';
import type { ReadingStreak } from '../../src/lib/types';

/** When a screen was last opened from this page, so a quick second tap doesn't open it twice. */
let openedAt = 0;
const once = (go: () => void) => {
  const now = Date.now();
  if (now - openedAt < 700) return;
  openedAt = now;
  go();
};

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

function VerseOfTheDay({ onOpen, onCard }: { onOpen: (book: string, chapter: number) => void; onCard: (verse: DailyVerse, translation: TranslationId) => void }) {
  const toast = useToast();
  const t = useT();
  const { width } = useWindowDimensions();
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
        {ready || failed ? (
          <Text selectable style={{ color: '#ffffff', fontFamily: SERIF, fontSize: 20.5, lineHeight: 30 }}>
            {ready ? `“${ready.text}”` : t('bible.openToRead')}
          </Text>
        ) : (
          // Pale lines where the verse will be, on the card's own dark green.
          <SkeletonFrame style={{ gap: 12, paddingVertical: 7 }}>
            {[0.94, 0.86, 0.52].map((f, i) => (
              <Skeleton key={i} dark width={Math.round((width - 68) * f)} height={15} radius={7} x={34} />
            ))}
          </SkeletonFrame>
        )}
        {/* The reference opens the chapter. */}
        <Pressable onPress={() => onOpen(verse.book, verse.chapter)} hitSlop={6} accessibilityRole="button" accessibilityLabel={`${verse.ref}. ${t('bible.readChapter')}`} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', opacity: pressed ? 0.6 : 1 })}>
          <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 14.5, fontWeight: '700' }}>
            {verse.ref}
            {ready ? <Text style={{ fontWeight: '500', color: 'rgba(255,255,255,0.65)' }}>{`  ${ready.translation.toUpperCase()}`}</Text> : null}
          </Text>
          <Icon name="right" size={14} color="rgba(255,255,255,0.75)" weight={2.4} />
        </Pressable>
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          {pill('image', t('verseCard.make'), () => ready && onCard(verse, ready.translation), !ready)}
          {pill('share', t('common.share'), share, !ready)}
        </View>
      </LinearGradient>

      <Sheet visible={menu} onClose={() => setMenu(false)}>
        <SheetRow first icon="close" label={t('bible.hideVerse')} onPress={hide} />
      </Sheet>
    </>
  );
}

/* ---------- the reading streak ---------- */

/** "M", "T"… for a day, in the app's language where the phone knows it. */
function weekdayLetter(d: Date, lang: string): string {
  try {
    return new Intl.DateTimeFormat(lang, { weekday: 'narrow' }).format(d);
  } catch {
    return 'SMTWTFS'[d.getDay()];
  }
}

/**
 * Days in a row with a chapter read, the last seven days, and the way back to the chapter last read.
 * Plain on the page; tapping anywhere on it carries on reading.
 */
function Streak({ continueTo, onContinue }: { continueTo: string; onContinue: () => void }) {
  const t = useT();
  const lang = useLanguage();
  const { me } = useSession();
  const { width } = useWindowDimensions();
  const [streak, setStreak] = useState<ReadingStreak | null>(() => peekStreak(me));
  const [failed, setFailed] = useState(false);
  const [today, setToday] = useState(() => localDay());

  // Fetched each time the page is shown, so a chapter just read shows here on coming back.
  useFocusEffect(
    useCallback(() => {
      let live = true;
      setToday(localDay());
      loadStreak(me)
        .then((s) => {
          if (!live) return;
          setStreak(s);
          setFailed(false);
        })
        .catch(() => {
          if (live) setFailed(true);
        });
      return () => {
        live = false;
      };
    }, [me]),
  );

  const week = useMemo(() => {
    const read = new Set(streak?.last_days ?? []);
    const [y, m, d] = today.split('-').map((n) => parseInt(n, 10));
    return Array.from({ length: 7 }, (_, i) => {
      const day = new Date(y, m - 1, d - (6 - i));
      const id = localDay(day);
      return { id, letter: weekdayLetter(day, lang), read: read.has(id), today: i === 6 };
    });
  }, [streak, today, lang]);

  const current = streak?.current_streak ?? 0;
  const best = streak?.best_streak ?? 0;
  const readToday = !!streak?.read_today;
  const title = current > 0 ? t('bible.streakDays', { n: current }) : t('bible.streakStart');
  const status = readToday ? t('bible.readToday') : t('bible.readAChapter');
  const spoken = `${title}. ${status}. ${t('bible.continueReading')}, ${continueTo}`;

  return (
    <View style={{ marginTop: 14 }}>
      {streak ? (
        <Pressable onPress={onContinue} accessibilityRole="button" accessibilityLabel={spoken} style={({ pressed }) => ({ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 14, backgroundColor: pressed ? C.press : 'transparent' })}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Icon name="flame" size={28} color={current > 0 ? C.accent : C.fg3} fill={readToday} weight={1.8} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: C.fg, fontSize: 20, fontWeight: '800', letterSpacing: -0.2 }}>{title}</Text>
              <Text numberOfLines={1} style={{ color: C.fg2, fontSize: 14, marginTop: 1 }}>
                <Text style={readToday ? { color: C.accent2, fontWeight: '700' } : null}>{status}</Text>
                {best > 0 ? <Text style={{ color: C.fg3 }}>{`  ·  ${t('bible.bestStreak', { n: best })}`}</Text> : null}
              </Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 16, paddingHorizontal: 2 }}>
            {week.map((day) => (
              <View key={day.id} style={{ alignItems: 'center', gap: 7, width: 34 }}>
                <Text style={{ color: day.today ? C.fg : C.fg3, fontSize: 12, fontWeight: day.today ? '800' : '600' }}>{day.letter}</Text>
                <View style={{ width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: day.read ? C.accent : C.surface, borderWidth: day.today && !day.read ? 1.5 : 0, borderColor: C.fg3 }}>
                  {day.read ? <Icon name="check" size={15} color={C.onAccent} weight={2.8} /> : null}
                </View>
              </View>
            ))}
          </View>
        </Pressable>
      ) : failed ? null : (
        <SkeletonFrame style={{ gap: 10, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Skeleton width={28} height={28} radius={14} x={16} />
            <View style={{ gap: 8 }}>
              <Skeleton width={140} height={15} radius={6} x={54} />
              <Skeleton width={100} height={11} radius={5} x={54} />
            </View>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, paddingHorizontal: 5 }}>
            {Array.from({ length: 7 }, (_, i) => (
              <Skeleton key={i} width={28} height={28} radius={14} x={16 + 5 + ((width - 42 - 28) / 6) * i} />
            ))}
          </View>
        </SkeletonFrame>
      )}
      <Row icon="book" title={t('bible.continueReading')} value={continueTo} onPress={onContinue} />
    </View>
  );
}

/* ---------- the page ---------- */

export default function Bible() {
  const router = useRouter();
  const { dailyVerse } = usePrefs();
  const t = useT();
  const [q, setQ] = useState('');
  const [last, setLast] = useState<{ book: string; chapter: number } | null>(() => peekBibleSettings()?.last ?? null);
  const [menu, setMenu] = useState(false);

  useFocusEffect(
    useCallback(() => {
      loadBibleSettings().then((s) => setLast(s.last ?? null));
    }, []),
  );

  const open = (book: string, chapter = 1) => once(() => router.push({ pathname: '/bible/[book]', params: { book, c: String(chapter) } } as any));
  const openMarks = () => once(() => router.push('/bible-marks' as any));
  const openCard = (v: DailyVerse, translation: TranslationId) =>
    once(() => router.push({ pathname: '/verse-card', params: { book: v.book, c: String(v.chapter), v: v.to > v.from ? `${v.from}-${v.to}` : String(v.from), tr: translation } } as any));
  // Carry on where the member left off; before anything has been read, today's verse's chapter.
  const today = verseFor(new Date());
  const resume = last ?? { book: today.book, chapter: today.chapter };
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
      <ScrollView contentContainerStyle={{ paddingBottom: 60 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        {needle ? (
          <View style={{ paddingTop: 4 }}>
            {ref ? <Row icon="book" title={t('bible.openRef', { ref: `${ref.book} ${ref.chapter}` })} bold onPress={() => open(ref.book, ref.chapter)} /> : null}
            {matches.map((b) => (
              <Pressable key={b.name} onPress={() => open(b.name)} accessibilityRole="button" style={({ pressed }) => ({ paddingHorizontal: 16, minHeight: 48, justifyContent: 'center', backgroundColor: pressed ? C.press : 'transparent' })}>
                <Text style={{ color: C.fg, fontSize: 17 }}>{b.name}</Text>
                <Text style={{ color: C.fg2, fontSize: 13 }}>{b.chapters} chapters</Text>
              </Pressable>
            ))}
            {!ref && !matches.length ? <Empty icon="search" title={t('bible.noMatch')} /> : null}
          </View>
        ) : (
          <>
            {dailyVerse ? <VerseOfTheDay onOpen={open} onCard={openCard} /> : null}
            <Streak continueTo={`${resume.book} ${resume.chapter}`} onContinue={() => open(resume.book, resume.chapter)} />
            <Row icon="compose" title={t('bibleMarks.title')} onPress={openMarks} />
            <SectionLabel>Old Testament</SectionLabel>
            {list('old')}
            <SectionLabel>New Testament</SectionLabel>
            {list('new')}
            <Text style={{ color: C.fg3, fontSize: 12.5, textAlign: 'center', paddingTop: 24, paddingHorizontal: 24, lineHeight: 17 }}>King James Version and World English Bible, both public domain.</Text>
          </>
        )}
      </ScrollView>

      {/* The page's menu: for now, the verse of the day, so a hidden card can be brought back. */}
      <Sheet visible={menu} onClose={() => setMenu(false)} title={t('churchApps.bible')}>
        <Row icon="sparkle" title={t('bible.verseOfDay')} right={<Toggle value={dailyVerse} onChange={(next) => setPrefs({ dailyVerse: next })} label={t('bible.verseOfDay')} />} />
        <Row icon="compose" title={t('bibleMarks.title')} onPress={() => { setMenu(false); openMarks(); }} />
      </Sheet>
    </Screen>
  );
}
