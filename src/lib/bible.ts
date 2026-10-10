import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchReadingStreak, localDay, markReading, withTimeout } from './api';
import type { BibleMark, ReadingStreak } from './types';

/** The 66 books, with how many chapters each has. */
export const BOOKS: { name: string; chapters: number; testament: 'old' | 'new' }[] = [
  ['Genesis', 50], ['Exodus', 40], ['Leviticus', 27], ['Numbers', 36], ['Deuteronomy', 34], ['Joshua', 24], ['Judges', 21], ['Ruth', 4],
  ['1 Samuel', 31], ['2 Samuel', 24], ['1 Kings', 22], ['2 Kings', 25], ['1 Chronicles', 29], ['2 Chronicles', 36], ['Ezra', 10], ['Nehemiah', 13],
  ['Esther', 10], ['Job', 42], ['Psalms', 150], ['Proverbs', 31], ['Ecclesiastes', 12], ['Song of Solomon', 8], ['Isaiah', 66], ['Jeremiah', 52],
  ['Lamentations', 5], ['Ezekiel', 48], ['Daniel', 12], ['Hosea', 14], ['Joel', 3], ['Amos', 9], ['Obadiah', 1], ['Jonah', 4], ['Micah', 7],
  ['Nahum', 3], ['Habakkuk', 3], ['Zephaniah', 3], ['Haggai', 2], ['Zechariah', 14], ['Malachi', 4],
  ['Matthew', 28], ['Mark', 16], ['Luke', 24], ['John', 21], ['Acts', 28], ['Romans', 16], ['1 Corinthians', 16], ['2 Corinthians', 13],
  ['Galatians', 6], ['Ephesians', 6], ['Philippians', 4], ['Colossians', 4], ['1 Thessalonians', 5], ['2 Thessalonians', 3], ['1 Timothy', 6],
  ['2 Timothy', 4], ['Titus', 3], ['Philemon', 1], ['Hebrews', 13], ['James', 5], ['1 Peter', 5], ['2 Peter', 3], ['1 John', 5], ['2 John', 1],
  ['3 John', 1], ['Jude', 1], ['Revelation', 22],
].map(([name, chapters], i) => ({ name: name as string, chapters: chapters as number, testament: (i < 39 ? 'old' : 'new') as 'old' | 'new' }));

export const TRANSLATIONS = [
  { id: 'kjv', name: 'King James Version', short: 'KJV' },
  { id: 'web', name: 'World English Bible', short: 'WEB' },
] as const;
export type TranslationId = (typeof TRANSLATIONS)[number]['id'];

export type Verse = { verse: number; text: string };
export type Chapter = { book: string; chapter: number; translation: TranslationId; verses: Verse[] };

const SETTINGS = 'community.bible';
export type BibleSettings = { translation: TranslationId; size: number; last?: { book: string; chapter: number } };
const DEFAULTS: BibleSettings = { translation: 'kjv', size: 18 };

/** The settings as last read or saved in this session, so a screen can draw with them at once. */
let settingsNow: BibleSettings | null = null;

export async function loadBibleSettings(): Promise<BibleSettings> {
  let s: BibleSettings = DEFAULTS;
  try {
    const raw = await AsyncStorage.getItem(SETTINGS);
    if (raw) s = { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    // Unreadable: the defaults.
  }
  settingsNow = s;
  return s;
}

/** The settings already read in this session, or null before the first read. */
export function peekBibleSettings(): BibleSettings | null {
  return settingsNow;
}

export async function saveBibleSettings(s: BibleSettings) {
  settingsNow = s;
  try {
    await AsyncStorage.setItem(SETTINGS, JSON.stringify(s));
  } catch {
    // Not worth interrupting reading for.
  }
}

const chapterKey = (book: string, chapter: number, translation: TranslationId) => `community.bible.${translation}.${book}.${chapter}`;

/** Chapters read in this session, so going back and forth between them shows the words at once. The newest last. */
const recent = new Map<string, Chapter>();
const RECENT_MAX = 40;

function remember(c: Chapter) {
  const key = chapterKey(c.book, c.chapter, c.translation);
  recent.delete(key);
  recent.set(key, c);
  if (recent.size > RECENT_MAX) recent.delete(recent.keys().next().value as string);
}

/** A stored chapter, if it reads as one; anything garbled counts as not there. */
function parseChapter(raw: string | null): Chapter | null {
  if (!raw) return null;
  try {
    const c = JSON.parse(raw) as Chapter;
    return c && typeof c.book === 'string' && Array.isArray(c.verses) && c.verses.length ? c : null;
  } catch {
    return null;
  }
}

/** A chapter read earlier in this session, straight away, or null. */
export function peekChapter(book: string, chapter: number, translation: TranslationId): Chapter | null {
  return recent.get(chapterKey(book, chapter, translation)) ?? null;
}

/**
 * One chapter, from the phone if it has been read before, otherwise from bible-api.com (public
 * domain texts, no key needed). Chapters are kept once fetched, so the Bible works offline for
 * anything already opened.
 */
export async function fetchChapter(book: string, chapter: number, translation: TranslationId): Promise<Chapter> {
  const seen = peekChapter(book, chapter, translation);
  if (seen) return seen;
  const key = chapterKey(book, chapter, translation);
  const kept = parseChapter(await AsyncStorage.getItem(key).catch(() => null));
  if (kept) {
    remember(kept);
    return kept;
  }
  const ref = `${book} ${chapter}`.replace(/\s+/g, '+');
  // One time limit over the request and reading the body, so a download that stalls half-way can't leave the chapter loading for ever.
  const data = await withTimeout(
    fetch(`https://bible-api.com/${encodeURIComponent(ref).replace(/%2B/g, '+')}?translation=${translation}`).then((res) => {
      if (!res.ok) throw new Error(res.status === 404 ? 'That chapter could not be found.' : 'The Bible text could not be loaded. Check your connection and try again.');
      return res.json() as Promise<{ verses?: { verse: number; text: string }[] }>;
    }),
    20000,
  );
  const verses: Verse[] = (data.verses ?? []).map((v: { verse: number; text: string }) => ({ verse: v.verse, text: String(v.text).replace(/\s+/g, ' ').trim() }));
  if (!verses.length) throw new Error('That chapter could not be found.');
  const out: Chapter = { book, chapter, translation, verses };
  remember(out);
  AsyncStorage.setItem(key, JSON.stringify(out)).catch(() => {});
  return out;
}

/** Chapters already kept on the phone, by "book chapter"; nothing is fetched. For verse snippets in lists. */
export async function cachedChapters(refs: { book: string; chapter: number }[], translation: TranslationId): Promise<Record<string, Chapter>> {
  const out: Record<string, Chapter> = {};
  try {
    const wanted = [...new Map(refs.map((r) => [chapterKey(r.book, r.chapter, translation), r])).entries()];
    const rows = await Promise.all(wanted.map(([k, r]) => peekChapter(r.book, r.chapter, translation) ?? AsyncStorage.getItem(k).then(parseChapter, () => null)));
    for (const c of rows) if (c) out[`${c.book} ${c.chapter}`] = c;
  } catch {
    // Snippets are a nicety; the list works without them.
  }
  return out;
}

/* ---------- my highlights and notes, kept on the phone too ---------- */

const marksKey = (me: string, book: string, chapter: number) => `community.bible.marks.${me}.${book}.${chapter}`;

/** Chapters' marks already read or kept in this session, by the key above. */
const marksNow = new Map<string, BibleMark[]>();

/** A chapter's marks already known in this session, straight away, or null. */
export function peekMarks(me: string, book: string, chapter: number): BibleMark[] | null {
  return me ? marksNow.get(marksKey(me, book, chapter)) ?? null : null;
}

/**
 * My highlights and notes on a chapter as last seen on this phone, so they show the moment the chapter
 * opens (and with no connection), before the server's copy arrives.
 */
export async function cachedMarks(me: string, book: string, chapter: number): Promise<BibleMark[]> {
  if (!me) return [];
  const known = peekMarks(me, book, chapter);
  if (known) return known;
  try {
    const raw = await AsyncStorage.getItem(marksKey(me, book, chapter));
    const list: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((m): m is BibleMark => !!m && typeof m === 'object' && typeof m.verse === 'number' && (!!m.color || !!m.note)) : [];
  } catch {
    return [];
  }
}

/** Keeps a chapter's marks on the phone for next time. */
export function keepMarks(me: string, book: string, chapter: number, marks: BibleMark[]) {
  if (!me) return;
  const key = marksKey(me, book, chapter);
  const list = marks.filter((m) => m.color || m.note);
  marksNow.set(key, list);
  (list.length ? AsyncStorage.setItem(key, JSON.stringify(list)) : AsyncStorage.removeItem(key)).catch(() => {});
}

/** "John 3:16", "John 3:16–18", "John 3:16–18, 20" for verses of one chapter. */
export function verseRef(book: string, chapter: number, verses: number[]): string {
  const sorted = [...new Set(verses)].sort((a, b) => a - b);
  const parts: string[] = [];
  for (let i = 0; i < sorted.length; i++) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++;
    parts.push(j > i ? `${sorted[i]}–${sorted[j]}` : String(sorted[i]));
    i = j;
  }
  return `${book} ${chapter}${parts.length ? `:${parts.join(', ')}` : ''}`;
}

/** A reference as people say it: "Psalm 23:1" for one psalm (the book is Psalms). */
export function spokenRef(book: string, chapter: number, verses: number[]): string {
  const ref = verseRef(book, chapter, verses);
  return book === 'Psalms' ? ref.replace(/^Psalms /, 'Psalm ') : ref;
}

/* ---------- the reading streak ---------- */

/** The streak as last fetched in this session, for the member it belongs to and the day it was fetched. */
let streakNow: { me: string; day: string; streak: ReadingStreak } | null = null;

/** The streak already fetched today in this session, straight away, or null. */
export function peekStreak(me: string): ReadingStreak | null {
  return streakNow && streakNow.me === me && streakNow.day === localDay() ? streakNow.streak : null;
}

/** The member's reading streak from the server, kept for peekStreak. */
export async function loadStreak(me: string): Promise<ReadingStreak> {
  const day = localDay();
  const streak = await fetchReadingStreak();
  streakNow = { me, day, streak };
  return streak;
}

/**
 * What this phone has counted today, per member: the chapters (so each counts once a day) and whether
 * the day's first chapter has been celebrated. Kept on the phone so reopening the app doesn't count
 * the same chapter twice.
 */
type ReadLog = { day: string; chapters: string[]; cheered: boolean };
const readKey = (me: string) => `community.bible.read.${me}`;
const readLogs = new Map<string, ReadLog>();

async function readLog(me: string): Promise<ReadLog> {
  const day = localDay();
  const known = readLogs.get(me);
  if (known && known.day === day) return known;
  let log: ReadLog = { day, chapters: [], cheered: false };
  try {
    const raw = await AsyncStorage.getItem(readKey(me));
    const kept = raw ? (JSON.parse(raw) as Partial<ReadLog>) : null;
    if (kept && kept.day === day && Array.isArray(kept.chapters)) log = { day, chapters: kept.chapters.filter((c) => typeof c === 'string'), cheered: !!kept.cheered };
  } catch {
    // Unreadable: a fresh day.
  }
  // Another call may have filled it in while this one was reading.
  const now = readLogs.get(me);
  if (now && now.day === day) return now;
  readLogs.set(me, log);
  return log;
}

function keepLog(me: string, log: ReadLog) {
  AsyncStorage.setItem(readKey(me), JSON.stringify(log)).catch(() => {});
}

/** Whether this chapter has already counted towards today's reading (as far as this session knows). */
export function chapterCounted(me: string, book: string, chapter: number): boolean {
  const log = readLogs.get(me);
  return !!log && log.day === localDay() && log.chapters.includes(`${book} ${chapter}`);
}

/**
 * Counts a chapter the member has actually read towards today's streak, once per chapter per day.
 * Resolves to the streak when this was the first chapter counted today on this phone (for a small
 * celebration), otherwise null. Never throws: reading must never wait on this.
 */
export async function noteChapterRead(me: string, book: string, chapter: number): Promise<ReadingStreak | null> {
  if (!me) return null;
  try {
    const log = await readLog(me);
    const key = `${book} ${chapter}`;
    if (log.chapters.includes(key)) return null;
    log.chapters.push(key);
    try {
      await markReading();
    } catch {
      // Not counted: it can count next time the chapter is read.
      log.chapters = log.chapters.filter((c) => c !== key);
      return null;
    }
    const first = !log.cheered;
    log.cheered = true;
    keepLog(me, log);
    const streak = await loadStreak(me).catch(() => null);
    return first && streak && streak.read_today && streak.current_streak > 0 ? streak : null;
  } catch {
    return null;
  }
}

/** "john 3", "1 sam 2", "psalm 23" and similar, to a book and chapter. */
export function parseReference(q: string): { book: string; chapter: number } | null {
  const m = q.trim().toLowerCase().match(/^((?:[1-3]\s*)?[a-z][a-z .]*?)\s*(\d+)?\s*(?::\d+(?:-\d+)?)?$/);
  if (!m) return null;
  const want = m[1].replace(/\s+/g, ' ').replace(/\./g, '').trim();
  const chapter = m[2] ? parseInt(m[2], 10) : 1;
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, '');
  const book = BOOKS.find((b) => norm(b.name) === norm(want)) ?? BOOKS.find((b) => norm(b.name).startsWith(norm(want))) ?? (want === 'psalm' ? BOOKS[18] : undefined);
  if (!book || chapter < 1 || chapter > book.chapters) return null;
  return { book: book.name, chapter };
}
