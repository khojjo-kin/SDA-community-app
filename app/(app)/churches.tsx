import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Linking, Pressable, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { Icon } from '../../src/components/Icon';
import { Button, Empty, ErrorNote, Loading, RoundButton, Row, Screen, ScreenHeader, SearchField, SectionLabel } from '../../src/components/ui';
import { distanceKm, fetchChurches } from '../../src/lib/api';
import { useSession } from '../../src/lib/session';
import { C, errText } from '../../src/lib/theme';
import type { Church } from '../../src/lib/types';

type Point = { lat: number; lng: number };
type Entry = { church: Church; km: number | null };

const NOTE = {
  ask: 'Sorted A to Z. Allow location to see the nearest churches first.',
  settings: 'Location is off for Community. Turn it on in Settings to see the nearest churches first.',
  nofix: "Couldn't find where you are, so this is sorted A to Z.",
};

/** Churches not yet approved carry a pill. Members only see their own unapproved ones; admins see every pending one. */
const STATUS_LABEL: Partial<Record<Church['status'], string>> = { pending: 'Pending review', rejected: 'Not approved' };

function StatusPill({ status }: { status: Church['status'] }) {
  const label = STATUS_LABEL[status];
  if (!label) return null;
  const rejected = status === 'rejected';
  return (
    <View style={{ height: 22, paddingHorizontal: 8, borderRadius: 11, backgroundColor: rejected ? C.like + '24' : C.close + '24', justifyContent: 'center' }}>
      <Text style={{ color: rejected ? C.like : C.close, fontSize: 11.5, fontWeight: '700' }}>{label}</Text>
    </View>
  );
}

/** One church in the list: name, where it is, and how far away when we know. */
function ChurchRow({ entry: { church, km }, mine, onPress }: { entry: Entry; mine?: boolean; onPress: () => void }) {
  const place = [church.city, church.country].map((s) => s.trim()).filter(Boolean).join(', ');
  const dist = km === null ? '' : `${km.toFixed(1)} km`;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={[church.name, STATUS_LABEL[church.status], place, dist && `${dist} away`, mine && 'your church'].filter(Boolean).join(', ')} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, minHeight: 64, backgroundColor: pressed ? C.press : 'transparent' })}>
      <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="church" size={24} color={mine ? C.accent2 : C.fg2} />
      </View>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text numberOfLines={1} style={{ flexShrink: 1, color: C.fg, fontSize: 16.5, fontWeight: '600' }}>{church.name}</Text>
          <StatusPill status={church.status} />
        </View>
        <Text numberOfLines={1} style={{ color: mine ? C.accent2 : C.fg2, fontSize: 13.5, marginTop: 1 }}>{mine ? `Your church${place ? ' · ' + place : ''}` : place || 'No address yet'}</Text>
      </View>
      {dist ? <Text style={{ color: C.fg2, fontSize: 15 }}>{dist}</Text> : null}
      <Icon name="right" size={18} color={C.fg2} weight={2} />
    </Pressable>
  );
}

export default function Churches() {
  const router = useRouter();
  const { me, profile } = useSession();
  const params = useLocalSearchParams<{ pick?: string }>();
  // Opened from Edit profile to choose a church: a tap hands the choice back (see edit-profile's `church` param) instead of opening the church.
  const picking = params.pick === '1';
  const [q, setQ] = useState('');
  const [list, setList] = useState<Church[] | null>(null);
  const [error, setError] = useState('');
  const [here, setHere] = useState<Point | null>(null);
  // Why there is no position: 'ask' if the prompt can be shown again, 'settings' if only the Settings app can turn it on, 'nofix' if allowed but no fix came.
  const [denied, setDenied] = useState<keyof typeof NOTE | null>(null);

  const load = useCallback(async () => {
    setError('');
    try {
      setList(await fetchChurches());
    } catch (e) {
      setError(errText(e));
      setList([]);
    }
  }, []);
  // Reload on every focus so a church added or edited on another screen shows up.
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const locate = useCallback(async () => {
    try {
      const { status, canAskAgain } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setDenied(canAskAgain ? 'ask' : 'settings');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setHere({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      setDenied(null);
    } catch {
      // Airplane mode, or a simulator with no location set: the list stays alphabetical.
      setDenied('nofix');
    }
  }, []);
  useEffect(() => { locate(); }, [locate]);

  const needle = q.trim().toLowerCase();
  const mineId = profile?.church_id ?? null;
  const { mine, rest } = useMemo(() => {
    const entries: Entry[] = (list ?? [])
      // A church an admin turned down stays visible only to the member who suggested it (so they know
      // what happened) and to anyone who already has it as their church; admins have already decided
      // on it. It is never offered when choosing a church.
      .filter((c) => c.status !== 'rejected' || (c.created_by === me && !picking) || c.id === mineId)
      .filter((c) => !needle || [c.name, c.city, c.country].some((s) => s.toLowerCase().includes(needle)))
      .map((c) => ({ church: c, km: here && c.lat !== null && c.lng !== null ? distanceKm(here, { lat: c.lat, lng: c.lng }) : null }));
    entries.sort((a, b) => {
      // Nearest first when we know where you are; churches without a pin go last. NaN (both unpinned) and 0 fall through to the name.
      const d = here ? (a.km ?? Infinity) - (b.km ?? Infinity) : 0;
      return d || a.church.name.localeCompare(b.church.name);
    });
    return { mine: entries.find((e) => e.church.id === mineId) ?? null, rest: entries.filter((e) => e.church.id !== mineId) };
  }, [list, needle, here, mineId, me, picking]);

  const choose = (id: string) => router.dismissTo({ pathname: '/edit-profile', params: { church: id } } as any);
  const open = (c: Church) => (picking ? choose(c.id) : router.push({ pathname: '/church/[id]', params: { id: c.id } } as any));
  const add = () => router.push((picking ? { pathname: '/church-new', params: { pick: '1' } } : '/church-new') as any);
  const retry = denied === 'settings' ? () => { Linking.openSettings().catch(() => {}); } : locate;

  const header = (
    <>
      {denied ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 16, marginTop: 10, padding: 12, borderRadius: 14, backgroundColor: C.surface }}>
          <Text style={{ flex: 1, color: C.fg2, fontSize: 13.5, lineHeight: 18 }}>{NOTE[denied]}</Text>
          <Button small kind="ghost" label={denied === 'settings' ? 'Open Settings' : 'Use my location'} onPress={retry} />
        </View>
      ) : null}
      {picking ? <Row icon="close" title="No church" sub="Leave it off your profile" onPress={() => choose('none')} /> : null}
      {mine ? (
        <>
          <SectionLabel>My church</SectionLabel>
          <ChurchRow entry={mine} mine onPress={() => open(mine.church)} />
        </>
      ) : null}
      {rest.length ? <SectionLabel>{here ? 'Nearest first' : 'All churches'}</SectionLabel> : null}
    </>
  );

  return (
    <Screen>
      <ScreenHeader title={picking ? 'Choose your church' : 'Churches'} right={<RoundButton name="plus" label="Add a church" onPress={add} />} />
      <View style={{ paddingBottom: 6 }}>
        <SearchField value={q} onChangeText={setQ} placeholder="Name, city or country" label="Search churches" />
      </View>
      {error ? (
        <ErrorNote message={error} onRetry={load} />
      ) : (
        <FlatList
          data={rest}
          keyExtractor={(e) => e.church.id}
          renderItem={({ item }) => <ChurchRow entry={item} onPress={() => open(item.church)} />}
          ListHeaderComponent={header}
          ListEmptyComponent={
            list === null ? (
              <Loading />
            ) : mine ? null : needle ? (
              <Empty icon="search" title="No churches match" body="Try another name, city or country." />
            ) : (
              <Empty icon="church" title="No churches listed yet" action={<Button small label="Add a church" onPress={add} style={{ marginTop: 8 }} />} />
            )
          }
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={{ paddingBottom: 40 }}
        />
      )}
    </Screen>
  );
}
