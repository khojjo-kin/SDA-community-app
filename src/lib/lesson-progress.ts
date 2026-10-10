import { useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Sabbath School progress, kept on this phone only: which days of each lesson were opened or
 * marked done, and which lessons and days the member saved. It lives in AsyncStorage under one
 * key (like src/lib/cache.ts and the lesson copies in src/lib/sabbath-school.ts), because
 * SecureStore caps a value at about 2KB on some phones and a quarter of progress outgrows that.
 * It is per phone, not per account, so signing out does not wipe a member's reading history.
 *
 * Keys stay short: a lesson is `${quarterId}:${lessonId}` ("2026-04:03") and a day adds its slot
 * ("2026-04:03:2"). Lists are trimmed to the most recent entries so the value never grows without end.
 */

const KEY = 'community.lessonProgress';
// About eight years of lessons (seven days each, 13 lessons a quarter), so finished lessons from
// older quarters stay in Completed. Even full, the value stays well under 200KB.
const MAX_DAYS = 3000;
const MAX_ITEMS = 200;
/** The lessons remembered for the Completed list: enough for every lesson the day lists can hold. */
const MAX_LESSONS = 500;

/** A dated day is its place in the week, 0 (Sabbath) to 6 (Friday); an extra section (Inside Story and so on) keeps its id. */
export type DaySlot = number | string;

/** Something the member saved, with the words to show for it even when offline. `at` is when, in ms. */
export type SavedItem = { k: string; t: string; s: string; at: number };

/** A lesson the member has opened, remembered with its title so the Completed list can show it. */
export type SeenLesson = { k: string; t: string; s: string };

export type LessonProgress = {
  /** Day keys the member has opened. */
  opened: string[];
  /** Day keys the member marked done. */
  done: string[];
  /** Saved lessons and days, oldest first. */
  saved: SavedItem[];
  /** Lessons opened, least recent first. */
  lessons: SeenLesson[];
};

const EMPTY: LessonProgress = { opened: [], done: [], saved: [], lessons: [] };

let current: LessonProgress = EMPTY;
let loading: Promise<void> | null = null;
/** True once the saved copy has been read (or found missing or garbled): only then may it be written over. */
let loaded = false;
/** Changes made while the saved copy could not be read, put on top of it once it can be. */
let pending: ((p: LessonProgress) => LessonProgress)[] = [];
let writing: Promise<void> = Promise.resolve();
const listeners = new Set<() => void>();

/* ---------- keys ---------- */

export const lessonKey = (quarterId: string, lessonId: string) => `${quarterId}:${lessonId}`;
export const dayKey = (quarterId: string, lessonId: string, day: DaySlot) => `${quarterId}:${lessonId}:${day}`;

/** A day's id from the lesson service ("01".."07", "inside-story") to its slot (0..6, or the id). */
export function daySlot(dayId: string): DaySlot {
  return /^\d+$/.test(dayId) ? parseInt(dayId, 10) - 1 : dayId;
}

/** The other way round: slot 0..6 back to "01".."07"; an extra section's id is already its id. */
export function slotDayId(slot: DaySlot): string {
  return typeof slot === 'number' ? String(slot + 1).padStart(2, '0') : slot;
}

/** Splits a lesson or day key back into its parts. */
export function parseKey(k: string): { quarterId: string; lessonId: string; day?: DaySlot } {
  const [quarterId = '', lessonId = '', day] = k.split(':');
  return { quarterId, lessonId, day: day === undefined || day === '' ? undefined : /^\d+$/.test(day) ? Number(day) : day };
}

/* ---------- loading and saving ---------- */

function emit() {
  listeners.forEach((l) => l());
}

function strings(xs: unknown): string[] {
  return Array.isArray(xs) ? xs.filter((x): x is string => typeof x === 'string') : [];
}

function items(xs: unknown): { k: string; t: string; s: string; at: number }[] {
  if (!Array.isArray(xs)) return [];
  return xs
    .filter((x) => x && typeof x === 'object' && typeof x.k === 'string' && typeof x.t === 'string')
    .map((x) => ({ k: x.k as string, t: x.t as string, s: typeof x.s === 'string' ? x.s : '', at: typeof x.at === 'number' ? x.at : 0 }));
}

/** Whatever was stored, made safe to use: anything malformed is dropped rather than trusted. */
function sanitise(raw: unknown): LessonProgress {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    opened: strings(o.opened).slice(-MAX_DAYS),
    done: strings(o.done).slice(-MAX_DAYS),
    saved: items(o.saved).slice(-MAX_ITEMS),
    lessons: items(o.lessons).map(({ k, t, s }) => ({ k, t, s })).slice(-MAX_LESSONS),
  };
}

function save() {
  const json = JSON.stringify(current);
  writing = writing.then(() => AsyncStorage.setItem(KEY, json)).catch(() => {});
}

/**
 * Reads the saved progress once. Safe to call any number of times; later calls share the first read.
 * If the phone cannot read it (rather than reading something garbled), the next call tries again.
 */
export function loadLessonProgress(): Promise<void> {
  if (!loading) {
    loading = AsyncStorage.getItem(KEY).then(
      (raw) => {
        let saved = EMPTY;
        if (raw) {
          try {
            saved = sanitise(JSON.parse(raw));
          } catch {
            // Garbled progress starts afresh rather than stopping anyone reading.
          }
        }
        loaded = true;
        // Anything done while the read was failing goes on top of what was saved, and is written now.
        const queued = pending;
        pending = [];
        current = queued.reduce((p, change) => change(p), saved);
        emit();
        if (queued.length) save();
      },
      () => {
        // The saved copy may be fine and just unreadable this moment: writing now would replace a
        // member's history with an empty one. Keep it as it is and try again on the next use.
        loading = null;
      },
    );
  }
  return loading;
}

/**
 * Applies a change once the saved copy has been read, so a tap in the first instant cannot be
 * overwritten by the read landing after it. Writes go one after another, newest last. While the
 * saved copy cannot be read, the change shows on screen and waits to be written on top of it.
 */
function update(change: (p: LessonProgress) => LessonProgress) {
  loadLessonProgress().then(() => {
    const next = change(current);
    if (next === current) return;
    current = next;
    emit();
    if (loaded) save();
    else pending.push(change);
  });
}

/* ---------- reading the progress ---------- */

/** Sets built once per snapshot, so checking many days while drawing a grid stays cheap. */
const lookups = new WeakMap<LessonProgress, { opened: Set<string>; done: Set<string>; saved: Set<string>; quarters: Set<string> }>();

function lookup(p: LessonProgress) {
  let l = lookups.get(p);
  if (!l) {
    const quarters = new Set<string>();
    for (const k of [...p.opened, ...p.done]) quarters.add(k.split(':')[0]);
    l = { opened: new Set(p.opened), done: new Set(p.done), saved: new Set(p.saved.map((x) => x.k)), quarters };
    lookups.set(p, l);
  }
  return l;
}

/** Re-renders whenever progress changes. The first use reads the saved copy from the phone. */
export function useLessonProgress(): LessonProgress {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      loadLessonProgress();
      return () => {
        listeners.delete(l);
      };
    },
    () => current,
  );
}

export function getLessonProgress(): LessonProgress {
  return current;
}

/** The helpers below read the latest progress, or the snapshot passed last (pass the hook's value while rendering). */

export function isDayOpened(quarterId: string, lessonId: string, day: DaySlot, p: LessonProgress = current): boolean {
  return lookup(p).opened.has(dayKey(quarterId, lessonId, day));
}

export function isDayDone(quarterId: string, lessonId: string, day: DaySlot, p: LessonProgress = current): boolean {
  return lookup(p).done.has(dayKey(quarterId, lessonId, day));
}

/** 'done' when marked done, 'opened' when only opened, null when not touched yet. */
export function dayState(quarterId: string, lessonId: string, day: DaySlot, p: LessonProgress = current): 'done' | 'opened' | null {
  const k = dayKey(quarterId, lessonId, day);
  const l = lookup(p);
  return l.done.has(k) ? 'done' : l.opened.has(k) ? 'opened' : null;
}

/** How many of the first `dayCount` dated days (Sabbath onwards) were opened or marked done. */
export function daysRead(quarterId: string, lessonId: string, dayCount = 7, p: LessonProgress = current): number {
  let n = 0;
  for (let i = 0; i < dayCount; i++) if (dayState(quarterId, lessonId, i, p)) n++;
  return n;
}

/** A lesson is complete when every dated day, Sabbath to Friday, was opened or marked done. */
export function lessonComplete(quarterId: string, lessonId: string, dayCount = 7, p: LessonProgress = current): boolean {
  return dayCount > 0 && daysRead(quarterId, lessonId, dayCount, p) === dayCount;
}

/** True once any day of the quarter has been opened. */
export function quarterStarted(quarterId: string, p: LessonProgress = current): boolean {
  return lookup(p).quarters.has(quarterId);
}

export function isSaved(key: string, p: LessonProgress = current): boolean {
  return lookup(p).saved.has(key);
}

/* ---------- changing it ---------- */

const addKey = (xs: string[], k: string) => (xs.includes(k) ? xs : [...xs, k].slice(-MAX_DAYS));
const dropKey = (xs: string[], k: string) => (xs.includes(k) ? xs.filter((x) => x !== k) : xs);

/** The lesson's words for the Completed list. Moved to the end (most recent) unless it already is. */
function remember(list: SeenLesson[], item: SeenLesson | undefined): SeenLesson[] {
  if (!item) return list;
  const last = list[list.length - 1];
  if (last && last.k === item.k && last.t === item.t && last.s === item.s) return list;
  return [...list.filter((x) => x.k !== item.k), item].slice(-MAX_LESSONS);
}

/** What to show for a lesson in the Saved and Completed lists. */
export type LessonInfo = { title: string; sub: string };

/** Records that a day's reading was opened. `lesson` names the lesson for the Completed list. */
export function markDayOpened(quarterId: string, lessonId: string, day: DaySlot, lesson?: LessonInfo) {
  update((p) => {
    const opened = addKey(p.opened, dayKey(quarterId, lessonId, day));
    const lessons = remember(p.lessons, lesson && { k: lessonKey(quarterId, lessonId), t: lesson.title, s: lesson.sub });
    return opened === p.opened && lessons === p.lessons ? p : { ...p, opened, lessons };
  });
}

/** Marks a day done, or not done again when `done` is false. */
export function markDayDone(quarterId: string, lessonId: string, day: DaySlot, done = true, lesson?: LessonInfo) {
  update((p) => {
    const k = dayKey(quarterId, lessonId, day);
    const next = done ? addKey(p.done, k) : dropKey(p.done, k);
    const lessons = remember(p.lessons, lesson && { k: lessonKey(quarterId, lessonId), t: lesson.title, s: lesson.sub });
    return next === p.done && lessons === p.lessons ? p : { ...p, done: next, lessons };
  });
}

/**
 * Saves a lesson (key from lessonKey) or a day (key from dayKey), or unsaves it if it was saved.
 * Returns whether it is saved now.
 */
export function toggleSaved(item: { k: string; t: string; s: string }): boolean {
  const now = !isSaved(item.k);
  update((p) => {
    const there = p.saved.some((x) => x.k === item.k);
    if (there === now) return p;
    return { ...p, saved: now ? [...p.saved, { ...item, at: Date.now() }].slice(-MAX_ITEMS) : p.saved.filter((x) => x.k !== item.k) };
  });
  return now;
}
