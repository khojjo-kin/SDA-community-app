import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import * as Location from 'expo-location';
import { Stack, useRouter } from 'expo-router';
import MapView, { Marker } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, VerifiedTick } from '../../src/components/Icon';
import { Avatar, Button, IconButton, Radio, RoundButton, Sheet, Toggle, useToast } from '../../src/components/ui';
import { fetchFriendLocations, openThread, shareLocation, stopSharingLocation } from '../../src/lib/api';
import { useAppFont } from '../../src/lib/fonts';
import { tap } from '../../src/lib/haptics';
import { liveLocationChanged } from '../../src/lib/liveLocation';
import { useSession } from '../../src/lib/session';
import { ago, C, errText } from '../../src/lib/theme';
import type { FriendLocation } from '../../src/lib/types';

/*
 * The friends map: people who share where they are with you, as faces on a map, and your own place
 * if you share it. Sharing is always a choice (off until turned on here), limited to mutual followers
 * or close friends, never open to members under 14, and the server drops a place after 24 hours
 * without an update. While you share, your place is updated every couple of minutes whenever the app
 * is open (useLiveLocation, mounted with the app's screens), not only while this screen is.
 */

/** How often friends' places are fetched again while the map is open. */
const REFRESH_MS = 60e3;

const AUDIENCES: { value: FriendLocation['audience']; label: string; sub: string }[] = [
  { value: 'mutuals', label: 'Mutual followers', sub: 'People you follow who follow you back' },
  { value: 'close_friends', label: 'Close friends', sub: 'Only the people on your close friends list' },
];

const EXPLAIN = "Only the people you choose see where you are. Your location updates while you're using the app, never in the background, and disappears after 24 hours if you stop opening the app.";

function firstName(l: { full_name: string; username: string }): string {
  return (l.full_name || '').trim().split(/\s+/)[0] || l.username;
}

/** "Updated just now", "Updated 5m ago", "Updated 3h ago". */
function updatedLabel(iso: string): string {
  const a = ago(iso);
  return a === 'now' ? 'Updated just now' : `Updated ${a} ago`;
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
  const insets = useSafeAreaInsets();
  const font = useAppFont();
  const fontBold = useAppFont('bold');
  const map = useRef<MapView>(null);
  const [locs, setLocs] = useState<FriendLocation[] | null>(null);
  const [error, setError] = useState('');
  const [chosen, setChosen] = useState<string | null>(null);
  const [settings, setSettings] = useState(false);
  const [audience, setAudience] = useState<FriendLocation['audience']>('mutuals');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [opening, setOpening] = useState(false);
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

  // Load now, then every minute while the map is open.
  useEffect(() => {
    load();
    const t = setInterval(load, REFRESH_MS);
    return () => clearInterval(t);
  }, [load]);

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
    if (!locs || !laidOut || fitted.current) return;
    if (locs.length) {
      const list = locs;
      const t = setTimeout(() => {
        fitted.current = true;
        fitAll(list, false);
      }, 250);
      return () => clearTimeout(t);
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
  }, [locs, laidOut, fitAll]);

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
      const spot = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
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

  async function message(l: FriendLocation) {
    if (opening) return;
    setOpening(true);
    try {
      const tid = await openThread(l.user_id);
      tap();
      router.push(`/chat/${tid}`);
    } catch (e) {
      toast(errText(e));
    } finally {
      if (alive.current) setOpening(false);
    }
  }

  function openSettings() {
    tap();
    setProblem('');
    setSettings(true);
  }

  const card = { position: 'absolute' as const, left: 12, right: 12, bottom: insets.bottom + 12, borderRadius: 24, backgroundColor: C.sheet, borderWidth: StyleSheet.hairlineWidth, borderColor: C.hairline, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 14, shadowOffset: { width: 0, height: 4 } };
  const audienceName = (mine?.audience ?? audience) === 'close_friends' ? 'close friends' : 'mutual followers';

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {/* Dragging the map mustn't count as a swipe back: only the screen's edge goes back here. */}
      <Stack.Screen options={{ fullScreenGestureEnabled: false }} />
      <MapView
        ref={map}
        style={StyleSheet.absoluteFill}
        onLayout={() => setLaidOut(true)}
        userInterfaceStyle={C.statusBar === 'light' ? 'dark' : 'light'}
        showsUserLocation={granted && !sharing}
        showsCompass={false}
        pitchEnabled={false}
        rotateEnabled={false}
        onPress={(e: any) => {
          // A tap on a face also reaches the map on some phones; only a tap on the map itself closes the card.
          if (e?.nativeEvent?.action === 'marker-press') return;
          setChosen(null);
        }}>
        {(locs ?? []).map((l) => (
          <FacePin key={l.user_id} loc={l} chosen={chosen === l.user_id} onPress={() => { tap(); setChosen(l.user_id); }} />
        ))}
      </MapView>

      {/* header, floating over the map */}
      <View style={{ position: 'absolute', top: insets.top + 6, left: 16, right: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <RoundButton name="back" label="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/inbox'))} />
        <View style={{ height: 44, paddingHorizontal: 20, borderRadius: 22, backgroundColor: C.round, borderWidth: StyleSheet.hairlineWidth, borderColor: C.hairline, justifyContent: 'center' }}>
          <Text accessibilityRole="header" style={{ color: C.fg, fontSize: 18, fontWeight: '700', fontFamily: fontBold }}>Map</Text>
        </View>
        <RoundButton name="settings" label="Location sharing settings" onPress={openSettings} />
      </View>

      {/* frame everyone again after looking around */}
      {(locs?.length ?? 0) > 0 && !picked ? (
        <View style={{ position: 'absolute', right: 16, bottom: insets.bottom + 104 }}>
          <RoundButton name="expand" label="Show everyone" onPress={() => { tap(); fitAll(locs ?? [], true); }} />
        </View>
      ) : null}

      {picked ? (
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

          {restricted ? (
            <View style={{ flexDirection: 'row', gap: 10, padding: 12, borderRadius: 14, backgroundColor: C.surface }}>
              <Icon name="shield" size={20} color={C.fg2} />
              <Text style={{ flex: 1, color: C.fg2, fontSize: 14, lineHeight: 20, fontFamily: font }}>Members under 14 can't share their location. It keeps younger members safe. You can still see friends who share with you.</Text>
            </View>
          ) : null}

          {problem ? <Text style={{ color: C.like, fontSize: 14, lineHeight: 20, fontFamily: font }} accessibilityLiveRegion="polite">{problem}</Text> : null}

          <View accessibilityRole="radiogroup" style={{ opacity: restricted ? 0.45 : 1 }}>
            <Text style={{ color: C.fg2, fontSize: 14, fontWeight: '700', marginBottom: 4, fontFamily: fontBold }}>Who can see it</Text>
            {AUDIENCES.map((a) => (
              <Pressable key={a.value} disabled={restricted} onPress={() => chooseAudience(a.value)} accessibilityRole="radio" accessibilityState={{ checked: audience === a.value, disabled: restricted }} accessibilityLabel={`${a.label}. ${a.sub}`} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9, opacity: pressed ? 0.7 : 1 })}>
                <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: a.value === 'close_friends' ? C.close : C.surface2, alignItems: 'center', justifyContent: 'center' }}>
                  {a.value === 'close_friends' ? <Icon name="star" size={18} color="#fff" fill /> : <Icon name="people" size={19} />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: C.fg, fontSize: 16.5, fontFamily: font }}>{a.label}</Text>
                  <Text style={{ color: C.fg2, fontSize: 13.5, marginTop: 1, fontFamily: font }}>{a.sub}</Text>
                </View>
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

          <View style={{ flexDirection: 'row', gap: 10, padding: 12, borderRadius: 14, backgroundColor: C.surface }}>
            <Icon name="lock" size={20} color={C.fg2} />
            <Text style={{ flex: 1, color: C.fg2, fontSize: 14, lineHeight: 20, fontFamily: font }}>{EXPLAIN}</Text>
          </View>
        </ScrollView>
      </Sheet>
    </View>
  );
}
