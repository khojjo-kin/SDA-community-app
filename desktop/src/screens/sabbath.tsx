// Sabbath School, from the iPhone app (app/(app)/sabbath-school.tsx, lesson/[id].tsx, the
// sabbath-post* screens, sabbath-publisher.tsx and src/components/sabbath/publishers.tsx), laid out
// for a wide window. On the left: the quarter, your progress and the lessons. On the right:
//   /lessons                      today: this week's memory text, today's study and the publishers' posts
//   /lessons/<quarter>/<lesson>   a lesson, day by day (?day=03 opens a day)
//   /lessons/posts                everything the publishers have posted, pinned first
//   /lessons/posts/<id>           one post; /lessons/posts/<id>/edit changes it
//   /lessons/write                a new post (approved publishers and admins)
//   /lessons/publish              asking to publish, and where the request has got to
// Lessons come from the free Sabbath School service by Adventech; progress stays on this computer.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createSabbathPost, deleteSabbathPost, fetchMyPublisher, fetchSabbathPost, fetchSabbathPosts, requestPublisher, updateSabbathPost, uploadImage, type SabbathPostInput } from 'shared/api';
import { type LessonProgress, dayKey, dayState, daySlot, daysRead, isSaved, lessonComplete, lessonKey, markDayDone, markDayOpened, parseKey, slotDayId, toggleSaved, useLessonProgress } from 'shared/lesson-progress';
import { type Day, type Lesson, type MemoryText, type Quarterly, type Reading, chipLabel, currentLesson, currentQuarterly, fetchDay, fetchLesson, fetchMemoryText, fetchQuarterlies, fetchQuarterly, isStandard, isThisWeek, loadSsSettings, parseDate, readingHtml, startOfToday, todayIndex, updateSsSettings } from 'shared/sabbath-school';
import { ago, agoLong, dayLabel, errText, monthName } from 'shared/theme';
import type { Media, Publisher, SabbathPost, SabbathPostKind } from 'shared/types';
import { useAppearance } from '../lib/appearance';
import { dateLocale, languageCode, t } from '../lib/i18n';
import { useMe } from '../lib/me';
import { nav, parts } from '../lib/router';
import { rememberSize } from '../shims/expo-file-system';
import { Avatar, ChoiceMenu, Empty, Failed, Icon, type IconName, Link, Spinner, Verified, ask, toast, toastError } from '../ui/kit';
import { SendText } from './bible';
import '../styles/church.css';

/* ---------- small helpers ---------- */

// The days' names (keys), by Date.getDay(): Saturday is the Sabbath.
const WEEKDAY = ['d.church.sunday', 'd.church.monday', 'd.church.tuesday', 'd.church.wednesday', 'd.church.thursday', 'd.church.friday', 'd.church.sabbath'];
const WEEKDAY_SHORT = ['d.church.sunShort', 'd.church.monShort', 'd.church.tueShort', 'd.church.wedShort', 'd.church.thuShort', 'd.church.friShort', 'd.church.sabShort'];
// A study week, Sabbath to Friday, in short.
const STUDY_DAYS = [6, 0, 1, 2, 3, 4, 5].map((i) => WEEKDAY_SHORT[i]);

const lessonNumber = (l: Lesson, i = 0) => parseInt(l.id, 10) || i + 1;

/**
 * "11 Oct". English keeps the app's own short months (shared/theme), as it always has; other
 * languages get the month as the browser writes it in that language.
 */
function shortDate(d: Date): string {
  return languageCode() === 'en' ? dayLabel(d) : d.toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short' });
}

/** "11 Oct – 17 Oct": a lesson's week (shared/sabbath-school's dateRange, in the app's language). */
function weekDates(start: string, end: string): string {
  return `${shortDate(parseDate(start))} – ${shortDate(parseDate(end))}`;
}

/** "Sabbath · 10 Oct": a reading's day (empty when its date can't be read). */
function dayLine(date: string): string {
  const d = parseDate(date);
  return isNaN(d.getTime()) ? '' : `${t(WEEKDAY[d.getDay()])} · ${shortDate(d)}`;
}

/** The short name on a day's button: "Sun" to "Fri", and "Sabbath" in full; an extra section keeps its own name. */
function dayChip(d: Day): string {
  const date = parseDate(d.date);
  if (!/^\d+$/.test(d.id) || isNaN(date.getTime())) return chipLabel(d);
  return t(date.getDay() === 6 ? WEEKDAY[6] : WEEKDAY_SHORT[date.getDay()]);
}

/** "Lesson 3, 11 Oct – 17 Oct 2026", for the Saved and Completed lists. */
function lessonLine(l: Lesson, n: number): string {
  const end = parseDate(l.end_date);
  // Other languages put the year where they write it ("17 oct. 2026", "2026年10月17日").
  const dates = isNaN(end.getTime())
    ? weekDates(l.start_date, l.end_date)
    : languageCode() === 'en'
      ? `${weekDates(l.start_date, l.end_date)} ${end.getFullYear()}`
      : `${shortDate(parseDate(l.start_date))} – ${end.toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short', year: 'numeric' })}`;
  return n ? t('d.church.lessonDates', { number: n, dates }) : dates;
}

/** A day's full name, "Wednesday" (or "Sabbath"); an extra section keeps its own name. */
function dayName(d: Day): string {
  if (!/^\d+$/.test(d.id)) return chipLabel(d);
  const date = parseDate(d.date);
  return isNaN(date.getTime()) ? d.title : t(WEEKDAY[date.getDay()]);
}

/** The day to study: today in the lesson's own week, otherwise the first day not read yet. */
function studySlot(quarterId: string, l: Lesson, p: LessonProgress): { slot: number; inWeek: boolean } {
  if (isThisWeek(l)) {
    const diff = Math.round((startOfToday().getTime() - parseDate(l.start_date).getTime()) / 86400e3);
    if (diff >= 0 && diff <= 6) return { slot: diff, inWeek: true };
  }
  for (let i = 0; i < 7; i++) if (!dayState(quarterId, l.id, i, p)) return { slot: i, inWeek: false };
  return { slot: 0, inWeek: false };
}

/** The weekday of day `slot` of a lesson, counted from its first day. */
function slotName(l: Lesson, slot: number): string {
  const s = parseDate(l.start_date);
  if (isNaN(s.getTime())) return t(WEEKDAY[(slot + 6) % 7]);
  return t(WEEKDAY[new Date(s.getFullYear(), s.getMonth(), s.getDate() + slot).getDay()]);
}

const lessonPath = (q: string, l: string, day?: string) => `/lessons/${q}/${l}${day ? `?day=${day}` : ''}`;

/* ---------- the quarter: shared by the list on the left and today's page ---------- */

type QuarterState = {
  list: Quarterly[] | null;
  quarterId: string;
  data: { quarterly: Quarterly; lessons: Lesson[] } | null;
  error: unknown;
  choose: (id: string) => void;
  reload: () => void;
};

/** The quarter to show: the one chosen (until it ends), else the one running now. */
function useQuarter(): QuarterState {
  const [list, setList] = useState<Quarterly[] | null>(null);
  const [quarterId, setQuarterId] = useState('');
  const [data, setData] = useState<QuarterState['data']>(null);
  const [error, setError] = useState<unknown>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    setError(null);
    (async () => {
      const [settings, all] = await Promise.all([loadSsSettings(), fetchQuarterlies()]);
      if (!live) return;
      setList(all);
      const saved = all.find((q) => q.id === settings.quarterly);
      const q = saved && parseDate(saved.end_date) >= startOfToday() ? saved : currentQuarterly(all);
      if (!q) throw new Error(t('d.church.noLessons'));
      setQuarterId((id) => id || q.id);
    })().catch((e) => live && setError(e));
    return () => {
      live = false;
    };
  }, [tick]);
  useEffect(() => {
    if (!quarterId) return;
    let live = true;
    setData(null);
    fetchQuarterly(quarterId).then(
      (d) => live && setData(d),
      (e) => live && setError(e),
    );
    return () => {
      live = false;
    };
  }, [quarterId, tick]);
  const choose = (id: string) => {
    setQuarterId(id);
    // Only a quarter still running or to come is remembered: an ended one would be passed over next time anyway.
    const q = list?.find((x) => x.id === id);
    if (q && parseDate(q.end_date) >= startOfToday()) updateSsSettings({ quarterly: id });
  };
  return { list, quarterId, data, error, choose, reload: () => setTick((n) => n + 1) };
}

/* ---------- publishing ---------- */

/** My request to publish (undefined while loading), and whether I can publish now (approved, or an admin). */
function usePublishing() {
  const { me } = useMe();
  const [publisher, setPublisher] = useState<Publisher | null | undefined>(undefined);
  const reload = useCallback(() => {
    fetchMyPublisher(me.id).then(setPublisher, () => setPublisher((p) => (p === undefined ? null : p)));
  }, [me.id]);
  useEffect(reload, [reload]);
  return { publisher, canPublish: !!me.admin_role || publisher?.status === 'approved', reload };
}

/** The kinds of post, with the key of each one's name. */
const KINDS: { id: SabbathPostKind; label: string }[] = [
  { id: 'study', label: 'ssPub.kindStudy' },
  { id: 'lesson', label: 'ssPub.kindLesson' },
  { id: 'announcement', label: 'ssPub.kindAnnouncement' },
  { id: 'resource', label: 'ssPub.kindResource' },
];
const kindLabel = (k: SabbathPostKind) => t(KINDS.find((x) => x.id === k)?.label ?? 'ssPub.kindStudy');

/** The small labels over a post: its kind, Pinned, and the lesson it goes with. */
function PostTags({ post }: { post: Pick<SabbathPost, 'kind' | 'pinned' | 'lesson_ref'> }) {
  return (
    <span className="ch-tags">
      <span className="ch-tag strong">{kindLabel(post.kind)}</span>
      {post.pinned ? (
        <span className="ch-tag">
          <Icon name="pin" size={11} /> {t('ssPub.pinned')}
        </span>
      ) : null}
      {post.lesson_ref ? <span className="ch-tag-ref">{post.lesson_ref}</span> : null}
    </span>
  );
}

/** A post as a card. `cover` gives a card without a photo a picture-sized space, for the grid on Today. */
function PostCard({ post, cover }: { post: SabbathPost; cover?: boolean }) {
  const image = post.media.find((m) => m.type === 'image');
  const name = post.full_name || post.username;
  const preview = post.body.replace(/\s+/g, ' ').trim();
  return (
    <Link to={'/lessons/posts/' + post.id} className={'ch-post-card' + (cover ? ' tile' : '')} title={post.title}>
      {image ? (
        <span className="ch-post-img">
          <img src={image.url} alt="" loading="lazy" />
        </span>
      ) : cover ? (
        <span className="ch-post-img empty">
          <Icon name="lesson" size={36} />
        </span>
      ) : null}
      <span className="ch-post-text">
        <PostTags post={post} />
        <b className="ch-post-title">{post.title}</b>
        {preview ? <span className="ch-post-preview">{preview}</span> : null}
        <span className="ch-post-by">
          <Avatar src={post.avatar_url} name={name} size={22} />
          <span className="ch-post-name">{name}</span>
          {post.verified ? <Verified size={13} /> : null}
          <span className="muted-text">· {ago(post.created_at)}</span>
        </span>
      </span>
    </Link>
  );
}

/** "Become a publisher", or where my request has got to. Hidden for members under 14 and approved publishers. */
function PublisherEntry({ publisher }: { publisher: Publisher | null | undefined }) {
  const { me } = useMe();
  if (me.restricted || publisher === undefined || publisher?.status === 'approved') return null;
  const label = publisher?.status === 'pending' ? t('ssPub.pending') : publisher?.status === 'rejected' ? t('ssPub.rejected') : publisher?.status === 'revoked' ? t('ssPub.revoked') : t('ssPub.become');
  return (
    <Link to="/lessons/publish" className="ch-entry">
      <Icon name={publisher ? 'clock' : 'compose'} size={18} />
      <span className="grow">{label}</span>
      <Icon name="right" size={14} />
    </Link>
  );
}

/* ---------- the page ---------- */

export function SabbathSchool({ path = '/lessons' }: { path?: string }) {
  const seg = parts(path).slice(1);
  const query = new URLSearchParams(path.split('?')[1] ?? '');
  const quarter = useQuarter();
  // Each page on the right starts at its top (the window's own scroll is reset by main.tsx).
  const pane = useRef<HTMLElement>(null);
  const page = path.split('?')[0];
  useEffect(() => {
    pane.current?.scrollTo({ top: 0 });
  }, [page]);

  let detail: React.ReactNode;
  if (!seg.length) detail = <Today quarter={quarter} />;
  else if (seg[0] === 'posts' && !seg[1]) detail = <Posts />;
  else if (seg[0] === 'posts' && seg[2] === 'edit') detail = <Editor key={'edit' + seg[1]} id={seg[1]} />;
  else if (seg[0] === 'posts') detail = <PostPage key={seg[1]} id={seg[1]} />;
  else if (seg[0] === 'write') detail = <Editor key="new" />;
  else if (seg[0] === 'publish') detail = <PublishRequest />;
  else if (seg[1]) detail = <LessonPage key={seg[0] + '/' + seg[1]} quarterId={seg[0]} lessonId={seg[1]} wantDay={query.get('day') ?? ''} />;
  else detail = <Empty icon="lesson" title={t('d.church.pageMissing')} body={t('d.church.chooseLesson')} />;

  return (
    <div className="split-page">
      <LessonList quarter={quarter} section={!seg.length ? 'today' : seg[0] === 'posts' || seg[0] === 'write' || seg[0] === 'publish' ? 'posts' : 'lesson'} openLesson={seg[1] && !['posts', 'write', 'publish'].includes(seg[0]) ? seg[0] + '/' + seg[1] : ''} />
      <section className="split-detail ch-ss-detail" ref={pane}>
        {detail}
      </section>
    </div>
  );
}

/* ---------- left: the quarter, progress and lessons ---------- */

type Tab = 'quarter' | 'saved' | 'done';

function LessonList({ quarter, section, openLesson }: { quarter: QuarterState; section: 'today' | 'posts' | 'lesson'; openLesson: string }) {
  const progress = useLessonProgress();
  const [tab, setTab] = useState<Tab>('quarter');
  const { list, quarterId, data, error } = quarter;
  const lessons = data?.lessons ?? [];
  const finished = lessons.filter((l) => lessonComplete(quarterId, l.id, 7, progress)).length;
  // The chooser: quarters still running or to come, then earlier ones from the last two years to look back at.
  const { coming, earlier } = useMemo(() => {
    const today = startOfToday();
    const cutoff = new Date(Date.now() - 2 * 365 * 86400e3);
    const all = (list ?? []).filter((q) => isStandard(q) || q.id === quarterId);
    const byStart = (a: Quarterly, b: Quarterly) => parseDate(a.start_date).getTime() - parseDate(b.start_date).getTime();
    return {
      coming: all.filter((q) => parseDate(q.end_date) >= today).sort(byStart),
      earlier: all.filter((q) => parseDate(q.end_date) < today && parseDate(q.end_date) >= cutoff).sort(byStart).reverse(),
    };
  }, [list, quarterId]);

  const nav2 = (to: string, icon: IconName, title: string, sub: string, on: boolean) => (
    <Link to={to} className={'hymn-row' + (on ? ' on' : '')}>
      <span className="hymn-no small">
        <Icon name={icon} size={18} />
      </span>
      <span className="row-text">
        <b>{title}</b>
        <span>{sub}</span>
      </span>
    </Link>
  );

  return (
    <section className="split-list">
      <header>
        <h1>{t('churchApps.sabbathSchool')}</h1>
        {list ? (
          <select className="ss-select" value={quarterId} onChange={(e) => quarter.choose(e.target.value)} aria-label={t('d.church.quarter')}>
            {coming.map((q) => (
              <option key={q.id} value={q.id}>
                {q.title} · {q.human_date}
              </option>
            ))}
            {earlier.length ? (
              <optgroup label={t('d.church.earlierQuarters')}>
                {earlier.map((q) => (
                  <option key={q.id} value={q.id}>
                    {q.title} · {q.human_date}
                  </option>
                ))}
              </optgroup>
            ) : null}
          </select>
        ) : null}
      </header>
      <div className="split-scroll">
        {nav2('/lessons', 'sparkle', t('liveSchedule.today'), t('d.church.todayLessonSub'), section === 'today')}
        {nav2('/lessons/posts', 'lesson', t('ssPub.section'), t('d.church.publishersSub'), section === 'posts')}
        {error && !data ? (
          <div className="ch-list-error">
            <p>{errText(error)}</p>
            <button className="btn quiet small" onClick={quarter.reload}>
              {t('common.tryAgain')}
            </button>
          </div>
        ) : !data ? (
          <Spinner />
        ) : (
          <>
            <div className="ss-cover ch-quarter">
              {data.quarterly.cover ? <img src={data.quarterly.cover} alt="" /> : null}
              <div className="grow">
                <b>{data.quarterly.title}</b>
                <span>{data.quarterly.human_date}</span>
                <span className="ch-progress-line">
                  {t('d.church.lessonsDone', { done: finished, total: lessons.length })}
                </span>
                <span className="ch-progress" aria-hidden="true">
                  <i style={{ width: `${lessons.length ? Math.round((finished / lessons.length) * 100) : 0}%` }} />
                </span>
              </div>
            </div>
            <div className="seg left pad-l ch-tabs" role="tablist">
              {(
                [
                  ['quarter', 'd.church.thisQuarter'],
                  ['saved', 'settings.saved'],
                  ['done', 'd.church.completed'],
                ] as const
              ).map(([id, label]) => (
                <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>
                  {t(label)}
                </button>
              ))}
            </div>
            {tab === 'quarter'
              ? lessons.map((l, i) => {
                  const n = lessonNumber(l, i);
                  const read = daysRead(quarterId, l.id, 7, progress);
                  const done = lessonComplete(quarterId, l.id, 7, progress);
                  return (
                    <Link key={l.id} to={lessonPath(quarterId, l.id)} className={'hymn-row ch-lesson-row' + (openLesson === quarterId + '/' + l.id ? ' on' : '')}>
                      <span className={'hymn-no' + (done ? ' ch-done' : '')}>{done ? <Icon name="check" size={20} /> : n}</span>
                      <span className="row-text">
                        <b>{l.title}</b>
                        <span>
                          {weekDates(l.start_date, l.end_date)}
                          {read && !done ? ` · ${t('d.church.daysReadOf', { count: read })}` : done ? ` · ${t('feed.done')}` : ''}
                        </span>
                      </span>
                      {isThisWeek(l) ? <span className="ch-week-tag">{t('d.church.thisWeek')}</span> : null}
                    </Link>
                  );
                })
              : tab === 'saved'
                ? <SavedList progress={progress} />
                : <DoneList progress={progress} />}
          </>
        )}
      </div>
    </section>
  );
}

function SavedList({ progress }: { progress: LessonProgress }) {
  const items = [...progress.saved].reverse();
  if (!items.length) return <p className="muted-text pad center">{t('d.church.savedEmpty')}</p>;
  return (
    <>
      {items.map((s) => {
        const { quarterId, lessonId, day } = parseKey(s.k);
        return (
          <div key={s.k} className="ch-saved-row">
            <Link to={lessonPath(quarterId, lessonId, day === undefined ? undefined : slotDayId(day))} className="hymn-row grow">
              <span className="hymn-no small">
                <Icon name={day === undefined ? 'lesson' : 'bookmark'} size={18} />
              </span>
              <span className="row-text">
                <b>{s.t}</b>
                <span>{s.s}</span>
              </span>
            </Link>
            <button className="icon-btn" aria-label={t('d.church.removeFromSaved', { title: s.t })} onClick={() => toggleSaved(s)}>
              <Icon name="heart" size={18} className="ch-like" fill="currentColor" />
            </button>
          </div>
        );
      })}
    </>
  );
}

function DoneList({ progress }: { progress: LessonProgress }) {
  const items = [...progress.lessons].reverse().filter((x) => {
    const { quarterId, lessonId } = parseKey(x.k);
    return lessonComplete(quarterId, lessonId, 7, progress);
  });
  if (!items.length) return <p className="muted-text pad center">{t('d.church.doneEmpty')}</p>;
  return (
    <>
      {items.map((x) => {
        const { quarterId, lessonId } = parseKey(x.k);
        return (
          <Link key={x.k} to={lessonPath(quarterId, lessonId)} className="hymn-row">
            <span className="hymn-no small ch-done">
              <Icon name="check" size={18} />
            </span>
            <span className="row-text">
              <b>{x.t}</b>
              <span>{x.s}</span>
            </span>
          </Link>
        );
      })}
    </>
  );
}

/* ---------- right: today ---------- */

/** This week's days and memory text. `undefined` memory is still loading; `null` means none. */
type Week = { key: string; days: Day[] | null; memory: MemoryText | null | undefined };

function Today({ quarter }: { quarter: QuarterState }) {
  const { me } = useMe();
  const progress = useLessonProgress();
  const { quarterId, data, error } = quarter;
  const thisLesson = useMemo(() => (data ? currentLesson(data.lessons) : null), [data]);
  const [week, setWeek] = useState<Week | null>(null);
  const [send, setSend] = useState<string | null>(null);

  useEffect(() => {
    if (!thisLesson || !quarterId) {
      setWeek(null);
      return;
    }
    const key = lessonKey(quarterId, thisLesson.id);
    let live = true;
    setWeek({ key, days: null, memory: undefined });
    const patch = (p: Partial<Week>) => live && setWeek((w) => (w?.key === key ? { ...w, ...p } : w));
    fetchLesson(quarterId, thisLesson.id).then((r) => patch({ days: r.days }), () => patch({ days: [] }));
    fetchMemoryText(quarterId, thisLesson.id).then((m) => patch({ memory: m }), () => patch({ memory: null }));
    return () => {
      live = false;
    };
  }, [quarterId, thisLesson]);

  const now = new Date();
  const h = now.getHours();
  const first = (me.full_name ?? '').trim().split(/\s+/)[0] || me.username;
  const greeting = t(h < 12 ? 'd.church.goodMorning' : h < 18 ? 'd.church.goodAfternoon' : 'd.church.goodEvening', { name: first });

  let lessonPart: React.ReactNode = null;
  if (error && !data) {
    lessonPart = (
      <div className="ch-note-card">
        <Icon name="lesson" size={22} />
        <span className="grow">
          <b>{t('d.church.lessonsFailed')}</b>
          <span className="muted-text">{errText(error)}</span>
        </span>
        <button className="btn quiet small" onClick={quarter.reload}>
          {t('common.tryAgain')}
        </button>
      </div>
    );
  } else if (!data || !thisLesson) {
    lessonPart = data ? null : <div className="ch-hero ch-skeleton" aria-label={t('d.church.loadingLessons')} />;
  } else {
    const l = thisLesson;
    const n = lessonNumber(l, data.lessons.indexOf(l));
    const { slot, inWeek } = studySlot(quarterId, l, progress);
    const states = [0, 1, 2, 3, 4, 5, 6].map((i) => dayState(quarterId, l.id, i, progress));
    const mine = week?.key === lessonKey(quarterId, l.id) ? week : null;
    const memory = mine?.memory;
    const days = mine?.days ?? null;
    const title = days === null ? '' : days.find((d) => d.id === slotDayId(slot))?.title || l.title;
    const key = lessonKey(quarterId, l.id);
    const saved = isSaved(key, progress);
    const action = states[slot] === 'done' ? t('d.church.readAgain') : states[slot] ? t('age.continue') : t('d.church.start');
    const read = () => nav(lessonPath(quarterId, l.id, slotDayId(slot)));
    const image = l.cover || data.quarterly.splash || '';
    lessonPart = (
      <>
        <section className={'ch-hero' + (image ? ' has-image' : '')} style={image ? { backgroundImage: `url("${image}")` } : undefined} aria-label={t('d.church.thisWeeksMemory')}>
          <span className="ch-hero-label">
            <Icon name="sun" size={16} />
            {memory ? (inWeek ? t('d.church.thisWeeksMemory') : t('d.church.memoryLesson', { number: n })) : inWeek ? t('d.church.thisWeeksLesson') : t('d.church.lessonNumber', { number: n })}
          </span>
          {memory === undefined ? (
            <span className="ch-hero-lines" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
          ) : (
            <span>
              <blockquote className="ch-hero-text">{memory ? memory.text : l.title}</blockquote>
              <span className="ch-hero-ref">{memory ? memory.reference : weekDates(l.start_date, l.end_date)}</span>
            </span>
          )}
          <span className="ch-hero-actions">
            <button
              className={'ch-glass' + (saved ? ' on' : '')}
              aria-label={saved ? t('d.church.unsaveWeek') : t('d.church.saveWeek')}
              aria-pressed={saved}
              onClick={() => toast(toggleSaved({ k: key, t: l.title, s: lessonLine(l, n) }) ? t('ssPub.saved') : t('d.church.removedFromSaved'))}
            >
              <Icon name="heart" size={20} fill={saved ? 'currentColor' : 'none'} />
            </button>
            <button className="ch-glass" aria-label={t('d.church.shareMemory')} onClick={() => setSend(memory ? `“${memory.text}”${memory.reference ? ` (${memory.reference})` : ''}` : t('d.church.shareLesson', { title: l.title, number: n }))}>
              <Icon name="send" size={20} />
            </button>
            <span className="grow" />
            <button className="ch-hero-read" onClick={read}>
              <Icon name="book" size={18} /> {t('d.church.read')}
            </button>
          </span>
        </section>
        <section className="ch-today-card">
          <div className="ch-today-head">
            <span className="ch-today-icon">
              <Icon name="calendar" size={22} />
            </span>
            <span className="grow">
              <span className="muted-text">{inWeek ? t('d.church.todaysStudy') : t('d.church.upNext')}</span>
              <b>{slotName(l, slot)}</b>
            </span>
            <span className="muted-text">{t('d.church.ofSeven', { count: states.filter(Boolean).length })}</span>
          </div>
          {title ? <p className="ch-today-title">{title}</p> : <p className="ch-today-title ch-skeleton-line" />}
          <WeekDots states={states} today={inWeek ? slot : undefined} />
          <button className="btn big block ch-today-go" onClick={read}>
            <Icon name="play" size={14} /> {action}
          </button>
        </section>
      </>
    );
  }

  return (
    <div className="ch-ss-page">
      <h1 className="ch-h1">{greeting}</h1>
      <p className="muted-text ch-date">{t('d.church.todayDate', { weekday: t(WEEKDAY[now.getDay()]), date: languageCode() === 'en' ? `${now.getDate()} ${monthName(now)}` : now.toLocaleDateString(dateLocale(), { day: 'numeric', month: 'long' }) })}</p>
      <div className="ch-today-grid">{lessonPart}</div>
      <PublishersSection />
      <p className="ch-foot">{t('d.church.ssFoot')}</p>
      {send ? <SendText title={t('common.share')} text={send} onClose={() => setSend(null)} /> : null}
    </div>
  );
}

/** The week so far as seven dots, Sabbath to Friday: done, read, or not yet; today ringed. */
function WeekDots({ states, today }: { states: ('done' | 'opened' | null)[]; today?: number }) {
  return (
    <span className="ch-week" aria-label={t('d.church.daysReadLabel', { count: states.filter(Boolean).length })}>
      {states.map((s, i) => (
        <span key={i} className={'ch-week-day' + (s ? ' ' + s : '') + (today === i ? ' today' : '')}>
          <i>{s === 'done' ? <Icon name="check" size={12} stroke={3} /> : null}</i>
          {t(STUDY_DAYS[i])}
        </span>
      ))}
    </span>
  );
}

/** "From our publishers" on Today: the newest posts, See all, Publish for publishers, and the way to ask for everyone else. */
function PublishersSection() {
  const [posts, setPosts] = useState<SabbathPost[] | null>(null);
  const { publisher, canPublish } = usePublishing();
  useEffect(() => {
    fetchSabbathPosts(0, 6).then(setPosts, () => setPosts([]));
  }, []);
  if (posts === null) return <Spinner />;
  if (!posts.length && !canPublish) return <PublisherEntry publisher={publisher} />;
  return (
    <section className="ch-pub-section" aria-label={t('ssPub.section')}>
      <div className="ch-section-head">
        <h2>{t('ssPub.section')}</h2>
        <span className="grow" />
        {posts.length ? (
          <Link to="/lessons/posts" className="link-btn">
            {t('ssPub.seeAll')}
          </Link>
        ) : null}
        {canPublish ? (
          <button className="btn small" onClick={() => nav('/lessons/write')}>
            <Icon name="plus" size={14} stroke={2.6} /> {t('ssPub.publish')}
          </button>
        ) : null}
      </div>
      {posts.length ? (
        <div className="ch-post-grid">
          {posts.map((p) => (
            <PostCard key={p.id} post={p} cover />
          ))}
        </div>
      ) : (
        <button className="ch-first" onClick={() => nav('/lessons/write')}>
          <Icon name="pluscircle" size={26} />
          {t('ssPub.publishFirst')}
        </button>
      )}
      {canPublish ? null : <PublisherEntry publisher={publisher} />}
    </section>
  );
}

/* ---------- right: one lesson ---------- */

const HEIGHT_SCRIPT = `(function(){function h(){parent.postMessage({chReadingHeight:Math.ceil(document.documentElement.scrollHeight)},'*')}window.addEventListener('load',h);if(window.ResizeObserver)new ResizeObserver(h).observe(document.body);h();})();`;

/** The reading page in the app's own colours (Dark or White), read from the CSS variables. */
function readingCss(): string {
  const s = getComputedStyle(document.documentElement);
  const v = (n: string) => s.getPropertyValue(n).trim();
  return [
    `html,body{background:${v('--bg')};color:${v('--fg')}}`,
    `body{padding:4px 0 24px;font-family:${v('--font') || 'system-ui'};overflow:hidden}`,
    `h1,h2,h3,h4{color:${v('--fg')}}a{color:${v('--accent2')}}a.verse{border-bottom-color:${v('--accent2')}}`,
    `blockquote{border-left-color:${v('--accent')};color:${v('--fg2')}}hr{border-top-color:${v('--line')}}small{color:${v('--fg3')}}`,
    `.verse-box{background:${v('--surface')}}.verse-box h2{color:${v('--accent2')}}.verse-box sup{color:${v('--fg3')}}`,
  ].join('');
}

function LessonPage({ quarterId, lessonId, wantDay }: { quarterId: string; lessonId: string; wantDay: string }) {
  const progress = useLessonProgress();
  const appearance = useAppearance();
  const [lesson, setLesson] = useState<{ lesson: Lesson; days: Day[] } | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [at, setAt] = useState(0);
  const [reading, setReading] = useState<Reading | null>(null);
  const [readError, setReadError] = useState<unknown>(null);
  const [memory, setMemory] = useState<MemoryText | null | undefined>(undefined);
  const [size, setSize] = useState(17);
  const [height, setHeight] = useState(0);
  const [tick, setTick] = useState(0);
  const frame = useRef<HTMLIFrameElement>(null);
  const wanted = useRef('');
  const n = parseInt(lessonId, 10) || 0;

  useEffect(() => {
    loadSsSettings().then((s) => setSize(s.size));
  }, []);
  useEffect(() => {
    let live = true;
    setLesson(null);
    setError(null);
    fetchLesson(quarterId, lessonId).then(
      (data) => {
        if (!live) return;
        const chosen = wantDay ? data.days.findIndex((d) => d.id === wantDay) : -1;
        setAt(chosen >= 0 ? chosen : todayIndex(data.days));
        setLesson(data);
      },
      (e) => live && setError(e),
    );
    fetchMemoryText(quarterId, lessonId).then(
      (m) => live && setMemory(m),
      () => live && setMemory(null),
    );
    return () => {
      live = false;
    };
  }, [quarterId, lessonId, tick]);
  // A day chosen from the list on the left or from Saved, while this lesson is open.
  useEffect(() => {
    if (!lesson || !wantDay) return;
    const i = lesson.days.findIndex((d) => d.id === wantDay);
    if (i >= 0) setAt(i);
  }, [wantDay]);

  const day = lesson?.days[at];
  useEffect(() => {
    if (!day || !lesson) return;
    let live = true;
    setReading(null);
    setReadError(null);
    setHeight(0);
    wanted.current = day.id;
    fetchDay(quarterId, lessonId, day.id).then(
      (r) => {
        // Days can be clicked faster than the network answers; only the latest choice lands.
        if (!live || wanted.current !== day.id) return;
        setReading(r);
        markDayOpened(quarterId, lessonId, daySlot(day.id), { title: lesson.lesson.title, sub: lessonLine(lesson.lesson, n) });
      },
      (e) => live && setReadError(e),
    );
    return () => {
      live = false;
    };
  }, [day?.id, lesson]);

  // The reading tells us how tall it is, so the whole page scrolls as one.
  useEffect(() => {
    const on = (e: MessageEvent) => {
      if (e.source === frame.current?.contentWindow && typeof e.data?.chReadingHeight === 'number') setHeight(e.data.chReadingHeight);
    };
    window.addEventListener('message', on);
    return () => window.removeEventListener('message', on);
  }, []);
  const html = useMemo(() => (reading ? readingHtml(reading, size, { css: readingCss(), script: HEIGHT_SCRIPT }) : ''), [reading, size, appearance]);

  const resize = (delta: number) => {
    const next = Math.min(30, Math.max(14, size + delta));
    setSize(next);
    updateSsSettings({ size: next });
  };

  if (error) return <Failed error={error} retry={() => setTick((n) => n + 1)} />;
  if (!lesson) return <Spinner />;
  if (!lesson.days.length) return <Empty icon="lesson" title={t('d.church.noReadings')} />;
  const l = lesson.lesson;
  const d = lesson.days[at];
  const slot = daySlot(d.id);
  const name = dayName(d);
  const done = dayState(quarterId, lessonId, slot, progress) === 'done';
  const lessonSaved = isSaved(lessonKey(quarterId, lessonId), progress);
  const daySaved = isSaved(dayKey(quarterId, lessonId, slot), progress);
  const info = { title: l.title, sub: lessonLine(l, n) };
  const go = (i: number) => {
    if (i < 0 || i >= lesson.days.length) return;
    setAt(i);
    frame.current?.closest('.split-detail')?.scrollTo({ top: 0 });
  };
  const prev = lesson.days[at - 1];
  const next = lesson.days[at + 1];

  return (
    <article className="ch-lesson">
      <div className="ch-lesson-top">
        <span className="grow">
          <span className="muted-text">{lessonLine(l, n)}</span>
          <h1 className="ch-h1">{l.title}</h1>
        </span>
        <button className={'icon-btn' + (lessonSaved ? ' ch-like' : '')} aria-label={lessonSaved ? t('d.church.unsaveLesson') : t('d.church.saveLesson')} aria-pressed={lessonSaved} onClick={() => toast(toggleSaved({ k: lessonKey(quarterId, lessonId), t: l.title, s: info.sub }) ? t('ssPub.saved') : t('d.church.removedFromSaved'))}>
          <Icon name="heart" size={22} fill={lessonSaved ? 'currentColor' : 'none'} />
        </button>
        <button className="btn quiet small" aria-label={t('d.church.smallerText')} disabled={size <= 14} onClick={() => resize(-2)}>
          A−
        </button>
        <button className="btn quiet small" aria-label={t('d.church.largerText')} disabled={size >= 30} onClick={() => resize(2)}>
          A+
        </button>
      </div>
      {memory ? (
        <blockquote className="ch-memory">
          <span className="ch-memory-label">{t('d.church.memoryText')}</span>
          <span className="ch-memory-text">{memory.text}</span>
          {memory.reference ? <cite>{memory.reference}</cite> : null}
        </blockquote>
      ) : null}
      <div className="ch-days" role="tablist" aria-label={t('d.church.days')}>
        {lesson.days.map((x, i) => {
          const st = dayState(quarterId, lessonId, daySlot(x.id), progress);
          return (
            <button key={x.id} role="tab" aria-selected={i === at} className={'pill-btn ch-day' + (i === at ? ' on' : '') + (st ? ' ' + st : '')} title={x.title} onClick={() => go(i)} aria-label={t(st === 'done' ? 'd.church.dayTabDone' : 'd.church.dayTab', { day: dayChip(x), title: x.title })}>
              {st === 'done' ? <Icon name="check" size={12} stroke={3} /> : null}
              {dayChip(x)}
            </button>
          );
        })}
      </div>
      <div className="ch-day-head">
        <span className="grow">
          <span className="muted-text">{dayLine(d.date) || name}</span>
          <h2>{reading?.title ?? d.title}</h2>
        </span>
        <button className={'icon-btn' + (daySaved ? ' ch-accent' : '')} aria-label={daySaved ? t('d.church.unsaveDay', { day: name }) : t('d.church.saveDay', { day: name })} aria-pressed={daySaved} onClick={() => toast(toggleSaved({ k: dayKey(quarterId, lessonId, slot), t: d.title, s: n ? t('d.church.lessonDay', { number: n, day: name }) : name }) ? t('ssPub.saved') : t('d.church.removedFromSaved'))}>
          <Icon name="bookmark" size={22} fill={daySaved ? 'currentColor' : 'none'} />
        </button>
      </div>
      {readError ? (
        <Failed error={readError} retry={() => setTick((n) => n + 1)} />
      ) : reading ? (
        // The day's own page, in a sealed frame: its HTML and verse pop-ups come from the Sabbath School service.
        <iframe ref={frame} className="ch-reading" title={reading.title} sandbox="allow-scripts" srcDoc={html} style={{ height: height || 600 }} />
      ) : (
        <Spinner />
      )}
      <div className="ch-lesson-foot">
        <button className={'btn big' + (done ? ' quiet' : '')} aria-pressed={done} onClick={() => { markDayDone(quarterId, lessonId, slot, !done, info); if (!done) toast(t('d.church.markedDone', { day: name })); }}>
          {done ? (
            <>
              <Icon name="check" size={16} /> {t('feed.done')}
            </>
          ) : (
            t('d.church.markDone')
          )}
        </button>
        <span className="grow" />
        <button className="btn quiet" disabled={!prev} onClick={() => go(at - 1)}>
          ← {prev ? dayName(prev) : t('d.church.previous')}
        </button>
        <button className="btn quiet" disabled={!next} onClick={() => go(at + 1)}>
          {next ? dayName(next) : t('d.church.next')} →
        </button>
      </div>
    </article>
  );
}

/* ---------- right: everything the publishers have posted ---------- */

const PAGE = 20;

function Posts() {
  const { publisher, canPublish } = usePublishing();
  const [posts, setPosts] = useState<SabbathPost[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [end, setEnd] = useState(false);
  const [more, setMore] = useState(false);
  const load = () => {
    setError(null);
    fetchSabbathPosts(0, PAGE).then((rows) => {
      setPosts(rows);
      setEnd(rows.length < PAGE);
    }, setError);
  };
  useEffect(load, []);
  const next = async () => {
    if (!posts || end || more) return;
    setMore(true);
    try {
      const rows = await fetchSabbathPosts(posts.length, PAGE);
      setPosts((p) => [...(p ?? []), ...rows.filter((r) => !(p ?? []).some((x) => x.id === r.id))]);
      setEnd(rows.length < PAGE);
    } catch (e) {
      toastError(e);
    } finally {
      setMore(false);
    }
  };
  return (
    <div className="ch-ss-page ch-feed">
      <div className="ch-section-head">
        <h1 className="ch-h1">{t('ssPub.section')}</h1>
        <span className="grow" />
        {canPublish ? (
          <button className="btn" onClick={() => nav('/lessons/write')}>
            <Icon name="plus" size={14} stroke={2.6} /> {t('ssPub.publish')}
          </button>
        ) : null}
      </div>
      <p className="muted-text ch-sub">{t('d.church.postsIntro')}</p>
      {posts === null ? error ? <Failed error={error} retry={load} /> : <Spinner /> : null}
      {posts && !posts.length ? <Empty icon="lesson" title={t('ssPub.empty')} /> : null}
      <div className="ch-post-list">
        {(posts ?? []).map((p) => (
          <PostCard key={p.id} post={p} />
        ))}
      </div>
      {posts && !end ? (
        <button className="btn quiet block" disabled={more} onClick={next}>
          {more ? t('d.church.loadingDots') : t('d.church.showMore')}
        </button>
      ) : null}
      {canPublish ? null : <PublisherEntry publisher={publisher} />}
    </div>
  );
}

/* ---------- right: one post ---------- */

function PostPage({ id }: { id: string }) {
  const { me } = useMe();
  const admin = !!me.admin_role;
  const [post, setPost] = useState<SabbathPost | null | undefined>(undefined);
  const [error, setError] = useState<unknown>(null);
  const [menu, setMenu] = useState(false);
  const [send, setSend] = useState(false);
  const load = () => {
    setError(null);
    fetchSabbathPost(id).then(setPost, setError);
  };
  useEffect(load, [id]);

  if (post === undefined) return error ? <Failed error={error} retry={load} /> : <Spinner />;
  if (post === null) return <Empty icon="lesson" title={t('ssPub.notFound')} body={t('profile.unavailableBody')} />;
  const canEdit = post.mine || admin;
  const name = post.full_name || post.username;
  const paragraphs = post.body.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean);
  const host = post.link.replace(/^https:\/\//i, '').split(/[/?#]/)[0];
  const link = location.href.split('#')[0] + '#/lessons/posts/' + post.id;

  const pin = async () => {
    try {
      await updateSabbathPost(post.id, { pinned: !post.pinned });
      setPost({ ...post, pinned: !post.pinned });
      toast(post.pinned ? t('ssPub.unpinned') : t('ssPub.pinnedToast'));
    } catch (e) {
      toastError(e);
    }
  };
  const remove = async () => {
    if (!(await ask(t('ssPub.deleteQuestion'), t('d.church.deletePostBody'), t('common.delete')))) return;
    try {
      await deleteSabbathPost(post.id);
      toast(t('ssPub.deleted'));
      nav('/lessons/posts');
    } catch (e) {
      toastError(e);
    }
  };

  return (
    <article className="ch-ss-page ch-post">
      <div className="ch-post-bar">
        <Link to="/lessons/posts" className="link-btn muted">
          ← {t('ssPub.section')}
        </Link>
        <span className="grow" />
        <button className="icon-btn" aria-label={t('common.share')} title={t('d.church.sendToPeople')} onClick={() => setSend(true)}>
          <Icon name="send" size={20} />
        </button>
        {canEdit ? (
          <button className="icon-btn" aria-label={t('ssPub.options')} onClick={() => setMenu(true)}>
            <Icon name="more" size={22} />
          </button>
        ) : null}
      </div>
      <PostTags post={post} />
      <h1 className="ch-post-h1">{post.title}</h1>
      <Link to={'/u/' + post.username} className="ch-author">
        <Avatar src={post.avatar_url} name={name} size={38} />
        <span className="row-text">
          <b>
            {name}
            {post.verified ? <Verified size={14} /> : null}
          </b>
          <span>{agoLong(post.created_at)}</span>
        </span>
      </Link>
      {post.media.filter((m) => m.type === 'image').map((m, i) => (
        <img key={m.url + i} className="ch-post-photo" src={m.url} alt="" style={m.w && m.h ? { aspectRatio: String(Math.min(2, Math.max(0.6, m.w / m.h))) } : undefined} />
      ))}
      <div className="ch-post-body">
        {paragraphs.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
      {post.link ? (
        <a className="ch-link-card" href={post.link} target="_blank" rel="noreferrer noopener">
          <Icon name="link" size={22} />
          <span className="row-text">
            <b>{t('ssPub.openLink')}</b>
            <span>{host}</span>
          </span>
          <Icon name="up" size={16} />
        </a>
      ) : null}
      {menu ? (
        <ChoiceMenu
          onClose={() => setMenu(false)}
          items={[
            { label: t('ssPub.edit'), onClick: () => nav(`/lessons/posts/${post.id}/edit`) },
            ...(admin ? [{ label: post.pinned ? t('ssPub.unpin') : t('ssPub.pin'), onClick: pin }] : []),
            { label: t('d.church.copyLink'), onClick: () => navigator.clipboard?.writeText(link).then(() => toast(t('d.church.linkCopied')), () => toast(t('d.church.linkNotCopied'))) },
            { label: t('common.delete'), danger: true, onClick: remove },
          ]}
        />
      ) : null}
      {send ? <SendText title={t('common.share')} text={`${post.title}\n${link}${post.link ? `\n${post.link}` : ''}`} onClose={() => setSend(false)} /> : null}
    </article>
  );
}

/* ---------- right: writing or editing a post ---------- */

/** The same limits as the database. */
const MAX = { title: 140, ref: 80, body: 10000, link: 500, photos: 6 };

/** A photo already uploaded (`media`), or one just chosen (`file`), uploaded on save. */
type Photo = { key: string; url: string; file?: File; media?: Media };
type Errors = { title?: string; ref?: string; body?: string; link?: string; form?: string };

/** "example.org/x" becomes "https://example.org/x"; anything with its own scheme is left for the check. */
function withScheme(raw: string): string {
  const s = raw.trim();
  return s && !/^[a-z][a-z0-9+.-]*:/i.test(s) ? `https://${s}` : s;
}

function Editor({ id }: { id?: string }) {
  const { me } = useMe();
  const admin = !!me.admin_role;
  const { publisher, canPublish } = usePublishing();
  const [existing, setExisting] = useState<SabbathPost | null | undefined>(id ? undefined : null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [kind, setKind] = useState<SabbathPostKind>('study');
  const [title, setTitle] = useState('');
  const [lessonRef, setLessonRef] = useState('');
  const [body, setBody] = useState('');
  const [link, setLink] = useState('');
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!id) return;
    fetchSabbathPost(id).then((p) => {
      setExisting(p);
      if (!p) return;
      setKind(p.kind);
      setTitle(p.title);
      setLessonRef(p.lesson_ref);
      setBody(p.body);
      setLink(p.link);
      setPhotos(p.media.filter((m) => m.type === 'image').map((m, i) => ({ key: `${i}:${m.url}`, url: m.url, media: m })));
    }, setLoadError);
  }, [id]);

  const addPhotos = (files: File[]) => {
    const room = MAX.photos - photos.length;
    const add = files.filter((f) => f.type.startsWith('image/')).slice(0, Math.max(0, room));
    setPhotos((p) =>
      [
        ...p,
        ...add.map((f, i) => {
          const url = URL.createObjectURL(f);
          rememberSize(url, f.size);
          return { key: `${Date.now()}:${i}:${f.name}`, url, file: f };
        }),
      ].slice(0, MAX.photos),
    );
  };

  async function save() {
    if (busy) return;
    const tt = title.trim();
    const ref = lessonRef.trim();
    const text = body.trim();
    const url = withScheme(link);
    const errs: Errors = {};
    if (!tt || tt.length > MAX.title) errs.title = t('ssPub.errTitle');
    if (ref.length > MAX.ref) errs.ref = t('ssPub.errRef');
    if (text.length > MAX.body) errs.body = t('ssPub.errBody');
    if (url && (!/^https:\/\/[^\s/]+\.[^\s]+$/i.test(url) || url.length > MAX.link)) errs.link = t('ssPub.errLink');
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      // New photos are uploaded only now, in order, so leaving the form leaves nothing behind.
      const media: Media[] = [];
      for (const p of photos) {
        if (p.media) media.push(p.media);
        else {
          const img = new Image();
          img.src = p.url;
          await img.decode().catch(() => {});
          media.push(await uploadImage(me.id, p.url, img.naturalWidth || undefined));
        }
      }
      const input: SabbathPostInput = { kind, title: tt, body: text, lesson_ref: ref, media, link: url };
      if (existing) {
        await updateSabbathPost(existing.id, input);
        toast(t('ssPub.saved'));
        nav('/lessons/posts/' + existing.id);
      } else {
        const newId = await createSabbathPost(me.id, input);
        toast(t('ssPub.published'));
        nav('/lessons/posts/' + newId);
      }
    } catch (e) {
      setErrors({ form: errText(e) });
      setBusy(false);
    }
  }

  if (loadError) return <Failed error={loadError} retry={() => location.reload()} />;
  if (existing === undefined || (!admin && publisher === undefined)) return <Spinner />;
  if (id && existing === null) return <Empty icon="lesson" title={t('ssPub.notFound')} />;
  if (existing ? !((existing.mine && canPublish) || admin) : !canPublish) {
    return (
      <Empty icon="lesson" title={t('ssPub.onlyPublishers')} body={t('d.church.onlyPublishersBody')}>
        <PublisherEntry publisher={publisher} />
      </Empty>
    );
  }

  // A field's error goes as soon as it is changed; the rest wait for the next Publish.
  const field = (key: keyof Errors, label: string, value: string, set: (v: string) => void, opts: { placeholder?: string; max: number; area?: boolean; type?: string }) => {
    const error = errors[key];
    const change = (v: string) => {
      set(v);
      if (error) setErrors((x) => ({ ...x, [key]: undefined }));
    };
    return (
      <label className="form-row">
        {label}
        {opts.area ? (
          <textarea value={value} onChange={(e) => change(e.target.value)} placeholder={opts.placeholder} maxLength={opts.max} rows={10} aria-invalid={!!error} />
        ) : (
          <input type={opts.type ?? 'text'} value={value} onChange={(e) => change(e.target.value)} placeholder={opts.placeholder} maxLength={opts.max} aria-invalid={!!error} />
        )}
        {opts.area && value.length > opts.max - 1000 ? <em className="count">{`${value.length.toLocaleString(dateLocale())} / ${opts.max.toLocaleString(dateLocale())}`}</em> : null}
        {error ? <span className="form-error">{error}</span> : null}
      </label>
    );
  };

  return (
    <div className="ch-ss-page ch-editor">
      <h1 className="ch-h1">{existing ? t('ssPub.editPost') : t('ssPub.newPost')}</h1>
      <div className="ch-kinds" role="radiogroup" aria-label={t('d.church.kindOfPost')}>
        {KINDS.map((k) => (
          <button key={k.id} role="radio" aria-checked={kind === k.id} className={'ch-kind' + (kind === k.id ? ' on' : '')} onClick={() => setKind(k.id)}>
            {t(k.label)}
          </button>
        ))}
      </div>
      {field('title', t('ssPub.title'), title, setTitle, { placeholder: t('ssPub.titlePlaceholder'), max: MAX.title })}
      {field('ref', t('ssPub.lessonRef'), lessonRef, setLessonRef, { placeholder: t('ssPub.lessonRefPlaceholder'), max: MAX.ref })}
      {field('body', t('ssPub.body'), body, setBody, { placeholder: t('ssPub.bodyPlaceholder'), max: MAX.body, area: true })}
      <div className="form-row">
        <span>
          {t('ssPub.photos')} <span className="muted-text ch-count">{`${photos.length}/${MAX.photos}`}</span>
        </span>
        <div className="ch-photos">
          {photos.map((p) => (
            <span key={p.key} className="ch-photo">
              <img src={p.url} alt="" />
              <button className="ch-photo-x" aria-label={t('ssPub.removePhoto')} disabled={busy} onClick={() => setPhotos((all) => all.filter((x) => x.key !== p.key))}>
                <Icon name="close" size={12} stroke={2.8} />
              </button>
            </span>
          ))}
          {photos.length < MAX.photos ? (
            <button className="ch-photo-add" aria-label={t('ssPub.addPhotos')} onClick={() => fileInput.current?.click()} disabled={busy}>
              <Icon name="image" size={24} />
            </button>
          ) : null}
          <input ref={fileInput} type="file" accept="image/*" multiple hidden data-testid="ss-photos" onChange={(e) => { addPhotos(Array.from(e.target.files ?? [])); e.target.value = ''; }} />
        </div>
      </div>
      {field('link', t('ssPub.link'), link, setLink, { placeholder: 'https://', max: MAX.link, type: 'url' })}
      {errors.form ? <p className="form-error">{errors.form}</p> : null}
      <div className="ch-dialog-actions">
        <button className="btn quiet" disabled={busy} onClick={() => (existing ? nav('/lessons/posts/' + existing.id) : nav('/lessons/posts'))}>
          {t('common.cancel')}
        </button>
        <button className="btn grow" disabled={busy} onClick={save}>
          {busy ? (existing ? t('d.church.saving') : t('d.church.publishing')) : existing ? t('ssPub.save') : t('ssPub.publish')}
        </button>
      </div>
    </div>
  );
}

/* ---------- right: asking to publish ---------- */

function Status({ icon, tone, title, note }: { icon: IconName; tone: 'ok' | 'wait' | 'off'; title: string; note?: string }) {
  return (
    <div className={'ch-status ' + tone}>
      <span className="ch-status-ring">
        <Icon name={icon} size={36} stroke={2} />
      </span>
      <h2>{title}</h2>
      {note ? <p className="muted-text">{note}</p> : null}
    </div>
  );
}

function PublishRequest() {
  const { me } = useMe();
  const [row, setRow] = useState<Publisher | null | undefined>(undefined);
  const [error, setError] = useState<unknown>(null);
  const [note, setNote] = useState('');
  const [again, setAgain] = useState(false);
  const [busy, setBusy] = useState(false);
  const load = () => {
    setError(null);
    fetchMyPublisher(me.id).then((r) => {
      setRow(r);
      setNote(r?.note ?? '');
    }, setError);
  };
  useEffect(load, []);

  const send = async () => {
    if (busy || !note.trim()) return;
    setBusy(true);
    try {
      await requestPublisher(me.id, note, row?.status === 'rejected');
      toast(t('ssPub.sent'));
      // Pending straight away; the read that follows brings the server's copy.
      setRow({ user_id: me.id, decided_by: null, decided_at: null, created_at: new Date().toISOString(), ...row, status: 'pending', note: note.trim() });
      setAgain(false);
      load();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  const write = <button className="btn big" onClick={() => nav('/lessons/write')}>{t('ssPub.publish')}</button>;

  let body: React.ReactNode;
  if (me.admin_role) {
    body = (
      <>
        <Status icon="check" tone="ok" title={t('ssPub.youCanPublish')} />
        {write}
      </>
    );
  } else if (me.restricted) body = <Empty icon="lesson" title={t('ssPub.under14')} />;
  else if (row === undefined) body = error ? <Failed error={error} retry={load} /> : <Spinner />;
  else if (!row || again) {
    body = (
      <div className="ch-ask">
        <p className="muted-text">{t('d.church.askIntro')}</p>
        <label className="form-row">
          {t('ssPub.aboutYou')}
          <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} rows={6} placeholder={t('ssPub.aboutPlaceholder')} autoFocus />
        </label>
        <button className="btn big" disabled={busy || !note.trim()} onClick={send}>
          {busy ? t('d.church.sending') : t('ssPub.send')}
        </button>
      </div>
    );
  } else if (row.status === 'pending') body = <Status icon="clock" tone="wait" title={t('ssPub.pending')} note={row.note} />;
  else if (row.status === 'approved') {
    body = (
      <>
        <Status icon="check" tone="ok" title={t('ssPub.approved')} />
        {write}
      </>
    );
  } else if (row.status === 'rejected') {
    body = (
      <>
        <Status icon="close" tone="off" title={t('ssPub.rejected')} note={row.note} />
        <button className="btn quiet big" onClick={() => setAgain(true)}>
          {t('ssPub.askAgain')}
        </button>
      </>
    );
  } else body = <Status icon="block" tone="off" title={t('ssPub.revoked')} />;

  return (
    <div className="ch-ss-page ch-publish">
      <h1 className="ch-h1">{t('ssPub.become')}</h1>
      {body}
    </div>
  );
}
