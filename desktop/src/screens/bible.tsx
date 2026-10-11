// The Bible, from the iPhone app (app/(app)/bible.tsx, bible/[book].tsx, bible-marks.tsx and
// src/components/BibleMarks.tsx), laid out for a wide window: the books on the left; on the right
// the verse of the day, a chapter to read, or your highlights and notes.
//
// Reading: click a verse to choose it, shift-click to choose a run of verses. A bar then offers the
// five highlight colours, a note, copy, send to people, a verse card and post. Highlights and notes
// are private and kept in the database (community_bible_marks), so they follow you to the iPhone app.
//
// The home page has the reading streak beside the verse of the day: days in a row with a chapter read,
// and the last seven days. A chapter counts once it has really been read (twenty seconds on it, or most
// of a long one scrolled through), once a day, through the shared code the iPhone app uses.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchBibleMarks, localDay, peopleToMessage, sendToPeople, setBibleColor, setBibleNote, uploadImage } from 'shared/api';
import { BOOKS, TRANSLATIONS, type BibleSettings, type Chapter, type TranslationId, cachedChapters, chapterCounted, fetchChapter, loadBibleSettings, loadStreak, noteChapterRead, parseReference, peekStreak, saveBibleSettings, verseRef } from 'shared/bible';
import { setPrefs, usePrefs } from 'shared/prefs';
import { ago } from 'shared/theme';
import type { BibleMark, BibleMarkColor, Profile, ReadingStreak } from 'shared/types';
import { type CreateRequest, openCreate } from '../lib/create';
import { dateLocale, t, tn } from '../lib/i18n';
import { useMe } from '../lib/me';
import { nav, useRoute } from '../lib/router';
import { Avatar, Empty, Failed, Icon, Modal, Spinner, ask, toast, toastError, useLoad, useOutside } from '../ui/kit';
import { VerseCardDialog, type VersePick } from '../ui/verse-card';
import '../styles/church.css';
import '../styles/events.css';

declare const __DEMO__: boolean;

/** A chapter counts towards the reading streak after this long on it (the demo's tests may ask for less)… */
const READ_MS = (__DEMO__ && typeof window !== 'undefined' && Number((window as { __bibleReadMs?: number }).__bibleReadMs)) || 20000;
/** …or once most of a long chapter has been scrolled through, after at least this long. */
const SKIM_MS = 8000;

/* ---------- highlight colours ---------- */

/** The five highlight colours, in the order offered (as on the iPhone), with the key of each one's name. The tints are in church.css. */
export const MARK_COLORS: { id: Exclude<BibleMarkColor, ''>; label: string }[] = [
  { id: 'yellow', label: 'bibleMarks.yellow' },
  { id: 'green', label: 'bibleMarks.green' },
  { id: 'blue', label: 'bibleMarks.blue' },
  { id: 'pink', label: 'bibleMarks.pink' },
  { id: 'purple', label: 'bibleMarks.purple' },
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

function VerseOfTheDay({ translation }: { translation: TranslationId }) {
  const verse = verseFor(new Date());
  const [text, setText] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [menu, setMenu] = useState(false);
  const [send, setSend] = useState(false);
  const [card, setCard] = useState(false);
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
    <section className="ch-votd" aria-label={t('bible.verseOfDay')}>
      <div className="ch-votd-head">
        <span>{t('bible.verseOfDay')}</span>
        <div className="ch-menu-wrap" ref={menuRef}>
          <button className="icon-btn tiny" aria-label={t('bible.verseOptions')} aria-expanded={menu} onClick={() => setMenu(!menu)}>
            <Icon name="more" size={20} />
          </button>
          {menu ? (
            <div className="popover ch-pop" role="menu">
              <button role="menuitem" disabled={!text} onClick={() => { setMenu(false); copyText(quote).then((ok) => toast(ok ? t('bibleMarks.copied') : t('d.church.verseNotCopied'))); }}>
                <Icon name="copy" size={18} /> {t('bibleMarks.copy')}
              </button>
              <button
                role="menuitem"
                onClick={() => {
                  setMenu(false);
                  setPrefs({ dailyVerse: false });
                  toast(t('bible.hidden'));
                }}
              >
                <Icon name="close" size={18} /> {t('bible.hideVerse')}
              </button>
            </div>
          ) : null}
        </div>
      </div>
      <blockquote className="ch-votd-text">{text ? `“${text}”` : failed ? t('bible.openToRead') : '…'}</blockquote>
      <p className="ch-votd-ref">
        {verse.ref}
        {text ? <span> {translation.toUpperCase()}</span> : null}
      </p>
      <div className="ch-votd-actions">
        <button className="ch-chip-btn" disabled={!text} onClick={() => setCard(true)}>
          <Icon name="image" size={16} /> {t('verseCard.make')}
        </button>
        <button className="ch-chip-btn" disabled={!text} onClick={() => setSend(true)}>
          <Icon name="send" size={16} /> {t('common.share')}
        </button>
        <button className="ch-chip-btn" onClick={() => nav(bibleLink(verse.book, verse.chapter, verse.from))}>
          <Icon name="book" size={16} /> {t('bible.readChapter')}
        </button>
      </div>
      {send ? <SendText title={t('d.church.sendVerse')} text={quote} onClose={() => setSend(false)} /> : null}
      {card ? <CardMaker pick={{ book: verse.book, chapter: verse.chapter, verses: Array.from({ length: verse.to - verse.from + 1 }, (_, i) => verse.from + i), translation }} onClose={() => setCard(false)} /> : null}
    </section>
  );
}

/** The verse card maker for a few verses, then (if its picture is shared) the people to send it to. */
function CardMaker({ pick, onClose }: { pick: VersePick; onClose: () => void }) {
  const [sending, setSending] = useState<File | null>(null);
  if (sending) return <SendText title={t('verseCard.title')} text="" picture={sending} onClose={onClose} />;
  return <VerseCardDialog pick={pick} onClose={onClose} onShare={(file) => setSending(file)} />;
}

/* ---------- sending words to people (verses, a post's link, a track) ---------- */

/**
 * Sends `text` (or a `picture`: a verse card) to the people you choose, one chat each, with an
 * optional message after it. A picture is uploaded once, when Send is clicked.
 */
export function SendText({ title, text, picture, onClose }: { title: string; text: string; picture?: File; onClose: () => void }) {
  const { me } = useMe();
  const [people, setPeople] = useState<Profile[] | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [q, setQ] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const preview = useMemo(() => (picture ? URL.createObjectURL(picture) : ''), [picture]);
  useEffect(() => () => (preview ? URL.revokeObjectURL(preview) : undefined), [preview]);
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
      if (picture) {
        const url = (await uploadImage(me.id, preview, 1080, 1080)).url;
        await sendToPeople(me.id, picked, { media: [url] });
      } else await sendToPeople(me.id, picked, { text });
      if (note.trim()) await sendToPeople(me.id, picked, { text: note });
      toast(tn('d.church.sent', picked.length));
      onClose();
    } catch (e) {
      toastError(e);
      setBusy(false);
    }
  };
  return (
    <Modal onClose={onClose} title={title} className="share">
      {preview ? <img className="ev-send-picture" src={preview} alt="" /> : <p className="ch-send-preview">{text}</p>}
      <div className="share-search">
        <span>{t('d.church.to')}</span>
        <input autoFocus placeholder={t('d.church.searchDots')} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t('createFlow.searchPeople')} />
      </div>
      <div className="share-list">
        {people === null ? <Spinner /> : null}
        {people && !shown.length ? <p className="muted-text pad">{t('d.church.noAccount')}</p> : null}
        {shown.map((p) => (
          <label key={p.id} className="row">
            <Avatar src={p.avatar_url} name={p.username} size={44} />
            <span className="row-text">
              <b>{p.full_name || p.username}</b>
              <span>{p.username}</span>
            </span>
            <input type="checkbox" className="round-check" aria-label={t('d.church.sendTo', { username: p.username })} checked={picked.includes(p.id)} onChange={(e) => setPicked(e.target.checked ? [...picked, p.id] : picked.filter((x) => x !== p.id))} />
          </label>
        ))}
      </div>
      {picked.length ? <input className="share-note" placeholder={t('d.church.writeMessage')} value={note} onChange={(e) => setNote(e.target.value)} aria-label={t('d.church.message')} /> : null}
      <div className="modal-foot">
        <button className="btn block" disabled={!picked.length || busy} onClick={send}>
          {busy ? t('d.church.sending') : t('common.send')}
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
  else if (name) detail = <Empty icon="bible" title={t('d.church.noBook')} body={t('d.church.noBookBody')} />;
  else detail = <BibleHome settings={settings} dailyVerse={dailyVerse} />;

  return (
    <div className="split-page">
      <section className="split-list">
        <header>
          <div className="ch-list-head">
            <h1>{t('churchApps.bible')}</h1>
            <div className="ch-menu-wrap" ref={menuRef}>
              <button className="icon-btn" aria-label={t('bible.options')} aria-expanded={menu} onClick={() => setMenu(!menu)}>
                <Icon name="more" size={22} />
              </button>
              {menu ? (
                <div className="popover ch-pop" role="menu">
                  <label className="ch-pop-row" role="menuitemcheckbox" aria-checked={dailyVerse}>
                    <Icon name="sparkle" size={18} />
                    <span className="grow">{t('bible.verseOfDay')}</span>
                    <input type="checkbox" role="switch" aria-label={t('bible.verseOfDay')} checked={dailyVerse} onChange={(e) => setPrefs({ dailyVerse: e.target.checked })} />
                    <i className="switch" />
                  </label>
                  <button role="menuitem" onClick={() => { setMenu(false); nav('/bible/marks'); }}>
                    <Icon name="compose" size={18} /> {t('bibleMarks.title')}
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
              else toastError(new Error(t('d.church.typeReference')));
            }}
          >
            <input placeholder={t('d.church.goToPlaceholder')} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t('d.church.goTo')} />
          </form>
        </header>
        <div className="split-scroll">
          <button className={'hymn-row book' + (!name ? ' on' : '')} onClick={() => nav('/bible')}>
            <span className="hymn-no small">
              <Icon name="sparkle" size={18} />
            </span>
            <span className="row-text">
              <b>{t('liveSchedule.today')}</b>
              <span>{t('d.church.todaySub')}</span>
            </span>
          </button>
          <button className={'hymn-row book' + (marksPage ? ' on' : '')} onClick={() => nav('/bible/marks')}>
            <span className="hymn-no small">
              <Icon name="compose" size={18} />
            </span>
            <span className="row-text">
              <b>{t('bibleMarks.title')}</b>
              <span>{t('d.church.marksSub')}</span>
            </span>
          </button>
          {(['old', 'new'] as const).map((testament) => (
            <React.Fragment key={testament}>
              <h3 className="list-h">{testament === 'old' ? t('d.church.oldTestament') : t('d.church.newTestament')}</h3>
              {BOOKS.filter((b) => b.testament === testament).map((b) => (
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

/* ---------- the reading streak ---------- */

/** "M", "T"… for a day, in the app's language. */
function weekdayLetter(d: Date): string {
  try {
    return new Intl.DateTimeFormat(dateLocale(), { weekday: 'narrow' }).format(d);
  } catch {
    return 'SMTWTFS'[d.getDay()];
  }
}

/** A small flame: green while there is a streak, filled once today's chapter is read. */
function Flame({ lit, warm }: { lit: boolean; warm: boolean }) {
  return (
    <svg className={'ev-flame' + (warm ? ' warm' : '')} width="30" height="30" viewBox="0 0 24 24" fill={lit ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 2.5c.6 3.2 2.6 5.1 4.3 7 1.4 1.6 2.4 3.3 2.4 5.6A6.7 6.7 0 0 1 12 21.5a6.7 6.7 0 0 1-6.7-6.4c0-2.2.9-3.9 2.2-5.2.2 1.6 1 2.8 2.2 3.5-.3-3.9.6-7.6 2.3-10.9Z" />
    </svg>
  );
}

/**
 * Days in a row with a chapter read, the best run, and the last seven days. Fetched each time the page
 * is shown, so a chapter just read shows here on coming back. Clicking it carries on reading.
 */
function Streak({ onContinue }: { onContinue: () => void }) {
  const { me } = useMe();
  const [streak, setStreak] = useState<ReadingStreak | null>(() => peekStreak(me.id));
  const [failed, setFailed] = useState(false);
  const today = localDay();
  useEffect(() => {
    let live = true;
    loadStreak(me.id).then(
      (s) => live && setStreak(s),
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, []);
  const week = useMemo(() => {
    const read = new Set(streak?.last_days ?? []);
    const [y, m, d] = today.split('-').map((n) => parseInt(n, 10));
    return Array.from({ length: 7 }, (_, i) => {
      const day = new Date(y, m - 1, d - (6 - i));
      const id = localDay(day);
      return { id, letter: weekdayLetter(day), read: read.has(id), today: i === 6 };
    });
  }, [streak, today]);
  if (!streak) return failed ? null : <div className="ev-streak loading" aria-hidden="true" />;
  const current = streak.current_streak;
  const best = streak.best_streak;
  const title = current > 0 ? t('bible.streakDays', { n: current }) : t('bible.streakStart');
  const status = streak.read_today ? t('bible.readToday') : t('bible.readAChapter');
  return (
    <button className="ev-streak" onClick={onContinue} aria-label={`${title}. ${status}. ${t('bible.continueReading')}`}>
      <span className="ev-streak-top">
        <Flame lit={streak.read_today} warm={current > 0} />
        <span className="ev-streak-text">
          <b>{title}</b>
          <span>
            <em className={streak.read_today ? 'done' : ''}>{status}</em>
            {best > 0 ? <span className="ev-streak-best">{` · ${t('bible.bestStreak', { n: best })}`}</span> : null}
          </span>
        </span>
      </span>
      <span className="ev-streak-week">
        {week.map((day) => (
          <span key={day.id} className={'ev-streak-day' + (day.read ? ' read' : '') + (day.today ? ' today' : '')} data-day={day.id}>
            <span>{day.letter}</span>
            <i>{day.read ? <Icon name="check" size={14} stroke={2.8} /> : null}</i>
          </span>
        ))}
      </span>
    </button>
  );
}

/* ---------- home: verse of the day, the streak, continue reading ---------- */

function BibleHome({ settings, dailyVerse }: { settings: BibleSettings; dailyVerse: boolean }) {
  // Carry on where the member left off; before anything has been read, today's verse's chapter.
  const today = verseFor(new Date());
  const resume = settings.last ?? { book: today.book, chapter: today.chapter };
  const carryOn = () => nav(bibleLink(resume.book, resume.chapter));
  return (
    <div className="ch-home ev-bible-home">
      <div className={'ev-home-top' + (dailyVerse ? '' : ' single')}>
        {dailyVerse ? <VerseOfTheDay translation={settings.translation} /> : null}
        <Streak onContinue={carryOn} />
      </div>
      <button className="ch-card-row" onClick={carryOn}>
        <Icon name="bookmark" size={22} className="ch-accent" />
        <span className="row-text">
          <span>{t('bible.continueReading')}</span>
          <b>
            {resume.book} {resume.chapter}
          </b>
        </span>
        <Icon name="right" size={16} />
      </button>
      <button className="ch-card-row" onClick={() => nav('/bible/marks')}>
        <Icon name="compose" size={22} className="ch-accent" />
        <span className="row-text">
          <b>{t('bibleMarks.title')}</b>
        </span>
        <Icon name="right" size={16} />
      </button>
      <p className="ch-foot">{t('d.church.bibleFoot')}</p>
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
  const [card, setCard] = useState<VersePick | null>(null);
  const [flash, setFlash] = useState<number | null>(null);
  const meta = BOOKS.find((b) => b.name === book)!;
  // Opened from Highlights & notes or a verse link (?v=16): scroll to it and mark it for a moment.
  const target = Number(new URLSearchParams(route.split('?')[1] ?? '').get('v')) || 0;

  /* ----- the reading streak: a chapter counts once it has really been read, once a day ----- */

  const readSince = useRef(0);
  const counted = useRef(false);
  const countRead = useCallback(() => {
    if (counted.current) return;
    counted.current = true;
    // In the background: reading never waits on it, and a failure is simply not counted.
    noteChapterRead(me.id, book, chapter).then((streak) => {
      if (streak) toast(t('bible.streakDay', { n: streak.current_streak }));
    });
  }, [me.id, book, chapter]);
  useEffect(() => {
    readSince.current = 0;
    if (!text || chapterCounted(me.id, book, chapter)) return;
    readSince.current = Date.now();
    const timer = setTimeout(countRead, READ_MS);
    // Most of a long chapter scrolled through, at reading pace rather than a flick to the end, counts too.
    const el = page.current;
    const scrolled = () => {
      if (!el || !readSince.current || Date.now() - readSince.current < SKIM_MS) return;
      if (el.scrollHeight > el.clientHeight * 1.5 && el.scrollTop + el.clientHeight >= el.scrollHeight * 0.8) countRead();
    };
    el?.addEventListener('scroll', scrolled, { passive: true });
    return () => {
      clearTimeout(timer);
      el?.removeEventListener('scroll', scrolled);
    };
  }, [text, countRead]);

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
    const timer = setTimeout(() => setFlash(null), 1800);
    return () => clearTimeout(timer);
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
      () => toast(note ? t('bibleMarks.noteSaved') : t('bibleMarks.noteDeleted')),
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
    toast(ok ? t('bibleMarks.copied') : t('d.church.versesNotCopied'));
  };
  const share = () => {
    setSending(quote());
    setSelected([]);
  };
  // As on the iPhone, Post starts a new post with the verses as its caption (pick a photo first).
  const post = () => {
    const q = quote();
    setSelected([]);
    openCreate({ mode: 'post', text: q });
  };
  // The chosen verses as a designed picture, in the card maker.
  const makeCard = () => {
    setCard({ book, chapter, verses: [...selected].sort((a, b) => a - b), translation: settings.translation });
    setSelected([]);
  };
  const note = () => {
    if (selected.length !== 1) {
      toast(t('bibleMarks.oneVerse'));
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
        <select value={settings.translation} onChange={(e) => onSettings({ translation: e.target.value as TranslationId })} aria-label={t('d.church.translation')}>
          {TRANSLATIONS.map((x) => (
            <option key={x.id} value={x.id}>
              {x.short}
            </option>
          ))}
        </select>
        <button className="btn quiet small" aria-label={t('d.church.smallerText')} onClick={() => onSettings({ size: Math.max(14, size - 2) })}>
          A−
        </button>
        <button className="btn quiet small" aria-label={t('d.church.largerText')} onClick={() => onSettings({ size: Math.min(30, size + 2) })}>
          A+
        </button>
      </div>
      <p className="ch-translation">{TRANSLATIONS.find((x) => x.id === settings.translation)?.name}</p>
      {error ? (
        <Failed error={error} retry={() => setTick((n) => n + 1)} />
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
                    aria-label={t('d.church.openNote', { verse: v.verse })}
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
          ← {prevRef ? (prevRef.book === book ? t('d.church.chapter', { number: prevRef.chapter }) : `${prevRef.book} ${prevRef.chapter}`) : t('d.church.previous')}
        </button>
        <button className="btn quiet" disabled={!nextRef} onClick={() => nextRef && nav(bibleLink(nextRef.book, nextRef.chapter))}>
          {nextRef ? (nextRef.book === book ? t('d.church.chapter', { number: nextRef.chapter }) : `${nextRef.book} ${nextRef.chapter}`) : t('d.church.next')} →
        </button>
      </div>
      {selected.length && text ? <MarkBar reference={verseRef(book, chapter, selected)} active={active} single={selected.length === 1} onColor={colour} onNote={note} onCopy={copy} onShare={share} onCard={makeCard} onPost={post} onClose={() => setSelected([])} /> : null}
      {noteFor !== null ? <NoteDialog reference={verseRef(book, chapter, [noteFor])} verseText={noteVerse?.text ?? ''} initial={markOf(noteFor)?.note ?? ''} onClose={() => setNoteFor(null)} onSave={(n) => saveNote(noteFor, n)} /> : null}
      {sending ? <SendText title={t('d.church.sendVerses')} text={sending} onClose={() => setSending(null)} /> : null}
      {card ? <CardMaker pick={card} onClose={() => setCard(null)} /> : null}
    </article>
  );
}

/** The bar that rises while verses are chosen: the colours, then Note, Copy, Share, Card and Post. */
function MarkBar({ reference, active, single, onColor, onNote, onCopy, onShare, onCard, onPost, onClose }: { reference: string; active: BibleMarkColor | null; single: boolean; onColor: (c: BibleMarkColor) => void; onNote: () => void; onCopy: () => void; onShare: () => void; onCard: () => void; onPost: () => void; onClose: () => void }) {
  return (
    <div className="ch-markbar" role="toolbar" aria-label={t('d.church.chosenVerses', { reference })}>
      <div className="ch-markbar-top">
        <b className="ch-markbar-ref">{reference}</b>
        <button className="icon-btn tiny ch-markbar-close" aria-label={t('bibleMarks.clear')} title={t('d.church.clearEsc')} onClick={onClose}>
          <Icon name="close" size={16} />
        </button>
      </div>
      <div className="ch-markbar-row">
        <div className="ch-dots">
          {MARK_COLORS.map((c) => (
            <button key={c.id} className={'ch-dot ch-dot-' + c.id + (active === c.id ? ' on' : '')} aria-label={t(c.label)} aria-pressed={active === c.id} title={t(c.label)} onClick={() => onColor(c.id)} />
          ))}
          <button className="ch-dot ch-dot-none" aria-label={t('bibleMarks.none')} title={t('bibleMarks.none')} onClick={() => onColor('')} />
        </div>
        <span className="ch-markbar-line" />
        <button className={'ch-bar-action' + (single ? '' : ' dim')} onClick={onNote} title={single ? t('d.church.writeNote') : t('bibleMarks.oneVerse')}>
          <Icon name="compose" size={18} /> {t('bibleMarks.note')}
        </button>
        <button className="ch-bar-action" onClick={onCopy}>
          <Icon name="copy" size={18} /> {t('bibleMarks.copy')}
        </button>
        <button className="ch-bar-action" onClick={onShare}>
          <Icon name="send" size={18} /> {t('common.share')}
        </button>
        <button className="ch-bar-action" onClick={onCard}>
          <Icon name="image" size={18} /> {t('verseCard.card')}
        </button>
        <button className="ch-bar-action" onClick={onPost}>
          <Icon name="pluscircle" size={18} /> {t('bibleMarks.post')}
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
        <textarea className="ch-note-input" value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} rows={6} placeholder={t('bibleMarks.notePlaceholder')} aria-label={t('bibleMarks.note')} autoFocus={!initial} />
        <div className="ch-dialog-actions">
          {initial ? (
            <button className="btn quiet" onClick={() => onSave('')}>
              {t('common.delete')}
            </button>
          ) : null}
          <button className="btn grow" disabled={!changed || (!initial && !text.trim())} onClick={() => onSave(text)}>
            {t('bibleMarks.save')}
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
    if (m.note && !(await ask(t('d.church.removeQuestion', { reference: ref }), t('d.church.removeBody'), t('live.remove')))) return;
    try {
      if (m.color) await setBibleColor(me.id, m.translation, m.book, m.chapter, [m.verse], '');
      if (m.note) await setBibleNote(me.id, m.translation, m.book, m.chapter, m.verse, '');
      toast(t('d.church.removed'));
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
  // A colour's name in small letters, for the swatch's tooltip ("yellow").
  const colourName = (color: BibleMarkColor) => t(MARK_COLORS.find((c) => c.id === color)?.label ?? 'bibleMarks.none').toLocaleLowerCase(dateLocale());

  return (
    <div className="ch-marks">
      <h1 className="ch-h1">{t('bibleMarks.title')}</h1>
      <div className="chip-row ch-chips" role="tablist" aria-label={t('d.church.show')}>
        {chip('all', t('bibleMarks.all'))}
        {chip('notes', t('bibleMarks.notes'))}
        {MARK_COLORS.map((c) => chip(c.id, t(c.label), c.id))}
      </div>
      {list.loading && !list.data ? <Spinner /> : list.error ? <Failed error={list.error} retry={list.reload} /> : null}
      {list.data && !shown.length ? <Empty icon="compose" title={list.data.rows.length ? t('bibleMarks.emptyFilter') : t('bibleMarks.empty')} body={list.data.rows.length ? undefined : t('d.church.marksEmptyBody')} /> : null}
      <div className="ch-mark-list">
        {shown.map((m) => {
          const ref = verseRef(m.book, m.chapter, [m.verse]);
          const words = list.data?.chapters[`${m.book} ${m.chapter}`]?.verses.find((v) => v.verse === m.verse)?.text ?? '';
          return (
            <div key={`${m.book}.${m.chapter}.${m.verse}`} className="ch-mark-row">
              <button className="ch-mark-open" onClick={() => nav(bibleLink(m.book, m.chapter, m.verse))} aria-label={t('d.church.openRef', { reference: ref })}>
                <span className="ch-mark-icon">{m.color ? <span className={'ch-swatch ch-dot-' + m.color} title={colourName(m.color)} /> : <Icon name="compose" size={18} className="ch-accent" />}</span>
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
              <button className="icon-btn ch-mark-remove" aria-label={t('d.church.removeRef', { reference: ref })} title={t('live.remove')} onClick={() => remove(m)}>
                <Icon name="trash" size={18} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
