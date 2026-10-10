import * as MediaLibrary from 'expo-media-library';

/**
 * The newest page of the photo library, loaded ahead of time so the picker opens with photos
 * already in it. Loaded only when access has already been given: nothing here ever asks for it.
 */

/** How many photos and videos make one page of the picker's grid. */
export const LIBRARY_PAGE = 60;
/** A page loaded less than this long ago is fresh enough to show without loading it again. */
const FRESH_MS = 60_000;

export type LibraryAccess = 'all' | 'limited';
export type LibraryPage = {
  assets: MediaLibrary.Asset[];
  endCursor: string;
  hasNextPage: boolean;
  /** Whether the person shared the whole library or only some of it. */
  access: LibraryAccess;
  /** When it was loaded (ms since epoch). */
  at: number;
};

let cached: LibraryPage | null = null;
let inflight: Promise<LibraryPage | null> | null = null;
// Bumped by invalidateLibrary, so a load that was already on its way cannot bring back a dropped page.
let generation = 0;

/** One page of photos and videos, newest first. `after` is the previous page's endCursor. */
export function libraryPage(after?: string): Promise<MediaLibrary.PagedInfo<MediaLibrary.Asset>> {
  return MediaLibrary.getAssetsAsync({ first: LIBRARY_PAGE, after, mediaType: ['photo', 'video'], sortBy: MediaLibrary.SortBy.creationTime });
}

/** The page loaded ahead of time, or null when there is none. */
export function getCachedLibrary(): LibraryPage | null {
  return cached;
}

/** Drops the page loaded ahead of time (the library changed, or access was taken away). */
export function invalidateLibrary() {
  cached = null;
  inflight = null;
  generation++;
}

async function loadFirstPage(gen: number): Promise<LibraryPage | null> {
  const p = await MediaLibrary.getPermissionsAsync();
  if (gen !== generation) return null;
  if (!p.granted) {
    cached = null;
    return null;
  }
  const page = await libraryPage();
  if (gen !== generation) return null;
  cached = { assets: page.assets, endCursor: page.endCursor, hasNextPage: page.hasNextPage, access: p.accessPrivileges === 'limited' ? 'limited' : 'all', at: Date.now() };
  return cached;
}

/**
 * Loads the newest page now (sharing a load that is already on its way) and keeps it. Null when
 * there is no access, or when the page was dropped while loading. Rejects if the library fails.
 */
export function refreshLibrary(): Promise<LibraryPage | null> {
  if (inflight) return inflight;
  const run = loadFirstPage(generation);
  inflight = run;
  const settle = () => {
    if (inflight === run) inflight = null;
  };
  run.then(settle, settle);
  return run;
}

/**
 * Warms the picker: loads the newest page if access is already given and the page kept is missing
 * or more than a minute old. Never asks for access and never fails.
 */
export function prefetchLibrary(): Promise<LibraryPage | null> {
  if (inflight) return inflight.catch(() => cached);
  if (cached && Date.now() - cached.at < FRESH_MS) return Promise.resolve(cached);
  return refreshLibrary().catch(() => cached);
}
