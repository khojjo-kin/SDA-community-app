// Asking for Create from anywhere in the app: the Create button, "Add to story" on a post, a story
// from the archive shared again, a post into a community. main.tsx listens and opens the right dialog.
import type { StoryItem } from 'shared/types';

export type CreateRequest = {
  mode: 'post' | 'story' | 'short' | 'live' | 'ad';
  /** "Add to story" on a post: the post to put on the story. */
  sharePostId?: string;
  /** A story from your archive, shared again. */
  storyItem?: StoryItem;
  /** Post into this community or page instead of your profile. */
  groupId?: string;
};

const EVENT = 'community:create';

/** Open Create (a post, a story, a Short…) with anything it should start from. */
export function openCreate(request: CreateRequest) {
  window.dispatchEvent(new CustomEvent<CreateRequest>(EVENT, { detail: request }));
}

/** main.tsx: call `fn` for every request; returns the function that stops listening. */
export function onCreateRequest(fn: (r: CreateRequest) => void): () => void {
  const on = (e: Event) => fn((e as CustomEvent<CreateRequest>).detail);
  window.addEventListener(EVENT, on);
  return () => window.removeEventListener(EVENT, on);
}
