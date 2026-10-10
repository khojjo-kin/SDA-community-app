import * as SecureStore from 'expo-secure-store';

/** The Seventh-day Adventist Hymnal (1985): hymns 1–695, where 660–695 are sentences and responses. */
export const HYMN_COUNT = 695;

const FAVOURITES = 'community.hymnal.favourites';
const SETTINGS = 'community.hymnal';

export type HymnalSettings = { size: number };
const DEFAULTS: HymnalSettings = { size: 18 };

/** Hymn numbers this person has marked with the heart, ascending. Kept on the phone only. */
export async function loadFavourites(): Promise<number[]> {
  try {
    const raw = await SecureStore.getItemAsync(FAVOURITES);
    const list: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(list)) return [];
    return list.filter((n): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= HYMN_COUNT).sort((a, b) => a - b);
  } catch {
    return [];
  }
}

/** Adds or removes one hymn and returns the new list. */
export async function toggleFavourite(n: number): Promise<number[]> {
  const current = await loadFavourites();
  const next = current.includes(n) ? current.filter((x) => x !== n) : [...current, n].sort((a, b) => a - b);
  try {
    await SecureStore.setItemAsync(FAVOURITES, JSON.stringify(next));
  } catch {
    // The heart still works for this session; it just won't be remembered.
  }
  return next;
}

export async function loadHymnalSettings(): Promise<HymnalSettings> {
  try {
    const raw = await SecureStore.getItemAsync(SETTINGS);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

export async function saveHymnalSettings(s: HymnalSettings) {
  try {
    await SecureStore.setItemAsync(SETTINGS, JSON.stringify(s));
  } catch {
    // Not worth interrupting singing for.
  }
}

/** Keeps a hymn number inside the book. */
export function clampHymn(n: number): number {
  return Math.min(HYMN_COUNT, Math.max(1, Math.floor(n) || 1));
}

/** Lyrics typed by an admin, as verses: blocks separated by a blank line. Line breaks inside a verse are kept. */
export function splitVerses(lyrics: string): string[] {
  return lyrics
    .replace(/\r\n?/g, '\n')
    .split(/\n\s*\n/)
    .map((v) => v.trim())
    .filter(Boolean);
}

/** Lower-case letters, digits and single spaces only, so "jesus' love" finds "Jesus' Love" and "amazing gr" finds "Amazing Grace". */
export function searchKey(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Groups hymns by section in the order the sections appear in the book. The list is expected
 * ascending by number, so walking it and starting a new group whenever the section changes
 * reproduces the hymnal's own order without a separate table of headings.
 */
export function groupBySection<T extends { number: number; section: string }>(hymns: T[]): { section: string; hymns: T[] }[] {
  const groups: { section: string; hymns: T[] }[] = [];
  for (const h of hymns) {
    const section = h.section.trim() || 'Hymns';
    const last = groups[groups.length - 1];
    if (last && last.section === section) last.hymns.push(h);
    else groups.push({ section, hymns: [h] });
  }
  return groups;
}
