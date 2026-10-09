import AsyncStorage from '@react-native-async-storage/async-storage';
import { withTimeout } from './api';

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

export async function loadBibleSettings(): Promise<BibleSettings> {
  try {
    const raw = await AsyncStorage.getItem(SETTINGS);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

export async function saveBibleSettings(s: BibleSettings) {
  try {
    await AsyncStorage.setItem(SETTINGS, JSON.stringify(s));
  } catch {
    // Not worth interrupting reading for.
  }
}

/**
 * One chapter, from the phone if it has been read before, otherwise from bible-api.com (public
 * domain texts, no key needed). Chapters are kept once fetched, so the Bible works offline for
 * anything already opened.
 */
export async function fetchChapter(book: string, chapter: number, translation: TranslationId): Promise<Chapter> {
  const key = `community.bible.${translation}.${book}.${chapter}`;
  try {
    const cached = await AsyncStorage.getItem(key);
    if (cached) return JSON.parse(cached);
  } catch {
    // Fall through to the network.
  }
  const ref = `${book} ${chapter}`.replace(/\s+/g, '+');
  const res = await withTimeout(fetch(`https://bible-api.com/${encodeURIComponent(ref).replace(/%2B/g, '+')}?translation=${translation}`), 20000);
  if (!res.ok) throw new Error(res.status === 404 ? 'That chapter could not be found.' : 'The Bible text could not be loaded. Check your connection and try again.');
  const data = await res.json();
  const verses: Verse[] = (data.verses ?? []).map((v: { verse: number; text: string }) => ({ verse: v.verse, text: String(v.text).replace(/\s+/g, ' ').trim() }));
  if (!verses.length) throw new Error('That chapter could not be found.');
  const out: Chapter = { book, chapter, translation, verses };
  AsyncStorage.setItem(key, JSON.stringify(out)).catch(() => {});
  return out;
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
