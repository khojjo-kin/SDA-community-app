import React from 'react';
import { DimensionValue, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useAppFont } from '../lib/fonts';
import { type Key, t } from '../lib/i18n';
import { C, dayLabel, fmt, monthName } from '../lib/theme';
import type { EventCard, EventKind } from '../lib/types';
import { Icon, IconName } from './Icon';
import { Skeleton, SkeletonFrame } from './Skeleton';

/*
 * The pieces of a church event that more than one screen shows: the row in a list, the larger tile
 * in a strip (Near you, a church's page), the cover with its fallback, the date block, the faces of
 * people going, and the words for when it is.
 */

/* ---------- kinds ---------- */

/** The kinds of event, in the order the organiser is offered them, each with its words and icon. */
export const EVENT_KINDS: readonly { kind: EventKind; label: Key; icon: IconName }[] = [
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
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
/** 0 for today, 1 for tomorrow, -1 for yesterday. */
export const daysFromToday = (d: Date) => Math.round((startOfDay(d).getTime() - startOfDay(new Date()).getTime()) / DAY_MS);

/** The day's name in the phone's language: "Sat", "Saturday" or "S". */
export function weekday(d: Date, style: 'short' | 'long' | 'narrow' = 'short'): string {
  try {
    const s = d.toLocaleDateString(undefined, { weekday: style });
    if (s) return s;
  } catch {
    // An engine without dates in other languages: English below.
  }
  const name = WEEKDAYS[d.getDay()];
  return style === 'long' ? name : style === 'narrow' ? name.charAt(0) : name.slice(0, 3);
}

/** "10:00" or "10:00 am", as the phone writes times. */
export function timeOf(d: Date): string {
  try {
    return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  } catch {
    return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
}

/**
 * The time split from its "am"/"pm" (when the phone writes one), so a narrow column can set the
 * period small under the time instead of breaking the time across two lines.
 */
export function timeParts(d: Date): { main: string; period: string } {
  try {
    const f = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
    if (typeof f.formatToParts === 'function') {
      const parts = f.formatToParts(d);
      const period = parts.find((p) => p.type === 'dayPeriod')?.value ?? '';
      const main = parts.filter((p) => p.type !== 'dayPeriod').map((p) => p.value).join('').trim();
      if (main) return { main, period };
    }
  } catch {
    // No Intl: the whole time on one line.
  }
  return { main: timeOf(d), period: '' };
}

export const monthShort = (d: Date) => monthName(d).slice(0, 3);
const yearIfOther = (d: Date) => (d.getFullYear() === new Date().getFullYear() ? '' : ` ${d.getFullYear()}`);

/** "Today", "Tomorrow", "Sat 18 Oct" (with the year when it isn't this one). */
export function dayHeading(d: Date): string {
  const n = daysFromToday(d);
  if (n === 0) return t('liveSchedule.today');
  if (n === 1) return t('liveSchedule.tomorrow');
  return `${weekday(d)} ${dayLabel(d)}${yearIfOther(d)}`;
}

/** "Saturday 18 October" (with the year when it isn't this one). */
export function longDay(d: Date): string {
  return `${weekday(d, 'long')} ${d.getDate()} ${monthName(d)}${yearIfOther(d)}`;
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
const stateColour = (s: EventState) => (s === 'off' ? C.like : s === 'now' ? C.accent2 : C.fg3);

/** "3.2 km", "41 km". */
export function kmText(km: number): string {
  return t('events.km', { km: km < 10 ? km.toFixed(1) : Math.round(km).toLocaleString('en-GB') });
}

/** "12 going · 3 interested", or '' when nobody has answered. */
export function countsText(ev: Pick<EventCard, 'going_count' | 'interested_count'>): string {
  const parts: string[] = [];
  if (ev.going_count > 0) parts.push(t('events.goingCount', { count: fmt(ev.going_count) }));
  if (ev.interested_count > 0) parts.push(t('events.interestedCount', { count: fmt(ev.interested_count) }));
  return parts.join(' · ');
}

/* ---------- pictures ---------- */

/** The organiser's photo, or a soft wash in the app's colours with the kind's icon. */
export function EventCover({ uri, kind, width, height, radius = 0, icon = 34 }: { uri: string; kind: EventKind; width: DimensionValue; height: DimensionValue; radius?: number; icon?: number }) {
  if (uri) {
    return <Image source={{ uri }} style={{ width, height, borderRadius: radius, backgroundColor: C.surface }} contentFit="cover" transition={150} cachePolicy="memory-disk" accessibilityIgnoresInvertColors />;
  }
  return (
    <View style={{ width, height, borderRadius: radius, overflow: 'hidden', backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' }}>
      <LinearGradient colors={[C.accent + '3d', C.close + '1f']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <Icon name={kindIcon(kind)} size={icon} color={C.accent2} weight={1.7} />
    </View>
  );
}

/** The month over the day number: "OCT / 18". `chip` sets it on a small card of its own, for over a cover. */
export function DateBlock({ iso, chip }: { iso: string; chip?: boolean }) {
  const d = new Date(iso);
  const font = useAppFont('bold');
  return (
    <View style={chip ? { width: 48, paddingVertical: 5, borderRadius: 12, alignItems: 'center', backgroundColor: C.bg } : { width: 48, alignItems: 'center' }}>
      <Text style={{ color: C.accent2, fontSize: 11.5, fontWeight: '800', letterSpacing: 0.8 }}>{monthShort(d).toUpperCase()}</Text>
      <Text style={{ color: C.fg, fontSize: 22, lineHeight: 26, fontWeight: '800', fontFamily: font, fontVariant: ['tabular-nums'] }}>{d.getDate()}</Text>
    </View>
  );
}

/** Up to five faces, overlapping. `ring` is the colour round each, to match what they sit on. */
export const Faces = React.memo(function Faces({ urls, size = 20, ring }: { urls: readonly string[]; size?: number; ring?: string }) {
  const shown = urls.slice(0, 5);
  if (!shown.length) return null;
  const outer = size + 4;
  return (
    <View style={{ flexDirection: 'row' }} accessible={false}>
      {shown.map((u, i) => (
        <View key={i} style={{ marginLeft: i ? -Math.round(size * 0.34) : 0, width: outer, height: outer, borderRadius: outer / 2, backgroundColor: ring ?? C.bg, alignItems: 'center', justifyContent: 'center' }}>
          {u ? (
            <Image source={{ uri: u }} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: C.surface2 }} contentFit="cover" cachePolicy="memory-disk" />
          ) : (
            <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="user" size={Math.round(size * 0.62)} color={C.fg2} weight={2.2} />
            </View>
          )}
        </View>
      ))}
    </View>
  );
});

/** Faces of people going and how many answered, with my own answer first when I gave one. */
function GoingLine({ ev }: { ev: EventCard }) {
  const counts = countsText(ev);
  const mine = ev.my_rsvp;
  if (!counts && !mine) return null;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }}>
      <Faces urls={ev.going_avatars} />
      <Text numberOfLines={1} style={{ flexShrink: 1, color: C.fg2, fontSize: 13 }}>
        {mine ? <Text style={{ color: C.accent2, fontWeight: '700' }}>{t(mine === 'going' ? 'events.going' : 'events.interested')}</Text> : null}
        {mine && counts ? ' · ' : ''}
        {counts}
      </Text>
    </View>
  );
}

/** Where it is and whose it is, for the lines under the title. */
function hostOf(ev: EventCard): string {
  return ev.group_name || ev.church_name || '';
}

function spoken(ev: EventCard, when: string, km?: number | null): string {
  const s = eventState(ev);
  return [ev.title, stateWords(s), when, ev.place, km != null ? kmText(km) : '', hostOf(ev), countsText(ev)].filter(Boolean).join(', ');
}

/**
 * An event in a list. `mode` 'time' is for a list already set out under day headings (the start time
 * leads); 'date' shows the date block instead, for lists of mixed days.
 */
export const EventRow = React.memo(function EventRow({ ev, mode, km, onOpen }: { ev: EventCard; mode: 'time' | 'date'; km?: number | null; onOpen: (id: string) => void }) {
  const fontBold = useAppFont('bold');
  const start = new Date(ev.starts_at);
  const state = eventState(ev);
  const host = hostOf(ev);
  const where = [ev.place, km != null ? kmText(km) : ''].filter(Boolean).join(' · ');
  const first = (mode === 'date' ? [timeOf(start), where || host] : [where || host]).filter(Boolean).join(' · ');
  const second = where && host ? host : '';
  const clock = mode === 'time' ? timeParts(start) : null;
  return (
    <Pressable
      onPress={() => onOpen(ev.id)}
      accessibilityRole="button"
      accessibilityLabel={spoken(ev, mode === 'date' ? shortWhen(ev.starts_at) : timeOf(start), km)}
      style={({ pressed }) => ({ flexDirection: 'row', gap: 14, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: pressed ? C.press : 'transparent' })}>
      <View style={{ width: 52, paddingTop: mode === 'date' ? 0 : 1 }}>
        {clock ? (
          <>
            <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} style={{ color: C.fg, fontSize: 15, lineHeight: 20, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{clock.main}</Text>
            {clock.period ? <Text numberOfLines={1} style={{ color: C.fg2, fontSize: 12, fontWeight: '600' }}>{clock.period}</Text> : null}
          </>
        ) : (
          <DateBlock iso={ev.starts_at} />
        )}
      </View>
      <View style={{ flex: 1, minHeight: 76 }}>
        {state !== 'soon' ? <Text style={{ color: stateColour(state), fontSize: 12.5, fontWeight: '700', marginBottom: 1 }}>{stateWords(state)}</Text> : null}
        <Text numberOfLines={2} style={{ color: state === 'off' ? C.fg2 : C.fg, fontSize: 16, lineHeight: 21, fontWeight: '700', fontFamily: fontBold }}>{ev.title}</Text>
        {first ? <Text numberOfLines={1} style={{ color: C.fg2, fontSize: 14, marginTop: 2 }}>{first}</Text> : null}
        {second ? <Text numberOfLines={1} style={{ color: C.fg2, fontSize: 14 }}>{second}</Text> : null}
        <GoingLine ev={ev} />
      </View>
      <EventCover uri={ev.cover_url} kind={ev.kind} width={76} height={76} radius={14} icon={30} />
    </Pressable>
  );
});

/** A larger card for a sideways strip: the cover with the date on it, then the title and the when. */
export const EventTile = React.memo(function EventTile({ ev, width, km, onOpen }: { ev: EventCard; width: number; km?: number | null; onOpen: (id: string) => void }) {
  const fontBold = useAppFont('bold');
  const h = Math.round(width * 0.6);
  const state = eventState(ev);
  const start = new Date(ev.starts_at);
  const meta = [state === 'soon' ? timeOf(start) : stateWords(state), ev.place || hostOf(ev), km != null ? kmText(km) : ''].filter(Boolean).join(' · ');
  return (
    <Pressable onPress={() => onOpen(ev.id)} accessibilityRole="button" accessibilityLabel={spoken(ev, shortWhen(ev.starts_at), km)} style={({ pressed }) => ({ width, opacity: pressed ? 0.8 : 1 })}>
      <View style={{ width, height: h, borderRadius: 16, overflow: 'hidden' }}>
        <EventCover uri={ev.cover_url} kind={ev.kind} width={width} height={h} icon={40} />
        <View style={{ position: 'absolute', top: 10, left: 10 }}>
          <DateBlock iso={ev.starts_at} chip />
        </View>
      </View>
      <Text numberOfLines={2} style={{ color: state === 'off' ? C.fg2 : C.fg, fontSize: 15.5, lineHeight: 20, fontWeight: '700', marginTop: 10, fontFamily: fontBold }}>{ev.title}</Text>
      {meta ? <Text numberOfLines={1} style={{ color: state === 'off' ? C.like : C.fg2, fontSize: 13.5, marginTop: 2 }}>{meta}</Text> : null}
      <GoingLine ev={ev} />
    </Pressable>
  );
});

/* ---------- the pin on a map ---------- */

/**
 * A map pin in the app's green: a drop whose point is exactly in the middle of whatever it is centred
 * in, so it can sit over the centre of a map (which is where the place is).
 */
export function MapPin({ size = 30 }: { size?: number }) {
  // A square with three round corners, turned so the square corner points down. Its point is half a
  // diagonal below its middle, so it is lifted by that much.
  const lift = (size * Math.SQRT2) / 2;
  return (
    <View
      style={{
        width: size,
        height: size,
        borderTopLeftRadius: size / 2,
        borderTopRightRadius: size / 2,
        borderBottomLeftRadius: size / 2,
        borderBottomRightRadius: 2,
        backgroundColor: C.accent,
        borderWidth: 2.5,
        borderColor: '#ffffff',
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#000',
        shadowOpacity: 0.3,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 2 },
        transform: [{ translateY: -lift }, { rotate: '45deg' }],
      }}>
      <View style={{ width: size * 0.32, height: size * 0.32, borderRadius: size, backgroundColor: '#ffffff' }} />
    </View>
  );
}

/* ---------- loading shapes ---------- */

/** Event rows while the list loads, drawn to EventRow's measurements. */
export function EventRowsSkeleton({ count = 5, heading = true }: { count?: number; heading?: boolean }) {
  const { width } = useWindowDimensions();
  const textX = 16 + 52 + 14;
  const room = width - textX - 14 - 76 - 16;
  return (
    <SkeletonFrame style={{ paddingTop: 6 }}>
      {heading ? <Skeleton width={96} height={16} x={16} style={{ marginLeft: 16, marginTop: 14, marginBottom: 10 }} /> : null}
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={{ flexDirection: 'row', gap: 14, paddingHorizontal: 16, paddingVertical: 10 }}>
          <Skeleton width={44} height={16} x={16} />
          <View style={{ flex: 1, gap: 9, paddingTop: 2 }}>
            <Skeleton width={Math.round(room * (i % 2 ? 0.78 : 0.94))} height={14} x={textX} />
            <Skeleton width={Math.round(room * (i % 2 ? 0.52 : 0.66))} height={11} x={textX} />
            <Skeleton width={Math.round(room * 0.42)} height={11} x={textX} />
          </View>
          <Skeleton width={76} height={76} radius={14} x={width - 16 - 76} />
        </View>
      ))}
    </SkeletonFrame>
  );
}

/** Two tiles of a strip while it loads. */
export function EventTilesSkeleton({ width }: { width: number }) {
  const h = Math.round(width * 0.6);
  return (
    <SkeletonFrame style={{ flexDirection: 'row', gap: 12, paddingHorizontal: 16 }}>
      {[0, 1].map((i) => (
        <View key={i} style={{ width, gap: 9 }}>
          <Skeleton width={width} height={h} radius={16} x={16 + i * (width + 12)} />
          <Skeleton width={Math.round(width * 0.7)} height={14} x={16 + i * (width + 12)} />
          <Skeleton width={Math.round(width * 0.45)} height={11} x={16 + i * (width + 12)} />
        </View>
      ))}
    </SkeletonFrame>
  );
}
