import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * A small cache of what the app showed last time (profile, feed, chats), so a screen can draw at
 * once and refresh behind. Kept on the phone with AsyncStorage and mirrored in memory, so a screen
 * that opens again in the same session gets its copy without waiting at all.
 *
 * Every key belongs to one account (`community.cache.<userId>.<name>`), so one person's copy is
 * never shown to another. Nothing here ever throws: a cache problem only means a slower screen.
 */

const PREFIX = 'community.cache.';

/** What is in memory, with the JSON it was saved as, so an unchanged value is not written again. */
const memory = new Map<string, { json: string; value: unknown }>();

/** The storage key for one account's copy of `name`. Empty when nobody is signed in. */
export function cacheKey(userId: string, name: string): string {
  return userId ? `${PREFIX}${userId}.${name}` : '';
}

/** The copy in memory, if this session has already read or written it. Never waits. */
export function peekCache<T>(key: string): T | null {
  if (!key) return null;
  try {
    return (memory.get(key)?.value as T | undefined) ?? null;
  } catch {
    return null;
  }
}

/** The saved copy, or null when there is none or it cannot be read. */
export async function readCache<T>(key: string): Promise<T | null> {
  if (!key) return null;
  try {
    const held = memory.get(key);
    if (held) return (held.value as T) ?? null;
    const json = await AsyncStorage.getItem(key);
    if (json == null) return null;
    // A write that landed while this read was on its way is newer: keep it.
    const newer = memory.get(key);
    if (newer) return (newer.value as T) ?? null;
    const value = JSON.parse(json) as T;
    memory.set(key, { json, value });
    return value ?? null;
  } catch {
    return null;
  }
}

/** Saves a copy. Resolves once written (or once it has failed quietly). */
export async function writeCache(key: string, value: unknown): Promise<void> {
  if (!key) return;
  try {
    const json = JSON.stringify(value ?? null);
    if (memory.get(key)?.json === json) return;
    memory.set(key, { json, value: value ?? null });
    await AsyncStorage.setItem(key, json);
  } catch {
    // Not worth interrupting anything for.
  }
}

/** Forgets everything kept for one account, on the phone and in memory. Used when they sign out. */
export async function clearCache(userId: string): Promise<void> {
  if (!userId) return;
  const prefix = `${PREFIX}${userId}.`;
  try {
    for (const key of [...memory.keys()]) if (key.startsWith(prefix)) memory.delete(key);
    const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(prefix));
    if (keys.length) await AsyncStorage.multiRemove(keys);
  } catch {
    // Not worth interrupting anything for.
  }
}

/** Each kept item's JSON, worked out once: the items on screen are compared again on every refresh. */
const jsonOf = new WeakMap<object, string>();
function json(item: object): string {
  let text = jsonOf.get(item);
  if (text === undefined) {
    text = JSON.stringify(item);
    jsonOf.set(item, text);
  }
  return text;
}

/**
 * A list that has just been fetched again, with every item that hasn't changed swapped for the one
 * already on screen, and the old list itself when nothing changed at all. A screen that polls (Messages,
 * a chat) then only draws again the rows that are new or different, instead of every row each time.
 */
export function keepSame<T extends { id: string }>(prev: readonly T[], next: T[]): T[] {
  if (!prev.length) return next;
  const before = new Map<string, T>();
  for (const item of prev) before.set(item.id, item);
  let same = prev.length === next.length;
  const out = next.map((item, i) => {
    const old = before.get(item.id);
    if (!old || json(old) !== JSON.stringify(item)) {
      same = false;
      return item;
    }
    if (prev[i] !== old) same = false;
    return old;
  });
  return same ? (prev as T[]) : out;
}
