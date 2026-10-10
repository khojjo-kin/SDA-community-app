// The Bible, Sabbath School and Pod, from the iPhone app's own shared code (src/lib/bible.ts,
// sabbath-school.ts and the Pod functions in api.ts), laid out for a wide window.
import React, { useEffect, useRef, useState } from 'react';
import { fetchPod, fetchPodLibrary, fetchPopularPod, setPodSaved } from 'shared/api';
import { BOOKS, TRANSLATIONS, type BibleSettings, type Chapter, type TranslationId, fetchChapter, loadBibleSettings, parseReference, saveBibleSettings } from 'shared/bible';
import { type Day, type Lesson, type Quarterly, type Reading, chipLabel, currentLesson, currentQuarterly, dateRange, fetchDay, fetchLesson, fetchQuarterlies, fetchQuarterly, isStandard, loadSsSettings, readingHtml, saveSsSettings, todayIndex } from 'shared/sabbath-school';
import { clock } from 'shared/theme';
import type { PodItem } from 'shared/types';
import { useMe } from '../lib/me';
import { nav } from '../lib/router';
import { Empty, Failed, Icon, Spinner, toastError, useLoad } from '../ui/kit';
import { usePlayer } from '../ui/player';

/* ---------- Bible ---------- */

export function Bible({ book, chapter }: { book?: string; chapter?: string }) {
  const [settings, setSettings] = useState<BibleSettings | null>(null);
  const [text, setText] = useState<Chapter | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const page = useRef<HTMLDivElement>(null);
  useEffect(() => {
    loadBibleSettings().then((s) => {
      setSettings(s);
      // Open where the reader left off.
      if (!book && s.last) nav(`/bible/${encodeURIComponent(s.last.book)}/${s.last.chapter}`, true);
    });
  }, []);
  const current = book ? BOOKS.find((b) => b.name === decodeURIComponent(book)) : undefined;
  const ch = Math.max(1, Math.min(current?.chapters ?? 1, Number(chapter) || 1));
  useEffect(() => {
    if (!current || !settings) return;
    setText(null);
    setError(null);
    setOpen(current.name);
    fetchChapter(current.name, ch, settings.translation).then(
      (c) => {
        setText(c);
        page.current?.scrollTo({ top: 0 });
        const next = { ...settings, last: { book: current.name, chapter: ch } };
        saveBibleSettings(next);
      },
      setError,
    );
  }, [current?.name, ch, settings?.translation]);
  const change = (patch: Partial<BibleSettings>) => {
    const next = { ...settings!, ...patch };
    setSettings(next);
    saveBibleSettings(next);
  };
  const go = (b: string, c: number) => nav(`/bible/${encodeURIComponent(b)}/${c}`);
  return (
    <div className="split-page">
      <section className="split-list">
        <header>
          <h1>Bible</h1>
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
          {(['old', 'new'] as const).map((t) => (
            <React.Fragment key={t}>
              <h3 className="list-h">{t === 'old' ? 'Old Testament' : 'New Testament'}</h3>
              {BOOKS.filter((b) => b.testament === t).map((b) => (
                <div key={b.name}>
                  <button className={'hymn-row book' + (current?.name === b.name ? ' on' : '')} onClick={() => setOpen(open === b.name ? null : b.name)}>
                    <span className="row-text">
                      <b>{b.name}</b>
                    </span>
                    <Icon name={open === b.name ? 'down' : 'right'} size={14} />
                  </button>
                  {open === b.name ? (
                    <div className="chapter-grid">
                      {Array.from({ length: b.chapters }, (_, i) => (
                        <button key={i} className={current?.name === b.name && ch === i + 1 ? 'on' : ''} onClick={() => go(b.name, i + 1)}>
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
      <section className="split-detail" ref={page}>
        {!current ? (
          <Empty icon="bible" title="Choose a book" body="King James Version and World English Bible. Chapters you open stay available offline." />
        ) : (
          <article className="reader" style={{ fontSize: settings?.size ?? 18 }}>
            <div className="reader-bar">
              <h1>
                {current.name} {ch}
              </h1>
              <span className="grow" />
              <select value={settings?.translation} onChange={(e) => change({ translation: e.target.value as TranslationId })} aria-label="Translation">
                {TRANSLATIONS.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.short}
                  </option>
                ))}
              </select>
              <button className="btn quiet small" aria-label="Smaller text" onClick={() => change({ size: Math.max(14, (settings?.size ?? 18) - 2) })}>
                A−
              </button>
              <button className="btn quiet small" aria-label="Larger text" onClick={() => change({ size: Math.min(30, (settings?.size ?? 18) + 2) })}>
                A+
              </button>
            </div>
            {error ? <Failed error={error} retry={() => setSettings({ ...settings! })} /> : !text ? <Spinner /> : (
              <p className="verses">
                {text.verses.map((v) => (
                  <span key={v.verse}>
                    <sup>{v.verse}</sup>
                    {v.text}{' '}
                  </span>
                ))}
              </p>
            )}
            <div className="reader-nav">
              <button className="btn quiet" disabled={ch <= 1} onClick={() => go(current.name, ch - 1)}>
                ← Chapter {ch - 1}
              </button>
              <button className="btn quiet" disabled={ch >= current.chapters} onClick={() => go(current.name, ch + 1)}>
                Chapter {ch + 1} →
              </button>
            </div>
          </article>
        )}
      </section>
    </div>
  );
}

/* ---------- Sabbath School ---------- */

export function SabbathSchool() {
  const [size, setSize] = useState(18);
  const [quarterlies, setQuarterlies] = useState<Quarterly[] | null>(null);
  const [qid, setQid] = useState<string | null>(null);
  const [lessons, setLessons] = useState<{ quarterly: Quarterly; lessons: Lesson[] } | null>(null);
  const [lessonId, setLessonId] = useState<string | null>(null);
  const [days, setDays] = useState<Day[] | null>(null);
  const [dayId, setDayId] = useState<string | null>(null);
  const [reading, setReading] = useState<Reading | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    (async () => {
      try {
        const s = await loadSsSettings();
        setSize(s.size);
        const list = (await fetchQuarterlies()).filter(isStandard);
        setQuarterlies(list);
        setQid(s.quarterly && list.some((q) => q.id === s.quarterly) ? s.quarterly : currentQuarterly(list)?.id ?? list[0]?.id ?? null);
      } catch (e) {
        setError(e);
      }
    })();
  }, []);
  useEffect(() => {
    if (!qid) return;
    setLessons(null);
    fetchQuarterly(qid).then((r) => {
      setLessons(r);
      setLessonId(currentLesson(r.lessons)?.id ?? r.lessons[0]?.id ?? null);
    }, setError);
  }, [qid]);
  useEffect(() => {
    if (!qid || !lessonId) return;
    setDays(null);
    fetchLesson(qid, lessonId).then((r) => {
      setDays(r.days);
      setDayId(r.days[todayIndex(r.days)]?.id ?? r.days[0]?.id ?? null);
    }, setError);
  }, [qid, lessonId]);
  useEffect(() => {
    if (!qid || !lessonId || !dayId) return;
    setReading(null);
    fetchDay(qid, lessonId, dayId).then(setReading, setError);
  }, [qid, lessonId, dayId]);

  if (error && !quarterlies) return <Failed error={error} retry={() => location.reload()} />;
  return (
    <div className="split-page">
      <section className="split-list">
        <header>
          <h1>Sabbath School</h1>
          {quarterlies ? (
            <select
              className="ss-select"
              value={qid ?? ''}
              onChange={(e) => {
                setQid(e.target.value);
                saveSsSettings({ size, quarterly: e.target.value });
              }}
              aria-label="Quarter"
            >
              {quarterlies.map((q) => (
                <option key={q.id} value={q.id}>
                  {q.title} · {q.human_date}
                </option>
              ))}
            </select>
          ) : null}
        </header>
        <div className="split-scroll">
          {lessons ? (
            <div className="ss-cover">
              {lessons.quarterly.cover ? <img src={lessons.quarterly.cover} alt="" /> : null}
              <div>
                <b>{lessons.quarterly.title}</b>
                <span>{lessons.quarterly.human_date}</span>
              </div>
            </div>
          ) : quarterlies ? <Spinner /> : <Spinner />}
          {(lessons?.lessons ?? []).map((l) => (
            <button key={l.id} className={'hymn-row' + (l.id === lessonId ? ' on' : '')} onClick={() => setLessonId(l.id)}>
              <span className="hymn-no">{Number(l.id) || l.id}</span>
              <span className="row-text">
                <b>{l.title}</b>
                <span>{dateRange(l.start_date, l.end_date)}</span>
              </span>
            </button>
          ))}
        </div>
      </section>
      <section className="split-detail ss-detail">
        {days ? (
          <div className="ss-days">
            {days.map((d) => (
              <button key={d.id} className={'pill-btn' + (d.id === dayId ? ' on' : '')} onClick={() => setDayId(d.id)} title={d.title}>
                {chipLabel(d)}
              </button>
            ))}
            <span className="grow" />
            <button className="btn quiet small" aria-label="Smaller text" onClick={() => { const s = Math.max(14, size - 2); setSize(s); saveSsSettings({ size: s, quarterly: qid ?? undefined }); }}>
              A−
            </button>
            <button className="btn quiet small" aria-label="Larger text" onClick={() => { const s = Math.min(28, size + 2); setSize(s); saveSsSettings({ size: s, quarterly: qid ?? undefined }); }}>
              A+
            </button>
          </div>
        ) : null}
        {reading ? (
          <>
            <h1 className="ss-title">{reading.title}</h1>
            {/* The lesson's own page, in a sealed frame: its HTML and verse pop-ups come from the Sabbath School service. */}
            <iframe className="ss-frame" title={reading.title} sandbox="allow-scripts" srcDoc={readingHtml(reading, size)} />
          </>
        ) : lessonId ? (
          <Spinner />
        ) : (
          <Empty icon="lesson" title="Sabbath School" body="This quarter's adult Bible study guide, day by day." />
        )}
      </section>
    </div>
  );
}

/* ---------- Pod: songs and podcasts ---------- */

export function Pod() {
  const { me } = useMe();
  const player = usePlayer();
  const [tab, setTab] = useState<'all' | 'song' | 'podcast' | 'library'>('all');
  const [q, setQ] = useState('');
  const [needle, setNeedle] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setNeedle(q), 250);
    return () => clearTimeout(t);
  }, [q]);
  const popular = useLoad(() => fetchPopularPod(10), []);
  const list = useLoad<PodItem[]>(() => (tab === 'library' ? fetchPodLibrary(me.id) : fetchPod(tab === 'all' ? undefined : tab, needle)), [tab, needle]);
  const save = async (item: PodItem) => {
    try {
      await setPodSaved(me.id, item.id, !item.saved);
      list.reload();
    } catch (e) {
      toastError(e);
    }
  };
  const row = (it: PodItem, i: number, all: PodItem[]) => (
    <div key={it.id} className={'pod-row' + (player.item?.id === it.id ? ' on' : '')}>
      <button className="pod-cover" onClick={() => player.play(it, all)} aria-label={'Play ' + it.title}>
        {it.cover_url ? <img src={it.cover_url} alt="" /> : <Icon name={it.kind === 'song' ? 'music' : 'podcast'} size={22} />}
        <span className="pod-play">
          <Icon name={player.item?.id === it.id && player.playing ? 'pause' : 'play'} size={18} color="#fff" />
        </span>
      </button>
      <span className="row-text">
        <b>{it.title}</b>
        <span>
          {it.artist || it.full_name} · {it.kind === 'song' ? 'Song' : 'Podcast'}
          {it.plays ? ` · ${it.plays.toLocaleString()} plays` : ''}
        </span>
      </span>
      <span className="muted-text small">{it.duration_seconds ? clock(it.duration_seconds) : ''}</span>
      <button className="icon-btn" aria-label={it.saved ? 'Remove from library' : 'Save to library'} onClick={() => save(it)}>
        <Icon name={it.saved ? 'check' : 'plus'} size={20} />
      </button>
    </div>
  );
  return (
    <div className="page pod-page">
      <h1 className="page-title">Pod</h1>
      {popular.data?.length ? (
        <>
          <h3 className="section-h">Popular</h3>
          <div className="pod-shelf">
            {popular.data.map((it) => (
              <button key={it.id} className="pod-card" onClick={() => player.play(it, popular.data!)}>
                <span className="pod-art">{it.cover_url ? <img src={it.cover_url} alt="" /> : <Icon name={it.kind === 'song' ? 'music' : 'podcast'} size={34} />}</span>
                <b>{it.title}</b>
                <span>{it.artist || it.full_name}</span>
              </button>
            ))}
          </div>
        </>
      ) : null}
      <div className="pod-tools">
        <div className="seg left">
          {(['all', 'song', 'podcast', 'library'] as const).map((t) => (
            <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>
              {t === 'all' ? 'All' : t === 'song' ? 'Songs' : t === 'podcast' ? 'Podcasts' : 'Your library'}
            </button>
          ))}
        </div>
        {tab !== 'library' ? (
          <div className="panel-search in-modal pod-search">
            <input placeholder="Search titles and artists" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search Pod" />
          </div>
        ) : null}
      </div>
      {list.loading && !list.data ? <Spinner /> : list.error ? <Failed error={list.error} retry={list.reload} /> : null}
      {list.data && !list.data.length ? (
        <Empty icon="headphones" title={tab === 'library' ? 'Your library is empty' : 'Nothing here yet'} body={tab === 'library' ? 'Press + on a song or podcast to keep it here.' : 'Songs and podcasts shared on Community appear here.'} />
      ) : null}
      <div className="pod-list">{(list.data ?? []).map((it, i, all) => row(it, i, all))}</div>
    </div>
  );
}
