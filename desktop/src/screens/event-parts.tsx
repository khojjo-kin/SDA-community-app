// The pieces of a church event that several desktop screens show, from the iPhone app's
// src/components/EventCard.tsx: the kinds, the words for when it is, the cover with its fallback, the
// date block, the faces of people going, a row in a list and a tile for a church's or a community's
// page. Dates and times are written in the app's language.
import React, { useEffect } from 'react';
import { fmt } from 'shared/theme';
import type { EventCard, EventKind } from 'shared/types';
import { dateLocale, t } from '../lib/i18n';
import { Avatar, Icon, type IconName, Link } from '../ui/kit';
import '../styles/events.css';

/* ---------- kinds ---------- */

/** The kinds of event, in the order the organiser is offered them, each with the key of its words and its icon. */
export const EVENT_KINDS: readonly { kind: EventKind; label: string; icon: IconName }[] = [
  { kind: 'service', label: 'events.kind.service', icon: 'church' },
  { kind: 'bible_study', label: 'events.kind.bible_study', icon: 'bible' },
  { kind: 'youth', label: 'events.kind.youth', icon: 'people' },
  { kind: 'prayer', label: 'events.kind.prayer', icon: 'heart' },
  { kind: 'outreach', label: 'events.kind.outreach', icon: 'globe' },
  { kind: 'music', label: 'events.kind.music', icon: 'music' },
  { kind: 'social', label: 'events.kind.social', icon: 'smile' },
  { kind: 'other', label: 'events.kind.other', icon: 'calendar' },
];

const kindOf = (k: EventKind) => EVENT_KINDS.find((x) => x.kind === k) ?? EVENT_KINDS[EVENT_KINDS.length - 1];
export const kindIcon = (k: EventKind): IconName => kindOf(k).icon;
export const kindLabel = (k: EventKind): string => t(kindOf(k).label);

/* ---------- when ---------- */

const DAY_MS = 86400e3;
/** An event with no end time counts as on for six hours after it starts, as the database has it. */
const OPEN_ENDED_MS = 6 * 3600e3;

export const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
/** 0 for today, 1 for tomorrow, -1 for yesterday. */
export const daysFromToday = (d: Date) => Math.round((startOfDay(d).getTime() - startOfDay(new Date()).getTime()) / DAY_MS);
const thisYear = (d: Date) => d.getFullYear() === new Date().getFullYear();

/** "18:30" or "6:30 pm", as the app's language writes times. */
export function timeOf(d: Date): string {
  try {
    return d.toLocaleTimeString(dateLocale(), { hour: 'numeric', minute: '2-digit' });
  } catch {
    return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
}

/** The time split from its "am"/"pm" (where the language writes one), so a narrow column can set it small underneath. */
export function timeParts(d: Date): { main: string; period: string } {
  try {
    const parts = new Intl.DateTimeFormat(dateLocale(), { hour: 'numeric', minute: '2-digit' }).formatToParts(d);
    const period = parts.find((p) => p.type === 'dayPeriod')?.value ?? '';
    const main = parts.filter((p) => p.type !== 'dayPeriod').map((p) => p.value).join('').trim();
    if (main) return { main, period };
  } catch {
    // No Intl: the whole time on one line.
  }
  return { main: timeOf(d), period: '' };
}

/** The day's name: "Sat", "Saturday" or "S". */
export function weekday(d: Date, style: 'short' | 'long' | 'narrow' = 'short'): string {
  try {
    return d.toLocaleDateString(dateLocale(), { weekday: style });
  } catch {
    return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()];
  }
}

/** "OCT", for the date block. */
export function monthShort(d: Date): string {
  try {
    return d.toLocaleDateString(dateLocale(), { month: 'short' }).replace(/\.$/, '').toLocaleUpperCase(dateLocale());
  } catch {
    return ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'][d.getMonth()];
  }
}

/** "Today", "Tomorrow", "Sat 18 Oct" (with the year when it isn't this one). */
export function dayHeading(d: Date): string {
  const n = daysFromToday(d);
  if (n === 0) return t('liveSchedule.today');
  if (n === 1) return t('liveSchedule.tomorrow');
  return d.toLocaleDateString(dateLocale(), { weekday: 'short', day: 'numeric', month: 'short', ...(thisYear(d) ? {} : { year: 'numeric' }) });
}

/** "Saturday 18 October" (with the year when it isn't this one). */
export function longDay(d: Date): string {
  return d.toLocaleDateString(dateLocale(), { weekday: 'long', day: 'numeric', month: 'long', ...(thisYear(d) ? {} : { year: 'numeric' }) });
}

/** "10:00 – 12:30"; an end on another day says which. */
export function timeRange(ev: Pick<EventCard, 'starts_at' | 'ends_at'>): string {
  const s = new Date(ev.starts_at);
  if (!ev.ends_at) return timeOf(s);
  const e = new Date(ev.ends_at);
  const sameDay = startOfDay(s).getTime() === startOfDay(e).getTime();
  return `${timeOf(s)} – ${sameDay ? timeOf(e) : `${dayHeading(e)} ${timeOf(e)}`}`;
}

/** "Sat 18 Oct · 10:00". */
export function shortWhen(iso: string): string {
  const d = new Date(iso);
  return `${dayHeading(d)} · ${timeOf(d)}`;
}

/** Called off, over, on now, or still to come. */
export type EventState = 'off' | 'ended' | 'now' | 'soon';
export function eventState(ev: Pick<EventCard, 'starts_at' | 'ends_at' | 'cancelled_at'>, now = Date.now()): EventState {
  if (ev.cancelled_at) return 'off';
  const start = Date.parse(ev.starts_at);
  const end = ev.ends_at ? Date.parse(ev.ends_at) : start + OPEN_ENDED_MS;
  if (now >= end) return 'ended';
  if (now >= start) return 'now';
  return 'soon';
}

/** The plain words for a state other than "still to come". */
export function stateWords(s: EventState): string {
  return s === 'off' ? t('events.calledOff') : s === 'ended' ? t('events.ended') : s === 'now' ? t('events.now') : '';
}

/** "3.2 km", "41 km". */
export function kmText(km: number): string {
  const n = km < 10 ? km.toLocaleString(dateLocale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : Math.round(km).toLocaleString(dateLocale());
  return t('events.km', { km: n });
}

/** "12 going · 3 interested", or '' when nobody has answered. */
export function countsText(ev: Pick<EventCard, 'going_count' | 'interested_count'>): string {
  const out: string[] = [];
  if (ev.going_count > 0) out.push(t('events.goingCount', { count: fmt(ev.going_count) }));
  if (ev.interested_count > 0) out.push(t('events.interestedCount', { count: fmt(ev.interested_count) }));
  return out.join(' · ');
}

/** The church or community it belongs to, for the lines under the title. */
export const hostOf = (ev: EventCard): string => ev.group_name || ev.church_name || '';

/** The place in the computer's maps (Apple Maps on a Mac, its website elsewhere), as a church's Directions does. A pin wins over the words. */
export function mapsLink(ev: Pick<EventCard, 'place' | 'title' | 'lat' | 'lng'>): string {
  const q = encodeURIComponent(ev.place || ev.title);
  return ev.lat !== null && ev.lng !== null ? `https://maps.apple.com/?ll=${ev.lat},${ev.lng}&q=${q}` : `https://maps.apple.com/?q=${q}`;
}

/* ---------- changes, so every list shows them ---------- */

const CHANGED = 'community:events';

/** An event was made, changed, answered or deleted: lists and pages showing events load again. */
export function eventsChanged() {
  window.dispatchEvent(new Event(CHANGED));
}

/** Calls `fn` whenever an event changes anywhere in the app. */
export function useEventsChanged(fn: () => void) {
  useEffect(() => {
    window.addEventListener(CHANGED, fn);
    return () => window.removeEventListener(CHANGED, fn);
  }, [fn]);
}

/* ---------- pictures ---------- */

/** The organiser's photo, or a soft wash in the app's colours with the kind's icon. */
export function EventCover({ uri, kind, className, icon = 34 }: { uri: string; kind: EventKind; className?: string; icon?: number }) {
  return (
    <span className={'ev-cover ' + (className ?? '')}>
      {uri ? <img src={uri} alt="" loading="lazy" draggable={false} /> : <Icon name={kindIcon(kind)} size={icon} stroke={1.7} />}
    </span>
  );
}

/** The month over the day number: "OCT / 18". `chip` sets it on a small card of its own, for over a cover. */
export function DateBlock({ iso, chip }: { iso: string; chip?: boolean }) {
  const d = new Date(iso);
  return (
    <span className={'ev-date' + (chip ? ' chip' : '')} aria-hidden="true">
      <span className="ev-date-month">{monthShort(d)}</span>
      <span className="ev-date-day">{d.getDate()}</span>
    </span>
  );
}

/** Up to five faces of people going, overlapping. */
export function Faces({ urls, size = 20 }: { urls: readonly string[]; size?: number }) {
  const shown = urls.slice(0, 5);
  if (!shown.length) return null;
  return (
    <span className="ev-faces" aria-hidden="true">
      {shown.map((u, i) => (
        <span key={i} className="ev-face" style={{ marginLeft: i ? -Math.round(size * 0.34) : 0 }}>
          <Avatar src={u} name="?" size={size} />
        </span>
      ))}
    </span>
  );
}

/** Faces of people going and how many answered, with my own answer first when I gave one. */
export function GoingLine({ ev }: { ev: EventCard }) {
  const counts = countsText(ev);
  const mine = ev.my_rsvp;
  if (!counts && !mine) return null;
  return (
    <span className="ev-going-line">
      <Faces urls={ev.going_avatars} />
      <span className="ev-going-words">
        {mine ? <b>{t(mine === 'going' ? 'events.going' : 'events.interested')}</b> : null}
        {mine && counts ? ' · ' : ''}
        {counts}
      </span>
    </span>
  );
}

/** The state of an event as a small coloured word ("Happening now", "Called off"), or nothing. */
function StateWord({ state }: { state: EventState }) {
  if (state === 'soon') return null;
  return <span className={'ev-state ' + state}>{stateWords(state)}</span>;
}

/** Everything about an event in one sentence, for a link's title. */
function spoken(ev: EventCard, when: string, km?: number | null): string {
  return [ev.title, stateWords(eventState(ev)), when, ev.place, km != null ? kmText(km) : '', hostOf(ev), countsText(ev)].filter(Boolean).join(', ');
}

/**
 * An event in a list. `mode` 'time' is for a list already set out under day headings (the start time
 * leads); 'date' shows the date block instead, for lists of mixed days.
 */
export function EventRow({ ev, mode, km, to, on }: { ev: EventCard; mode: 'time' | 'date'; km?: number | null; to: string; on?: boolean }) {
  const start = new Date(ev.starts_at);
  const state = eventState(ev);
  const host = hostOf(ev);
  const where = [ev.place, km != null ? kmText(km) : ''].filter(Boolean).join(' · ');
  const first = (mode === 'date' ? [timeOf(start), where || host] : [where || host]).filter(Boolean).join(' · ');
  const second = where && host ? host : '';
  const clock = mode === 'time' ? timeParts(start) : null;
  return (
    <Link to={to} className={'ev-row' + (on ? ' on' : '') + (state === 'off' ? ' off' : '')} title={spoken(ev, mode === 'date' ? shortWhen(ev.starts_at) : timeOf(start), km)}>
      <span className="ev-row-when">
        {clock ? (
          <>
            <b>{clock.main}</b>
            {clock.period ? <span>{clock.period}</span> : null}
          </>
        ) : (
          <DateBlock iso={ev.starts_at} />
        )}
      </span>
      <span className="ev-row-text">
        <StateWord state={state} />
        <b className="ev-row-title">{ev.title}</b>
        {first ? <span className="ev-row-line">{first}</span> : null}
        {second ? <span className="ev-row-line">{second}</span> : null}
        <GoingLine ev={ev} />
      </span>
      <EventCover uri={ev.cover_url} kind={ev.kind} className="ev-row-cover" icon={26} />
    </Link>
  );
}

/** A larger card, for a church's or a community's page: the cover with the date on it, then the title and when. */
export function EventTile({ ev, to, km }: { ev: EventCard; to: string; km?: number | null }) {
  const state = eventState(ev);
  const start = new Date(ev.starts_at);
  const meta = [state === 'soon' ? `${dayHeading(start)} · ${timeOf(start)}` : stateWords(state), ev.place || hostOf(ev), km != null ? kmText(km) : ''].filter(Boolean).join(' · ');
  return (
    <Link to={to} className={'ev-tile' + (state === 'off' ? ' off' : '')} title={spoken(ev, shortWhen(ev.starts_at), km)}>
      <span className="ev-tile-pic">
        <EventCover uri={ev.cover_url} kind={ev.kind} icon={40} />
        <DateBlock iso={ev.starts_at} chip />
      </span>
      <b className="ev-tile-title">{ev.title}</b>
      {meta ? <span className={'ev-tile-meta' + (state === 'now' ? ' now' : '')}>{meta}</span> : null}
      <GoingLine ev={ev} />
    </Link>
  );
}

/** A green map pin whose point is exactly in the middle of whatever it is centred in. */
export function MapPin({ size = 30 }: { size?: number }) {
  return (
    <span className="ev-pin" style={{ width: size, height: size, marginLeft: -size / 2, marginTop: -size / 2 - (size * Math.SQRT2) / 2 }} aria-hidden="true">
      <i />
    </span>
  );
}
