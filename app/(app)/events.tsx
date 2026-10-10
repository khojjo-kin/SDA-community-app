import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, FlatList, Linking, Pressable, RefreshControl, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EventRow, EventRowsSkeleton, EventTile, dayHeading, startOfDay } from '../../src/components/EventCard';
import { FeedSwitch } from '../../src/components/FeedSwitch';
import { Icon } from '../../src/components/Icon';
import { Button, Empty, ErrorNote, RoundButton, Screen, ScreenHeader, useToast } from '../../src/components/ui';
import { distanceKm, fetchChurch, fetchEvents, fetchGroup } from '../../src/lib/api';
import { useAppFont } from '../../src/lib/fonts';
import { type Key, useT } from '../../src/lib/i18n';
import { useSession } from '../../src/lib/session';
import { C, errText } from '../../src/lib/theme';
import type { EventCard } from '../../src/lib/types';

/*
 * Church events: what's coming up (set out by day, with the ones near you first when the phone has
 * said where it is), the ones I answered, and the ones I made. `?church=` or `?group=` narrows all
 * three to one church or community.
 */

type Scope = 'upcoming' | 'going' | 'mine';
const SCOPES: readonly { key: Scope; label: Key }[] = [
  { key: 'upcoming', label: 'events.upcoming' },
  { key: 'going', label: 'events.going' },
  { key: 'mine', label: 'events.yours' },
];

type Point = { lat: number; lng: number };
/** Why there is no position: 'ask' if the prompt can be shown, 'settings' if only the Settings app can turn it on. */
type NoFix = 'ask' | 'settings';
type Near = { ev: EventCard; km: number };

/** Events this close count as near you, and the strip shows at most this many. */
const NEAR_KM = 60;
const NEAR_MAX = 10;
const TILE = 236;

type Item =
  | { type: 'locate'; key: string }
  | { type: 'near'; key: string; list: Near[] }
  | { type: 'day'; key: string; label: string }
  | { type: 'event'; key: string; ev: EventCard; km: number | null; mode: 'time' | 'date' };

const EMPTY_LISTS: Record<Scope, EventCard[] | null> = { upcoming: null, going: null, mine: null };
const NO_ERRORS: Record<Scope, string> = { upcoming: '', going: '', mine: '' };
const keyOf = (i: Item) => i.key;

function DayHeading({ label }: { label: string }) {
  const font = useAppFont('bold');
  return (
    <Text accessibilityRole="header" style={{ color: C.fg, fontSize: 18, fontWeight: '800', paddingHorizontal: 16, paddingTop: 20, paddingBottom: 4, fontFamily: font }}>
      {label}
    </Text>
  );
}

/** Near you: the closest events coming up, sideways. */
const NearStrip = React.memo(function NearStrip({ list, onOpen, title }: { list: Near[]; onOpen: (id: string) => void; title: string }) {
  return (
    <View style={{ paddingBottom: 6 }}>
      <DayHeading label={title} />
      <FlatList
        horizontal
        data={list}
        keyExtractor={(n) => n.ev.id}
        renderItem={({ item }) => <EventTile ev={item.ev} km={item.km} width={TILE} onOpen={onOpen} />}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 12, paddingTop: 8 }}
        initialNumToRender={3}
      />
    </View>
  );
});

export default function Events() {
  const t = useT();
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const { profile } = useSession();
  const params = useLocalSearchParams<{ church?: string; group?: string }>();
  const churchId = typeof params.church === 'string' && params.church ? params.church : undefined;
  const groupId = !churchId && typeof params.group === 'string' && params.group ? params.group : undefined;

  const [scope, setScope] = useState<Scope>('upcoming');
  const [lists, setLists] = useState(EMPTY_LISTS);
  const [errors, setErrors] = useState(NO_ERRORS);
  const [refreshing, setRefreshing] = useState(false);
  // The church or community the list is narrowed to, by name.
  const [narrowedTo, setNarrowedTo] = useState('');
  const [here, setHere] = useState<Point | null>(null);
  const [noFix, setNoFix] = useState<NoFix | null>(null);
  const [locating, setLocating] = useState(false);
  const shown = useRef(lists);
  shown.current = lists;
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // Members under 14 can't post events (the database says no), so they aren't offered it.
  const canCreate = profile?.restricted !== true;

  const load = useCallback(
    async (which: Scope, pull = false) => {
      if (pull) setRefreshing(true);
      try {
        const rows = await fetchEvents({ scope: which, churchId, groupId });
        if (!alive.current) return;
        setLists((l) => ({ ...l, [which]: rows }));
        setErrors((e) => ({ ...e, [which]: '' }));
      } catch (e) {
        if (!alive.current) return;
        // A refresh that fails keeps the list on screen; with nothing shown yet, the error takes its place.
        if (shown.current[which] === null) setErrors((x) => ({ ...x, [which]: errText(e) }));
        else if (pull) toast(errText(e));
      } finally {
        if (alive.current && pull) setRefreshing(false);
      }
    },
    [churchId, groupId, toast],
  );
  // On every visit (an answer or a new event changes the lists) and on every switch of list.
  useFocusEffect(
    useCallback(() => {
      load(scope);
    }, [load, scope]),
  );

  useEffect(() => {
    if (!churchId && !groupId) return;
    const get = churchId ? fetchChurch(churchId).then((c) => c?.name ?? '') : fetchGroup(groupId as string).then((g) => g?.name ?? '');
    get.then((name) => { if (alive.current) setNarrowedTo(name); }).catch(() => {});
  }, [churchId, groupId]);

  /** Where the phone is. Without `ask`, only if location is already allowed: sorting alone never brings up the prompt. */
  const locate = useCallback(
    async (ask: boolean) => {
      setLocating(true);
      try {
        const perm = ask ? await Location.requestForegroundPermissionsAsync() : await Location.getForegroundPermissionsAsync();
        if (!perm.granted) {
          if (alive.current) setNoFix(perm.canAskAgain ? 'ask' : 'settings');
          return;
        }
        // A recent position is good enough to sort by, and comes at once; otherwise wait for a fix.
        const pos = (await Location.getLastKnownPositionAsync({ maxAge: 10 * 60e3 })) ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
        if (!alive.current) return;
        setHere({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setNoFix(null);
      } catch {
        // Airplane mode, or no fix yet: the list stays in date order, and the offer stays.
        if (!alive.current) return;
        setNoFix('ask');
        if (ask) toast(t('events.noFix'));
      } finally {
        if (alive.current) setLocating(false);
      }
    },
    [toast, t],
  );
  useEffect(() => {
    locate(false);
  }, [locate]);
  // Sent to the Settings app to turn location on: on the way back, the list sorts without another tap.
  useEffect(() => {
    if (noFix !== 'settings') return;
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') locate(false);
    });
    return () => sub.remove();
  }, [noFix, locate]);

  const lastOpen = useRef(0);
  const open = useCallback(
    (id: string) => {
      // One page per tap, however quickly a row is tapped twice.
      if (Date.now() - lastOpen.current < 700) return;
      lastOpen.current = Date.now();
      router.push(`/event/${id}`);
    },
    [router],
  );
  const create = useCallback(() => {
    router.push({ pathname: '/event-edit', params: churchId ? { church: churchId } : groupId ? { group: groupId } : {} } as any);
  }, [router, churchId, groupId]);

  const list = lists[scope];
  const items = useMemo<Item[]>(() => {
    if (!list) return [];
    const kmOf = (ev: EventCard) => (here && ev.lat !== null && ev.lng !== null ? distanceKm(here, { lat: ev.lat, lng: ev.lng }) : null);
    const out: Item[] = [];
    if (scope !== 'upcoming') {
      for (const ev of list) out.push({ type: 'event', key: ev.id, ev, km: kmOf(ev), mode: 'date' });
      return out;
    }
    if (list.length && !here && noFix) out.push({ type: 'locate', key: 'locate' });
    if (here) {
      const near = list
        .map((ev) => ({ ev, km: kmOf(ev) }))
        .filter((n): n is Near => n.km !== null && n.km <= NEAR_KM)
        .sort((a, b) => a.km - b.km)
        .slice(0, NEAR_MAX);
      if (near.length) out.push({ type: 'near', key: 'near', list: near });
    }
    const today = startOfDay(new Date()).getTime();
    let lastDay = -1;
    for (const ev of list) {
      // Something already under way is listed under today.
      const day = Math.max(today, startOfDay(new Date(ev.starts_at)).getTime());
      if (day !== lastDay) {
        out.push({ type: 'day', key: `day:${day}`, label: dayHeading(new Date(day)) });
        lastDay = day;
      }
      out.push({ type: 'event', key: ev.id, ev, km: kmOf(ev), mode: 'time' });
    }
    return out;
  }, [list, scope, here, noFix]);

  const nearTitle = t('events.nearYou');
  const renderItem = useCallback(
    ({ item }: { item: Item }) => {
      if (item.type === 'event') return <EventRow ev={item.ev} km={item.km} mode={item.mode} onOpen={open} />;
      if (item.type === 'day') return <DayHeading label={item.label} />;
      if (item.type === 'near') return <NearStrip list={item.list} onOpen={open} title={nearTitle} />;
      // Sorting by distance is one tap away when the phone hasn't said where it is.
      const settings = noFix === 'settings';
      return (
        <Pressable
          disabled={locating}
          onPress={settings ? () => { Linking.openSettings().catch(() => {}); } : () => { locate(true); }}
          accessibilityRole="button"
          accessibilityLabel={settings ? t('events.openSettings') : t('events.useMyLocation')}
          hitSlop={8}
          style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 5, marginLeft: 16, marginTop: 8, opacity: pressed || locating ? 0.55 : 1 })}>
          <Icon name="location" size={16} color={C.accent2} weight={2.2} />
          <Text style={{ color: C.accent2, fontSize: 14.5, fontWeight: '600' }}>{settings ? t('events.openSettings') : t('events.useMyLocation')}</Text>
        </Pressable>
      );
    },
    [open, nearTitle, noFix, locating, locate, t],
  );

  const options = useMemo(() => SCOPES.map((s) => ({ key: s.key, label: t(s.label) })), [t]);
  const createButton = canCreate ? <Button small label={t('events.create')} onPress={create} style={{ marginTop: 10 }} /> : undefined;
  const empty =
    list === null ? (
      <EventRowsSkeleton heading={scope === 'upcoming'} />
    ) : scope === 'upcoming' ? (
      <Empty icon="calendar" title={t('events.emptyUpcoming')} action={createButton} />
    ) : scope === 'going' ? (
      <Empty icon="calendar" title={t('events.emptyGoing')} />
    ) : (
      <Empty icon="calendar" title={t('events.emptyYours')} action={createButton} />
    );

  return (
    <Screen>
      <ScreenHeader title={t('events.title')} right={canCreate ? <RoundButton name="plus" label={t('events.create')} onPress={create} /> : undefined} />
      <FeedSwitch plain value={scope} onChange={setScope} options={options} />
      {narrowedTo ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: 24, paddingTop: 6 }}>
          <Icon name={churchId ? 'church' : 'users'} size={14} color={C.fg2} weight={2} />
          <Text numberOfLines={1} style={{ flexShrink: 1, color: C.fg2, fontSize: 13.5 }}>{narrowedTo}</Text>
        </View>
      ) : null}
      {errors[scope] && list === null ? (
        <ErrorNote message={errors[scope]} onRetry={() => { setErrors((e) => ({ ...e, [scope]: '' })); load(scope); }} />
      ) : (
        <FlatList
          // A list of its own for each tab, so switching doesn't keep the other's scroll position.
          key={scope}
          data={items}
          keyExtractor={keyOf}
          renderItem={renderItem}
          ListEmptyComponent={empty}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(scope, true)} tintColor={C.fg2} />}
          initialNumToRender={10}
          windowSize={9}
          contentContainerStyle={{ paddingTop: 2, paddingBottom: insets.bottom + 40 }}
        />
      )}
    </Screen>
  );
}
