import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Marker, type Region } from 'react-native-maps';
import { useAppFont } from '../lib/fonts';
import { t } from '../lib/i18n';
import { C, dayLabel, fmt } from '../lib/theme';
import type { Church, EventCard, NearbyPerson } from '../lib/types';
import { Icon, VerifiedTick } from './Icon';
import { Avatar } from './ui';

/*
 * What the map shows besides friends: people in Nearby, churches and events, as pins on the map and
 * as rows in the list under it. A map draws a custom pin into a picture, so each pin is only redrawn
 * for a moment after it changes (being chosen, its photo arriving), which keeps panning smooth.
 */

export type Point = { lat: number; lng: number };

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const pad = (n: number) => String(n).padStart(2, '0');

/* ---------- words ---------- */

/** A distance as the churches list shows it: "2.4 km", "12 km". */
export function kmText(km: number): string {
  return `${km < 10 ? km.toFixed(1) : Math.round(km).toLocaleString('en-GB')} km`;
}

/** Someone in Nearby, whose place is only known roughly: "About 2 km away" (never closer than 1). */
export function roughAway(km: number): string {
  return t('map.aboutKm', { n: Math.max(1, Math.round(km)) });
}

/** "Happening now", "Today · 18:30", "Tomorrow · 10:00", "Sat 12 Oct · 10:00". */
export function eventWhen(e: Pick<EventCard, 'starts_at' | 'ends_at'>): string {
  const start = new Date(e.starts_at);
  const now = Date.now();
  // With no end time an event counts as on for six hours after it starts, as the server does.
  const end = e.ends_at ? new Date(e.ends_at).getTime() : start.getTime() + 6 * 3600e3;
  if (start.getTime() <= now && now < end) return t('map.happeningNow');
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOf(start) - startOf(new Date(now))) / 86400e3);
  const day = days === 0 ? t('map.today') : days === 1 ? t('map.tomorrow') : `${WEEKDAYS[start.getDay()]} ${dayLabel(start)}`;
  return `${day} · ${pad(start.getHours())}:${pad(start.getMinutes())}`;
}

function firstName(p: { full_name: string; username: string }): string {
  return (p.full_name || '').trim().split(/\s+/)[0] || p.username;
}

/* ---------- placing pins ---------- */

/**
 * People in Nearby share a rounded place, so several can stand on the very same spot. Each group is
 * set out in rings round its spot, a face's width apart on screen at the zoom given (`degPerPx`: how
 * much latitude one point of the screen covers). Order within a group is fixed, so a refresh doesn't
 * shuffle faces. Returns where to draw each person, by id.
 */
export function spreadOut<T extends Point>(items: readonly T[], idOf: (item: T) => string, degPerPx: number): Map<string, Point> {
  const groups = new Map<string, T[]>();
  for (const it of items) {
    const key = `${it.lat.toFixed(3)},${it.lng.toFixed(3)}`;
    const g = groups.get(key);
    if (g) g.push(it);
    else groups.set(key, [it]);
  }
  const RING = 46;
  const GAP = 58;
  const out = new Map<string, Point>();
  groups.forEach((group) => {
    const { lat, lng } = group[0];
    if (group.length === 1) {
      out.set(idOf(group[0]), { lat, lng });
      return;
    }
    const sorted = [...group].sort((a, b) => (idOf(a) < idOf(b) ? -1 : 1));
    // A degree of longitude is shorter away from the equator.
    const cos = Math.max(0.2, Math.cos((lat * Math.PI) / 180));
    let i = 0;
    for (let ring = 1; i < sorted.length; ring++) {
      const r = RING * ring;
      const n = Math.min(Math.max(3, Math.floor((2 * Math.PI * r) / GAP)), sorted.length - i);
      for (let j = 0; j < n; j++, i++) {
        const a = -Math.PI / 2 + (2 * Math.PI * j) / n + (ring % 2 ? 0 : Math.PI / n);
        out.set(idOf(sorted[i]), { lat: lat - r * Math.sin(a) * degPerPx, lng: lng + (r * Math.cos(a) * degPerPx) / cos });
      }
    }
  });
  return out;
}

/**
 * The items in (or just around) the part of the map on screen, at most `max`, nearest the middle
 * first: a whole country of churches would otherwise be drawn at once. With no region yet, the first
 * `max` as given.
 */
export function inView<T>(items: readonly T[], at: (item: T) => Point, region: Region | null, max: number): T[] {
  if (!region) return items.slice(0, max);
  const latPad = region.latitudeDelta * 0.75;
  const lngPad = region.longitudeDelta * 0.75;
  const inside = items.filter((it) => {
    const p = at(it);
    return Math.abs(p.lat - region.latitude) <= latPad && Math.abs(p.lng - region.longitude) <= lngPad;
  });
  if (inside.length <= max) return inside;
  const d = (it: T) => {
    const p = at(it);
    return (p.lat - region.latitude) ** 2 + (p.lng - region.longitude) ** 2;
  };
  return inside.sort((a, b) => d(a) - d(b)).slice(0, max);
}

/* ---------- pins ---------- */

/** Redraw a pin's picture for `ms` after `key` changes (and when it first appears). */
function useTracking(key: string, ms: number): [boolean, () => void] {
  const [track, setTrack] = useState(true);
  useEffect(() => {
    setTrack(true);
    const timer = setTimeout(() => setTrack(false), ms);
    return () => clearTimeout(timer);
  }, [key, ms]);
  return [track, () => setTrack(false)];
}

const SHADOW = { shadowColor: '#000', shadowOpacity: 0.28, shadowRadius: 5, shadowOffset: { width: 0, height: 2 } } as const;

/** Someone in Nearby: their face in a white ring (friends wear green), and their first name. */
export const PersonPin = React.memo(function PersonPin({ person, lat, lng, chosen, onPress }: { person: NearbyPerson; lat: number; lng: number; chosen: boolean; onPress: (id: string) => void }) {
  const [track, loaded] = useTracking(`${chosen}|${person.avatar_url}`, 2500);
  const size = chosen ? 52 : 44;
  const outer = size + 8;
  const initial = (person.full_name || person.username || '?').trim().charAt(0).toUpperCase() || '?';
  return (
    <Marker
      coordinate={{ latitude: lat, longitude: lng }}
      anchor={{ x: 0.5, y: outer / 2 / (outer + 26) }}
      tracksViewChanges={track}
      onPress={(e: any) => {
        e?.stopPropagation?.();
        onPress(person.user_id);
      }}
      accessibilityLabel={`${person.full_name || person.username}. ${roughAway(person.km)}`}>
      <View style={{ alignItems: 'center', width: 96, height: outer + 26 }}>
        <View style={[{ width: outer, height: outer, borderRadius: outer / 2, borderWidth: 3, borderColor: chosen ? C.green : '#ffffff', padding: 1, backgroundColor: '#ffffff' }, SHADOW]}>
          {person.avatar_url ? (
            <Image source={{ uri: person.avatar_url }} style={{ flex: 1, borderRadius: size / 2 }} contentFit="cover" onLoad={loaded} />
          ) : (
            <View style={{ flex: 1, borderRadius: size / 2, backgroundColor: '#272e38', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: size * 0.42 }}>{initial}</Text>
            </View>
          )}
        </View>
        <View style={{ marginTop: 4, maxWidth: 96, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 9, backgroundColor: 'rgba(11,16,20,0.8)' }}>
          <Text numberOfLines={1} style={{ color: '#ffffff', fontSize: 12, fontWeight: '700' }}>{firstName(person)}</Text>
        </View>
      </View>
    </Marker>
  );
});

/** A church: a white disc with the church mark; green when chosen. */
export const ChurchPin = React.memo(function ChurchPin({ church, chosen, onPress }: { church: Church; chosen: boolean; onPress: (id: string) => void }) {
  const [track] = useTracking(String(chosen), 900);
  const size = chosen ? 44 : 34;
  return (
    <Marker
      coordinate={{ latitude: church.lat ?? 0, longitude: church.lng ?? 0 }}
      anchor={{ x: 0.5, y: 0.5 }}
      tracksViewChanges={track}
      onPress={(e: any) => {
        e?.stopPropagation?.();
        onPress(church.id);
      }}
      accessibilityLabel={church.name}>
      <View style={{ padding: 4 }}>
        <View style={[{ width: size, height: size, borderRadius: size / 2, borderWidth: 2.5, borderColor: '#ffffff', backgroundColor: chosen ? C.green : '#ffffff', alignItems: 'center', justifyContent: 'center' }, SHADOW]}>
          <Icon name="church" size={size * 0.56} color={chosen ? '#ffffff' : C.green} weight={2.1} />
        </View>
      </View>
    </Marker>
  );
});

/** An event: a little calendar leaf with its month and day. Several at one place are set round it (spreadOut). */
export const EventPin = React.memo(function EventPin({ event, lat, lng, chosen, onPress }: { event: EventCard; lat: number; lng: number; chosen: boolean; onPress: (id: string) => void }) {
  const [track] = useTracking(`${chosen}|${event.starts_at}`, 900);
  return (
    <Marker
      coordinate={{ latitude: lat, longitude: lng }}
      anchor={{ x: 0.5, y: 0.5 }}
      tracksViewChanges={track}
      onPress={(e: any) => {
        e?.stopPropagation?.();
        onPress(event.id);
      }}
      accessibilityLabel={`${event.title}. ${eventWhen(event)}`}>
      <View style={{ padding: 4 }}>
        <DateBadge iso={event.starts_at} size={chosen ? 46 : 36} pin />
      </View>
    </Marker>
  );
});

/** The month over the day, as on a calendar leaf. `pin` gives it the white edge and shadow a pin needs. */
export function DateBadge({ iso, size, pin }: { iso: string; size: number; pin?: boolean }) {
  const d = new Date(iso);
  const strip = Math.round(size * 0.32);
  const radius = Math.round(size * 0.24);
  const leaf = (
    <View style={{ width: size, height: size, borderRadius: radius, overflow: 'hidden', backgroundColor: pin ? '#ffffff' : C.surface }}>
      <View style={{ height: strip, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' }}>
        <Text allowFontScaling={false} style={{ color: '#ffffff', fontSize: Math.max(8, size * 0.2), fontWeight: '800', letterSpacing: 0.5 }}>{MONTHS[d.getMonth()]}</Text>
      </View>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Text allowFontScaling={false} style={{ color: pin ? '#0f1419' : C.fg, fontSize: size * 0.42, fontWeight: '800', fontVariant: ['tabular-nums'] }}>{d.getDate()}</Text>
      </View>
    </View>
  );
  if (!pin) return leaf;
  return <View style={[{ borderRadius: radius + 2, borderWidth: 2, borderColor: '#ffffff', backgroundColor: '#ffffff' }, SHADOW]}>{leaf}</View>;
}

/* ---------- rows in the list under the map ---------- */

const rowStyle = { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12, paddingHorizontal: 16, minHeight: 64, paddingVertical: 8 };

export const PersonRow = React.memo(function PersonRow({ person, onPress }: { person: NearbyPerson; onPress: (id: string) => void }) {
  const font = useAppFont();
  const fontBold = useAppFont('bold');
  const away = roughAway(person.km);
  return (
    <Pressable onPress={() => onPress(person.user_id)} accessibilityRole="button" accessibilityLabel={`${person.full_name || person.username}, ${away}`} style={({ pressed }) => [rowStyle, { backgroundColor: pressed ? C.press : 'transparent' }]}>
      <Avatar uri={person.avatar_url} name={person.full_name || person.username} size={44} />
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Text numberOfLines={1} style={{ flexShrink: 1, color: C.fg, fontSize: 16, fontWeight: '600', fontFamily: fontBold }}>{person.full_name || person.username}</Text>
          {person.verified ? <VerifiedTick size={13} /> : null}
        </View>
        <Text numberOfLines={1} style={{ color: C.fg2, fontSize: 13.5, marginTop: 1, fontFamily: font }}>{away}</Text>
      </View>
    </Pressable>
  );
});

/** Where a church is, as one line: its address, else its town and country. */
export function churchPlace(c: Church): string {
  const address = (c.address ?? '').trim();
  const town = [c.city, c.country].map((s) => (s ?? '').trim()).filter(Boolean).join(', ');
  if (address && town && !address.toLowerCase().includes((c.city ?? '').trim().toLowerCase())) return `${address}, ${town}`;
  return address || town;
}

export const ChurchRow = React.memo(function ChurchRow({ church, km, onPress }: { church: Church; km: number | null; onPress: (id: string) => void }) {
  const font = useAppFont();
  const fontBold = useAppFont('bold');
  const place = churchPlace(church);
  const dist = km === null ? '' : kmText(km);
  return (
    <Pressable onPress={() => onPress(church.id)} accessibilityRole="button" accessibilityLabel={[church.name, place, dist].filter(Boolean).join(', ')} style={({ pressed }) => [rowStyle, { backgroundColor: pressed ? C.press : 'transparent' }]}>
      <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="church" size={23} color={C.accent2} />
      </View>
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={{ color: C.fg, fontSize: 16, fontWeight: '600', fontFamily: fontBold }}>{church.name}</Text>
        {place ? <Text numberOfLines={1} style={{ color: C.fg2, fontSize: 13.5, marginTop: 1, fontFamily: font }}>{place}</Text> : null}
      </View>
      {dist ? <Text style={{ color: C.fg2, fontSize: 14, fontFamily: font }}>{dist}</Text> : null}
    </Pressable>
  );
});

export const EventRow = React.memo(function EventRow({ event, km, onPress }: { event: EventCard; km: number | null; onPress: (id: string) => void }) {
  const font = useAppFont();
  const fontBold = useAppFont('bold');
  const when = eventWhen(event);
  const where = [event.place.trim(), km === null ? '' : kmText(km)].filter(Boolean).join(' · ');
  const going = event.going_count > 0 ? t('map.going', { n: fmt(event.going_count) }) : '';
  return (
    <Pressable onPress={() => onPress(event.id)} accessibilityRole="button" accessibilityLabel={[event.title, when, where, going].filter(Boolean).join(', ')} style={({ pressed }) => [rowStyle, { backgroundColor: pressed ? C.press : 'transparent' }]}>
      <DateBadge iso={event.starts_at} size={44} />
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={{ color: C.fg, fontSize: 16, fontWeight: '600', fontFamily: fontBold }}>{event.title}</Text>
        <Text numberOfLines={1} style={{ color: C.fg2, fontSize: 13.5, marginTop: 1, fontFamily: font }}>{[when, where].filter(Boolean).join(' · ')}</Text>
        {going ? <Text numberOfLines={1} style={{ color: C.accent2, fontSize: 13, fontWeight: '600', marginTop: 1, fontFamily: fontBold }}>{going}</Text> : null}
      </View>
    </Pressable>
  );
});
