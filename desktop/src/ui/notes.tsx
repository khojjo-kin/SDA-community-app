// Notes: a short line (with a song from Pod or a place) shown above the inbox and on the profile
// picture for 24 hours, seen by mutual followers or close friends, as on the iPhone.
// (Owned by the Messages area. The Profile area shows NoteBubble on the profile picture.)
import React from 'react';

/** The note bubble over a profile picture. Your own shows "Note…" and opens the editor. */
export function NoteBubble(_: { userId: string; mine: boolean }) {
  return null;
}

/** The row of notes at the top of the inbox: yours first, then friends'. */
export function NotesRow() {
  return null;
}

/** Writing or changing your note. */
export function NoteEditor(_: { onClose: () => void }) {
  return null;
}
