// Notes: a short line (up to 60 characters), a song from Pod and a place, in a coloured bubble above
// a member's picture for 24 hours, seen by mutual followers or close friends, as on the iPhone
// (src/components/NotesRow.tsx, app/(app)/note.tsx). The server keeps the 24 hours and the audience.
// NotesRow sits at the top of the inbox; NoteBubble sits over a profile picture.
import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { deleteNote, fetchNotes, fetchPod, openThread, saveNote } from 'shared/api';
import { agoLong, clock } from 'shared/theme';
import type { Note, PodItem } from 'shared/types';
import { useMe } from '../lib/me';
import { nav } from '../lib/router';
import { Avatar, Icon, Modal, Spinner, Verified, ask, toast, toastError } from './kit';
import { usePlayer } from './player';
import { firstName, setDraft } from './chat-bits';
import '../styles/messages.css';

export const NOTE_MAX = 60;
export const PLACE_MAX = 80;
/** The bubble colours, as on the iPhone. '' is the theme's own. */
export const NOTE_COLORS: { value: string; label: string }[] = [
  { value: '', label: 'Theme colour' },
  { value: '#1fbf5a', label: 'Green' },
  { value: '#3d8bff', label: 'Blue' },
  { value: '#8b5cf6', label: 'Purple' },
  { value: '#ff3d6e', label: 'Pink' },
  { value: '#ff8a00', label: 'Orange' },
  { value: '#ffd23f', label: 'Yellow' },
];
/** How long a friend's song plays when you open their note. */
const PREVIEW_MS = 15000;

/** Words on a bubble of this colour: the theme's own on the plain bubble, black on light colours, white on the rest. */
export function noteInk(color: string): string {
  const m = /^#([0-9a-f]{6})$/i.exec(color);
  if (!m) return 'var(--fg)';
  const n = parseInt(m[1], 16);
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.68 ? '#111111' : '#ffffff';
}

/* ---------- one shared copy of the notes, for the inbox row and every profile bubble ---------- */

let store: { owner: string; list: Note[]; at: number } | null = null;
let inflight: Promise<void> | null = null;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

/** Loads the notes I can see, unless a load is already on its way. */
function loadNotes(owner: string): Promise<void> {
  if (inflight) return inflight;
  inflight = fetchNotes()
    .then(
      (list) => {
        store = { owner, list, at: Date.now() };
      },
      // Notes are a nicety: if they don't load, the row keeps what it had and the chats still work.
      () => {
        if (!store || store.owner !== owner) store = { owner, list: [], at: Date.now() };
      },
    )
    .finally(() => {
      inflight = null;
      emit();
    });
  return inflight;
}

/** Loads the notes again after a change (sharing or deleting mine): waits for any earlier load, then asks afresh. */
export function refreshNotes(owner: string): Promise<void> {
  return (inflight ?? Promise.resolve()).then(() => loadNotes(owner));
}

function useNotes(owner: string): Note[] | null {
  const snap = useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => store,
  );
  useEffect(() => {
    if (!store || store.owner !== owner || Date.now() - store.at > 30e3) loadNotes(owner);
  }, [owner]);
  return snap && snap.owner === owner ? snap.list : null;
}

/** A note that is still within its 24 hours (a list kept on screen can outlive a note). */
const live = (n: Note) => !n.expires_at || new Date(n.expires_at).getTime() > Date.now();
/** "Song · Artist", or undefined for none. */
const songLine = (n: Pick<Note, 'song_id' | 'song_title' | 'song_artist'>) => (n.song_id && n.song_title ? (n.song_artist ? `${n.song_title} · ${n.song_artist}` : n.song_title) : undefined);
/** The words a note is known by: its text, or its song when it is a song alone. */
const noteWords = (n: Note) => n.text || (n.song_title ? `♪ ${n.song_title}` : '');

/* ---------- the bubble ---------- */

/** The soft bubble a note sits in, with two small dots trailing down to the face. */
function NoteShape({ text, song, place, color = '', placeholder, size }: { text: string; song?: string; place?: string; color?: string; placeholder?: boolean; size: 'sm' | 'lg' }) {
  // The small bubble has room for three short lines: the song, the words, the place.
  const showPlace = !!place && (size === 'lg' || !song || !text);
  const style = color ? ({ background: color, color: noteInk(color), '--nt-bg': color } as React.CSSProperties) : undefined;
  return (
    <span className={'nt-bubble nt-' + size + (placeholder ? ' placeholder' : '') + (song && text && size === 'sm' ? ' with-song' : '')} style={style}>
      {song ? <span className="nt-song">♪ {song}</span> : null}
      {text ? <span className="nt-text">{text}</span> : null}
      {showPlace ? (
        <span className="nt-place">
          <Icon name="location" size={size === 'lg' ? 13 : 10} />
          <span>{place}</span>
        </span>
      ) : null}
      <i className="nt-tail" aria-hidden="true" />
    </span>
  );
}

/* ---------- the row at the top of the inbox ---------- */

/** One face in the row: the bubble above, the name below. */
function NoteFace({ src, name, label, children, onClick, a11y, adding }: { src?: string | null; name: string; label: string; children: React.ReactNode; onClick: () => void; a11y: string; adding?: boolean }) {
  return (
    <button type="button" className="nt-face" onClick={onClick} aria-label={a11y}>
      <span className="nt-face-top">{children}</span>
      <span className="nt-face-pic">
        <Avatar src={src} name={name} size={64} />
        {adding ? (
          <span className="nt-add" aria-hidden="true">
            <Icon name="plus" size={11} stroke={3} />
          </span>
        ) : null}
      </span>
      <span className="nt-face-name">{label}</span>
    </button>
  );
}

/** The row of notes at the top of the inbox: yours first, then your friends'. */
export function NotesRow() {
  const { me } = useMe();
  const list = useNotes(me.id);
  const [editing, setEditing] = useState(false);
  const [viewing, setViewing] = useState<Note | null>(null);
  const mine = list?.find((n) => n.mine && live(n)) ?? null;
  const others = (list ?? []).filter((n) => !n.mine && live(n));
  return (
    <div className="nt-row" role="group" aria-label="Notes">
      <NoteFace src={me.avatar_url} name={me.username} label="Your note" onClick={() => setEditing(true)} adding={!mine} a11y={mine ? `Your note: ${noteWords(mine)}. Change or delete it` : 'Leave a note'}>
        {mine ? <NoteShape size="sm" text={mine.text} song={songLine(mine)} place={mine.place} color={mine.color} /> : <NoteShape size="sm" text="Note…" placeholder />}
      </NoteFace>
      {others.map((n) => (
        <NoteFace key={n.user_id} src={n.avatar_url} name={n.username} label={firstName(n)} onClick={() => setViewing(n)} a11y={`Note from ${n.full_name || n.username}: ${noteWords(n)}`}>
          <NoteShape size="sm" text={n.text} song={songLine(n)} place={n.place} color={n.color} />
        </NoteFace>
      ))}
      {editing ? <NoteEditor onClose={() => setEditing(false)} /> : null}
      {viewing ? <NoteCard note={viewing} onClose={() => setViewing(null)} /> : null}
    </div>
  );
}

/* ---------- over a profile picture ---------- */

/** The note bubble over a profile picture. Your own shows "Note…" and opens the editor; a friend's opens their note. */
export function NoteBubble({ userId, mine }: { userId: string; mine: boolean }) {
  const { me } = useMe();
  const list = useNotes(me.id);
  const [open, setOpen] = useState(false);
  const note = list?.find((n) => n.user_id === userId && live(n)) ?? null;
  if (!list || (!mine && !note)) return null;
  return (
    <span className="nt-anchor">
      <button type="button" className="nt-anchor-btn" onClick={() => setOpen(true)} aria-label={mine ? (note ? `Your note: ${noteWords(note)}. Change or delete it` : 'Leave a note') : `Note from ${note!.full_name || note!.username}: ${noteWords(note!)}`}>
        {note ? <NoteShape size="sm" text={note.text} song={songLine(note)} place={note.place} color={note.color} /> : <NoteShape size="sm" text="Note…" placeholder />}
      </button>
      {open && mine ? <NoteEditor onClose={() => setOpen(false)} /> : null}
      {open && !mine && note ? <NoteCard note={note} onClose={() => setOpen(false)} /> : null}
    </span>
  );
}

/* ---------- a friend's note ---------- */

/** A friend's note, larger, with their song playing for a moment and a way to reply in a chat. */
export function NoteCard({ note, onClose }: { note: Note; onClose: () => void }) {
  const player = usePlayer();
  const latest = useRef(player);
  latest.current = player;
  const [busy, setBusy] = useState(false);
  const songItem = note.song_id && note.song_url ? podItemOf(note) : null;

  // A short listen of the note's song with the app's player, as on the iPhone; it stops with the card.
  useEffect(() => {
    if (!songItem) return;
    const p = latest.current;
    if (!(p.item?.id === songItem.id && p.playing)) p.play(songItem);
    const stop = () => {
      const q = latest.current;
      if (q.item?.id === songItem.id && q.playing) q.toggle();
    };
    const timer = setTimeout(stop, PREVIEW_MS);
    return () => {
      clearTimeout(timer);
      stop();
    };
  }, [note.user_id]);

  const reply = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const tid = await openThread(note.user_id);
      setDraft(tid, `Replying to your note: ‘${noteWords(note)}’ `);
      onClose();
      nav('/direct/t/' + tid);
    } catch (e) {
      toastError(e);
      setBusy(false);
    }
  };
  const playing = !!songItem && player.item?.id === songItem.id && player.playing;
  return (
    <Modal onClose={onClose} className="nt-card">
      <button className="icon-btn nt-card-close" aria-label="Close" onClick={onClose}>
        <Icon name="close" size={20} />
      </button>
      <div className="nt-card-body">
        <span className="nt-card-face">
          <NoteShape size="lg" text={note.text} song={songLine(note)} place={note.place} color={note.color} />
          <Avatar src={note.avatar_url} name={note.username} size={88} />
        </span>
        <b className="nt-card-name">
          {note.full_name || note.username}
          {note.verified ? <Verified size={14} /> : null}
        </b>
        <span className="nt-card-meta">
          {agoLong(note.created_at)}
          {note.audience === 'close_friends' ? (
            <span className="nt-close-badge">
              <Icon name="star" size={11} fill="currentColor" /> Close friends
            </span>
          ) : null}
        </span>
        {songItem ? (
          <button type="button" className="nt-song-row" onClick={() => player.play(songItem)} aria-label={playing ? 'Pause song' : 'Play song'}>
            <span className="nt-song-cover">{note.song_cover ? <img src={note.song_cover} alt="" /> : <Icon name="music" size={18} />}</span>
            <span className="row-text">
              <b>{note.song_title}</b>
              <span>{note.song_artist}</span>
            </span>
            <Icon name={playing ? 'pause' : 'play'} size={18} />
          </button>
        ) : null}
        <button className="btn block big" onClick={reply} disabled={busy}>
          Reply to {firstName(note)}
        </button>
      </div>
    </Modal>
  );
}

/** A note's song as the player wants it. */
function podItemOf(n: Note): PodItem {
  return { id: n.song_id!, user_id: '', kind: 'song', title: n.song_title ?? '', artist: n.song_artist ?? '', description: '', cover_url: n.song_cover ?? '', audio_url: n.song_url ?? '', duration_seconds: 0, plays: 0, created_at: n.created_at, username: '', full_name: '', avatar_url: '', saved: false };
}

/* ---------- writing your note ---------- */

type Song = { id: string; title: string; artist: string; cover: string; url: string };

/** Writing or changing your note: words, a song from Pod, a place, the bubble's colour, and who sees it. */
export function NoteEditor({ onClose }: { onClose: () => void }) {
  const { me } = useMe();
  const list = useNotes(me.id);
  const player = usePlayer();
  const latest = useRef(player);
  latest.current = player;
  const existing = list?.find((n) => n.mine && live(n)) ?? null;
  const [text, setText] = useState(existing?.text ?? '');
  const [song, setSong] = useState<Song | null>(existing?.song_id ? { id: existing.song_id, title: existing.song_title ?? '', artist: existing.song_artist ?? '', cover: existing.song_cover ?? '', url: existing.song_url ?? '' } : null);
  const [place, setPlace] = useState(existing?.place ?? '');
  const [color, setColor] = useState(existing?.color ?? '');
  const [audience, setAudience] = useState<Note['audience']>(existing?.audience ?? 'mutuals');
  const [view, setView] = useState<'main' | 'music'>('main');
  const [busy, setBusy] = useState(false);
  const touched = useRef(false);
  // Songs previewed here, paused again when the editor closes.
  const previewed = useRef(new Set<string>());

  // The note may arrive after the editor opened (the row was still loading): fill it in, unless you've started.
  useEffect(() => {
    if (!existing || touched.current) return;
    setText(existing.text);
    setSong(existing.song_id ? { id: existing.song_id, title: existing.song_title ?? '', artist: existing.song_artist ?? '', cover: existing.song_cover ?? '', url: existing.song_url ?? '' } : null);
    setPlace(existing.place);
    setColor(existing.color);
    setAudience(existing.audience);
  }, [existing?.created_at]);

  useEffect(
    () => () => {
      const p = latest.current;
      if (p.item && previewed.current.has(p.item.id) && p.playing) p.toggle();
    },
    [],
  );

  const touch = () => (touched.current = true);
  const canShare = (text.trim().length > 0 || !!song) && !busy;

  const share = async () => {
    if (!canShare) return;
    setBusy(true);
    try {
      await saveNote(me.id, text, audience, { song_id: song?.id ?? null, place, color });
      await refreshNotes(me.id);
      toast('Note shared');
      onClose();
    } catch (e) {
      toastError(e);
      setBusy(false);
    }
  };
  const remove = async () => {
    if (busy || !(await ask('Delete your note?', 'Your friends will no longer see it.', 'Delete'))) return;
    setBusy(true);
    try {
      await deleteNote(me.id);
      await refreshNotes(me.id);
      toast('Note deleted');
      onClose();
    } catch (e) {
      toastError(e);
      setBusy(false);
    }
  };

  if (view === 'music') {
    return (
      <Modal onClose={onClose} className="nt-editor" title="Music">
        <SongPicker
          chosen={song?.id ?? null}
          onBack={() => setView('main')}
          onPreview={(id) => previewed.current.add(id)}
          onPick={(s) => {
            touch();
            setSong(s);
            setView('main');
          }}
        />
      </Modal>
    );
  }

  const ink = noteInk(color);
  return (
    <Modal onClose={onClose} className="nt-editor" title={existing ? 'Your note' : 'New note'}>
      <div className="nt-editor-body">
        <div className="nt-compose">
          <span className="nt-bubble nt-lg nt-input-bubble" style={color ? ({ background: color, color: ink, '--nt-bg': color } as React.CSSProperties) : undefined}>
            {song ? <span className="nt-song">♪ {song.title}{song.artist ? ` · ${song.artist}` : ''}</span> : null}
            <textarea
              autoFocus
              rows={2}
              value={text}
              maxLength={NOTE_MAX}
              placeholder="Share a thought…"
              aria-label="Your note"
              onChange={(e) => {
                touch();
                setText(e.target.value.replace(/\n/g, ' ').slice(0, NOTE_MAX));
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  share();
                }
              }}
            />
            {place ? (
              <span className="nt-place">
                <Icon name="location" size={13} />
                <span>{place}</span>
              </span>
            ) : null}
            <i className="nt-tail" aria-hidden="true" />
          </span>
          <Avatar src={me.avatar_url} name={me.username} size={88} />
          <span className="nt-count" aria-live="polite">
            {text.length}/{NOTE_MAX}
          </span>
        </div>

        <div className="nt-field">
          <span className="nt-label">Bubble colour</span>
          <span className="nt-swatches" role="radiogroup" aria-label="Bubble colour">
            {NOTE_COLORS.map((c) => (
              <button
                key={c.label}
                type="button"
                role="radio"
                aria-checked={color === c.value}
                aria-label={c.label}
                title={c.label}
                className={'nt-swatch' + (color === c.value ? ' on' : '') + (c.value ? '' : ' theme')}
                style={c.value ? { background: c.value } : undefined}
                onClick={() => {
                  touch();
                  setColor(c.value);
                }}
              />
            ))}
          </span>
        </div>

        <button type="button" className="nt-option" onClick={() => setView('music')}>
          <span className={'nt-option-icon' + (song ? ' on' : '')}>
            <Icon name="music" size={18} />
          </span>
          <span className="row-text">
            <b>Music</b>
            <span>{song ? `${song.title}${song.artist ? ' · ' + song.artist : ''}` : 'Add a song from Pod'}</span>
          </span>
          {song ? (
            <span
              role="button"
              tabIndex={0}
              className="link-btn danger"
              onClick={(e) => {
                e.stopPropagation();
                touch();
                setSong(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.stopPropagation();
                  touch();
                  setSong(null);
                }
              }}
            >
              Remove
            </span>
          ) : (
            <Icon name="right" size={16} />
          )}
        </button>

        <label className="nt-option">
          <span className={'nt-option-icon' + (place ? ' on' : '')}>
            <Icon name="location" size={18} />
          </span>
          <span className="row-text">
            <b>Location</b>
            <input
              value={place}
              maxLength={PLACE_MAX}
              placeholder="Add a place"
              aria-label="Location"
              onChange={(e) => {
                touch();
                setPlace(e.target.value.replace(/\n/g, ' ').slice(0, PLACE_MAX));
              }}
            />
          </span>
          {place ? <span className="nt-count small">{place.length}/{PLACE_MAX}</span> : null}
        </label>

        <div className="nt-field">
          <span className="nt-label">Share with</span>
          <div className="nt-audience" role="radiogroup" aria-label="Share with">
            {(
              [
                { value: 'mutuals', label: 'Mutual followers', sub: 'Followers you follow back', icon: 'people' },
                { value: 'close_friends', label: 'Close friends', sub: 'Only your close friends list', icon: 'star' },
              ] as const
            ).map((o) => (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={audience === o.value}
                className={'nt-aud' + (audience === o.value ? ' on' : '') + (o.value === 'close_friends' ? ' close' : '')}
                onClick={() => {
                  touch();
                  setAudience(o.value);
                }}
              >
                <span className="nt-aud-icon">
                  <Icon name={o.icon} size={16} fill={o.value === 'close_friends' ? 'currentColor' : undefined} />
                </span>
                <span className="row-text">
                  <b>{o.label}</b>
                  <span>{o.sub}</span>
                </span>
                <span className="nt-radio" aria-hidden="true" />
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="nt-editor-foot">
        <span className="muted-text">Notes disappear after 24 hours</span>
        <span className="grow" />
        {existing ? (
          <button type="button" className="btn quiet" disabled={busy} onClick={remove}>
            Delete note
          </button>
        ) : null}
        <button type="button" className="btn" disabled={!canShare} onClick={share}>
          Share
        </button>
      </div>
    </Modal>
  );
}

/** A song from Pod: search, listen for a moment, choose. */
function SongPicker({ chosen, onPick, onBack, onPreview }: { chosen: string | null; onPick: (s: Song | null) => void; onBack: () => void; onPreview: (id: string) => void }) {
  const player = usePlayer();
  const [q, setQ] = useState('');
  const [songs, setSongs] = useState<PodItem[] | null>(null);
  useEffect(() => {
    let alive = true;
    const t = setTimeout(
      () =>
        fetchPod('song', q).then(
          (r) => alive && setSongs(r),
          (e) => {
            if (!alive) return;
            setSongs([]);
            toastError(e);
          },
        ),
      q ? 220 : 0,
    );
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q]);
  return (
    <div className="nt-songs">
      <div className="nt-songs-search">
        <button type="button" className="icon-btn" aria-label="Back" onClick={onBack}>
          <Icon name="back" size={20} />
        </button>
        <span className="mx-search">
          <Icon name="search" size={16} />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search songs on Pod" aria-label="Search songs on Pod" />
        </span>
      </div>
      <div className="nt-songs-list">
        {songs === null ? <Spinner /> : null}
        {songs && !songs.length ? <p className="muted-text pad center">No songs found</p> : null}
        {chosen && songs?.length ? (
          <button type="button" className="nt-song-pick" onClick={() => onPick(null)}>
            <span className="nt-song-cover">
              <Icon name="mute" size={18} />
            </span>
            <span className="row-text">
              <b className="danger-text">No music</b>
            </span>
          </button>
        ) : null}
        {(songs ?? []).map((s) => {
          const on = chosen === s.id;
          const playing = player.item?.id === s.id && player.playing;
          return (
            <div key={s.id} className={'nt-song-pick' + (on ? ' on' : '')}>
              <button
                type="button"
                className="nt-song-cover"
                aria-label={(playing ? 'Pause ' : 'Preview ') + s.title}
                onClick={() => {
                  onPreview(s.id);
                  player.play(s);
                }}
              >
                {s.cover_url ? <img src={s.cover_url} alt="" /> : null}
                <span className="nt-song-play">
                  <Icon name={playing ? 'pause' : 'play'} size={16} color="#fff" />
                </span>
              </button>
              <button type="button" className="nt-song-choose" onClick={() => onPick({ id: s.id, title: s.title, artist: s.artist, cover: s.cover_url, url: s.audio_url })} aria-label={`Choose ${s.title} by ${s.artist}`}>
                <span className="row-text">
                  <b>{s.title}</b>
                  <span>
                    {s.artist}
                    {s.duration_seconds ? ` · ${clock(s.duration_seconds)}` : ''}
                  </span>
                </span>
                {on ? <Icon name="check" size={20} stroke={2.4} /> : null}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
