import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, FlatList, Linking, PanResponder, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Image } from 'expo-image';
import * as Location from 'expo-location';
import { useLocalSearchParams, useRouter } from 'expo-router';
import MapView, { Marker, type Region } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FeedSwitch } from '../../src/components/FeedSwitch';
import { Icon, VerifiedTick } from '../../src/components/Icon';
import { ChurchPin, ChurchRow, churchPlace, DateBadge, EventPin, EventRow, eventWhen, inView, kmText, PersonPin, PersonRow, type Point, roughAway, spreadOut } from '../../src/components/MapPins';
import { Skeleton, SkeletonFrame } from '../../src/components/Skeleton';
import { Avatar, Button, IconButton, Radio, RoundButton, Sheet, Toggle, useToast } from '../../src/components/ui';
import { distanceKm, fetchChurches, fetchFriendLocations, fetchMapEvents, fetchNearbyPeople, nearbyIsOn, openThread, shareLocation, stopSharingLocation } from '../../src/lib/api';
import { useAppFont } from '../../src/lib/fonts';
import { tap } from '../../src/lib/haptics';
import { type Key, useT } from '../../src/lib/i18n';
import { liveLocationChanged, nearbyRefresh, nearbyTurnOff, nearbyTurnOn } from '../../src/lib/liveLocation';
import { useSession } from '../../src/lib/session';
import { ago, C, errText, fmt } from '../../src/lib/theme';
import type { Church, EventCard, FriendLocation, NearbyPerson } from '../../src/lib/types';

/*
 * The map, in four layers chosen along the top:
 *
 * Friends: people who share where they are with you, as faces on a map, and your own place if you
 * share it. Sharing is always a choice (off until turned on here), limited to mutual followers or
 * close friends, never open to members under 14, and the server drops a place after 24 hours without
 * an update. While you share, your place is updated every couple of minutes whenever the app is open
 * (useLiveLocation, mounted with the app's screens), not only while this screen is.
 *
 * Nearby: adults (18 and over) who chose to show there, at a rough place (rounded by the server to
 * about a kilometre, never exact). You only see others while you show yourself. While you do, your
 * rough place is sent when this opens and every few minutes while the app is open (also
 * useLiveLocation), and it lapses after a day without one.
 *
 * Churches and Events: approved churches and upcoming events that have a place on the map.
 */

/** How often friends' places are fetched again while the map is open. */
const REFRESH_MS = 60e3;
/** How often people in Nearby are fetched again while that layer is open. */
const NEARBY_REFRESH_MS = 60e3;
/** Churches and events are fetched again on coming back to their layer after this long. */
const STALE_MS = 3 * 60e3;
/** The most churches or events drawn at once: the ones nearest the middle of the screen. */
const MAX_PINS = 80;

type Layer = 'friends' | 'nearby' | 'churches' | 'events';
const LAYERS: readonly { key: Layer; label: Key }[] = [
  { key: 'friends', label: 'map.friends' },
  { key: 'nearby', label: 'map.nearby' },
  { key: 'churches', label: 'map.churches' },
  { key: 'events', label: 'map.events' },
];
const isLayer = (s: unknown): s is Layer => s === 'friends' || s === 'nearby' || s === 'churches' || s === 'events';

/** What is chosen on the Nearby, Churches or Events layer (Friends keeps its own `chosen`). */
type Picked = { kind: 'person' | 'church' | 'event'; id: string };
/** Why Nearby can't go on (or show anyone): under 18, location access off ('settings' only the Settings app can change), or no fix. */
type NearbyNote = '' | 'adult' | 'ask' | 'settings' | 'nofix';
/** A church or event with where it is, and how far from you when that's known. */
type Entry<T> = { item: T; pos: Point; km: number | null };

const AUDIENCES: { value: FriendLocation['audience']; label: string }[] = [
  { value: 'mutuals', label: 'Mutual followers' },
  { value: 'close_friends', label: 'Close friends' },
];

function firstName(l: { full_name: string; username: string }): string {
  return (l.full_name || '').trim().split(/\s+/)[0] || l.username;
}

/** "Updated just now", "Updated 5m ago", "Updated 3h ago". */
function updatedLabel(iso: string): string {
  const a = ago(iso);
  return a === 'now' ? 'Updated just now' : `Updated ${a} ago`;
}

/** Nearest first when you know where you are (then by `tie`); as given otherwise. */
function nearestFirst<T>(list: Entry<T>[], tie: (a: T, b: T) => number): Entry<T>[] {
  return [...list].sort((a, b) => (a.km !== null && b.km !== null ? a.km - b.km : 0) || tie(a.item, b.item));
}

/** Opens the phone's maps app with directions to a place. */
function directionsTo(p: Point, name: string): Promise<unknown> {
  // Brackets end the label in a geo: link, so they're encoded too.
  const q = encodeURIComponent(name).replace(/[()]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  const url = Platform.OS === 'ios' ? `http://maps.apple.com/?daddr=${p.lat},${p.lng}&q=${q}` : `geo:${p.lat},${p.lng}?q=${p.lat},${p.lng}(${q})`;
  return Linking.openURL(url);
}

/**
 * One person on the map: their face in a ring, and their first name underneath. Maps draw a custom
 * marker into a picture, so it is only redrawn while it changes (the photo arriving, being chosen),
 * which keeps panning smooth with many friends on screen.
 */
function FacePin({ loc, chosen, onPress }: { loc: FriendLocation; chosen: boolean; onPress: () => void }) {
  const [track, setTrack] = useState(true);
  useEffect(() => {
    setTrack(true);
    const t = setTimeout(() => setTrack(false), 2500);
    return () => clearTimeout(t);
  }, [chosen, loc.avatar_url]);
  const size = chosen ? 60 : 52;
  // Friends wear the app's green; your own pin is ringed in white so it stands apart.
  const ring = loc.mine ? '#ffffff' : C.green;
  const label = loc.mine ? 'You' : firstName(loc);
  const initial = (loc.full_name || loc.username || '?').trim().charAt(0).toUpperCase() || '?';
  return (
    <Marker
      coordinate={{ latitude: loc.lat, longitude: loc.lng }}
      anchor={{ x: 0.5, y: 0.4 }}
      tracksViewChanges={track}
      onPress={(e: any) => {
        e?.stopPropagation?.();
        onPress();
      }}
      accessibilityLabel={loc.mine ? 'Your location' : `${loc.full_name || loc.username}. ${updatedLabel(loc.updated_at)}`}>
      <View style={{ alignItems: 'center', width: 96 }}>
        <View style={{ width: size + 8, height: size + 8, borderRadius: (size + 8) / 2, borderWidth: 3, borderColor: ring, padding: 1, backgroundColor: loc.mine ? C.green : '#ffffff', shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } }}>
          {loc.avatar_url ? (
            <Image source={{ uri: loc.avatar_url }} style={{ flex: 1, borderRadius: size / 2 }} contentFit="cover" onLoad={() => setTrack(false)} />
          ) : (
            <View style={{ flex: 1, borderRadius: size / 2, backgroundColor: '#272e38', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: size * 0.42 }}>{initial}</Text>
            </View>
          )}
        </View>
        <View style={{ marginTop: 4, maxWidth: 96, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 9, backgroundColor: loc.mine ? C.green : 'rgba(11,16,20,0.8)' }}>
          <Text numberOfLines={1} style={{ color: '#ffffff', fontSize: 12, fontWeight: '700' }}>{label}</Text>
        </View>
      </View>
    </Marker>
  );
}

export default function FriendsMap() {
  const { me, profile } = useSession();
  const router = useRouter();
  const toast = useToast();
  const t = useT();
  const insets = useSafeAreaInsets();
  const { height: winH } = useWindowDimensions();
  const font = useAppFont();
  const fontBold = useAppFont('bold');
  const params = useLocalSearchParams<{ layer?: string }>();
  const map = useRef<MapView>(null);
  const [locs, setLocs] = useState<FriendLocation[] | null>(null);
  const [error, setError] = useState('');
  const [chosen, setChosen] = useState<string | null>(null);
  const [settings, setSettings] = useState(false);
  const [audience, setAudience] = useState<FriendLocation['audience']>('mutuals');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [opening, setOpening] = useState(false);
  const openingRef = useRef(false);
  const [granted, setGranted] = useState(false);
  const [laidOut, setLaidOut] = useState(false);
  const alive = useRef(true);
  const fitted = useRef(false);
  const centred = useRef(false);
  const later = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Once you pick an audience here, a refresh doesn't put back the one saved before.
  const audienceTouched = useRef(false);
  // Moved on when sharing is turned off, so a refresh asked before then can't show your old place as still shared.
  const shareGen = useRef(0);

  /* ---------- layers ---------- */

  // Opens on Friends, unless the screen that opened it asked for another layer (/map?layer=events).
  const [layer, setLayer] = useState<Layer>(() => (isLayer(params.layer) ? params.layer : 'friends'));
  const layerRef = useRef(layer);
  layerRef.current = layer;
  const layers = useMemo(() => LAYERS.map((l) => ({ key: l.key, label: t(l.label) })), [t]);
  const [pick, setPick] = useState<Picked | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const [bottomH, setBottomH] = useState(0);
  const lastNav = useRef(0);
  // Each of the other layers frames its pins once, the first time it is shown.
  const framed = useRef(new Set<Layer>());

  // Where the map is looking, kept up to date only off the Friends layer (Friends doesn't need it).
  const [region, setRegion] = useState<Region | null>(null);
  const regionRef = useRef<Region | null>(null);
  const regionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Where you are (only with location access already given; nothing is asked for this).
  const [here, setHereState] = useState<Point | null>(null);
  const hereRef = useRef<Point | null>(null);
  const hereAt = useRef(0);
  const [located, setLocated] = useState(false);
  const [centring, setCentring] = useState(false);
  const findMe = useRef<Promise<Point | null> | null>(null);

  // Churches and events with a place on the map.
  const [churches, setChurches] = useState<Church[] | null>(null);
  const [churchError, setChurchError] = useState('');
  const churchesAt = useRef(0);
  const [events, setEvents] = useState<EventCard[] | null>(null);
  const [eventError, setEventError] = useState('');
  const eventsAt = useRef(0);

  // Nearby.
  const [nearbyOn, setNearbyOn] = useState<boolean | null>(null);
  const [people, setPeople] = useState<NearbyPerson[] | null>(null);
  const [peopleError, setPeopleError] = useState('');
  const [nearbyBusy, setNearbyBusy] = useState(false);
  const nearbyBusyRef = useRef(false);
  const [nearbyNote, setNearbyNote] = useState<NearbyNote>('');
  // How far out people were last asked for, and a number moved on by every ask (and by turning
  // Nearby off), so only the latest answer is shown.
  const peopleKm = useRef(0);
  const peopleReq = useRef(0);

  const restricted = !!profile?.restricted;
  const mine = locs?.find((l) => l.mine) ?? null;
  const sharing = !!mine;
  const friends = (locs ?? []).filter((l) => !l.mine);
  const picked = chosen ? (locs ?? []).find((l) => l.user_id === chosen) ?? null : null;

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (later.current) clearTimeout(later.current);
      if (regionTimer.current) clearTimeout(regionTimer.current);
    };
  }, []);

  const load = useCallback(async () => {
    const gen = shareGen.current;
    try {
      let list = await fetchFriendLocations();
      if (!alive.current) return;
      // Asked before you stopped sharing: your old place in this answer is out of date, and must not
      // switch sharing back on here (which would send your place again).
      if (gen !== shareGen.current) list = list.filter((l) => !l.mine);
      setLocs(list);
      setError('');
      const own = list.find((l) => l.mine);
      if (own && !audienceTouched.current) setAudience(own.audience);
    } catch (e) {
      if (!alive.current) return;
      setError(errText(e));
      setLocs((cur) => cur ?? []);
    }
  }, []);

  // While Friends is shown: load now, then every minute.
  useEffect(() => {
    if (layer !== 'friends') return;
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer);
  }, [load, layer]);

  // Whether location access is already on: only then is your own blue dot shown. Nothing is asked here.
  useEffect(() => {
    Location.getForegroundPermissionsAsync()
      .then((p) => { if (alive.current) setGranted(p.granted); })
      .catch(() => {});
  }, []);

  const fitAll = useCallback(
    (list: FriendLocation[], animated: boolean) => {
      const pts = list.map((l) => ({ latitude: l.lat, longitude: l.lng }));
      if (!pts.length || !map.current) return;
      if (pts.length === 1) {
        map.current.animateToRegion({ ...pts[0], latitudeDelta: 0.05, longitudeDelta: 0.05 }, animated ? 450 : 1);
        return;
      }
      map.current.fitToCoordinates(pts, { edgePadding: { top: insets.top + 120, right: 70, bottom: insets.bottom + 170, left: 70 }, animated });
    },
    [insets.top, insets.bottom],
  );

  // The first time there is someone to show (and the map has its size), frame everyone. Later refreshes leave the view alone.
  // Marked done only when the framing actually happens, so a refresh landing in between can't cancel it for good.
  useEffect(() => {
    if (layer !== 'friends' || !locs || !laidOut || fitted.current) return;
    if (locs.length) {
      const list = locs;
      const timer = setTimeout(() => {
        fitted.current = true;
        fitAll(list, false);
      }, 250);
      return () => clearTimeout(timer);
    }
    // Nobody to show yet: start near you, if location access is already on. Once someone appears, they're framed.
    if (centred.current) return;
    centred.current = true;
    Location.getForegroundPermissionsAsync()
      .then((p) => (p.granted ? Location.getLastKnownPositionAsync({ maxAge: 10 * 60e3 }) : null))
      .then((spot) => {
        if (spot && alive.current) map.current?.animateToRegion({ latitude: spot.coords.latitude, longitude: spot.coords.longitude, latitudeDelta: 0.2, longitudeDelta: 0.2 }, 1);
      })
      .catch(() => {});
  }, [locs, laidOut, fitAll, layer]);

  async function turnOn() {
    if (busy || restricted) return;
    setBusy(true);
    setProblem('');
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) {
        setGranted(false);
        setProblem(perm.canAskAgain ? 'Community needs your location to share it. Allow it when asked.' : 'Location access is off for Community. Turn it on in the Settings app, then try again.');
        return;
      }
      setGranted(true);
      let spot: Location.LocationObject;
      try {
        spot = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      } catch {
        // Location Services off for the whole phone, or no fix (indoors, flight mode): nothing is shared.
        if (alive.current) setProblem(t('map.noFix'));
        return;
      }
      if (!alive.current) return;
      await shareLocation(me, { lat: spot.coords.latitude, lng: spot.coords.longitude, accuracy: spot.coords.accuracy, audience });
      // The app-wide updater takes it from here, every couple of minutes while the app is open.
      liveLocationChanged(true);
      tap('success');
      // With nobody else on the map, go to where you are, so you can see your own face appear.
      if (!friends.length) {
        fitted.current = true;
        map.current?.animateToRegion({ latitude: spot.coords.latitude, longitude: spot.coords.longitude, latitudeDelta: 0.05, longitudeDelta: 0.05 }, 450);
      }
      toast(audience === 'close_friends' ? 'Sharing your location with close friends' : 'Sharing your location with mutual followers');
      await load();
    } catch (e) {
      if (alive.current) setProblem(errText(e));
    } finally {
      if (alive.current) setBusy(false);
    }
  }

  async function turnOff() {
    if (busy) return;
    setBusy(true);
    setProblem('');
    // The app-wide updater only ever moves a place that is there, so one on its way can't share you again.
    shareGen.current++;
    try {
      await stopSharingLocation(me);
      // Moved on again now the place is gone, so any refresh asked while it was being removed is treated as old too.
      shareGen.current++;
      // The updater stops now rather than at its next update.
      liveLocationChanged();
      tap();
      if (!alive.current) return;
      setLocs((cur) => (cur ? cur.filter((l) => !l.mine) : cur));
      if (chosen === me) setChosen(null);
      toast('Location sharing is off');
      load();
    } catch (e) {
      if (alive.current) setProblem(errText(e));
    } finally {
      if (alive.current) setBusy(false);
    }
  }

  async function chooseAudience(next: FriendLocation['audience']) {
    tap('select');
    audienceTouched.current = true;
    setAudience(next);
    // Already sharing: the new choice applies straight away, at the place last sent.
    if (!mine || mine.audience === next) return;
    try {
      await shareLocation(me, { lat: mine.lat, lng: mine.lng, accuracy: mine.accuracy, audience: next });
      load();
    } catch (e) {
      toast(errText(e));
    }
  }

  async function message(l: { user_id: string }) {
    // A ref as well as the busy button, so a quick second tap can't open the chat twice.
    if (openingRef.current) return;
    openingRef.current = true;
    setOpening(true);
    try {
      const tid = await openThread(l.user_id);
      tap();
      router.push(`/chat/${tid}`);
    } catch (e) {
      toast(errText(e));
    } finally {
      openingRef.current = false;
      if (alive.current) setOpening(false);
    }
  }

  function openSettings() {
    tap();
    setProblem('');
    setSettings(true);
  }

  /* ---------- where you are ---------- */

  const setHere = useCallback((p: Point) => {
    hereAt.current = Date.now();
    const cur = hereRef.current;
    // Small moves aren't worth drawing everything again for.
    if (cur && distanceKm(cur, p) < 0.05) return;
    hereRef.current = p;
    setHereState(p);
  }, []);

  /** Where you are, if location access is already on (never asked for here): a recent place will do. */
  const whereAmI = useCallback((): Promise<Point | null> => {
    if (hereRef.current && Date.now() - hereAt.current < 2 * 60e3) return Promise.resolve(hereRef.current);
    if (findMe.current) return findMe.current;
    const job = (async () => {
      try {
        const perm = await Location.getForegroundPermissionsAsync();
        if (!perm.granted) return null;
        const spot = (await Location.getLastKnownPositionAsync({ maxAge: 2 * 60e3 })) ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
        const p = { lat: spot.coords.latitude, lng: spot.coords.longitude };
        if (alive.current) setHere(p);
        return p;
      } catch {
        return null;
      } finally {
        findMe.current = null;
      }
    })();
    findMe.current = job;
    return job;
  }, [setHere]);

  async function centreOnMe() {
    if (centring) return;
    setCentring(true);
    try {
      let perm = await Location.getForegroundPermissionsAsync();
      if (!perm.granted && perm.canAskAgain) perm = await Location.requestForegroundPermissionsAsync();
      if (!alive.current) return;
      if (!perm.granted) {
        setGranted(false);
        Alert.alert(t('map.locationOff'), undefined, [
          { text: t('common.cancel'), style: 'cancel' },
          { text: t('churches.openSettings'), onPress: () => { Linking.openSettings().catch(() => {}); } },
        ]);
        return;
      }
      setGranted(true);
      const spot = (await Location.getLastKnownPositionAsync({ maxAge: 60e3 })) ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
      if (!alive.current) return;
      const p = { lat: spot.coords.latitude, lng: spot.coords.longitude };
      setHere(p);
      const span = Math.min(Math.max(regionRef.current?.latitudeDelta ?? 0.05, 0.01), 0.2);
      map.current?.animateToRegion({ latitude: p.lat, longitude: p.lng, latitudeDelta: span, longitudeDelta: span }, 450);
    } catch {
      if (alive.current) toast(t('map.noFix'));
    } finally {
      if (alive.current) setCentring(false);
    }
  }

  /* ---------- churches and events ---------- */

  const churchesRef = useRef(churches);
  churchesRef.current = churches;
  const loadChurches = useCallback(async () => {
    churchesAt.current = Date.now();
    try {
      const all = await fetchChurches();
      if (!alive.current) return;
      setChurches(all.filter((c) => c.status === 'approved' && c.lat !== null && c.lng !== null));
      setChurchError('');
    } catch (e) {
      churchesAt.current = 0;
      if (!alive.current) return;
      // A refresh that fails keeps what is on the map.
      if (!churchesRef.current?.length) {
        setChurchError(errText(e));
        setChurches((cur) => cur ?? []);
      }
    }
  }, []);

  const eventsRef = useRef(events);
  eventsRef.current = events;
  const loadEvents = useCallback(async () => {
    eventsAt.current = Date.now();
    try {
      const list = await fetchMapEvents();
      if (!alive.current) return;
      setEvents(list.filter((e) => e.lat !== null && e.lng !== null));
      setEventError('');
    } catch (e) {
      eventsAt.current = 0;
      if (!alive.current) return;
      if (!eventsRef.current?.length) {
        setEventError(errText(e));
        setEvents((cur) => cur ?? []);
      }
    }
  }, []);

  /* ---------- Nearby ---------- */

  const loadPeople = useCallback(async (km?: number) => {
    const at = hereRef.current;
    if (!at) return;
    const req = ++peopleReq.current;
    const before = peopleKm.current;
    const want = Math.round(Math.min(100, Math.max(30, km ?? before)));
    peopleKm.current = want;
    try {
      const list = await fetchNearbyPeople(at.lat, at.lng, want);
      if (!alive.current || req !== peopleReq.current) return;
      setPeople(list);
      setPeopleError('');
    } catch (e) {
      if (!alive.current || req !== peopleReq.current) return;
      peopleKm.current = before;
      setPeopleError(errText(e));
      setPeople((cur) => cur ?? []);
    }
  }, []);

  // On coming to a layer: fetch what it shows (again, if it has been a while), and find where you are.
  useEffect(() => {
    if (layer === 'churches' && Date.now() - churchesAt.current > STALE_MS) loadChurches();
    if (layer === 'events' && Date.now() - eventsAt.current > STALE_MS) loadEvents();
    if (layer === 'friends') return;
    let stop = false;
    whereAmI().finally(() => {
      if (!stop && alive.current) setLocated(true);
    });
    return () => {
      stop = true;
    };
  }, [layer, loadChurches, loadEvents, whereAmI]);

  // Nearby: whether you show there now; if you do, your rough place is sent again and people are fetched.
  useEffect(() => {
    if (layer !== 'nearby') return;
    if (restricted) {
      // Members under 14 are certainly under 18.
      setNearbyOn(false);
      setNearbyNote('adult');
      return;
    }
    let stop = false;
    (async () => {
      let on: boolean;
      try {
        on = await nearbyIsOn();
      } catch (e) {
        if (stop || !alive.current) return;
        setNearbyOn((cur) => cur ?? false);
        toast(errText(e));
        return;
      }
      if (stop || !alive.current) return;
      setNearbyOn(on);
      if (!on) return;
      const at = await whereAmI();
      if (stop || !alive.current) return;
      if (!at) {
        const perm = await Location.getForegroundPermissionsAsync().catch(() => null);
        if (stop || !alive.current) return;
        setNearbyNote(perm && !perm.granted ? (perm.canAskAgain ? 'ask' : 'settings') : 'nofix');
        return;
      }
      setNearbyNote((cur) => (cur === 'adult' ? cur : ''));
      nearbyRefresh(at.lat, at.lng).catch(() => {});
      loadPeople();
    })();
    return () => {
      stop = true;
    };
  }, [layer, restricted, whereAmI, loadPeople, toast]);

  // While Nearby is shown and on: people again every minute (from where you are then).
  useEffect(() => {
    if (layer !== 'nearby' || !nearbyOn) return;
    const timer = setInterval(() => {
      whereAmI().then((at) => { if (at && alive.current) loadPeople(); });
    }, NEARBY_REFRESH_MS);
    return () => clearInterval(timer);
  }, [layer, nearbyOn, whereAmI, loadPeople]);

  // Zoomed out past where people were asked for: ask again, as far as the farthest corner (up to 100 km).
  useEffect(() => {
    if (layer !== 'nearby' || !nearbyOn || !region || !here || people === null || peopleKm.current >= 100) return;
    const corner = (dLat: number, dLng: number) => distanceKm(here, { lat: region.latitude + dLat * region.latitudeDelta, lng: region.longitude + dLng * region.longitudeDelta });
    const far = Math.max(corner(0.5, 0.5), corner(-0.5, -0.5), corner(0.5, -0.5), corner(-0.5, 0.5));
    if (far > peopleKm.current + 1) loadPeople(Math.ceil(far));
  }, [layer, nearbyOn, region, here, people, loadPeople]);

  async function turnNearbyOn() {
    if (nearbyBusyRef.current || restricted || nearbyNote === 'adult') return;
    nearbyBusyRef.current = true;
    setNearbyBusy(true);
    setNearbyNote('');
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!alive.current) return;
      if (!perm.granted) {
        setGranted(false);
        setNearbyNote(perm.canAskAgain ? 'ask' : 'settings');
        return;
      }
      setGranted(true);
      let spot: Location.LocationObject;
      try {
        spot = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      } catch {
        if (alive.current) setNearbyNote('nofix');
        return;
      }
      if (!alive.current) return;
      const p = { lat: spot.coords.latitude, lng: spot.coords.longitude };
      setHere(p);
      const shown = await nearbyTurnOn(p.lat, p.lng);
      if (!alive.current) return;
      if (!shown) {
        // The server's answer: this account isn't 18 or over (or its birthday isn't known).
        setNearbyOn(false);
        setNearbyNote('adult');
        tap('warning');
        return;
      }
      setNearbyOn(true);
      tap('success');
      toast(t('map.nearbyOnToast'));
      framed.current.add('nearby');
      map.current?.animateToRegion({ latitude: p.lat, longitude: p.lng, latitudeDelta: 0.15, longitudeDelta: 0.15 }, 450);
      await loadPeople();
    } catch (e) {
      if (alive.current) toast(errText(e));
    } finally {
      nearbyBusyRef.current = false;
      if (alive.current) setNearbyBusy(false);
    }
  }

  async function turnNearbyOff() {
    if (nearbyBusyRef.current) return;
    nearbyBusyRef.current = true;
    setNearbyBusy(true);
    // Answers already on their way can't put people back on the map.
    peopleReq.current++;
    try {
      await nearbyTurnOff();
      tap();
      if (!alive.current) return;
      setNearbyOn(false);
      setPeople(null);
      setPeopleError('');
      peopleKm.current = 0;
      setPick((cur) => (cur?.kind === 'person' ? null : cur));
      setListOpen(false);
      toast(t('map.nearbyOffToast'));
    } catch (e) {
      if (alive.current) toast(errText(e));
    } finally {
      nearbyBusyRef.current = false;
      if (alive.current) setNearbyBusy(false);
    }
  }

  /** On coming back from the Settings app (or the prompt), try again from the top. */
  const askingRef = useRef(false);
  async function askForLocation() {
    if (nearbyNote === 'settings') {
      Linking.openSettings().catch(() => {});
      return;
    }
    // The prompt closing brings the app back to the front: the check below mustn't run this a second time.
    askingRef.current = true;
    const perm = await Location.requestForegroundPermissionsAsync().catch(() => null);
    askingRef.current = false;
    if (!alive.current || !perm) return;
    setGranted(perm.granted);
    if (!perm.granted) {
      setNearbyNote(perm.canAskAgain ? 'ask' : 'settings');
      return;
    }
    setNearbyNote('');
    const at = await whereAmI();
    if (!alive.current) return;
    if (!at) {
      setNearbyNote('nofix');
      return;
    }
    if (nearbyOn) {
      nearbyRefresh(at.lat, at.lng).catch(() => {});
      loadPeople();
    }
  }

  // Back in the app (from the Settings app, say) with location access now on: the note about it goes,
  // and if Nearby is on it carries on from where you are. Nothing is asked for here.
  const nearbyOnRef = useRef(nearbyOn);
  nearbyOnRef.current = nearbyOn;
  useEffect(() => {
    if (layer !== 'nearby' || (nearbyNote !== 'ask' && nearbyNote !== 'settings' && nearbyNote !== 'nofix')) return;
    let stop = false;
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active' || askingRef.current) return;
      (async () => {
        const perm = await Location.getForegroundPermissionsAsync().catch(() => null);
        if (stop || !alive.current || askingRef.current || !perm?.granted) return;
        setGranted(true);
        if (!nearbyOnRef.current) {
          // Off: turning it on finds where you are, so only the note about access goes.
          if (nearbyNote !== 'nofix') setNearbyNote('');
          return;
        }
        const at = await whereAmI();
        if (stop || !alive.current) return;
        if (!at) {
          setNearbyNote('nofix');
          return;
        }
        setNearbyNote('');
        nearbyRefresh(at.lat, at.lng).catch(() => {});
        loadPeople();
      })();
    });
    return () => {
      stop = true;
      sub.remove();
    };
  }, [layer, nearbyNote, whereAmI, loadPeople]);

  /* ---------- what is drawn ---------- */

  const churchList = useMemo<Entry<Church>[] | null>(() => {
    if (!churches) return null;
    const list = churches.map((c) => {
      const pos = { lat: c.lat ?? 0, lng: c.lng ?? 0 };
      return { item: c, pos, km: here ? distanceKm(here, pos) : null };
    });
    return nearestFirst(list, (a, b) => a.name.localeCompare(b.name));
  }, [churches, here]);

  const eventList = useMemo<Entry<EventCard>[] | null>(() => {
    if (!events) return null;
    const list = events.map((e) => {
      const pos = { lat: e.lat ?? 0, lng: e.lng ?? 0 };
      return { item: e, pos, km: here ? distanceKm(here, pos) : null };
    });
    return nearestFirst(list, (a, b) => a.starts_at.localeCompare(b.starts_at));
  }, [events, here]);

  // People (and events at the same place) are set out round their shared spot, a pin's width apart
  // at the zoom shown; the zoom is taken in half steps so panning doesn't move them.
  const zoomStep = region ? Math.round(Math.log2(Math.max(region.latitudeDelta, 1e-4)) * 2) / 2 : -3.5;
  const degPerPx = Math.pow(2, zoomStep) / Math.max(320, winH);
  const personSpots = useMemo(() => spreadOut(people ?? [], (p) => p.user_id, degPerPx), [people, degPerPx]);
  const eventSpots = useMemo(() => spreadOut((events ?? []) as (EventCard & Point)[], (e) => e.id, degPerPx), [events, degPerPx]);

  const churchPins = useMemo(() => (layer === 'churches' && churchList ? inView(churchList, (e) => e.pos, region, MAX_PINS) : []), [layer, churchList, region]);
  const eventPins = useMemo(() => (layer === 'events' && eventList ? inView(eventList, (e) => e.pos, region, MAX_PINS) : []), [layer, eventList, region]);

  const pickedPerson = layer === 'nearby' && pick?.kind === 'person' ? people?.find((p) => p.user_id === pick.id) ?? null : null;
  const pickedChurch = layer === 'churches' && pick?.kind === 'church' ? churchList?.find((e) => e.item.id === pick.id) ?? null : null;
  const pickedEvent = layer === 'events' && pick?.kind === 'event' ? eventList?.find((e) => e.item.id === pick.id) ?? null : null;

  // Frame a layer the first time it is shown: you and what is nearest you, or everything when we don't know where you are.
  useEffect(() => {
    if (!laidOut || layer === 'friends' || framed.current.has(layer) || !located) return;
    if (layer === 'nearby') {
      if (!here) return;
      framed.current.add(layer);
      map.current?.animateToRegion({ latitude: here.lat, longitude: here.lng, latitudeDelta: 0.15, longitudeDelta: 0.15 }, 450);
      return;
    }
    const list: Entry<unknown>[] | null = layer === 'churches' ? churchList : eventList;
    if (!list) return;
    framed.current.add(layer);
    const pts = (here ? list.filter((e) => e.km !== null && e.km <= 80).slice(0, 6) : list.slice(0, 40)).map((e) => e.pos);
    if (here) pts.push(here);
    if (!pts.length || !map.current) return;
    if (pts.length === 1) {
      map.current.animateToRegion({ latitude: pts[0].lat, longitude: pts[0].lng, latitudeDelta: 0.12, longitudeDelta: 0.12 }, 450);
      return;
    }
    map.current.fitToCoordinates(pts.map((p) => ({ latitude: p.lat, longitude: p.lng })), { edgePadding: { top: insets.top + 140, right: 60, bottom: Math.max(bottomH, insets.bottom + 120) + 40, left: 60 }, animated: true });
  }, [laidOut, layer, located, here, churchList, eventList, insets.top, insets.bottom, bottomH]);

  /* ---------- choosing ---------- */

  const chooseLayer = useCallback((next: Layer) => {
    setLayer(next);
    setPick(null);
    setChosen(null);
    setListOpen(false);
    if (next !== 'friends') setRegion(regionRef.current);
  }, []);

  // A link to /map?layer=… while the map is already open changes only its params: follow them.
  const askedLayer = isLayer(params.layer) ? params.layer : null;
  useEffect(() => {
    if (askedLayer && askedLayer !== layerRef.current) chooseLayer(askedLayer);
  }, [askedLayer, chooseLayer]);

  const onRegionChangeComplete = useCallback((r: Region) => {
    regionRef.current = r;
    // Friends draws every face whatever the view, so moving the map there changes nothing on screen.
    if (layerRef.current === 'friends') return;
    if (regionTimer.current) clearTimeout(regionTimer.current);
    regionTimer.current = setTimeout(() => {
      if (alive.current) setRegion(r);
    }, 250);
  }, []);

  const pickPerson = useCallback((id: string) => { tap(); setPick({ kind: 'person', id }); }, []);
  const pickChurch = useCallback((id: string) => { tap(); setPick({ kind: 'church', id }); }, []);
  const pickEvent = useCallback((id: string) => { tap(); setPick({ kind: 'event', id }); }, []);

  // From the list: choose it and bring it into view.
  const lists = useRef({ people, personSpots, churchList, eventList });
  lists.current = { people, personSpots, churchList, eventList };
  const goTo = useCallback((pos: Point) => {
    const span = Math.min(regionRef.current?.latitudeDelta ?? 0.05, 0.05);
    map.current?.animateToRegion({ latitude: pos.lat, longitude: pos.lng, latitudeDelta: span, longitudeDelta: span }, 400);
  }, []);
  const rowPerson = useCallback((id: string) => {
    const p = lists.current.people?.find((x) => x.user_id === id);
    if (!p) return;
    pickPerson(id);
    goTo({ lat: p.lat, lng: p.lng });
  }, [pickPerson, goTo]);
  const rowChurch = useCallback((id: string) => {
    const e = lists.current.churchList?.find((x) => x.item.id === id);
    if (!e) return;
    pickChurch(id);
    goTo(e.pos);
  }, [pickChurch, goTo]);
  const rowEvent = useCallback((id: string) => {
    const e = lists.current.eventList?.find((x) => x.item.id === id);
    if (!e) return;
    pickEvent(id);
    goTo(e.pos);
  }, [pickEvent, goTo]);

  // One screen per tap.
  const navOnce = () => {
    const now = Date.now();
    if (now - lastNav.current < 700) return false;
    lastNav.current = now;
    return true;
  };
  const viewProfile = (id: string) => { if (navOnce()) router.push(`/user/${id}`); };
  const openChurch = (id: string) => { if (navOnce()) router.push(`/church/${id}`); };
  const openEvent = (id: string) => { if (navOnce()) router.push(`/event/${id}`); };
  const directions = (p: Point, name: string) => {
    if (!navOnce()) return;
    directionsTo(p, name).catch(() => {});
  };

  // The list under the map opens with a swipe up on its top (or a tap), and closes with a swipe down.
  const canOpen = useRef(false);
  const listPan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponderCapture: (_, g) => Math.abs(g.dy) > 12 && Math.abs(g.dy) > Math.abs(g.dx) * 1.5,
      onPanResponderRelease: (_, g) => {
        if (g.dy < -24 && canOpen.current) setListOpen(true);
        else if (g.dy > 24) setListOpen(false);
      },
      onPanResponderTerminationRequest: () => true,
    }),
  ).current;

  const renderPerson = useCallback(({ item }: { item: NearbyPerson }) => <PersonRow person={item} onPress={rowPerson} />, [rowPerson]);
  const renderChurch = useCallback(({ item }: { item: Entry<Church> }) => <ChurchRow church={item.item} km={item.km} onPress={rowChurch} />, [rowChurch]);
  const renderEvent = useCallback(({ item }: { item: Entry<EventCard> }) => <EventRow event={item.item} km={item.km} onPress={rowEvent} />, [rowEvent]);

  const cardLook = { borderRadius: 24, backgroundColor: C.sheet, borderWidth: StyleSheet.hairlineWidth, borderColor: C.hairline, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 14, shadowOffset: { width: 0, height: 4 } };
  const card = { position: 'absolute' as const, left: 12, right: 12, bottom: insets.bottom + 12, ...cardLook };
  const audienceName = (mine?.audience ?? audience) === 'close_friends' ? 'close friends' : 'mutual followers';

  /* ---------- the panel under the map (Nearby, Churches, Events) ---------- */

  // The heading over the list: how many, or why there's nothing, or that it's still loading.
  let heading: { title: string; sub?: string; count: number; loading: boolean; retry?: () => void } | null = null;
  if (layer === 'churches') {
    const n = churchList?.length ?? 0;
    heading = churchList === null
      ? { title: '', count: 0, loading: true }
      : churchError && !n
        ? { title: t('common.didNotLoad'), sub: t('common.tryAgain'), count: 0, loading: false, retry: () => { setChurchError(''); setChurches(null); loadChurches(); } }
        : { title: n ? (n === 1 ? t('map.oneChurch') : t('map.churchCount', { n: fmt(n) })) : t('map.noChurches'), sub: n && here ? t('map.nearestFirst') : undefined, count: n, loading: false };
  } else if (layer === 'events') {
    const n = eventList?.length ?? 0;
    heading = eventList === null
      ? { title: '', count: 0, loading: true }
      : eventError && !n
        ? { title: t('common.didNotLoad'), sub: t('common.tryAgain'), count: 0, loading: false, retry: () => { setEventError(''); setEvents(null); loadEvents(); } }
        : { title: n ? (n === 1 ? t('map.oneEvent') : t('map.eventCount', { n: fmt(n) })) : t('map.noEvents'), sub: n && here ? t('map.nearestFirst') : undefined, count: n, loading: false };
  } else if (layer === 'nearby' && nearbyOn && (nearbyNote === '' || people !== null)) {
    const n = people?.length ?? 0;
    heading = people === null
      ? { title: '', count: 0, loading: true }
      : peopleError && !n
        ? { title: t('common.didNotLoad'), sub: t('common.tryAgain'), count: 0, loading: false, retry: () => { setPeopleError(''); setPeople(null); loadPeople(); } }
        : { title: n ? (n === 1 ? t('map.onePerson') : t('map.personCount', { n: fmt(n) })) : t('map.nobodyNearby'), count: n, loading: false };
  }
  const expandable = !!heading && heading.count > 0;
  canOpen.current = expandable;
  const open = listOpen && expandable;

  const noteLine =
    nearbyNote === 'adult' ? t('map.adultsOnly')
      : nearbyNote === 'settings' ? t('map.locationOff')
        : nearbyNote === 'ask' ? t('map.allowLocation')
          : nearbyNote === 'nofix' ? t('map.noFix')
            : '';

  const nearbySwitch = layer === 'nearby' ? (
    <View style={{ paddingHorizontal: 20, paddingTop: expandable ? 2 : 14, paddingBottom: heading ? 10 : 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 }}>
        <Text style={{ flex: 1, color: C.fg, fontSize: 17, fontWeight: '600', fontFamily: fontBold }}>{t('map.showMe')}</Text>
        {nearbyBusy || nearbyOn === null ? <ActivityIndicator color={C.fg2} /> : null}
        <Toggle value={!!nearbyOn} disabled={nearbyBusy || nearbyOn === null || nearbyNote === 'adult'} label={t('map.showMe')} onChange={(next) => (next ? turnNearbyOn() : turnNearbyOff())} />
      </View>
      {nearbyNote !== 'adult' ? <Text style={{ color: C.fg2, fontSize: 13.5, lineHeight: 19, marginTop: 2, fontFamily: font }}>{t('map.nearbyPrivacy')}</Text> : null}
      {noteLine ? (
        <View accessibilityLiveRegion="polite" style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8 }}>
          <Text style={{ flex: 1, color: nearbyNote === 'adult' ? C.fg2 : C.fg, fontSize: 14, lineHeight: 19, fontWeight: nearbyNote === 'adult' ? '400' : '600', fontFamily: nearbyNote === 'adult' ? font : fontBold }}>{noteLine}</Text>
          {nearbyNote === 'settings' || (nearbyNote === 'ask' && nearbyOn) ? (
            <Pressable onPress={askForLocation} hitSlop={8} accessibilityRole="button" accessibilityLabel={nearbyNote === 'settings' ? t('churches.openSettingsLabel') : t('churches.useMyLocation')} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
              <Text style={{ color: C.accent2, fontSize: 14.5, fontWeight: '700', fontFamily: fontBold }}>{nearbyNote === 'settings' ? t('churches.openSettings') : t('churches.useMyLocation')}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  ) : null;

  const headingRow = heading ? (
    <Pressable
      disabled={!expandable && !heading.retry}
      onPress={heading.retry ?? (() => { tap('select'); setListOpen((v) => !v); })}
      accessibilityRole="button"
      accessibilityLabel={heading.retry ? `${heading.title}. ${heading.sub ?? ''}` : expandable ? `${heading.title}. ${open ? t('map.hideList') : t('map.showList')}` : heading.title}
      accessibilityState={expandable ? { expanded: open } : undefined}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, minHeight: 50, paddingVertical: 6, opacity: pressed ? 0.7 : 1, borderTopWidth: layer === 'nearby' ? StyleSheet.hairlineWidth : 0, borderTopColor: C.line })}>
      {heading.loading ? (
        <SkeletonFrame style={{ flex: 1, gap: 6 }}>
          <Skeleton width={150} height={16} />
        </SkeletonFrame>
      ) : (
        <View style={{ flex: 1 }}>
          <Text numberOfLines={1} style={{ color: C.fg, fontSize: 17, fontWeight: '700', fontFamily: fontBold }}>{heading.title}</Text>
          {heading.sub ? <Text numberOfLines={1} style={{ color: heading.retry ? C.accent2 : C.fg2, fontSize: 13.5, marginTop: 1, fontWeight: heading.retry ? '600' : '400', fontFamily: heading.retry ? fontBold : font }}>{heading.sub}</Text> : null}
        </View>
      )}
      {expandable ? (
        <View style={{ transform: [{ rotate: open ? '0deg' : '180deg' }] }}>
          <Icon name="down" size={20} color={C.fg2} weight={2.2} />
        </View>
      ) : null}
    </Pressable>
  ) : null;

  const listHeight = Math.round(winH * 0.42);
  const list = !open ? null : layer === 'nearby' ? (
    <FlatList data={people ?? []} keyExtractor={(p) => p.user_id} renderItem={renderPerson} style={{ maxHeight: listHeight }} initialNumToRender={8} windowSize={5} />
  ) : layer === 'churches' ? (
    <FlatList data={churchList ?? []} keyExtractor={(e) => e.item.id} renderItem={renderChurch} style={{ maxHeight: listHeight }} initialNumToRender={8} windowSize={5} />
  ) : (
    <FlatList data={eventList ?? []} keyExtractor={(e) => e.item.id} renderItem={renderEvent} style={{ maxHeight: listHeight }} initialNumToRender={8} windowSize={5} />
  );

  // Floats like the Friends card, so the bottom of the map looks the same on every layer.
  const panel = (
    <View style={cardLook}>
      {/* Clipped inside, so the shadow outside stays (a view that clips can't cast one on iPhone). */}
      <View style={{ borderRadius: 24, overflow: 'hidden', paddingBottom: open ? 6 : 4 }}>
        <View {...listPan.panHandlers}>
          {/* The grabber shows only when there is a list to pull up. */}
          {expandable ? (
            <View style={{ alignItems: 'center', paddingTop: 8, paddingBottom: 2 }}>
              <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: C.fg3 }} />
            </View>
          ) : layer !== 'nearby' ? <View style={{ height: 6 }} /> : null}
          {nearbySwitch}
          {headingRow}
        </View>
        {list}
      </View>
    </View>
  );

  // A chosen person, church or event: what it is, and the way into it.
  let pickedCard: React.ReactNode = null;
  if (pickedPerson) {
    const p = pickedPerson;
    pickedCard = (
      <View style={[cardLook, { padding: 14 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Avatar uri={p.avatar_url} name={p.full_name || p.username} size={48} />
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text numberOfLines={1} style={{ color: C.fg, fontSize: 16.5, fontWeight: '700', flexShrink: 1, fontFamily: fontBold }}>{p.full_name || p.username}</Text>
              {p.verified ? <VerifiedTick size={14} /> : null}
            </View>
            <Text numberOfLines={1} style={{ color: C.fg2, fontSize: 13.5, marginTop: 1, fontFamily: font }}>{roughAway(p.km)}</Text>
          </View>
          <IconButton name="close" size={20} label={t('common.close')} onPress={() => setPick(null)} />
        </View>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
          <Button small kind="ghost" label={t('chat.viewProfile')} onPress={() => viewProfile(p.user_id)} style={{ flex: 1 }} />
          <Button small label={t('profile.message')} busy={opening} onPress={() => message(p)} style={{ flex: 1 }} />
        </View>
      </View>
    );
  } else if (pickedChurch) {
    const { item: c, pos, km } = pickedChurch;
    const place = churchPlace(c);
    pickedCard = (
      <View style={[cardLook, { padding: 14 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="church" size={25} color={C.accent2} />
          </View>
          <View style={{ flex: 1 }}>
            <Text numberOfLines={2} style={{ color: C.fg, fontSize: 16.5, fontWeight: '700', fontFamily: fontBold }}>{c.name}</Text>
            {place ? <Text numberOfLines={2} style={{ color: C.fg2, fontSize: 13.5, marginTop: 1, fontFamily: font }}>{place}</Text> : null}
            {km !== null ? <Text numberOfLines={1} style={{ color: C.fg2, fontSize: 13.5, marginTop: 1, fontFamily: font }}>{t('map.away', { d: kmText(km) })}</Text> : null}
          </View>
          <IconButton name="close" size={20} label={t('common.close')} onPress={() => setPick(null)} />
        </View>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
          <Button small kind="ghost" label={t('map.directions')} onPress={() => directions(pos, c.name)} style={{ flex: 1 }} />
          <Button small label={t('map.viewChurch')} onPress={() => openChurch(c.id)} style={{ flex: 1 }} />
        </View>
      </View>
    );
  } else if (pickedEvent) {
    const { item: e, pos, km } = pickedEvent;
    const where = [e.place.trim() || e.church_name || '', km !== null ? kmText(km) : ''].filter(Boolean).join(' · ');
    pickedCard = (
      <View style={[cardLook, { padding: 14 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <DateBadge iso={e.starts_at} size={48} />
          <View style={{ flex: 1 }}>
            <Text numberOfLines={2} style={{ color: C.fg, fontSize: 16.5, fontWeight: '700', fontFamily: fontBold }}>{e.title}</Text>
            <Text numberOfLines={1} style={{ color: C.fg2, fontSize: 13.5, marginTop: 1, fontFamily: font }}>{eventWhen(e)}</Text>
            {where ? <Text numberOfLines={1} style={{ color: C.fg2, fontSize: 13.5, marginTop: 1, fontFamily: font }}>{where}</Text> : null}
            {e.going_count > 0 ? <Text numberOfLines={1} style={{ color: C.accent2, fontSize: 13.5, fontWeight: '600', marginTop: 1, fontFamily: fontBold }}>{t('map.going', { n: fmt(e.going_count) })}</Text> : null}
          </View>
          <IconButton name="close" size={20} label={t('common.close')} onPress={() => setPick(null)} />
        </View>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
          <Button small kind="ghost" label={t('map.directions')} onPress={() => directions(pos, e.place.trim() || e.title)} style={{ flex: 1 }} />
          <Button small label={t('map.viewEvent')} onPress={() => openEvent(e.id)} style={{ flex: 1 }} />
        </View>
      </View>
    );
  }

  // The round buttons on the right sit just above whatever is at the bottom.
  const floatBottom = layer === 'friends' ? insets.bottom + 104 : bottomH + 12;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <MapView
        ref={map}
        style={StyleSheet.absoluteFill}
        onLayout={() => setLaidOut(true)}
        userInterfaceStyle={C.statusBar === 'light' ? 'dark' : 'light'}
        showsUserLocation={layer === 'friends' ? granted && !sharing : granted}
        showsCompass={false}
        pitchEnabled={false}
        rotateEnabled={false}
        onRegionChangeComplete={onRegionChangeComplete}
        onPress={(e: any) => {
          // A tap on a face also reaches the map on some phones; only a tap on the map itself closes the card.
          if (e?.nativeEvent?.action === 'marker-press') return;
          setChosen(null);
          setPick(null);
        }}>
        {layer === 'friends'
          ? (locs ?? []).map((l) => (
            <FacePin key={l.user_id} loc={l} chosen={chosen === l.user_id} onPress={() => { tap(); setChosen(l.user_id); }} />
          ))
          : null}
        {layer === 'nearby' && nearbyOn
          ? (people ?? []).map((p) => {
            const at = personSpots.get(p.user_id) ?? p;
            return <PersonPin key={p.user_id} person={p} lat={at.lat} lng={at.lng} chosen={pick?.kind === 'person' && pick.id === p.user_id} onPress={pickPerson} />;
          })
          : null}
        {churchPins.map((e) => (
          <ChurchPin key={e.item.id} church={e.item} chosen={pick?.kind === 'church' && pick.id === e.item.id} onPress={pickChurch} />
        ))}
        {eventPins.map((e) => {
          const at = eventSpots.get(e.item.id) ?? e.pos;
          return <EventPin key={e.item.id} event={e.item} lat={at.lat} lng={at.lng} chosen={pick?.kind === 'event' && pick.id === e.item.id} onPress={pickEvent} />;
        })}
      </MapView>

      {/* header, floating over the map: back, the title, and the layers under them */}
      <View pointerEvents="box-none" style={{ position: 'absolute', top: insets.top + 6, left: 16, right: 16 }}>
        <View pointerEvents="box-none" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <RoundButton name="back" label="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/inbox'))} />
          <View style={{ height: 44, paddingHorizontal: 20, borderRadius: 22, backgroundColor: C.round, borderWidth: StyleSheet.hairlineWidth, borderColor: C.hairline, justifyContent: 'center' }}>
            <Text accessibilityRole="header" style={{ color: C.fg, fontSize: 18, fontWeight: '700', fontFamily: fontBold }}>Map</Text>
          </View>
          {layer === 'friends' ? <RoundButton name="settings" label="Location sharing settings" onPress={openSettings} /> : <View style={{ width: 44 }} />}
        </View>
        <View style={{ alignSelf: 'center', marginTop: 10, paddingHorizontal: 18, borderRadius: 20, backgroundColor: C.round, borderWidth: StyleSheet.hairlineWidth, borderColor: C.hairline, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } }}>
          <FeedSwitch value={layer} onChange={chooseLayer} options={layers} plain style={{ gap: 18, height: 40 }} />
        </View>
      </View>

      {/* round buttons on the right: go to where you are, and (on Friends) frame everyone again */}
      <View pointerEvents="box-none" style={{ position: 'absolute', right: 16, bottom: floatBottom, gap: 10 }}>
        {centring ? (
          <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: C.round, borderWidth: StyleSheet.hairlineWidth, borderColor: C.hairline, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color={C.fg2} />
          </View>
        ) : (
          <RoundButton name="location" label={t('map.myLocation')} onPress={centreOnMe} />
        )}
        {layer === 'friends' && (locs?.length ?? 0) > 0 && !picked ? (
          <RoundButton name="expand" label="Show everyone" onPress={() => { tap(); fitAll(locs ?? [], true); }} />
        ) : null}
      </View>

      {layer !== 'friends' ? (
        <View pointerEvents="box-none" onLayout={(e) => setBottomH(e.nativeEvent.layout.height)} style={{ position: 'absolute', left: 12, right: 12, bottom: 0, paddingBottom: insets.bottom + 12 }}>
          {pickedCard ?? panel}
        </View>
      ) : picked ? (
        // A chosen face: who, when their place was last updated, and a way to message them.
        <View style={[card, { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 }]}>
          <Avatar uri={picked.avatar_url} name={picked.full_name || picked.username} size={48} />
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text numberOfLines={1} style={{ color: C.fg, fontSize: 16.5, fontWeight: '700', flexShrink: 1, fontFamily: fontBold }}>{picked.mine ? 'You' : picked.full_name || picked.username}</Text>
              {picked.verified && !picked.mine ? <VerifiedTick size={14} /> : null}
            </View>
            <Text numberOfLines={1} style={{ color: C.fg2, fontSize: 13.5, marginTop: 1, fontFamily: font }}>{updatedLabel(picked.updated_at)}</Text>
          </View>
          {picked.mine ? <Button small kind="ghost" label="Settings" onPress={openSettings} /> : <Button small label="Message" busy={opening} onPress={() => message(picked)} />}
          <IconButton name="close" size={20} label="Close" onPress={() => setChosen(null)} />
        </View>
      ) : (
        // Nothing chosen: how you're sharing, and how many friends are on the map. Tapping opens the settings.
        <Pressable onPress={error ? () => { setError(''); load(); } : openSettings} accessibilityRole="button" accessibilityLabel={error ? "Friends' places didn't load. Try again" : sharing ? `Sharing your location with ${audienceName}. Change` : 'Location sharing is off. Change'} style={({ pressed }) => [card, { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, opacity: pressed ? 0.85 : 1 }]}>
          <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: sharing ? C.accentSoft : C.surface2, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="location" size={22} color={sharing ? C.accent2 : C.fg2} />
          </View>
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={{ color: C.fg, fontSize: 16, fontWeight: '700', fontFamily: fontBold }}>{sharing ? 'Sharing your location' : 'Your location is off'}</Text>
            <Text numberOfLines={2} style={{ color: C.fg2, fontSize: 13.5, marginTop: 1, fontFamily: font }}>
              {locs === null
                ? 'Looking for friends…'
                : error
                  ? "Friends' places didn't load. Tap to try again."
                  : `${sharing ? `With ${audienceName}. ` : ''}${friends.length ? `${friends.length} ${friends.length === 1 ? 'friend is' : 'friends are'} sharing with you.` : 'No friends are sharing with you right now.'}`}
            </Text>
          </View>
          {locs === null ? <ActivityIndicator color={C.fg2} /> : <Icon name="right" size={18} color={C.fg2} weight={2} />}
        </Pressable>
      )}

      {/* sharing settings */}
      <Sheet visible={settings} onClose={() => setSettings(false)} title="Location sharing">
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 8, gap: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: C.fg, fontSize: 17, fontWeight: '600', fontFamily: fontBold }}>Share my location</Text>
              <Text style={{ color: C.fg2, fontSize: 13.5, marginTop: 2, fontFamily: font }}>{restricted ? 'Not available on your account' : sharing ? `On · ${updatedLabel(mine.updated_at).toLowerCase()}` : 'Off'}</Text>
            </View>
            {busy ? <ActivityIndicator color={C.fg2} style={{ marginRight: 8 }} /> : null}
            <Toggle value={sharing} disabled={restricted || busy} label="Share my location" onChange={(next) => (next ? turnOn() : turnOff())} />
          </View>

          {restricted ? <Text style={{ color: C.fg2, fontSize: 14, lineHeight: 20, fontFamily: font }}>Members under 14 can't share their location.</Text> : null}

          {problem ? <Text style={{ color: C.like, fontSize: 14, lineHeight: 20, fontFamily: font }} accessibilityLiveRegion="polite">{problem}</Text> : null}

          <View accessibilityRole="radiogroup" style={{ opacity: restricted ? 0.45 : 1 }}>
            <Text style={{ color: C.fg2, fontSize: 14, fontWeight: '700', marginBottom: 4, fontFamily: fontBold }}>Who can see it</Text>
            {AUDIENCES.map((a) => (
              <Pressable key={a.value} disabled={restricted} onPress={() => chooseAudience(a.value)} accessibilityRole="radio" accessibilityState={{ checked: audience === a.value, disabled: restricted }} accessibilityLabel={a.label} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9, opacity: pressed ? 0.7 : 1 })}>
                <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: a.value === 'close_friends' ? C.close : C.surface2, alignItems: 'center', justifyContent: 'center' }}>
                  {a.value === 'close_friends' ? <Icon name="star" size={18} color="#fff" fill /> : <Icon name="people" size={19} />}
                </View>
                <Text style={{ flex: 1, color: C.fg, fontSize: 16.5, fontFamily: font }}>{a.label}</Text>
                <Radio on={audience === a.value} />
              </Pressable>
            ))}
            <Pressable onPress={() => {
                setSettings(false);
                // Let the sheet slide away before the list opens.
                if (later.current) clearTimeout(later.current);
                later.current = setTimeout(() => router.push('/close-friends'), 350);
              }} accessibilityRole="link" style={({ pressed }) => ({ paddingVertical: 6, opacity: pressed ? 0.6 : 1 })}>
              <Text style={{ color: C.accent2, fontSize: 14.5, fontWeight: '600', fontFamily: fontBold }}>Edit close friends</Text>
            </Pressable>
          </View>
        </ScrollView>
      </Sheet>
    </View>
  );
}
