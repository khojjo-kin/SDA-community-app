import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { fetchNotes, openThread } from '../lib/api';
import { useAppFont } from '../lib/fonts';
import { tap } from '../lib/haptics';
import { currentItem, play, stop } from '../lib/player';
import { useSession } from '../lib/session';
import { agoLong, C, errText } from '../lib/theme';
import type { Note, PodItem } from '../lib/types';
import { Icon, VerifiedTick } from './Icon';
import { Avatar, Button, Sheet, useToast } from './ui';

/*
 * Notes: a short line (up to 60 characters), a song from Pod and a place, in a coloured bubble above
 * a member's face at the top of Messages for 24 hours. Mutual followers or close friends see it, and
 * can reply to it in a chat. The server keeps the 24-hour limit and the audience; this file only
 * shows them. Yours is written full screen (app/(app)/note.tsx).
 */

export const NOTE_MAX = 60;

/** The bubble colours the palette badge steps through. '' is the theme's own. */
export const NOTE_COLORS = ['', '#1fbf5a', '#3d8bff', '#8b5cf6', '#ff3d6e', '#ff8a00', '#ffd23f'];

/** Text on a bubble of this colour: the theme's own on the plain bubble, black on light colours, white on the rest. */
export function noteInk(color: string): string {
  const m = /^#([0-9a-f]{6})$/i.exec(color);
  if (!m) return C.fg;
  const n = parseInt(m[1], 16);
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.68 ? '#111111' : '#ffffff';
}

// Your note, handed from the row to the composer as it opens: undefined until set, null for none.
let seed: Note | null | undefined;

/** Read once by the composer: your current note (null for none), or undefined if it wasn't opened from the row. */
export function takeNoteSeed(): Note | null | undefined {
  const s = seed;
  seed = undefined;
  return s;
}

/** How long a song plays when a note is opened. */
const PREVIEW_MS = 15000;

/** "Grace" from "Grace Mensah"; the username when there is no name. */
function firstName(n: { full_name: string; username: string }): string {
  return (n.full_name || '').trim().split(/\s+/)[0] || n.username;
}

/** A note that is still within its 24 hours. The server filters too, but a list kept on screen can outlive a note. */
function live(n: Note, now = Date.now()): boolean {
  return !n.expires_at || new Date(n.expires_at).getTime() > now;
}

/** The words a note is known by: its text, or its song when it is a song alone. */
function noteWords(n: Note): string {
  return n.text || (n.song_title ? `♪ ${n.song_title}` : '');
}

/**
 * The soft bubble a note sits in, with a short tail pointing down at the face. The tail is set a
 * little to the left of centre, so it reads as someone speaking rather than a name tag.
 */
function NoteBubble({ text, song, place, color = '', placeholder, big }: { text: string; song?: string; place?: string; color?: string; placeholder?: boolean; big?: boolean }) {
  const font = useAppFont();
  const tail = big ? 14 : 10;
  const bg = color || C.surface2;
  const ink = noteInk(color);
  // The small bubble has room for three short lines: the song, the words, the place.
  const textLines = big ? 3 : song ? 1 : 2;
  const showPlace = !!place && (big || !song || !text);
  return (
    <View style={{ alignItems: 'center' }}>
      <View style={{ maxWidth: big ? 260 : 86, paddingHorizontal: big ? 16 : 9, paddingVertical: big ? 10 : 6, borderRadius: big ? 20 : 15, backgroundColor: bg, alignItems: 'center' }}>
        {song ? (
          <Text numberOfLines={1} style={{ color: ink, opacity: 0.85, fontSize: big ? 13.5 : 10.5, lineHeight: big ? 18 : 13, fontWeight: '600', fontFamily: font }}>
            ♪ {song}
          </Text>
        ) : null}
        {text ? (
          <Text numberOfLines={textLines} style={{ color: placeholder ? C.fg3 : ink, fontSize: big ? 16 : 12, lineHeight: big ? 21 : 15, textAlign: 'center', fontFamily: font }}>
            {text}
          </Text>
        ) : null}
        {showPlace ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, maxWidth: '100%' }}>
            <Icon name="location" size={big ? 12 : 9} color={ink} />
            <Text numberOfLines={1} style={{ color: ink, opacity: 0.85, fontSize: big ? 13 : 10.5, lineHeight: big ? 18 : 13, flexShrink: 1, fontFamily: font }}>
              {place}
            </Text>
          </View>
        ) : null}
      </View>
      <View style={{ width: tail, height: tail, borderBottomRightRadius: 3, backgroundColor: bg, transform: [{ rotate: '45deg' }], marginTop: -tail / 2 - 1, marginLeft: big ? -26 : -18 }} />
    </View>
  );
}

/** "Song · Artist" for a note's bubble, or undefined for none. */
function songLine(n: Note): string | undefined {
  if (!n.song_id || !n.song_title) return undefined;
  return n.song_artist ? `${n.song_title} · ${n.song_artist}` : n.song_title;
}

/** One face in the row: the bubble above, the name below. */
function NoteFace({ uri, name, label, note, placeholder, adding, onPress, a11y }: { uri?: string | null; name: string; label: string; note: Note | { text: string }; placeholder?: boolean; adding?: boolean; onPress: () => void; a11y: string }) {
  const font = useAppFont();
  const full = 'user_id' in note ? note : null;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={a11y} style={({ pressed }) => ({ width: 88, alignItems: 'center', opacity: pressed ? 0.7 : 1 })}>
      {/* A fixed height above every face, so short and long notes keep the faces level. */}
      <View style={{ height: 58, justifyContent: 'flex-end', zIndex: 2, marginBottom: -7 }}>
        <NoteBubble text={note.text} song={full ? songLine(full) : undefined} place={full?.place} color={full?.color} placeholder={placeholder} />
      </View>
      <View>
        <Avatar uri={uri} name={name} size={64} />
        {adding ? (
          <View style={{ position: 'absolute', right: -1, bottom: -1, width: 22, height: 22, borderRadius: 11, backgroundColor: C.accent, borderWidth: 2.5, borderColor: C.bg, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="plus" size={12} color={C.onAccent} weight={3} />
          </View>
        ) : null}
      </View>
      <Text numberOfLines={1} style={{ color: C.fg2, fontSize: 12.5, marginTop: 5, maxWidth: 82, fontFamily: font }}>
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * The row of notes at the top of Messages: yours first, then your friends'. It loads itself and
 * refreshes whenever Messages comes back to the front; `refreshKey` changing (pull to refresh) loads it again.
 */
// Memoised: it is the header of Messages' list, which draws again on every 15-second refresh.
export const NotesRow = React.memo(function NotesRow({ refreshKey = 0 }: { refreshKey?: number }) {
  const { profile } = useSession();
  const router = useRouter();
  const toast = useToast();
  const fontBold = useAppFont('bold');
  const font = useAppFont();
  const [notes, setNotes] = useState<Note[]>([]);
  // The friend's note in the sheet. Kept after the sheet closes so it doesn't empty while sliding away.
  const [viewing, setViewing] = useState<Note | null>(null);
  const [viewOpen, setViewOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const alive = useRef(true);
  // Whether the row has loaded once, so the composer knows `mine` is the truth rather than "not loaded yet".
  const loadedOnce = useRef(false);
  const later = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The song a note is playing, and when its preview ends.
  const preview = useRef<{ id: string; timer: ReturnType<typeof setTimeout> } | null>(null);

  const endPreview = useCallback(() => {
    const p = preview.current;
    if (!p) return;
    preview.current = null;
    clearTimeout(p.timer);
    if (currentItem()?.id === p.id) stop();
  }, []);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (later.current) clearTimeout(later.current);
      endPreview();
    };
  }, [endPreview]);

  const load = useCallback(async () => {
    try {
      const list = await fetchNotes();
      loadedOnce.current = true;
      if (alive.current) setNotes(list);
    } catch {
      // Notes are a nicety: if they don't load, the row keeps what it had and the chats still work.
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
      // Leaving Messages ends a note's song.
      return endPreview;
    }, [load, endPreview]),
  );
  useEffect(() => {
    if (refreshKey) load();
  }, [refreshKey, load]);

  const now = Date.now();
  const mine = notes.find((n) => n.mine && live(n, now)) ?? null;
  const others = notes.filter((n) => !n.mine && live(n, now));

  function openWriter() {
    tap();
    endPreview();
    // Not loaded yet: the composer looks your note up itself.
    seed = loadedOnce.current ? mine : undefined;
    router.push('/note');
  }

  /** A short listen of a note's song, with the Pod player. */
  function playPreview(n: Note) {
    endPreview();
    if (!n.song_id || !n.song_url) return;
    const item: PodItem = { id: n.song_id, user_id: '', kind: 'song', title: n.song_title ?? '', artist: n.song_artist ?? '', description: '', cover_url: n.song_cover ?? '', audio_url: n.song_url, duration_seconds: 0, plays: 0, created_at: n.created_at, username: '', full_name: '', avatar_url: '', saved: false };
    play([item], 0);
    const id = n.song_id;
    preview.current = { id, timer: setTimeout(endPreview, PREVIEW_MS) };
  }

  function openNote(n: Note) {
    tap();
    setViewing(n);
    setViewOpen(true);
    playPreview(n);
  }

  function closeNote() {
    setViewOpen(false);
    endPreview();
  }

  /** Opens the chat with them, the note already quoted at the start of the message box. */
  async function reply() {
    if (!viewing || busy) return;
    const n = viewing;
    setBusy(true);
    try {
      const tid = await openThread(n.user_id);
      tap();
      closeNote();
      // Let the sheet slide away before the chat opens over it.
      if (later.current) clearTimeout(later.current);
      later.current = setTimeout(() => {
        later.current = null;
        router.push({ pathname: '/chat/[id]', params: { id: tid, draft: `Replying to your note: ‘${noteWords(n)}’\n` } });
      }, 320);
    } catch (e) {
      toast(errText(e));
    } finally {
      if (alive.current) setBusy(false);
    }
  }

  return (
    <>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 8, paddingTop: 2, paddingBottom: 10, gap: 2 }} accessibilityLabel="Notes">
        <NoteFace
          uri={profile?.avatar_url}
          name={profile?.full_name ?? ''}
          label="Your note"
          note={mine ?? { text: 'Leave a note…' }}
          placeholder={!mine}
          adding={!mine}
          onPress={openWriter}
          a11y={mine ? `Your note: ${noteWords(mine)}. Change or delete it` : 'Leave a note'}
        />
        {others.map((n) => (
          <NoteFace key={n.user_id} uri={n.avatar_url} name={n.full_name || n.username} label={firstName(n)} note={n} onPress={() => openNote(n)} a11y={`Note from ${n.full_name || n.username}: ${noteWords(n)}`} />
        ))}
      </ScrollView>

      {/* A friend's note. */}
      <Sheet visible={viewOpen} onClose={closeNote}>
        {viewing ? (
          <View style={{ alignItems: 'center', paddingHorizontal: 24, paddingTop: 10, paddingBottom: 4 }}>
            <View style={{ zIndex: 2, marginBottom: -8 }}>
              <NoteBubble big text={viewing.text} song={songLine(viewing)} place={viewing.place} color={viewing.color} />
            </View>
            <Avatar uri={viewing.avatar_url} name={viewing.full_name || viewing.username} size={84} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 12 }}>
              <Text numberOfLines={1} style={{ color: C.fg, fontSize: 18, fontWeight: '700', flexShrink: 1, fontFamily: fontBold }}>{viewing.full_name || viewing.username}</Text>
              {viewing.verified ? <VerifiedTick size={15} /> : null}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
              <Text style={{ color: C.fg2, fontSize: 14, fontFamily: font }}>{agoLong(viewing.created_at)}</Text>
              {viewing.audience === 'close_friends' ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, backgroundColor: C.close }}>
                  <Icon name="star" size={11} color="#fff" fill />
                  <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>Close friends</Text>
                </View>
              ) : null}
            </View>
            <Button label={`Reply to ${firstName(viewing)}`} onPress={reply} busy={busy} style={{ alignSelf: 'stretch', marginTop: 20 }} />
          </View>
        ) : null}
      </Sheet>
    </>
  );
});
