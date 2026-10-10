import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Keyboard, Linking, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Location from 'expo-location';
import MapView, { type Region } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EVENT_KINDS, EventCover, MapPin, dayHeading, startOfDay, timeOf, weekday } from '../../src/components/EventCard';
import { Icon, IconName } from '../../src/components/Icon';
import { RowsSkeleton } from '../../src/components/Skeleton';
import { Button, Empty, ErrorNote, Field, IconButton, Loading, Radio, Row, Screen, ScreenHeader, SearchField, Sheet, useToast } from '../../src/components/ui';
import { canPostIn, createEvent, fetchChurch, fetchChurches, fetchEvent, fetchGroup, fetchMyGroups, updateEvent, uploadImage } from '../../src/lib/api';
import { useAppFont } from '../../src/lib/fonts';
import { tap } from '../../src/lib/haptics';
import { useT } from '../../src/lib/i18n';
import { pickFromLibrary } from '../../src/lib/pick';
import { useSession } from '../../src/lib/session';
import { C, errText, monthName } from '../../src/lib/theme';
import type { Church, EventCard, EventInput, EventKind, Group } from '../../src/lib/types';

/*
 * Making an event, or changing one with `?id=`. `?church=` or `?group=` starts a new one there.
 * Slides up from the bottom; Share (or Save) at the top right. The day is picked on a small calendar
 * and the times from a row of quarter hours, as a live is scheduled (src/components/LiveSchedule.tsx).
 */

type Point = { lat: number; lng: number };
type ChurchChoice = { id: string; name: string; lat: number | null; lng: number | null };
type GroupChoice = { id: string; name: string };
type Errors = { title?: string; when?: string };
type Picker = 'date' | 'start' | 'end';

const DAY_MS = 86400e3;
/** Times are offered every quarter of an hour. */
const STEP = 15;
/** The database takes events up to two years ahead; a day less keeps a late time on the last day inside that. */
const AHEAD_DAYS = 729;
const CHIP_W = 92;
const CHIP_GAP = 8;
/** A Monday, for the calendar's weekday letters (the week starts on Monday). */
const A_MONDAY = new Date(2024, 0, 1);

/** The moment `minutes` after the start of `day` (past midnight runs on into the next day). */
const atMinutes = (day: Date, minutes: number) => new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, minutes);
/**
 * How far into `day` (a start of day) `at` is, in minutes by the clock, as `atMinutes` counts them: on the
 * day the clocks change, 10:00 is still 600 (time gone by would make it 540 or 660, and an edit an hour out).
 */
const minutesInto = (day: Date, at: Date) => Math.round((startOfDay(at).getTime() - day.getTime()) / DAY_MS) * 24 * 60 + at.getHours() * 60 + at.getMinutes();
/** A new event starts on the hour, about an hour from now. */
function firstStart(): { day: Date; min: number } {
  const at = new Date(Date.now() + 60 * 60e3);
  at.setMinutes(0, 0, 0);
  return { day: startOfDay(at), min: at.getHours() * 60 };
}
const near = (lat: number, lng: number, d = 0.01): Region => ({ latitude: lat, longitude: lng, latitudeDelta: d, longitudeDelta: d });
const WORLD: Region = { latitude: 20, longitude: 0, latitudeDelta: 100, longitudeDelta: 100 };

/* ---------- small pieces ---------- */

/** A line that opens a picker under it: icon, what it is, the value chosen, and an arrow. */
function PickRow({ icon, label, value, placeholder, open, onPress, onClear, clearLabel, chevron = 'down' }: { icon: IconName; label: string; value: string; placeholder?: boolean; open?: boolean; onPress: () => void; onClear?: () => void; clearLabel?: string; chevron?: 'down' | 'right' }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${value}`}
      accessibilityState={{ expanded: chevron === 'down' ? !!open : undefined }}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, minHeight: 52, backgroundColor: pressed ? C.press : 'transparent' })}>
      <Icon name={icon} size={24} color={C.fg} />
      <Text style={{ flex: 1, color: C.fg, fontSize: 16.5 }}>{label}</Text>
      <Text numberOfLines={1} style={{ maxWidth: '58%', color: placeholder || open ? C.accent2 : C.fg2, fontSize: 16, fontWeight: placeholder ? '600' : '500' }}>{value}</Text>
      {onClear ? (
        <Pressable onPress={onClear} hitSlop={10} accessibilityRole="button" accessibilityLabel={clearLabel} style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}>
          <Icon name="close" size={16} color={C.fg2} weight={2.4} />
        </Pressable>
      ) : (
        <View style={{ transform: [{ rotate: chevron === 'down' && open ? '180deg' : '0deg' }] }}>
          <Icon name={chevron} size={18} color={C.fg2} weight={2} />
        </View>
      )}
    </Pressable>
  );
}

/** A month at a time, Monday first. Days before `min` or after `max` can't be chosen. */
function Calendar({ value, onChange, min, max }: { value: Date; onChange: (d: Date) => void; min: Date; max: Date }) {
  const t = useT();
  const { width } = useWindowDimensions();
  const [month, setMonth] = useState(() => new Date(value.getFullYear(), value.getMonth(), 1));
  const cell = Math.floor((width - 32) / 7);
  const letters = useMemo(() => Array.from({ length: 7 }, (_, i) => weekday(new Date(A_MONDAY.getFullYear(), 0, 1 + i), 'narrow')), []);
  const days = useMemo(() => {
    const lead = (month.getDay() + 6) % 7;
    const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const out: (Date | null)[] = Array.from({ length: lead }, () => null);
    for (let d = 1; d <= count; d++) out.push(new Date(month.getFullYear(), month.getMonth(), d));
    while (out.length % 7) out.push(null);
    return out;
  }, [month]);
  const first = new Date(min.getFullYear(), min.getMonth(), 1).getTime();
  const last = new Date(max.getFullYear(), max.getMonth(), 1).getTime();
  const canBack = month.getTime() > first;
  const canOn = month.getTime() < last;
  const today = startOfDay(new Date()).getTime();
  const step = (n: number) => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + n, 1));
  return (
    <View style={{ paddingHorizontal: 16, paddingBottom: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', height: 44 }}>
        <Text accessibilityRole="header" style={{ flex: 1, color: C.fg, fontSize: 16.5, fontWeight: '700' }}>{`${monthName(month)} ${month.getFullYear()}`}</Text>
        <IconButton name="back" size={20} label={t('events.prevMonth')} color={canBack ? C.fg : C.fg3} onPress={canBack ? () => step(-1) : undefined} />
        <IconButton name="right" size={20} label={t('events.nextMonth')} color={canOn ? C.fg : C.fg3} onPress={canOn ? () => step(1) : undefined} />
      </View>
      <View style={{ flexDirection: 'row' }}>
        {letters.map((l, i) => (
          <Text key={i} style={{ width: cell, textAlign: 'center', color: C.fg3, fontSize: 12.5, fontWeight: '600', paddingVertical: 4 }}>{l}</Text>
        ))}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {days.map((d, i) => {
          if (!d) return <View key={i} style={{ width: cell, height: Math.min(cell, 44) }} />;
          const ms = d.getTime();
          const off = ms < min.getTime() || ms > max.getTime();
          const on = ms === value.getTime();
          const isToday = ms === today;
          const ring = Math.min(cell, 44) - 6;
          return (
            <Pressable
              key={i}
              disabled={off}
              onPress={() => {
                tap('select');
                onChange(d);
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: on, disabled: off }}
              accessibilityLabel={`${weekday(d, 'long')} ${d.getDate()} ${monthName(d)}`}
              style={{ width: cell, height: Math.min(cell, 44), alignItems: 'center', justifyContent: 'center' }}>
              {({ pressed }) => (
                <View style={{ width: ring, height: ring, borderRadius: ring / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? C.accent : pressed ? C.press : 'transparent' }}>
                  <Text style={{ color: on ? C.onAccent : off ? C.fg3 : isToday ? C.accent2 : C.fg, opacity: off ? 0.5 : 1, fontSize: 15.5, fontWeight: on || isToday ? '700' : '500', fontVariant: ['tabular-nums'] }}>{d.getDate()}</Text>
                </View>
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** Quarter hours in a row; the chosen one stays in sight. `nextDay` marks times after midnight. */
function TimeStrip({ times, value, onChange, day }: { times: number[]; value: number | null; onChange: (m: number) => void; day: Date }) {
  const t = useT();
  const ref = useRef<ScrollView>(null);
  useEffect(() => {
    const i = value === null ? -1 : times.indexOf(value);
    const id = setTimeout(() => ref.current?.scrollTo({ x: Math.max(0, i * (CHIP_W + CHIP_GAP) - 90), animated: false }), 40);
    return () => clearTimeout(id);
    // Only as it opens: following every tap would fight the finger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <ScrollView ref={ref} horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 16, gap: CHIP_GAP, paddingTop: 2, paddingBottom: 12 }}>
      {times.map((m) => {
        const on = m === value;
        const label = timeOf(atMinutes(day, m));
        const later = m >= 24 * 60;
        return (
          <Pressable
            key={m}
            onPress={() => {
              tap('select');
              onChange(m);
            }}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            accessibilityLabel={later ? `${label} ${t('events.nextDay')}` : label}
            style={({ pressed }) => ({ width: CHIP_W, height: 40, borderRadius: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3, backgroundColor: on ? C.accent : C.surface, opacity: pressed ? 0.75 : 1 })}>
            <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={{ color: on ? C.onAccent : C.fg, fontSize: 14.5, fontWeight: '600', fontVariant: ['tabular-nums'] }}>{label}</Text>
            {later ? <Text style={{ color: on ? C.onAccent : C.fg2, fontSize: 11, fontWeight: '700', marginTop: -6 }}>{t('events.nextDay')}</Text> : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/** A small map with the pin, not to be moved about: the place as it will show on the event. */
function PinPreview({ pin }: { pin: Point }) {
  return (
    <View pointerEvents="none" style={{ height: 150, borderRadius: 16, overflow: 'hidden', backgroundColor: C.surface }}>
      <MapView
        // A new pin draws a new map, centred on it.
        key={`${pin.lat},${pin.lng}`}
        style={StyleSheet.absoluteFill}
        initialRegion={near(pin.lat, pin.lng, 0.008)}
        userInterfaceStyle={C.statusBar === 'light' ? 'dark' : 'light'}
        showsCompass={false}
        pitchEnabled={false}
        rotateEnabled={false}
      />
      <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
        <MapPin />
      </View>
    </View>
  );
}

/** A plain green text action with a small icon. */
function TextAction({ icon, label, onPress, busy }: { icon: IconName; label: string; onPress: () => void; busy?: boolean }) {
  return (
    <Pressable disabled={busy} onPress={onPress} hitSlop={8} accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 5, opacity: pressed || busy ? 0.55 : 1 })}>
      <Icon name={icon} size={16} color={C.accent2} weight={2.2} />
      <Text style={{ color: C.accent2, fontSize: 14.5, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}

/* ---------- the screen ---------- */

export default function EventEdit() {
  const t = useT();
  const params = useLocalSearchParams<{ id?: string; church?: string; group?: string }>();
  const editId = typeof params.id === 'string' && params.id ? params.id : '';
  const churchParam = !editId && typeof params.church === 'string' && params.church ? params.church : '';
  const groupParam = !editId && !churchParam && typeof params.group === 'string' && params.group ? params.group : '';
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { me, profile } = useSession();
  const fontBold = useAppFont('bold');

  const first = useMemo(firstStart, []);
  const [existing, setExisting] = useState<EventCard | null>(null);
  const [loadError, setLoadError] = useState('');
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<EventKind>('service');
  const [description, setDescription] = useState('');
  const [place, setPlace] = useState('');
  const [pin, setPin] = useState<Point | null>(null);
  // A newly chosen photo (uploaded only on save), or the one already there when editing.
  const [cover, setCover] = useState<{ uri: string; width: number } | null>(null);
  const [coverUrl, setCoverUrl] = useState('');
  // A new event belongs to the member's own church unless they choose another (or none).
  const [church, setChurch] = useState<ChurchChoice | null>(() =>
    churchParam ? { id: churchParam, name: '', lat: null, lng: null } : !editId && !groupParam && profile?.church_id ? { id: profile.church_id, name: profile.church_name ?? '', lat: null, lng: null } : null,
  );
  const [group, setGroup] = useState<GroupChoice | null>(null);
  const [day, setDay] = useState(first.day);
  const [startMin, setStartMin] = useState(first.min);
  const [endMin, setEndMin] = useState<number | null>(null);
  const [picker, setPicker] = useState<Picker | null>(null);
  const [sheet, setSheet] = useState<'pin' | 'church' | 'group' | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  // The communities I can post in (null while loading); the row shows only if there are any.
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [churches, setChurches] = useState<Church[] | null>(null);
  const [churchError, setChurchError] = useState('');
  const [q, setQ] = useState('');
  // The pin sheet: where its map opens (null while that's worked out), whether to show me on it.
  const [pinStart, setPinStart] = useState<Region | null>(null);
  const [showMe, setShowMe] = useState(false);
  const pinMap = useRef<MapView>(null);
  const pinCentre = useRef<Region | null>(null);
  const scroller = useRef<ScrollView>(null);
  // The start as saved, when editing: kept as it is unless the date or time is changed.
  const original = useRef<{ iso: string; ms: number } | null>(null);
  const working = useRef(false);
  // The chosen photo once uploaded, so a second try at saving doesn't upload it again.
  const uploaded = useRef<{ uri: string; url: string } | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  /* ---------- loading what's there ---------- */

  const load = useCallback(async () => {
    if (!editId) return;
    setLoadError('');
    try {
      const ev = await fetchEvent(editId);
      if (!alive.current) return;
      if (!ev) {
        setLoadError(t('events.gone'));
        return;
      }
      const start = new Date(ev.starts_at);
      const d = startOfDay(start);
      original.current = { iso: ev.starts_at, ms: start.getTime() };
      setExisting(ev);
      setTitle(ev.title);
      setKind(ev.kind);
      setDescription(ev.description);
      setPlace(ev.place);
      setPin(ev.lat !== null && ev.lng !== null ? { lat: ev.lat, lng: ev.lng } : null);
      setCoverUrl(ev.cover_url);
      setChurch(ev.church_id ? { id: ev.church_id, name: ev.church_name ?? '', lat: null, lng: null } : null);
      setGroup(ev.group_id ? { id: ev.group_id, name: ev.group_name ?? '' } : null);
      setDay(d);
      setStartMin(minutesInto(d, start));
      setEndMin(ev.ends_at ? minutesInto(d, new Date(ev.ends_at)) : null);
    } catch (e) {
      if (alive.current) setLoadError(errText(e));
    }
  }, [editId, t]);
  useEffect(() => {
    load();
  }, [load]);

  // Started from a church's page: its name. From a community's: the community, and its church.
  useEffect(() => {
    if (churchParam) {
      fetchChurch(churchParam)
        .then((c) => { if (alive.current && c) setChurch({ id: c.id, name: c.name, lat: c.lat, lng: c.lng }); })
        .catch(() => {});
    }
    if (groupParam) {
      fetchGroup(groupParam)
        .then((g) => {
          if (!alive.current || !g || !canPostIn(g)) return;
          setGroup({ id: g.id, name: g.name });
          setChurch(g.church_id ? { id: g.church_id, name: g.church_name ?? '', lat: null, lng: null } : null);
        })
        .catch(() => {});
    }
  }, [churchParam, groupParam]);

  useEffect(() => {
    if (!me) return;
    fetchMyGroups(me)
      .then((gs) => { if (alive.current) setGroups(gs.filter(canPostIn)); })
      .catch(() => { if (alive.current) setGroups([]); });
  }, [me]);

  /* ---------- when ---------- */

  const minDay = useMemo(() => {
    const today = startOfDay(new Date());
    const orig = original.current ? startOfDay(new Date(original.current.ms)) : today;
    return orig < today ? orig : today;
    // `existing` arriving is when original is set.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing]);
  const maxDay = useMemo(() => startOfDay(new Date(Date.now() + AHEAD_DAYS * DAY_MS)), []);

  // The quarter hours on the chosen day that haven't passed (the database allows a start up to an
  // hour back, so the current quarter is still offered), and the saved start when editing.
  const startTimes = useMemo(() => {
    const now = Date.now();
    const soonest = now - (now % (STEP * 60e3));
    const out: number[] = [];
    for (let m = 0; m < 24 * 60; m += STEP) {
      if (atMinutes(day, m).getTime() >= soonest) out.push(m);
    }
    const orig = original.current;
    if (orig && startOfDay(new Date(orig.ms)).getTime() === day.getTime()) {
      const m = minutesInto(day, new Date(orig.ms));
      if (!out.includes(m)) out.push(m);
      out.sort((a, b) => a - b);
    }
    return out;
    // `existing` arriving is when original is set. Opening a picker works it out again, so a form left
    // open a while doesn't still offer times that have passed since.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day, existing, picker]);
  const endTimes = useMemo(() => {
    const out: number[] = [];
    for (let m = startMin + STEP; m <= startMin + 24 * 60; m += STEP) out.push(m);
    return out;
  }, [startMin]);

  /** A new start moves the end with it, so the length stays the same. */
  const changeStart = useCallback(
    (m: number) => {
      if (m === startMin) return;
      setEndMin((e) => (e === null ? null : e + (m - startMin)));
      setStartMin(m);
      setErrors((e) => (e.when ? { ...e, when: undefined } : e));
    },
    [startMin],
  );
  // A start no longer offered (another day picked, or it has passed) moves to the next one that is.
  useEffect(() => {
    if (!startTimes.length || startTimes.includes(startMin)) return;
    changeStart(startTimes.find((m) => m >= startMin) ?? startTimes[0]);
  }, [startTimes, startMin, changeStart]);

  const togglePicker = (p: Picker) => {
    Keyboard.dismiss();
    setPicker((cur) => (cur === p ? null : p));
  };

  /* ---------- cover ---------- */

  async function chooseCover() {
    if (busy) return;
    try {
      const [a] = await pickFromLibrary();
      if (a && alive.current) setCover({ uri: a.uri, width: a.width });
    } catch (e) {
      toast(errText(e));
    }
  }

  /* ---------- place ---------- */

  /** Asks for location if need be; null (having said why) when there's no position. */
  async function position(): Promise<Point | null> {
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) {
        // Turned off for good: only the Settings app can turn it back on, so offer the way there.
        if (!perm.canAskAgain) {
          Alert.alert(t('events.locationOff'), undefined, [
            { text: t('common.cancel'), style: 'cancel' },
            { text: t('events.openSettings'), onPress: () => { Linking.openSettings().catch(() => {}); } },
          ]);
        }
        return null;
      }
      const pos = (await Location.getLastKnownPositionAsync({ maxAge: 2 * 60e3 })) ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }));
      return { lat: pos.coords.latitude, lng: pos.coords.longitude };
    } catch {
      toast(t('events.noFix'));
      return null;
    }
  }

  /** Pins the event where the phone is, and writes the address in when the place is still empty. */
  async function pinHere() {
    if (locating) return;
    Keyboard.dismiss();
    setLocating(true);
    try {
      const p = await position();
      if (!p || !alive.current) return;
      setPin(p);
      tap('success');
      if (!place.trim()) {
        try {
          const [a] = await Location.reverseGeocodeAsync({ latitude: p.lat, longitude: p.lng });
          const words = a ? [a.name || a.street, a.city].map((s) => (s ?? '').trim()).filter((s, i, all) => s && all.indexOf(s) === i).join(', ') : '';
          if (words && alive.current) setPlace((cur) => (cur.trim() ? cur : words.slice(0, 200)));
        } catch {
          // The pin is enough; the place can be typed.
        }
      }
    } finally {
      if (alive.current) setLocating(false);
    }
  }

  /** Where the pin map opens: the pin, the place typed, the church, where the phone is, or the world. */
  async function pinRegion(): Promise<Region> {
    if (pin) return near(pin.lat, pin.lng);
    if (place.trim()) {
      try {
        const [hit] = await Location.geocodeAsync(place.trim());
        if (hit) return near(hit.latitude, hit.longitude);
      } catch {
        // Not found, or offline: try the church.
      }
    }
    if (church) {
      let c: { lat: number | null; lng: number | null } = church;
      if (c.lat === null) c = await fetchChurch(church.id).then((x) => x ?? c).catch(() => c);
      if (c.lat !== null && c.lng !== null) return near(c.lat, c.lng);
    }
    try {
      const perm = await Location.getForegroundPermissionsAsync();
      if (perm.granted) {
        const pos = await Location.getLastKnownPositionAsync({ maxAge: 60 * 60e3 });
        if (pos) return near(pos.coords.latitude, pos.coords.longitude, 0.02);
      }
    } catch {
      // The whole world, then.
    }
    return WORLD;
  }

  async function openPin() {
    Keyboard.dismiss();
    setPinStart(null);
    pinCentre.current = null;
    setSheet('pin');
    Location.getForegroundPermissionsAsync()
      .then((p) => { if (alive.current) setShowMe(p.granted); })
      .catch(() => {});
    const r = await pinRegion();
    if (!alive.current) return;
    pinCentre.current = r;
    setPinStart(r);
  }

  async function pinToMe() {
    if (locating) return;
    setLocating(true);
    try {
      const p = await position();
      if (!p || !alive.current) return;
      setShowMe(true);
      const r = near(p.lat, p.lng, 0.006);
      if (pinMap.current) pinMap.current.animateToRegion(r, 300);
      else setPinStart(r);
      pinCentre.current = r;
    } finally {
      if (alive.current) setLocating(false);
    }
  }

  function pinDone() {
    const c = pinCentre.current;
    if (!c) return;
    // Still looking at a whole country or more (the map opened on the world): not a place yet.
    if (c.latitudeDelta > 2) {
      tap('warning');
      toast(t('events.pinTitle'));
      return;
    }
    setPin({ lat: c.latitude, lng: c.longitude });
    tap('success');
    setSheet(null);
  }

  /* ---------- church and community ---------- */

  function loadChurches() {
    setChurchError('');
    fetchChurches()
      .then((list) => { if (alive.current) setChurches(list.filter((c) => c.status === 'approved')); })
      .catch((e) => { if (alive.current) setChurchError(errText(e)); });
  }
  function openChurches() {
    Keyboard.dismiss();
    setQ('');
    setSheet('church');
    if (churches === null) loadChurches();
  }
  const pickChurch = useCallback((c: Church | null) => {
    setChurch(c ? { id: c.id, name: c.name, lat: c.lat, lng: c.lng } : null);
    setSheet(null);
  }, []);
  const pickGroup = useCallback((g: Group | null) => {
    setGroup(g ? { id: g.id, name: g.name } : null);
    setSheet(null);
  }, []);

  const ownChurch = profile?.church_id ?? null;
  const churchList = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = (churches ?? []).filter((c) => !needle || [c.name, c.city, c.country].some((s) => (s ?? '').toLowerCase().includes(needle)));
    // My own church first, then by name.
    return list.sort((a, b) => (a.id === ownChurch ? -1 : b.id === ownChurch ? 1 : a.name.localeCompare(b.name)));
  }, [churches, q, ownChurch]);
  const chosenChurch = church?.id ?? null;
  const renderChurch = useCallback(
    ({ item }: { item: Church }) => (
      <Row icon="church" title={item.name} sub={[item.city, item.country].map((s) => (s ?? '').trim()).filter(Boolean).join(', ') || undefined} onPress={() => pickChurch(item)} right={<Radio on={chosenChurch === item.id} />} chevron={false} />
    ),
    [chosenChurch, pickChurch],
  );

  /* ---------- saving ---------- */

  async function save() {
    if (working.current) return;
    Keyboard.dismiss();
    const name = title.trim();
    const start = atMinutes(day, startMin);
    const orig = original.current;
    // Unchanged, the saved start goes back as it was (a start under way can be kept, not set anew).
    const keepStart = !!orig && Math.floor(orig.ms / 60e3) === Math.floor(start.getTime() / 60e3);
    const errs: Errors = {};
    if (!name) errs.title = t('events.needTitle');
    if (!keepStart && start.getTime() < Date.now() - 55 * 60e3) errs.when = t('events.timePassed');
    setErrors(errs);
    if (errs.title || errs.when) {
      tap('warning');
      if (errs.title) scroller.current?.scrollTo({ y: 0, animated: true });
      return;
    }

    working.current = true;
    setBusy(true);
    try {
      // The photo is uploaded only now, so backing out of the form leaves nothing behind in storage; a
      // second try after a refusal (a time that has passed, say) uses the copy already uploaded.
      let cover_url = coverUrl;
      if (cover) {
        if (uploaded.current?.uri !== cover.uri) uploaded.current = { uri: cover.uri, url: (await uploadImage(me, cover.uri, cover.width)).url };
        cover_url = uploaded.current.url;
      }
      const input: EventInput = {
        kind,
        title: name,
        description,
        starts_at: keepStart && orig ? orig.iso : start.toISOString(),
        ends_at: endMin !== null ? atMinutes(day, endMin).toISOString() : null,
        place,
        lat: pin?.lat ?? null,
        lng: pin?.lng ?? null,
        cover_url,
        church_id: church?.id ?? null,
        group_id: group?.id ?? null,
      };
      if (existing) {
        await updateEvent(existing.id, input);
        if (!alive.current) return;
        tap('success');
        toast(t('events.saved'));
        if (router.canGoBack()) router.back();
        else router.replace(`/event/${existing.id}`);
        return;
      }
      const id = await createEvent(me, input);
      if (!alive.current) return;
      tap('success');
      router.replace(`/event/${id}`);
    } catch (e) {
      if (alive.current) {
        tap('warning');
        toast(errText(e));
      }
    } finally {
      working.current = false;
      if (alive.current) setBusy(false);
    }
  }

  /* ---------- drawing ---------- */

  const heading = editId ? t('events.editTitle') : t('events.new');
  const action = editId ? t('events.save') : t('common.share');
  const ready = !editId || !!existing;
  const headerAction = ready && profile?.restricted !== true && !loadError ? (
    <Pressable onPress={save} disabled={busy} hitSlop={10} accessibilityRole="button" accessibilityLabel={action} accessibilityState={{ busy }} style={({ pressed }) => ({ minWidth: 44, height: 44, alignItems: 'flex-end', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
      {busy ? <ActivityIndicator color={C.accent2} /> : <Text style={{ color: C.accent2, fontSize: 17, fontWeight: '700', fontFamily: fontBold }}>{action}</Text>}
    </Pressable>
  ) : undefined;

  let body: React.ReactNode;
  if (profile?.restricted === true) {
    body = <Empty icon="calendar" title={t('events.forMembers14')} />;
  } else if (loadError) {
    body = <ErrorNote message={loadError} onRetry={load} />;
  } else if (!ready) {
    body = <Loading />;
  } else {
    const shownCover = cover?.uri || coverUrl;
    const coverH = Math.round((width - 32) * 0.56);
    const start = atMinutes(day, startMin);
    const endLabel = endMin === null ? t('events.addEnd') : `${timeOf(atMinutes(day, endMin))}${endMin >= 24 * 60 ? ` ${t('events.nextDay')}` : ''}`;
    const showGroups = (groups?.length ?? 0) > 0 || !!group;
    body = (
      // The scroll view makes room for the keyboard itself and keeps the field being typed in above it.
      <ScrollView ref={scroller} style={{ flex: 1 }} automaticallyAdjustKeyboardInsets keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" contentContainerStyle={{ paddingTop: 4, paddingBottom: insets.bottom + 48 }}>
        {/* The cover: tap to choose one. Without a photo, the kind's icon on the app's soft wash. */}
        <View style={{ paddingHorizontal: 16 }}>
          <Pressable onPress={chooseCover} accessibilityRole="button" accessibilityLabel={shownCover ? t('events.changeCover') : t('events.addCover')} style={({ pressed }) => ({ borderRadius: 18, overflow: 'hidden', opacity: pressed && !busy ? 0.85 : 1 })}>
            {shownCover ? (
              <Image source={{ uri: shownCover }} style={{ width: '100%', height: coverH, backgroundColor: C.surface }} contentFit="cover" transition={150} accessibilityIgnoresInvertColors />
            ) : (
              <EventCover uri="" kind={kind} width="100%" height={coverH} icon={44} />
            )}
            <View style={{ position: 'absolute', left: 0, right: 0, bottom: 14, alignItems: 'center' }}>
              {/* Over a photo the words sit on a dark pill so they read on any picture; without one, plain green words. */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, height: 34, borderRadius: 17, backgroundColor: shownCover ? 'rgba(10,12,14,0.62)' : 'transparent' }}>
                <Icon name="image" size={18} color={shownCover ? '#ffffff' : C.accent2} />
                <Text style={{ color: shownCover ? '#ffffff' : C.accent2, fontWeight: '600', fontSize: 14.5 }}>{shownCover ? t('events.changeCover') : t('events.addCover')}</Text>
              </View>
            </View>
          </Pressable>
          {shownCover ? (
            <Pressable onPress={busy ? undefined : () => { setCover(null); setCoverUrl(''); }} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('events.removeCover')} style={({ pressed }) => ({ alignSelf: 'flex-start', marginTop: 10, opacity: pressed ? 0.6 : 1 })}>
              <Text style={{ color: C.fg2, fontSize: 13.5, fontWeight: '600' }}>{t('events.removeCover')}</Text>
            </Pressable>
          ) : null}
        </View>

        <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
          <Field
            label={t('events.titleLabel')}
            value={title}
            onChangeText={(v) => {
              setTitle(v);
              if (errors.title) setErrors((e) => ({ ...e, title: undefined }));
            }}
            placeholder={t('events.titlePlaceholder')}
            maxLength={120}
            error={errors.title}
            autoFocus={!editId}
            editable={!busy}
            returnKeyType="done"
          />
        </View>

        <Text style={{ color: C.fg2, fontSize: 12.5, paddingHorizontal: 16, paddingTop: 18, paddingBottom: 8 }}>{t('events.kindLabel')}</Text>
        <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16 }}>
          {EVENT_KINDS.map((k) => {
            const on = kind === k.kind;
            return (
              <Pressable
                key={k.kind}
                onPress={() => {
                  if (on) return;
                  tap('select');
                  setKind(k.kind);
                }}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                accessibilityLabel={t(k.label)}
                style={({ pressed }) => ({ height: 36, paddingHorizontal: 13, borderRadius: 18, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: on ? C.accent : pressed ? C.surface2 : C.surface })}>
                <Icon name={k.icon} size={16} color={on ? C.onAccent : C.fg} weight={2} />
                <Text style={{ color: on ? C.onAccent : C.fg, fontWeight: '600', fontSize: 14 }}>{t(k.label)}</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={{ marginTop: 18 }}>
          <PickRow icon="calendar" label={t('events.date')} value={dayHeading(day)} open={picker === 'date'} onPress={() => togglePicker('date')} />
          {picker === 'date' ? (
            <Calendar
              value={day}
              min={minDay}
              max={maxDay}
              onChange={(d) => {
                setDay(d);
                setErrors((e) => (e.when ? { ...e, when: undefined } : e));
              }}
            />
          ) : null}
          <PickRow icon="clock" label={t('events.starts')} value={timeOf(start)} open={picker === 'start'} onPress={() => togglePicker('start')} />
          {picker === 'start' ? <TimeStrip times={startTimes} value={startMin} onChange={changeStart} day={day} /> : null}
          <PickRow
            icon="clock"
            label={t('events.ends')}
            value={endLabel}
            placeholder={endMin === null}
            open={picker === 'end'}
            onPress={() => {
              if (endMin === null) setEndMin(startMin + 60);
              togglePicker('end');
            }}
            onClear={endMin !== null ? () => { setEndMin(null); setPicker((p) => (p === 'end' ? null : p)); } : undefined}
            clearLabel={t('events.removeEnd')}
          />
          {picker === 'end' && endMin !== null ? <TimeStrip times={endTimes} value={endMin} onChange={setEndMin} day={day} /> : null}
          {errors.when ? <Text accessibilityLiveRegion="polite" style={{ color: C.like, fontSize: 13, paddingHorizontal: 16, paddingTop: 4 }}>{errors.when}</Text> : null}
        </View>

        <View style={{ paddingHorizontal: 16, paddingTop: 18, gap: 12 }}>
          <Field label={t('events.place')} value={place} onChangeText={setPlace} placeholder={t('events.placePlaceholder')} maxLength={200} editable={!busy} returnKeyType="done" />
          {pin ? (
            <>
              <Pressable onPress={openPin} accessibilityRole="button" accessibilityLabel={t('events.movePin')} style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}>
                <PinPreview pin={pin} />
              </Pressable>
              <View style={{ flexDirection: 'row', gap: 22 }}>
                <TextAction icon="location" label={t('events.movePin')} onPress={openPin} />
                <Pressable onPress={() => setPin(null)} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('events.removePin')} style={({ pressed }) => ({ opacity: pressed ? 0.55 : 1 })}>
                  <Text style={{ color: C.fg2, fontSize: 14.5, fontWeight: '600' }}>{t('events.removePin')}</Text>
                </Pressable>
              </View>
            </>
          ) : (
            <View style={{ flexDirection: 'row', gap: 22 }}>
              <TextAction icon="location" label={t('events.useMyLocation')} onPress={pinHere} busy={locating} />
              <TextAction icon="globe" label={t('events.pinOnMap')} onPress={openPin} />
            </View>
          )}
        </View>

        <View style={{ marginTop: 14 }}>
          <PickRow icon="church" label={t('events.church')} value={church ? church.name || '…' : t('events.none')} onPress={openChurches} chevron="right" />
          {showGroups ? <PickRow icon="users" label={t('events.community')} value={group ? group.name || '…' : t('events.none')} onPress={() => { Keyboard.dismiss(); setSheet('group'); }} chevron="right" /> : null}
        </View>

        <View style={{ paddingHorizontal: 16, paddingTop: 14 }}>
          <Field
            label={t('events.details')}
            value={description}
            onChangeText={setDescription}
            placeholder={t('events.detailsPlaceholder')}
            maxLength={2000}
            multiline
            editable={!busy}
            // The last field: bring the end of the form up once the keyboard is there.
            onFocus={() => setTimeout(() => scroller.current?.scrollToEnd({ animated: true }), 300)}
            style={{ minHeight: 110, textAlignVertical: 'top' }}
          />
        </View>
      </ScrollView>
    );
  }

  return (
    <Screen>
      {/* Not while saving: the photo and the event would be half made. */}
      <ScreenHeader close title={heading} right={headerAction} onBack={busy ? () => undefined : undefined} />
      {body}

      {/* Move the map until the pin sits on the place; a tap on the map brings that spot to the pin. */}
      <Sheet visible={sheet === 'pin'} onClose={() => setSheet(null)} title={t('events.pinTitle')} tall footer={<View style={{ paddingHorizontal: 20, paddingTop: 12 }}><Button label={t('events.done')} disabled={!pinStart} onPress={pinDone} /></View>}>
        <View style={{ flex: 1, marginHorizontal: 16, borderRadius: 18, overflow: 'hidden', backgroundColor: C.surface }}>
          {pinStart ? (
            <>
              <MapView
                ref={pinMap}
                style={StyleSheet.absoluteFill}
                initialRegion={pinStart}
                onRegionChangeComplete={(r) => { pinCentre.current = r; }}
                onPress={(e: any) => {
                  const c = e?.nativeEvent?.coordinate;
                  const now = pinCentre.current;
                  if (c && now) pinMap.current?.animateToRegion({ ...now, latitude: c.latitude, longitude: c.longitude }, 250);
                }}
                userInterfaceStyle={C.statusBar === 'light' ? 'dark' : 'light'}
                showsUserLocation={showMe}
                showsCompass={false}
                pitchEnabled={false}
                rotateEnabled={false}
              />
              <View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
                <MapPin size={34} />
              </View>
            </>
          ) : (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <ActivityIndicator color={C.fg2} />
            </View>
          )}
        </View>
        <View style={{ paddingHorizontal: 16, paddingTop: 14 }}>
          <TextAction icon="location" label={t('events.useMyLocation')} onPress={pinToMe} busy={locating} />
        </View>
      </Sheet>

      <Sheet visible={sheet === 'church'} onClose={() => setSheet(null)} title={t('events.church')} tall>
        <View style={{ flex: 1 }}>
          <View style={{ paddingBottom: 8 }}>
            <SearchField value={q} onChangeText={setQ} placeholder={t('events.searchChurches')} />
          </View>
          {churches === null ? (
            churchError ? <ErrorNote message={churchError} onRetry={loadChurches} /> : <RowsSkeleton count={6} avatar={26} gap={14} padY={12} />
          ) : (
            <FlatList
              data={churchList}
              keyExtractor={(c) => c.id}
              renderItem={renderChurch}
              ListHeaderComponent={q.trim() ? null : <Row icon="close" title={t('events.none')} onPress={() => pickChurch(null)} right={<Radio on={!church} />} chevron={false} />}
              initialNumToRender={14}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              contentContainerStyle={{ paddingBottom: 8 }}
            />
          )}
        </View>
      </Sheet>

      <Sheet visible={sheet === 'group'} onClose={() => setSheet(null)} title={t('events.community')}>
        <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ paddingBottom: 8 }}>
          <Row icon="close" title={t('events.none')} onPress={() => pickGroup(null)} right={<Radio on={!group} />} chevron={false} />
          {(groups ?? []).map((g) => (
            <Row key={g.id} icon={g.kind === 'page' ? 'crown' : 'users'} title={g.name} onPress={() => pickGroup(g)} right={<Radio on={group?.id === g.id} />} chevron={false} />
          ))}
        </ScrollView>
      </Sheet>
    </Screen>
  );
}
