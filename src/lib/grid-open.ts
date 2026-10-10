import { fetchExplore, fetchGroupPosts, fetchReels, fetchUserPosts } from './api';
import type { Post } from './types';

/*
 * Opening a post from a grid, the way Instagram does: a photo opens a scrolling feed of that grid's
 * posts starting at the one tapped (/posts), a Short opens the full-screen player at that Short with
 * the grid's other Shorts above and below it (/shorts).
 *
 * The grid hands over what it is showing, in its own order, kept here under a short key that goes in
 * the route; the screen it opens reads it back. `source` says where more of the same come from once
 * the grid's own list runs out. A key that is no longer here (the app was restarted on that screen)
 * falls back to the profile named in the route, or to the one post.
 */

/** Where a grid's posts come from, so the screen it opens can fetch more of the same. */
export type GridSource =
  | { from: 'user'; userId: string }
  | { from: 'explore' }
  | { from: 'group'; groupId: string }
  /** A fixed list (saved, likes, reposts, inspiration, insights): nothing more to fetch. */
  | { from: 'list' };

export type OpenedGrid = {
  /** The grid's posts in its order: every post for /posts, only the Shorts for /shorts. */
  ids: string[];
  source: GridSource;
  /** Under "Posts" in the feed's header: the username, or the grid's own name. */
  subtitle?: string;
};

const opened = new Map<string, OpenedGrid>();
let count = 0;
/** Enough for a few grids opened one inside another; older ones are dropped. */
const KEEP = 24;

export function rememberGrid(grid: OpenedGrid): string {
  const key = `g${++count}`;
  opened.set(key, grid);
  while (opened.size > KEEP) {
    const oldest = opened.keys().next().value;
    if (oldest === undefined) break;
    opened.delete(oldest);
  }
  return key;
}

export function recallGrid(key: string | undefined): OpenedGrid | undefined {
  return key ? opened.get(key) : undefined;
}

/** A Short opens the Shorts player; anything else opens the posts feed. */
export const isShort = (p: Pick<Post, 'kind'>) => p.kind === 'reel';

/** How many posts a page fetched further on holds. */
export const MORE_PAGE = 18;

/**
 * The page after `before` (a created_at) from the same place, as the server sent it: the caller keeps
 * only Shorts when `shorts`, and treats an empty page as the end.
 */
export async function fetchMoreLike(source: GridSource, before: string, shorts: boolean): Promise<Post[]> {
  switch (source.from) {
    case 'user':
      return fetchUserPosts(source.userId, before, shorts);
    case 'explore':
      return shorts ? fetchReels(false, before) : fetchExplore(before, MORE_PAGE);
    case 'group':
      return fetchGroupPosts(source.groupId, before);
    default:
      return [];
  }
}
