import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, Linking, Platform, Pressable, RefreshControl, ScrollView, Share, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import MapView from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EventCover, Faces, MapPin, countsText, eventState, kindLabel, longDay, stateWords, timeRange } from '../../../src/components/EventCard';
import { FeedSwitch } from '../../../src/components/FeedSwitch';
import { Icon, VerifiedTick } from '../../../src/components/Icon';
import { RowsSkeleton, Skeleton, SkeletonFrame } from '../../../src/components/Skeleton';
import { afterSheet } from '../../../src/components/StoryChrome';
import { Avatar, Empty, ErrorNote, RoundButton, Row, Screen, ScreenHeader, SectionLabel, Sheet, SheetRow, useToast } from '../../../src/components/ui';
import { cancelEvent, deleteEvent, fetchEvent, fetchEventPeople, fetchGroup, setEventRsvp } from '../../../src/lib/api';
import { useAppFont } from '../../../src/lib/fonts';
import { tap } from '../../../src/lib/haptics';
import { useT } from '../../../src/lib/i18n';
import { useSession } from '../../../src/lib/session';
import { C, errText, fmt } from '../../../src/lib/theme';
import type { EventCard, EventPerson, EventRsvp } from '../../../src/lib/types';

/*
 * One event: its cover, what and when, where (with a small map), Going and Interested, who's coming,
 * the details, and who organised it. The organiser (and admins, and the community's managers) can
 * edit it, call it off or delete it from the ⋯ menu.
 */

/** The event with my answer changed, the counts and the faces of people going moved with it. */
function withAnswer(ev: EventCard, to: EventRsvp | null, myFace: string): EventCard {
  const was = ev.my_rsvp;
  if (was === to) return ev;
  let going = ev.going_count;
  let interested = ev.interested_count;
  let faces = ev.going_avatars;
  // The faces are only of people with a photo, as the server gives them.
  if (was === 'going') {
    going -= 1;
    const at = myFace ? faces.indexOf(myFace) : -1;
    if (at >= 0) faces = faces.filter((_, i) => i !== at);
  }
  if (was === 'interested') interested -= 1;
  if (to === 'going') {
    going += 1;
    if (myFace) faces = [myFace, ...faces].slice(0, 5);
  }
  if (to === 'interested') interested += 1;
  return { ...ev, my_rsvp: to, going_count: Math.max(0, going), interested_count: Math.max(0, interested), going_avatars: faces };
}

/** Apple Maps on iPhone (the app, or the website if that fails); Google Maps elsewhere. A pin wins over the typed place. */
async function openInMaps(ev: EventCard) {
  const q = encodeURIComponent(ev.place || ev.title);
  const ll = ev.lat !== null && ev.lng !== null ? `${ev.lat},${ev.lng}` : '';
  if (Platform.OS === 'ios') {
    const query = ll ? `?q=${q}&ll=${ll}` : `?q=${q}`;
    try {
      await Linking.openURL(`maps://${query}`);
    } catch {
      await Linking.openURL(`https://maps.apple.com/${query}`);
    }
    return;
  }
  await Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${ll || q}`);
}

/** Going or Interested. Chosen, it fills with the app's green; tapped again, the answer is taken back. */
function AnswerButton({ label, icon, on, onPress }: { label: string; icon: 'check' | 'star'; on: boolean; onPress: () => void }) {
  const font = useAppFont('bold');
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: on }}
      style={({ pressed }) => ({ flex: 1, height: 44, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: on ? C.accent : C.surface2, opacity: pressed ? 0.75 : 1 })}>
      <Icon name={icon} size={18} color={on ? C.onAccent : C.fg} weight={2.4} fill={icon === 'star' && on} />
      <Text numberOfLines={1} style={{ color: on ? C.onAccent : C.fg, fontSize: 15.5, fontWeight: '600', fontFamily: font }}>{label}</Text>
    </Pressable>
  );
}

/** Someone who answered, in the people sheet. */
const PersonLine = React.memo(function PersonLine({ person, onOpen }: { person: EventPerson; onOpen: (id: string) => void }) {
  return (
    <Pressable onPress={() => onOpen(person.user_id)} accessibilityRole="button" accessibilityLabel={`${person.full_name || person.username}, ${person.username}`} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: pressed ? C.press : 'transparent' })}>
      <Avatar uri={person.avatar_url} name={person.full_name || person.username} size={44} />
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Text numberOfLines={1} style={{ flexShrink: 1, color: C.fg, fontSize: 15, fontWeight: '600' }}>{person.username}</Text>
          {person.verified ? <VerifiedTick size={14} /> : null}
        </View>
        {person.full_name ? <Text numberOfLines={1} style={{ color: C.fg2, fontSize: 13.5 }}>{person.full_name}</Text> : null}
      </View>
    </Pressable>
  );
});

function EventSkeleton() {
  const { width } = useWindowDimensions();
  const half = (width - 32 - 16 - 44) / 2;
  return (
    <SkeletonFrame>
      <Skeleton width={width} height={Math.round(width * 0.62)} radius={0} />
      <View style={{ padding: 16, gap: 10 }}>
        <Skeleton width={84} height={11} x={16} />
        <Skeleton width={Math.round(width * 0.72)} height={24} x={16} />
        <Skeleton width={Math.round(width * 0.5)} height={14} x={16} style={{ marginTop: 14 }} />
        <Skeleton width={Math.round(width * 0.36)} height={12} x={16} />
        <Skeleton width={Math.round(width * 0.56)} height={14} x={16} style={{ marginTop: 10 }} />
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 18 }}>
          <Skeleton width={half} height={44} radius={12} x={16} />
          <Skeleton width={half} height={44} radius={12} x={24 + half} />
          <Skeleton width={44} height={44} radius={22} x={width - 16 - 44} />
        </View>
      </View>
    </SkeletonFrame>
  );
}

export default function EventPage() {
  const t = useT();
  const params = useLocalSearchParams<{ id: string }>();
  const id = String(params.id);
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { me, profile } = useSession();
  const fontBold = useAppFont('bold');
  // undefined while loading, null when the event is gone (deleted, or not for me to see).
  const [ev, setEv] = useState<EventCard | null | undefined>(undefined);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  // Managers of the event's community may change it too.
  const [manager, setManager] = useState(false);
  const [sheet, setSheet] = useState<'menu' | 'people' | null>(null);
  const [people, setPeople] = useState<EventPerson[] | null>(null);
  const [peopleError, setPeopleError] = useState('');
  const [peopleTab, setPeopleTab] = useState<EventRsvp>('going');
  // An answer on its way: a second tap waits for it, and a reload doesn't overwrite it with an older copy.
  const answering = useRef(false);
  const shown = useRef<EventCard | null | undefined>(undefined);
  shown.current = ev;
  const lastPush = useRef(0);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const load = useCallback(
    async (pull = false) => {
      if (pull) setRefreshing(true);
      try {
        const e = await fetchEvent(id);
        if (!alive.current) return;
        if (!answering.current) setEv(e);
        setError('');
        if (e?.group_id && !e.mine) {
          fetchGroup(e.group_id)
            .then((g) => { if (alive.current) setManager(g?.my_standing === 'owner' || g?.my_standing === 'admin'); })
            .catch(() => {});
        }
      } catch (e) {
        if (!alive.current) return;
        // A refresh that fails keeps the page as it was.
        if (shown.current === undefined) setError(errText(e));
        else if (pull) toast(errText(e));
      } finally {
        if (alive.current && pull) setRefreshing(false);
      }
    },
    [id, toast],
  );
  // On every visit: back from editing it, the page shows the changes.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  /** Going or Interested; the same again takes the answer back. Shown at once, put back if it fails. */
  function answer(next: EventRsvp) {
    const cur = shown.current;
    if (!cur || answering.current) return;
    const to = cur.my_rsvp === next ? null : next;
    answering.current = true;
    tap(to ? 'select' : 'light');
    setEv(withAnswer(cur, to, profile?.avatar_url ?? ''));
    setEventRsvp(me, cur.id, to)
      .then(() => {
        if (to === 'going') tap('success');
        // The list of people is fetched again next time it opens.
        if (alive.current) setPeople(null);
      })
      .catch((e) => {
        if (alive.current) setEv(cur);
        toast(errText(e));
      })
      .finally(() => {
        answering.current = false;
      });
  }

  const openProfile = useCallback(
    (userId: string) => {
      if (Date.now() - lastPush.current < 700) return;
      lastPush.current = Date.now();
      router.push(`/user/${userId}`);
    },
    [router],
  );

  const openPeople = useCallback(() => {
    const cur = shown.current;
    if (!cur) return;
    setPeopleTab(cur.going_count > 0 || cur.interested_count === 0 ? 'going' : 'interested');
    setSheet('people');
    setPeopleError('');
    fetchEventPeople(cur.id)
      .then((rows) => { if (alive.current) setPeople(rows); })
      .catch((e) => { if (alive.current) setPeopleError(errText(e)); });
  }, []);

  const openPersonFromSheet = useCallback(
    (userId: string) => {
      setSheet(null);
      afterSheet().then(() => { if (alive.current) openProfile(userId); });
    },
    [openProfile],
  );

  /** Runs once the menu has slid away, so an alert or a new screen doesn't cross it. */
  const fromMenu = (fn: () => void) => () => {
    setSheet(null);
    afterSheet().then(() => { if (alive.current) fn(); });
  };

  function share() {
    const cur = shown.current;
    if (!cur) return;
    const when = `${longDay(new Date(cur.starts_at))} · ${timeRange(cur)}`;
    Share.share({ message: [cur.title, when, cur.place, `community://event/${cur.id}`].filter(Boolean).join('\n') }).catch(() => {});
  }

  function callOff() {
    Alert.alert(t('events.callOffQuestion'), t('events.callOffBody'), [
      { text: t('events.keep'), style: 'cancel' },
      {
        text: t('events.callOff'),
        style: 'destructive',
        onPress: () => {
          cancelEvent(id)
            .then(() => {
              tap('success');
              if (alive.current) setEv((cur) => cur && { ...cur, cancelled_at: new Date().toISOString() });
            })
            .catch((e) => toast(errText(e)));
        },
      },
    ]);
  }

  function confirmDelete() {
    Alert.alert(t('events.deleteQuestion'), t('events.deleteBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () => {
          deleteEvent(id)
            .then(() => {
              toast(t('events.deleted'));
              if (router.canGoBack()) router.back();
              else router.replace('/events');
            })
            .catch((e) => toast(errText(e)));
        },
      },
    ]);
  }

  const peopleShown = useMemo(() => (people ?? []).filter((p) => p.status === peopleTab), [people, peopleTab]);
  const renderPerson = useCallback(({ item }: { item: EventPerson }) => <PersonLine person={item} onOpen={openPersonFromSheet} />, [openPersonFromSheet]);

  const title = t('events.event');
  if (error && ev === undefined) return <Screen><ScreenHeader title={title} /><ErrorNote message={error} onRetry={() => { setError(''); load(); }} /></Screen>;
  if (ev === undefined) return <Screen><ScreenHeader title={title} /><EventSkeleton /></Screen>;
  if (ev === null) return <Screen><ScreenHeader title={title} /><Empty icon="calendar" title={t('events.gone')} /></Screen>;

  const state = eventState(ev);
  const open = state === 'soon' || state === 'now';
  const canManage = ev.mine || !!profile?.admin_role || manager;
  const start = new Date(ev.starts_at);
  const pinned = ev.lat !== null && ev.lng !== null;
  const counts = countsText(ev);
  const coverH = Math.round(width * 0.62);
  const organiser = ev.full_name || ev.username;

  return (
    <Screen>
      <ScreenHeader title={title} right={<RoundButton name="more" label={t('events.options')} onPress={() => setSheet('menu')} />} />
      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={C.fg2} />} contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>
        <EventCover uri={ev.cover_url} kind={ev.kind} width={width} height={coverH} icon={64} />

        <View style={{ paddingHorizontal: 16, paddingTop: 18, paddingBottom: 6, gap: 6 }}>
          <Text style={{ color: C.accent2, fontSize: 13, fontWeight: '800', letterSpacing: 0.7 }}>{kindLabel(ev.kind).toUpperCase()}</Text>
          <Text accessibilityRole="header" selectable style={{ color: state === 'off' ? C.fg2 : C.fg, fontSize: 26, lineHeight: 32, fontWeight: '800', fontFamily: fontBold }}>{ev.title}</Text>
          {state !== 'soon' ? <Text style={{ color: state === 'off' ? C.like : state === 'now' ? C.accent2 : C.fg2, fontSize: 16, fontWeight: '700' }}>{stateWords(state)}</Text> : null}
        </View>

        <Row icon="calendar" title={longDay(start)} sub={timeRange(ev)} />
        {ev.place || pinned ? <Row icon="location" title={ev.place || t('events.openInMaps')} sub={ev.place ? t('events.openInMaps') : undefined} onPress={() => { openInMaps(ev).catch(() => toast(t('events.mapsFailed'))); }} /> : null}
        {ev.church_id && ev.church_name ? <Row icon="church" title={ev.church_name} onPress={() => router.push(`/church/${ev.church_id}`)} /> : null}
        {ev.group_id && ev.group_name ? <Row icon="users" title={ev.group_name} onPress={() => router.push(`/group/${ev.group_id}`)} /> : null}

        {open ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, marginTop: 16 }}>
            <AnswerButton label={t('events.going')} icon="check" on={ev.my_rsvp === 'going'} onPress={() => answer('going')} />
            <AnswerButton label={t('events.interested')} icon="star" on={ev.my_rsvp === 'interested'} onPress={() => answer('interested')} />
            <RoundButton name="share" label={t('common.share')} onPress={share} />
          </View>
        ) : null}

        {counts ? (
          <Pressable onPress={openPeople} accessibilityRole="button" accessibilityLabel={counts} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 12, marginTop: open ? 6 : 10, opacity: pressed ? 0.6 : 1 })}>
            <Faces urls={ev.going_avatars} size={26} />
            <Text numberOfLines={1} style={{ flexShrink: 1, color: C.fg, fontSize: 15, fontWeight: '600' }}>{counts}</Text>
            <Icon name="right" size={16} color={C.fg2} weight={2.2} />
          </Pressable>
        ) : null}

        {ev.description ? (
          <Text selectable style={{ color: C.fg, fontSize: 16, lineHeight: 23, paddingHorizontal: 16, marginTop: counts ? 6 : 18 }}>
            {ev.description}
          </Text>
        ) : null}

        {pinned ? (
          <Pressable onPress={() => { openInMaps(ev).catch(() => toast(t('events.mapsFailed'))); }} accessibilityRole="button" accessibilityLabel={t('events.openInMaps')} style={({ pressed }) => ({ marginHorizontal: 16, marginTop: 22, height: 168, borderRadius: 18, overflow: 'hidden', backgroundColor: C.surface, opacity: pressed ? 0.85 : 1 })}>
            {/* A picture of the place, not a map to move about: a tap opens the Maps app. */}
            <View pointerEvents="none" style={StyleSheet.absoluteFill}>
              <MapView
                // The region is only read as the map is made: a pin moved in Edit draws a new map on the way back.
                key={`${ev.lat},${ev.lng}`}
                style={StyleSheet.absoluteFill}
                initialRegion={{ latitude: ev.lat as number, longitude: ev.lng as number, latitudeDelta: 0.008, longitudeDelta: 0.008 }}
                userInterfaceStyle={C.statusBar === 'light' ? 'dark' : 'light'}
                showsCompass={false}
                pitchEnabled={false}
                rotateEnabled={false}
              />
              <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
                <MapPin />
              </View>
            </View>
          </Pressable>
        ) : null}

        <SectionLabel>{t('events.organiser')}</SectionLabel>
        <Pressable onPress={() => openProfile(ev.user_id)} accessibilityRole="button" accessibilityLabel={`${organiser}, ${ev.username}`} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 4, backgroundColor: pressed ? C.press : 'transparent' })}>
          <Avatar uri={ev.avatar_url} name={organiser} size={44} />
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text numberOfLines={1} style={{ flexShrink: 1, color: C.fg, fontSize: 15.5, fontWeight: '600' }}>{ev.username}</Text>
              {ev.verified ? <VerifiedTick size={15} /> : null}
            </View>
            {ev.full_name ? <Text numberOfLines={1} style={{ color: C.fg2, fontSize: 14 }}>{ev.full_name}</Text> : null}
          </View>
          <Icon name="right" size={18} color={C.fg2} weight={2} />
        </Pressable>
      </ScrollView>

      <Sheet visible={sheet === 'menu'} onClose={() => setSheet(null)}>
        <SheetRow first icon="share" label={t('common.share')} onPress={fromMenu(share)} />
        {canManage ? <SheetRow icon="compose" label={t('events.edit')} onPress={fromMenu(() => router.push({ pathname: '/event-edit', params: { id } } as any))} /> : null}
        {canManage && open ? <SheetRow icon="block" label={t('events.callOff')} danger onPress={fromMenu(callOff)} /> : null}
        {canManage ? <SheetRow icon="trash" label={t('common.delete')} danger onPress={fromMenu(confirmDelete)} /> : null}
      </Sheet>

      <Sheet visible={sheet === 'people'} onClose={() => setSheet(null)} tall>
        <View style={{ flex: 1 }}>
          <FeedSwitch
            plain
            value={peopleTab}
            onChange={setPeopleTab}
            options={[
              { key: 'going', label: t('events.goingCount', { count: fmt(ev.going_count) }) },
              { key: 'interested', label: t('events.interestedCount', { count: fmt(ev.interested_count) }) },
            ]}
            style={{ marginBottom: 8 }}
          />
          {people === null ? (
            peopleError ? <ErrorNote message={peopleError} onRetry={openPeople} /> : <RowsSkeleton count={5} avatar={44} />
          ) : (
            <FlatList
              data={peopleShown}
              keyExtractor={(p) => p.user_id}
              renderItem={renderPerson}
              ListEmptyComponent={<Empty title={t('events.noOneYet')} />}
              initialNumToRender={12}
              contentContainerStyle={{ paddingBottom: 8 }}
            />
          )}
        </View>
      </Sheet>
    </Screen>
  );
}
