// The Bible, from the iPhone app (app/(app)/bible.tsx, bible/[book].tsx, bible-marks.tsx and
// src/components/BibleMarks.tsx), laid out for a wide window: the books on the left; on the right
// the verse of the day, a chapter to read, or your highlights and notes.
//
// Reading: click a verse to choose it, shift-click to choose a run of verses. A bar then offers the
// five highlight colours, a note, copy, send to people and post. Highlights and notes are private
// and kept in the database (community_bible_marks), so they follow you to the iPhone app.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { fetchBibleMarks, peopleToMessage, sendToPeople, setBibleColor, setBibleNote } from 'shared/api';
import { BOOKS, TRANSLATIONS, type BibleSettings, type Chapter, type TranslationId, cachedChapters, fetchChapter, loadBibleSettings, parseReference, saveBibleSettings, verseRef } from 'shared/bible';
import { setPrefs, usePrefs } from 'shared/prefs';
import { ago } from 'shared/theme';
import type { BibleMark, BibleMarkColor, Profile } from 'shared/types';
import { type CreateRequest, openCreate } from '../lib/create';
import { useMe } from '../lib/me';
import { nav, useRoute } from '../lib/router';
import { Avatar, Empty, Failed, Icon, Modal, Spinner, ask, toast, toastError, useLoad, useOutside } from '../ui/kit';
import '../styles/church.css';

/* ---------- highlight colours ---------- */

/** The five highlight colours, in the order offered (as on the iPhone). The tints are in church.css. */
export const MARK_COLORS: { id: Exclude<BibleMarkColor, ''>; label: string }[] = [
  { id: 'yellow', label: 'Yellow' },
  { id: 'green', label: 'Green' },
  { id: 'blue', label: 'Blue' },
  { id: 'pink', label: 'Pink' },
  { id: 'purple', label: 'Purple' },
];

/** Copies text to the clipboard (or the older way where the clipboard API isn't allowed). False if it couldn't. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const area = document.createElement('textarea');
      area.value = text;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      const done = document.execCommand('copy');
      area.remove();
      return done;
    } catch {
      return false;
    }
  }
}

/** "Psalms 23" on screen as "Psalm 23", as people say it. */
const spoken = (book: string) => (book === 'Psalms' ? 'Psalm' : book);
const bibleLink = (book: string, chapter: number, verse?: number) => `/bible/${encodeURIComponent(book)}/${chapter}${verse ? `?v=${verse}` : ''}`;

/* ---------- verse of the day ---------- */

/** Well-loved, encouraging verses, the iPhone app's list: [book, chapter, first verse, last verse]. */
const DAILY: [string, number, number, number?][] = [
  ['John', 3, 16], ['Jeremiah', 29, 11], ['Philippians', 4, 13], ['Psalms', 23, 1, 3], ['Isaiah', 41, 10], ['Romans', 8, 28], ['Proverbs', 3, 5, 6],
  ['Exodus', 20, 8], ['Joshua', 1, 9], ['Matthew', 11, 28, 29], ['Isaiah', 40, 31], ['Psalms', 46, 1], ['Romans', 15, 13], ['2 Corinthians', 5, 17],
  ['Lamentations', 3, 22, 23], ['Psalms', 119, 105], ['Matthew', 6, 33], ['Hebrews', 11, 1], ['Mark', 2, 27], ['Galatians', 5, 22, 23], ['Ephesians', 2, 8, 9],
  ['Psalms', 27, 1], ['Philippians', 4, 6, 7], ['Psalms', 34, 18], ['Psalms', 37, 4], ['John', 14, 1, 3], ['Psalms', 55, 22], ['Psalms', 91, 1, 2],
  ['Psalms', 121, 1, 2], ['Psalms', 139, 14], ['Proverbs', 18, 10], ['Isaiah', 26, 3], ['Isaiah', 43, 2], ['Micah', 6, 8], ['Zephaniah', 3, 17],
  ['Matthew', 5, 16], ['Revelation', 14, 12], ['John', 14, 27], ['John', 16, 33], ['Romans', 5, 8], ['Romans', 12, 2], ['Romans', 12, 12],
  ['2 Corinthians', 12, 9], ['Galatians', 6, 9], ['Ephesians', 3, 20], ['Philippians', 1, 6], ['Colossians', 3, 23], ['1 Thessalonians', 5, 16, 18],
  ['2 Timothy', 1, 7], ['Hebrews', 13, 8], ['James', 1, 5], ['1 Peter', 5, 7], ['1 John', 1, 9], ['Revelation', 21, 4], ['Deuteronomy', 31, 6],
  ['Numbers', 6, 24, 26], ['Nahum', 1, 7], ['Psalms', 30, 5], ['Isaiah', 40, 8], ['Psalms', 46, 10], ['1 Corinthians', 13, 13], ['Matthew', 28, 20],
];

type DailyVerse = { book: string; chapter: number; from: number; to: number; ref: string };

/** Today's verse: the same for everyone on the same calendar day, changing at the member's own midnight. */
export function verseFor(date: Date): DailyVerse {
  const day = Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400e3);
  const [book, chapter, from, to = from] = DAILY[day % DAILY.length];
  return { book, chapter, from, to, ref: `${spoken(book)} ${chapter}:${from}${to > from ? `–${to}` : ''}` };
}

function VerseCard({ translation }: { translation: TranslationId }) {
  const verse = verseFor(new Date());
  const [text, setText] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [menu, setMenu] = useState(false);
  const [send, setSend] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useOutside(menuRef, () => setMenu(false), menu);
  // The words come from the app's own Bible, in the reader's translation.
  useEffect(() => {
    let live = true;
    setText(null);
    setFailed(false);
    fetchChapter(verse.book, verse.chapter, translation)
      .then((c) => {
        const words = c.verses.filter((v) => v.verse >= verse.from && v.verse <= verse.to).map((v) => v.text).join(' ').trim();
        if (!words) throw new Error('missing');
        if (live) setText(words);
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [verse.ref, translation]);
  const quote = text ? `“${text}” — ${verse.ref} (${translation.toUpperCase()})` : '';
  return (
    <section className="ch-votd" aria-label="Verse of the day">
      <div className="ch-votd-head">
        <span>Verse of the day</span>
        <div className="ch-menu-wrap" ref={menuRef}>
          <button className="icon-btn tiny" aria-label="Verse of the day options" aria-expanded={menu} onClick={() => setMenu(!menu)}>
            <Icon name="more" size={20} />
          </button>
          {menu ? (
            <div className="popover ch-pop" role="menu">
              <button role="menuitem" disabled={!text} onClick={() => { setMenu(false); copyText(quote).then((ok) => toast(ok ? 'Copied' : "The verse couldn't be copied")); }}>
                <Icon name="copy" size={18} /> Copy
              </button>
              <button
                role="menuitem"
                onClick={() => {
                  setMenu(false);
                  setPrefs({ dailyVerse: false });
                  toast("You can turn it back on in the Bible's menu");
                }}
              >
                <Icon name="close" size={18} /> Hide verse of the day
              </button>
            </div>
          ) : null}
        </div>
      </div>
      <blockquote className="ch-votd-text">{text ? `“${text}”` : failed ? 'Open it to read today’s verse.' : '…'}</blockquote>
      <p className="ch-votd-ref">
        {verse.ref}
        {text ? <span> {translation.toUpperCase()}</span> : null}
      </p>
      <div className="ch-votd-actions">
        <button className="ch-chip-btn" disabled={!text} onClick={() => setSend(true)}>
          <Icon name="send" size={16} /> Share
        </button>
        <button className="ch-chip-btn" onClick={() => nav(bibleLink(verse.book, verse.chapter, verse.from))}>
          <Icon name="book" size={16} /> Read the chapter
        </button>
      </div>
      {send ? <SendText title="Send verse" text={quote} onClose={() => setSend(false)} /> : null}
    </section>
  );
}

/* ---------- sending words to people (verses, a post's link, a track) ---------- */

/** Sends `text` to the people you choose, one chat each, with an optional message after it. */
export function SendText({ title, text, onClose }: { title: string; text: string; onClose: () => void }) {
  const { me } = useMe();
  const [people, setPeople] = useState<Profile[] | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [q, setQ] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    peopleToMessage(me.id).then(setPeople, (e) => {
      toastError(e);
      setPeople([]);
    });
  }, []);
  const needle = q.trim().toLowerCase();
  const shown = (people ?? []).filter((p) => !needle || p.username.includes(needle) || p.full_name.toLowerCase().includes(needle));
  const send = async () => {
    setBusy(true);
    try {
      await sendToPeople(me.id, picked, { text });
      if (note.trim()) await sendToPeople(me.id, picked, { text: note });
      toast(picked.length === 1 ? 'Sent' : `Sent to ${picked.length} people`);
      onClose();
    } catch (e) {
      toastError(e);
      setBusy(false);
    }
  };
  return (
    <Modal onClose={onClose} title={title} className="share">
      <p className="ch-send-preview">{text}</p>
      <div className="share-search">
        <span>To:</span>
        <input autoFocus placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search people" />
      </div>
      <div className="share-list">
        {people === null ? <Spinner /> : null}
        {people && !shown.length ? <p className="muted-text pad">No account found.</p> : null}
        {shown.map((p) => (
          <label key={p.id} className="row">
            <Avatar src={p.avatar_url} name={p.username} size={44} />
            <span className="row-text">
              <b>{p.full_name || p.username}</b>
              <span>{p.username}</span>
            </span>
            <input type="checkbox" className="round-check" aria-label={'Send to ' + p.username} checked={picked.includes(p.id)} onChange={(e) => setPicked(e.target.checked ? [...picked, p.id] : picked.filter((x) => x !== p.id))} />
          </label>
        ))}
      </div>
      {picked.length ? <input className="share-note" placeholder="Write a message…" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Message" /> : null}
      <div className="modal-foot">
        <button className="btn block" disabled={!picked.length || busy} onClick={send}>
          {busy ? 'Sending…' : 'Send'}
        </button>
      </div>
    </Modal>
  );
}

/* ---------- the page ---------- */

export function Bible({ book, chapter }: { book?: string; chapter?: string }) {
  const [settings, setSettings] = useState<BibleSettings | null>(null);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const { dailyVerse } = usePrefs();
  const menuRef = useRef<HTMLDivElement>(null);
  const page = useRef<HTMLElement>(null);
  useOutside(menuRef, () => setMenu(false), menu);
  useEffect(() => {
    loadBibleSettings().then(setSettings);
  }, []);
  const name = book ? decodeURIComponent(book) : '';
  const marksPage = name === 'marks';
  const current = name && !marksPage ? BOOKS.find((b) => b.name === name) : undefined;
  const ch = Math.max(1, Math.min(current?.chapters ?? 1, Number(chapter) || 1));
  useEffect(() => {
    if (current) setOpen(current.name);
  }, [current?.name]);
  // Today and Highlights & notes start at their top; a chapter scrolls itself (to the top, or to a verse).
  useEffect(() => {
    if (!current) page.current?.scrollTo({ top: 0 });
  }, [name]);
  // A functional update, so a change landing late (the chapter just read) can't undo a newer one.
  const change = (patch: Partial<BibleSettings>) =>
    setSettings((s) => {
      if (!s) return s;
      const next = { ...s, ...patch };
      saveBibleSettings(next);
      return next;
    });
  const go = (b: string, c: number) => nav(bibleLink(b, c));

  let detail: React.ReactNode;
  if (!settings) detail = <Spinner />;
  else if (marksPage) detail = <BibleMarks translation={settings.translation} />;
  else if (current) detail = <Reader key={current.name + ch} book={current.name} chapter={ch} settings={settings} onSettings={change} page={page} />;
  else if (name) detail = <Empty icon="bible" title="That book isn't in the Bible" body="Choose a book on the left, or type a reference like John 3." />;
  else detail = <BibleHome settings={settings} dailyVerse={dailyVerse} />;

  return (
    <div className="split-page">
      <section className="split-list">
        <header>
          <div className="ch-list-head">
            <h1>Bible</h1>
            <div className="ch-menu-wrap" ref={menuRef}>
              <button className="icon-btn" aria-label="Bible options" aria-expanded={menu} onClick={() => setMenu(!menu)}>
                <Icon name="more" size={22} />
              </button>
              {menu ? (
                <div className="popover ch-pop" role="menu">
                  <label className="ch-pop-row" role="menuitemcheckbox" aria-checked={dailyVerse}>
                    <Icon name="sparkle" size={18} />
                    <span className="grow">Verse of the day</span>
                    <input type="checkbox" role="switch" aria-label="Verse of the day" checked={dailyVerse} onChange={(e) => setPrefs({ dailyVerse: e.target.checked })} />
                    <i className="switch" />
                  </label>
                  <button role="menuitem" onClick={() => { setMenu(false); nav('/bible/marks'); }}>
                    <Icon name="compose" size={18} /> Highlights &amp; notes
                  </button>
                </div>
              ) : null}
            </div>
          </div>
          <form
            className="panel-search in-modal"
            onSubmit={(e) => {
              e.preventDefault();
              const ref = parseReference(q);
              if (ref) go(ref.book, ref.chapter);
              else toastError(new Error('Type a book and chapter, like John 3 or Psalm 23.'));
            }}
          >
            <input placeholder="Go to, e.g. John 3" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Go to a passage" />
          </form>
        </header>
        <div className="split-scroll">
          <button className={'hymn-row book' + (!name ? ' on' : '')} onClick={() => nav('/bible')}>
            <span className="hymn-no small">
              <Icon name="sparkle" size={18} />
            </span>
            <span className="row-text">
              <b>Today</b>
              <span>Verse of the day and where you left off</span>
            </span>
          </button>
          <button className={'hymn-row book' + (marksPage ? ' on' : '')} onClick={() => nav('/bible/marks')}>
            <span className="hymn-no small">
              <Icon name="compose" size={18} />
            </span>
            <span className="row-text">
              <b>Highlights &amp; notes</b>
              <span>Verses you marked</span>
            </span>
          </button>
          {(['old', 'new'] as const).map((t) => (
            <React.Fragment key={t}>
              <h3 className="list-h">{t === 'old' ? 'Old Testament' : 'New Testament'}</h3>
              {BOOKS.filter((b) => b.testament === t).map((b) => (
                <div key={b.name}>
                  <button className={'hymn-row book' + (current?.name === b.name ? ' on' : '')} aria-expanded={open === b.name} onClick={() => setOpen(open === b.name ? null : b.name)}>
                    <span className="row-text">
                      <b>{b.name}</b>
                    </span>
                    <Icon name={open === b.name ? 'down' : 'right'} size={14} />
                  </button>
                  {open === b.name ? (
                    <div className="chapter-grid">
                      {Array.from({ length: b.chapters }, (_, i) => (
                        <button key={i} className={current?.name === b.name && ch === i + 1 ? 'on' : ''} aria-label={`${b.name} ${i + 1}`} onClick={() => go(b.name, i + 1)}>
                          {i + 1}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </React.Fragment>
          ))}
        </div>
      </section>
      <section className="split-detail ch-bible-detail" ref={page}>
        {detail}
      </section>
    </div>
  );
}

/* ---------- home: verse of the day, continue reading ---------- */

function BibleHome({ settings, dailyVerse }: { settings: BibleSettings; dailyVerse: boolean }) {
  const last = settings.last;
  return (
    <div className="ch-home">
      {dailyVerse ? <VerseCard translation={settings.translation} /> : null}
      {last ? (
        <button className="ch-card-row" onClick={() => nav(bibleLink(last.book, last.chapter))}>
          <Icon name="bookmark" size={22} className="ch-accent" />
          <span className="row-text">
            <span>Continue reading</span>
            <b>
              {last.book} {last.chapter}
            </b>
          </span>
          <Icon name="right" size={16} />
        </button>
      ) : null}
      <button className="ch-card-row" onClick={() => nav('/bible/marks')}>
        <Icon name="compose" size={22} className="ch-accent" />
        <span className="row-text">
          <b>Highlights &amp; notes</b>
        </span>
        <Icon name="right" size={16} />
      </button>
      <p className="ch-foot">King James Version and World English Bible, both public domain. Chapters you open stay available offline. Choose a book on the left to start reading.</p>
    </div>
  );
}

/* ---------- reading a chapter ---------- */

/** This chapter's marks by verse. `null` is a mark just taken off here, so a slower load doesn't bring it back. */
type Marks = Record<number, BibleMark | null>;

function Reader({ book, chapter, settings, onSettings, page }: { book: string; chapter: number; settings: BibleSettings; onSettings: (p: Partial<BibleSettings>) => void; page: React.RefObject<HTMLElement | null> }) {
  const { me } = useMe();
  const route = useRoute();
  const [text, setText] = useState<Chapter | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [tick, setTick] = useState(0);
  const [selected, setSelected] = useState<number[]>([]);
  const anchor = useRef<number | null>(null);
  const [marks, setMarks] = useState<Marks>({});
  const [noteFor, setNoteFor] = useState<number | null>(null);
  const [sending, setSending] = useState<string | null>(null);
  const [flash, setFlash] = useState<number | null>(null);
  const meta = BOOKS.find((b) => b.name === book)!;
  // Opened from Highlights & notes or a verse link (?v=16): scroll to it and mark it for a moment.
  const target = Number(new URLSearchParams(route.split('?')[1] ?? '').get('v')) || 0;

  useEffect(() => {
    let live = true;
    setText(null);
    setError(null);
    fetchChapter(book, chapter, settings.translation).then(
      (c) => {
        if (!live) return;
        setText(c);
        if (!target) page.current?.scrollTo({ top: 0 });
        onSettings({ last: { book, chapter } });
      },
      (e) => live && setError(e),
    );
    return () => {
      live = false;
    };
  }, [settings.translation, tick]);

  // My highlights and notes on this chapter. Changes made before they arrive win.
  useEffect(() => {
    let live = true;
    fetchBibleMarks(me.id, { book, chapter })
      .then((rows) => live && setMarks((mine) => ({ ...Object.fromEntries(rows.map((m) => [m.verse, m])), ...mine })))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (!text || !target) return;
    const el = page.current?.querySelector(`[data-verse="${target}"]`);
    el?.scrollIntoView({ block: 'center' });
    setFlash(target);
    const t = setTimeout(() => setFlash(null), 1800);
    return () => clearTimeout(t);
  }, [text, target]);

  // Escape lets go of the chosen verses (unless a dialog is open; it closes first).
  useEffect(() => {
    if (!selected.length) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('.scrim')) setSelected([]);
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [selected.length]);

  const markOf = (verse: number) => marks[verse] ?? null;

  /** Click chooses a verse or lets it go; shift-click chooses every verse from the last one clicked. */
  const pick = (verse: number, shift: boolean) => {
    if (shift && anchor.current !== null) {
      const [a, b] = anchor.current < verse ? [anchor.current, verse] : [verse, anchor.current];
      const run = Array.from({ length: b - a + 1 }, (_, i) => a + i);
      setSelected((s) => [...new Set([...s, ...run])].sort((x, y) => x - y));
    } else {
      setSelected((s) => (s.includes(verse) ? s.filter((x) => x !== verse) : [...s, verse].sort((x, y) => x - y)));
    }
    anchor.current = verse;
  };

  /** A mark as it will be after a change, or null when it has neither a colour nor a note. */
  const patched = (verse: number, patch: { color?: BibleMarkColor; note?: string }): BibleMark | null => {
    const old = markOf(verse);
    const color = patch.color ?? old?.color ?? '';
    const note = patch.note ?? old?.note ?? '';
    if (!color && !note) return null;
    return { user_id: me.id, translation: settings.translation, book, chapter, verse, color, note, updated_at: new Date().toISOString() };
  };

  /** After a failed write: those verses as they were before it, and nothing else. */
  const putBack = (verses: number[]) => {
    const prior = verses.map((v) => [v, marks[v]] as const);
    return () =>
      setMarks((m) => {
        const next = { ...m };
        for (const [v, old] of prior) {
          if (old === undefined) delete next[v];
          else next[v] = old;
        }
        return next;
      });
  };

  const colour = (color: BibleMarkColor) => {
    if (!selected.length) return;
    const verses = [...selected];
    const undo = putBack(verses);
    setMarks((m) => ({ ...m, ...Object.fromEntries(verses.map((v) => [v, patched(v, { color })])) }));
    setSelected([]);
    setBibleColor(me.id, settings.translation, book, chapter, verses, color).catch((e) => {
      undo();
      toastError(e);
    });
  };

  const saveNote = (verse: number, raw: string) => {
    const note = raw.trim().slice(0, 2000);
    const undo = putBack([verse]);
    setMarks((m) => ({ ...m, [verse]: patched(verse, { note }) }));
    setNoteFor(null);
    setSelected([]);
    setBibleNote(me.id, settings.translation, book, chapter, verse, note).then(
      () => toast(note ? 'Note saved' : 'Note deleted'),
      (e) => {
        undo();
        toastError(e);
      },
    );
  };

  /** The chosen verses as a quotation with its reference. */
  const quote = () => {
    const words = (text?.verses ?? []).filter((v) => selected.includes(v.verse)).map((v) => v.text).join(' ');
    return `“${words}” — ${verseRef(book, chapter, selected)} (${settings.translation.toUpperCase()})`;
  };
  const copy = async () => {
    const ok = await copyText(quote());
    setSelected([]);
    toast(ok ? 'Copied' : "The verses couldn't be copied");
  };
  const share = () => {
    setSending(quote());
    setSelected([]);
  };
  // As on the iPhone, Post starts a new post with the verses as its caption. Create on the desktop
  // starts from a photo, so the verses also go on the clipboard to paste into the caption.
  const post = async () => {
    const q = quote();
    setSelected([]);
    await copyText(q);
    openCreate({ mode: 'post', text: q } as CreateRequest & { text: string });
    toast('The verses are copied. Paste them into your caption.');
  };
  const note = () => {
    if (selected.length !== 1) {
      toast('Choose one verse to write a note');
      return;
    }
    setNoteFor(selected[0]);
  };

  // The colour all the chosen verses share, if they do, so the bar can show it as chosen.
  const shared = selected.length ? markOf(selected[0])?.color ?? '' : '';
  const active = shared && selected.every((v) => markOf(v)?.color === shared) ? shared : null;

  const at = BOOKS.findIndex((b) => b.name === book);
  const prevRef = chapter > 1 ? { book, chapter: chapter - 1 } : at > 0 ? { book: BOOKS[at - 1].name, chapter: BOOKS[at - 1].chapters } : null;
  const nextRef = chapter < meta.chapters ? { book, chapter: chapter + 1 } : at < BOOKS.length - 1 ? { book: BOOKS[at + 1].name, chapter: 1 } : null;
  const size = settings.size ?? 18;
  const noteVerse = noteFor === null ? null : text?.verses.find((v) => v.verse === noteFor) ?? null;

  return (
    <article className="reader ch-reader" style={{ fontSize: size }}>
      <div className="reader-bar">
        <h1>
          {book} {chapter}
        </h1>
        <span className="grow" />
        <select value={settings.translation} onChange={(e) => onSettings({ translation: e.target.value as TranslationId })} aria-label="Translation">
          {TRANSLATIONS.map((t) => (
            <option key={t.id} value={t.id}>
              {t.short}
            </option>
          ))}
        </select>
        <button className="btn quiet small" aria-label="Smaller text" onClick={() => onSettings({ size: Math.max(14, size - 2) })}>
          A−
        </button>
        <button className="btn quiet small" aria-label="Larger text" onClick={() => onSettings({ size: Math.min(30, size + 2) })}>
          A+
        </button>
      </div>
      <p className="ch-translation">{TRANSLATIONS.find((t) => t.id === settings.translation)?.name}</p>
      {error ? (
        <Failed error={error} retry={() => setTick((t) => t + 1)} />
      ) : !text ? (
        <Spinner />
      ) : (
        <div className="ch-verses" aria-label={`${book} ${chapter}`}>
          {text.verses.map((v) => {
            const m = markOf(v.verse);
            const on = selected.includes(v.verse);
            return (
              <div
                key={v.verse}
                data-verse={v.verse}
                role="button"
                tabIndex={0}
                aria-pressed={on}
                className={'ch-verse' + (m?.color ? ' ch-mark-' + m.color : '') + (on ? ' on' : '') + (flash === v.verse ? ' flash' : '')}
                onMouseDown={(e) => e.shiftKey && e.preventDefault()}
                onClick={(e) => pick(v.verse, e.shiftKey)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    pick(v.verse, e.shiftKey);
                  }
                }}
              >
                <sup>{v.verse}</sup>
                {m?.note ? (
                  <button
                    className="ch-note-mark"
                    aria-label={'Open note on verse ' + v.verse}
                    title={m.note}
                    onClick={(e) => {
                      e.stopPropagation();
                      setNoteFor(v.verse);
                    }}
                  >
                    <Icon name="compose" size={Math.round(size * 0.8)} />
                  </button>
                ) : null}
                {v.text}
              </div>
            );
          })}
        </div>
      )}
      <div className="reader-nav">
        <button className="btn quiet" disabled={!prevRef} onClick={() => prevRef && nav(bibleLink(prevRef.book, prevRef.chapter))}>
          ← {prevRef ? (prevRef.book === book ? `Chapter ${prevRef.chapter}` : `${prevRef.book} ${prevRef.chapter}`) : 'Previous'}
        </button>
        <button className="btn quiet" disabled={!nextRef} onClick={() => nextRef && nav(bibleLink(nextRef.book, nextRef.chapter))}>
          {nextRef ? (nextRef.book === book ? `Chapter ${nextRef.chapter}` : `${nextRef.book} ${nextRef.chapter}`) : 'Next'} →
        </button>
      </div>
      {selected.length && text ? <MarkBar reference={verseRef(book, chapter, selected)} active={active} single={selected.length === 1} onColor={colour} onNote={note} onCopy={copy} onShare={share} onPost={post} onClose={() => setSelected([])} /> : null}
      {noteFor !== null ? <NoteDialog reference={verseRef(book, chapter, [noteFor])} verseText={noteVerse?.text ?? ''} initial={markOf(noteFor)?.note ?? ''} onClose={() => setNoteFor(null)} onSave={(n) => saveNote(noteFor, n)} /> : null}
      {sending ? <SendText title="Send verses" text={sending} onClose={() => setSending(null)} /> : null}
    </article>
  );
}

/** The bar that rises while verses are chosen: the colours, then Note, Copy, Share and Post. */
function MarkBar({ reference, active, single, onColor, onNote, onCopy, onShare, onPost, onClose }: { reference: string; active: BibleMarkColor | null; single: boolean; onColor: (c: BibleMarkColor) => void; onNote: () => void; onCopy: () => void; onShare: () => void; onPost: () => void; onClose: () => void }) {
  return (
    <div className="ch-markbar" role="toolbar" aria-label={'Chosen verses: ' + reference}>
      <div className="ch-markbar-top">
        <b className="ch-markbar-ref">{reference}</b>
        <button className="icon-btn tiny ch-markbar-close" aria-label="Clear selection" title="Clear selection (Esc)" onClick={onClose}>
          <Icon name="close" size={16} />
        </button>
      </div>
      <div className="ch-markbar-row">
        <div className="ch-dots">
          {MARK_COLORS.map((c) => (
            <button key={c.id} className={'ch-dot ch-dot-' + c.id + (active === c.id ? ' on' : '')} aria-label={c.label} aria-pressed={active === c.id} title={c.label} onClick={() => onColor(c.id)} />
          ))}
          <button className="ch-dot ch-dot-none" aria-label="No colour" title="No colour" onClick={() => onColor('')} />
        </div>
        <span className="ch-markbar-line" />
        <button className={'ch-bar-action' + (single ? '' : ' dim')} onClick={onNote} title={single ? 'Write a note' : 'Choose one verse to write a note'}>
          <Icon name="compose" size={18} /> Note
        </button>
        <button className="ch-bar-action" onClick={onCopy}>
          <Icon name="copy" size={18} /> Copy
        </button>
        <button className="ch-bar-action" onClick={onShare}>
          <Icon name="send" size={18} /> Share
        </button>
        <button className="ch-bar-action" onClick={onPost}>
          <Icon name="pluscircle" size={18} /> Post
        </button>
      </div>
    </div>
  );
}

/** Writing or changing the note on one verse. Saving an empty note, or Delete, takes the note off. */
function NoteDialog({ reference, verseText, initial, onClose, onSave }: { reference: string; verseText: string; initial: string; onClose: () => void; onSave: (note: string) => void }) {
  const [text, setText] = useState(initial);
  const changed = text.trim() !== initial.trim();
  return (
    <Modal onClose={onClose} title={reference} className="ch-note-dialog">
      <div className="form-pad">
        {verseText ? <p className="ch-note-verse">{verseText}</p> : null}
        <textarea className="ch-note-input" value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} rows={6} placeholder="Write a note…" aria-label="Note" autoFocus={!initial} />
        <div className="ch-dialog-actions">
          {initial ? (
            <button className="btn quiet" onClick={() => onSave('')}>
              Delete
            </button>
          ) : null}
          <button className="btn grow" disabled={!changed || (!initial && !text.trim())} onClick={() => onSave(text)}>
            Save
          </button>
        </div>
      </div>
    </Modal>
  );
}

/* ---------- Highlights & notes ---------- */

type Filter = 'all' | 'notes' | Exclude<BibleMarkColor, ''>;

/** Every verse I've highlighted or written a note on, newest first, with filters. */
function BibleMarks({ translation }: { translation: TranslationId }) {
  const { me } = useMe();
  const [filter, setFilter] = useState<Filter>('all');
  const list = useLoad(async () => {
    const rows = await fetchBibleMarks(me.id);
    // The verse's words, where the chapter has been opened on this computer before.
    const chapters = await cachedChapters(rows, translation);
    return { rows, chapters };
  }, [translation]);
  const shown = useMemo(() => (list.data?.rows ?? []).filter((m) => (filter === 'all' ? true : filter === 'notes' ? !!m.note : m.color === filter)), [list.data, filter]);

  const remove = async (m: BibleMark) => {
    const ref = verseRef(m.book, m.chapter, [m.verse]);
    if (m.note && !(await ask(`Remove ${ref}?`, 'Its highlight and your note are taken off.', 'Remove'))) return;
    try {
      if (m.color) await setBibleColor(me.id, m.translation, m.book, m.chapter, [m.verse], '');
      if (m.note) await setBibleNote(me.id, m.translation, m.book, m.chapter, m.verse, '');
      toast('Removed');
      list.reload();
    } catch (e) {
      toastError(e);
    }
  };

  const chip = (id: Filter, label: string, swatch?: string) => (
    <button key={id} role="tab" aria-selected={filter === id} aria-label={label} className={'filter-chip' + (filter === id ? ' on' : '') + (swatch ? ' ch-swatch-chip' : '')} onClick={() => setFilter(id)}>
      {swatch ? <span className={'ch-swatch ch-dot-' + swatch} /> : label}
    </button>
  );

  return (
    <div className="ch-marks">
      <h1 className="ch-h1">Highlights &amp; notes</h1>
      <div className="chip-row ch-chips" role="tablist" aria-label="Show">
        {chip('all', 'All')}
        {chip('notes', 'Notes')}
        {MARK_COLORS.map((c) => chip(c.id, c.label, c.id))}
      </div>
      {list.loading && !list.data ? <Spinner /> : list.error ? <Failed error={list.error} retry={list.reload} /> : null}
      {list.data && !shown.length ? <Empty icon="compose" title={list.data.rows.length ? 'Nothing here yet' : 'No highlights or notes yet'} body={list.data.rows.length ? undefined : 'Choose verses while you read to highlight them or write a note.'} /> : null}
      <div className="ch-mark-list">
        {shown.map((m) => {
          const ref = verseRef(m.book, m.chapter, [m.verse]);
          const words = list.data?.chapters[`${m.book} ${m.chapter}`]?.verses.find((v) => v.verse === m.verse)?.text ?? '';
          return (
            <div key={`${m.book}.${m.chapter}.${m.verse}`} className="ch-mark-row">
              <button className="ch-mark-open" onClick={() => nav(bibleLink(m.book, m.chapter, m.verse))} aria-label={'Open ' + ref}>
                <span className="ch-mark-icon">{m.color ? <span className={'ch-swatch ch-dot-' + m.color} title={m.color} /> : <Icon name="compose" size={18} className="ch-accent" />}</span>
                <span className="ch-mark-body">
                  <span className="ch-mark-top">
                    <b>{ref}</b>
                    <span className="muted-text small">{ago(m.updated_at)}</span>
                  </span>
                  {words ? <span className="ch-mark-words">{words}</span> : null}
                  {m.note ? (
                    <span className="ch-mark-note">
                      {m.color ? <Icon name="compose" size={14} className="ch-accent" /> : null}
                      {m.note}
                    </span>
                  ) : null}
                </span>
              </button>
              <button className="icon-btn ch-mark-remove" aria-label={'Remove ' + ref} title="Remove" onClick={() => remove(m)}>
                <Icon name="trash" size={18} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
