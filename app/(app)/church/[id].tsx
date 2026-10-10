import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, FlatList, Linking, Platform, Pressable, RefreshControl, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { EventTile, EventTilesSkeleton } from '../../../src/components/EventCard';
import { Icon } from '../../../src/components/Icon';
import { PersonRow } from '../../../src/components/PersonRow';
import { RowsSkeleton, Skeleton, SkeletonFrame } from '../../../src/components/Skeleton';
import { Button, Divider, Empty, ErrorNote, Field, Loading, RoundButton, Row, Screen, ScreenHeader, SectionLabel, Sheet, SheetRow, useToast } from '../../../src/components/ui';
import { countChurchMembers, decideChurch, deleteChurch, fetchChurch, fetchChurchMembers, fetchEvents, updateChurch, updateProfile } from '../../../src/lib/api';
import { tap } from '../../../src/lib/haptics';
import { t } from '../../../src/lib/i18n';
import { useSession } from '../../../src/lib/session';
import { announce } from '../../../src/lib/store';
import { C, errText, fmt } from '../../../src/lib/theme';
import type { Church, EventCard, Profile } from '../../../src/lib/types';

/** The fields an admin can correct. */
type Form = Pick<Church, 'name' | 'address' | 'city' | 'country' | 'website' | 'service_times'>;

/** fetchChurchMembers' page: a shorter page is the last one. */
const PAGE = 50;
const EMPTY: Form = { name: '', address: '', city: '', country: '', website: '', service_times: '' };
const placeOf = (c: Pick<Church, 'address' | 'city' | 'country'>) => [c.address, c.city, c.country].map((s) => (s ?? '').trim()).filter(Boolean).join(', ');
/** "example.org" was allowed when the church was added, so give it a scheme before opening. */
const siteOf = (c: Church) => (c.website.trim() ? (/^https?:\/\//i.test(c.website.trim()) ? c.website.trim() : `https://${c.website.trim()}`) : '');
/** What the edit form takes as a website: empty, or something that looks like one ("example.org" gains https://). Null when it doesn't. */
function websiteFrom(raw: string): string | null {
  const s = raw.trim();
  if (!s) return '';
  const url = /^https?:\/\//i.test(s) ? s : `https://${s}`;
  return /^https?:\/\/[\w-]+(\.[\w-]+)+(\/\S*)?$/i.test(url) ? url : null;
}
const keyOfPerson = (p: Profile) => p.id;
/** The church's next few events, in a sideways strip. */
const EVENTS_SHOWN = 6;
const EVENT_TILE = 236;
const keyOfEvent = (e: EventCard) => e.id;

/** Apple Maps on iOS. On Android the Google Maps link opens the app when it is installed and the browser otherwise. A pin wins over the typed address. */
function mapsUrl(c: Church) {
  const q = encodeURIComponent(placeOf(c) || c.name);
  const pin = c.lat !== null && c.lng !== null ? `${c.lat},${c.lng}` : '';
  if (Platform.OS === 'ios') return pin ? `https://maps.apple.com/?ll=${pin}&q=${encodeURIComponent(c.name)}` : `https://maps.apple.com/?q=${q}`;
  return `https://www.google.com/maps/search/?api=1&query=${pin || q}`;
}

/** The page while it loads: the disc, the name and place, the button, a few rows. */
function ChurchSkeleton() {
  const { width } = useWindowDimensions();
  const mid = (w: number) => Math.round((width - w) / 2);
  return (
    <SkeletonFrame style={{ alignItems: 'center', paddingTop: 10, gap: 10 }}>
      <Skeleton width={88} height={88} radius={44} x={mid(88)} />
      <Skeleton width={180} height={18} x={mid(180)} />
      <Skeleton width={130} height={12} x={mid(130)} />
      <Skeleton width={width - 32} height={46} radius={12} x={16} style={{ marginTop: 16 }} />
      <View style={{ alignSelf: 'stretch', paddingHorizontal: 16, paddingTop: 26, gap: 24 }}>
        {[0.42, 0.5, 0.36].map((w, i) => (
          <Skeleton key={i} width={Math.round((width - 32) * w)} height={14} x={16} />
        ))}
      </View>
    </SkeletonFrame>
  );
}

export default function ChurchPage() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = String(params.id);
  const router = useRouter();
  const toast = useToast();
  const { me, profile, refresh } = useSession();
  // undefined while loading, null when the church is gone.
  const [church, setChurch] = useState<Church | null | undefined>(undefined);
  const [members, setMembers] = useState<Profile[] | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [paging, setPaging] = useState(false);
  const [sheet, setSheet] = useState<'more' | 'edit' | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [formErr, setFormErr] = useState('');
  const [saving, setSaving] = useState(false);
  const [deciding, setDeciding] = useState(false);
  // Work on its way, against a second tap before its button shows it.
  const busyNow = useRef(false);
  const savingNow = useRef(false);
  const decidingNow = useRef(false);
  const done = useRef(false);
  const pagingNow = useRef(false);
  const alive = useRef(true);
  const shown = useRef<Church | null | undefined>(undefined);
  shown.current = church;
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const mine = profile?.church_id === id;
  const admin = !!profile?.admin_role;

  /** The members from the top again, with how many there are. */
  const loadMembers = useCallback(async () => {
    const [people, n] = await Promise.all([fetchChurchMembers(id), countChurchMembers(id).catch(() => null)]);
    if (!alive.current) return;
    done.current = people.length < PAGE;
    setMembers(people);
    setTotal(n);
  }, [id]);

  const load = useCallback(
    async (pull = false) => {
      if (pull) setRefreshing(true);
      try {
        const [c] = await Promise.all([fetchChurch(id), loadMembers()]);
        if (!alive.current) return;
        setChurch(c);
        setError('');
      } catch (e) {
        if (!alive.current) return;
        // A refresh that fails keeps the page as it was.
        if (shown.current === undefined) setError(errText(e));
        else if (pull) toast(errText(e));
      } finally {
        if (alive.current && pull) setRefreshing(false);
      }
    },
    [id, loadMembers, toast],
  );
  useEffect(() => {
    load();
  }, [load]);

  // The church's next events, on every visit: one made from here shows on the way back. The strip is
  // extra, so if it can't load the page goes without it (or keeps what it showed).
  const [events, setEvents] = useState<EventCard[] | null>(null);
  const loadEvents = useCallback(() => {
    fetchEvents({ churchId: id, limit: EVENTS_SHOWN })
      .then((list) => { if (alive.current) setEvents(list); })
      .catch(() => { if (alive.current) setEvents((cur) => cur ?? []); });
  }, [id]);
  useFocusEffect(loadEvents);
  const lastOpen = useRef(0);
  const openEvent = useCallback(
    (eventId: string) => {
      if (Date.now() - lastOpen.current < 700) return;
      lastOpen.current = Date.now();
      router.push(`/event/${eventId}`);
    },
    [router],
  );
  const renderEvent = useCallback(({ item }: { item: EventCard }) => <EventTile ev={item} width={EVENT_TILE} onOpen={openEvent} />, [openEvent]);

  function more() {
    const cur = members;
    if (!cur || done.current || pagingNow.current) return;
    pagingNow.current = true;
    setPaging(true);
    fetchChurchMembers(id, cur.length)
      .then((page) => {
        if (!alive.current) return;
        if (page.length < PAGE) done.current = true;
        setMembers((list) => {
          if (!list) return list;
          const seen = new Set(list.map((p) => p.id));
          return [...list, ...page.filter((p) => !seen.has(p.id))];
        });
      })
      .catch((e) => toast(errText(e)))
      .finally(() => {
        pagingNow.current = false;
        if (alive.current) setPaging(false);
      });
  }

  // Let the sheet slide away before the next thing opens, so the two animations do not overlap.
  const after = (fn: () => void) => () => {
    setSheet(null);
    setTimeout(fn, 380);
  };

  /** Join or leave. The session already listens for 'profile'; refresh() as well so the button flips straight away. */
  async function setMembership(next: string | null) {
    if (busyNow.current) return;
    busyNow.current = true;
    setBusy(true);
    try {
      await updateProfile(me, { church_id: next });
      announce('profile');
      await refresh();
      loadMembers().catch(() => {});
      if (next) tap('success');
      toast(next ? 'This is your church now' : 'You have left this church');
    } catch (e) {
      toast(errText(e));
    } finally {
      busyNow.current = false;
      if (alive.current) setBusy(false);
    }
  }
  function join() {
    if (!church) return;
    Alert.alert(`Make ${church.name} your church?`, undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'This is my church', onPress: () => { setMembership(id); } },
    ]);
  }
  function leave() {
    Alert.alert('Leave this church?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Leave', style: 'destructive', onPress: () => { setMembership(null); } },
    ]);
  }

  function openEdit() {
    if (!church) return;
    setForm({ name: church.name, address: church.address, city: church.city, country: church.country, website: church.website, service_times: church.service_times });
    setFormErr('');
    setSheet('edit');
  }
  const set = (k: keyof Form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function saveEdit() {
    if (!church || savingNow.current) return;
    const website = websiteFrom(form.website);
    const patch: Form = { name: form.name.trim(), address: form.address.trim(), city: form.city.trim(), country: form.country.trim(), website: website ?? '', service_times: form.service_times.trim() };
    if (patch.name.length < 2) return setFormErr("Add the church's name.");
    if (website === null) return setFormErr('That website address does not look right.');
    savingNow.current = true;
    setSaving(true);
    setFormErr('');
    // A changed address gets a fresh pin so distances stay right. Geocoding can fail offline; the old pin is kept then.
    let pin: Partial<Pick<Church, 'lat' | 'lng'>> = {};
    const next = { ...church, ...patch };
    if (placeOf(next) && placeOf(next) !== placeOf(church)) {
      try {
        const [hit] = await Location.geocodeAsync(placeOf(next));
        if (hit) pin = { lat: hit.latitude, lng: hit.longitude };
      } catch {
        // Keep the old coordinates.
      }
    }
    try {
      await updateChurch(church.id, { ...patch, ...pin });
      if (!alive.current) return;
      setChurch({ ...next, ...pin });
      setSheet(null);
      tap('success');
      toast('Church updated');
      if (mine) announce('profile'); // church_name on the profile comes from this row
    } catch (e) {
      if (alive.current) setFormErr(errText(e));
    } finally {
      savingNow.current = false;
      if (alive.current) setSaving(false);
    }
  }

  /** Admins: approve a suggested church (it then lists for everyone) or turn it down. */
  async function decide(approve: boolean) {
    if (!church || decidingNow.current) return;
    decidingNow.current = true;
    setDeciding(true);
    try {
      await decideChurch(me, church.id, approve);
      if (!alive.current) return;
      setChurch((c) => c && { ...c, status: approve ? 'approved' : 'rejected', reviewed_by: me, reviewed_at: new Date().toISOString() });
      if (approve) tap('success');
      toast(approve ? 'Church approved' : 'Church not approved');
    } catch (e) {
      toast(errText(e));
    } finally {
      decidingNow.current = false;
      if (alive.current) setDeciding(false);
    }
  }
  function reject() {
    Alert.alert('Reject this church?', "It won't be listed.", [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reject', style: 'destructive', onPress: () => { decide(false); } },
    ]);
  }

  function confirmDelete() {
    Alert.alert('Delete this church?', 'It comes off every member’s profile. This can’t be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          deleteChurch(id)
            .then(() => {
              announce('profile'); // members, maybe you, just lost their church
              toast('Church deleted');
              if (router.canGoBack()) router.back();
              else router.replace('/churches' as any);
            })
            .catch((e) => toast(errText(e)));
        },
      },
    ]);
  }

  const renderMember = useCallback(({ item }: { item: Profile }) => <PersonRow person={item} />, []);

  if (error && church === undefined) return <Screen><ScreenHeader title="Church" /><ErrorNote message={error} onRetry={() => { setError(''); load(); }} /></Screen>;
  if (church === undefined) return <Screen><ScreenHeader title="Church" /><ChurchSkeleton /></Screen>;
  if (church === null) return <Screen><ScreenHeader title="Church" /><Empty icon="church" title="This church isn't listed any more" /></Screen>;

  const place = placeOf(church);
  const site = siteOf(church);
  const times = church.service_times.trim();
  const pending = church.status === 'pending';
  const rejected = church.status === 'rejected';
  // Members 14 and over can post an event for a listed church; the section shows when there's something in it.
  const canAddEvent = !rejected && profile?.restricted !== true;
  const showEvents = events === null || events.length > 0 || canAddEvent;

  const head = (
    <View>
      {pending || rejected ? (
        <View style={{ marginHorizontal: 16, marginTop: 4, padding: 14, borderRadius: 14, backgroundColor: rejected ? C.like + '1f' : C.close + '1f', gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Icon name={rejected ? 'info' : 'clock'} size={20} color={rejected ? C.like : C.close} />
            <Text style={{ flex: 1, color: C.fg, fontWeight: '700' }}>{rejected ? t('churches.notApproved') : t('churches.pending')}</Text>
          </View>
          {admin ? (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button small label={rejected ? 'Approve after all' : 'Approve'} busy={deciding} onPress={() => decide(true)} style={{ flex: 1 }} />
              {pending ? <Button small kind="ghost" label="Reject" disabled={deciding} onPress={reject} /> : null}
            </View>
          ) : null}
        </View>
      ) : null}
      <View style={{ alignItems: 'center', gap: 10, paddingTop: 10, paddingBottom: 18, paddingHorizontal: 24 }}>
        {/* Solid green disc with a white mark: the same look as the verified tick, so a listed church reads as the real thing. */}
        <View accessible={false} style={{ width: 88, height: 88, borderRadius: 44, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="church" size={46} color={C.onAccent} weight={2} />
        </View>
        <Text accessibilityRole="header" style={{ color: C.fg, fontSize: 22, fontWeight: '800', textAlign: 'center' }}>{church.name}</Text>
        {place ? <Text style={{ color: C.fg2, textAlign: 'center', lineHeight: 20 }}>{place}</Text> : null}
        {mine ? <Text style={{ color: C.accent2, fontWeight: '700', fontSize: 14 }}>Your church</Text> : null}
      </View>
      <View style={{ paddingHorizontal: 16 }}>
        {/* A church that was turned down can be left, but not newly chosen. */}
        {mine ? <Button label="Leave this church" kind="ghost" busy={busy} onPress={leave} /> : rejected ? null : <Button label="This is my church" busy={busy} onPress={join} />}
      </View>

      <SectionLabel>About</SectionLabel>
      {times ? <Row icon="clock" title="Service times" sub={times} /> : null}
      {site ? <Row icon="link" title="Website" sub={site.replace(/^https?:\/\//i, '').replace(/\/.*$/, '')} onPress={() => Linking.openURL(site).catch(() => toast('Could not open that link'))} /> : null}
      <Row icon="location" title="Open in Maps" sub={place || undefined} onPress={() => Linking.openURL(mapsUrl(church)).catch(() => toast('Could not open Maps'))} />

      {showEvents ? (
        <>
          <Divider />
          <SectionLabel
            right={
              events && events.length ? (
                <Pressable onPress={() => router.push({ pathname: '/events', params: { church: id } } as any)} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('events.seeAll')} style={({ pressed }) => ({ opacity: pressed ? 0.55 : 1 })}>
                  <Text style={{ color: C.accent2, fontSize: 14.5, fontWeight: '600' }}>{t('events.seeAll')}</Text>
                </Pressable>
              ) : undefined
            }>
            {t('events.title')}
          </SectionLabel>
          {events === null ? (
            <EventTilesSkeleton width={EVENT_TILE} />
          ) : events.length ? (
            <FlatList horizontal data={events} keyExtractor={keyOfEvent} renderItem={renderEvent} showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }} />
          ) : null}
          {canAddEvent ? <Row icon="pluscircle" title={t('events.addEvent')} onPress={() => router.push({ pathname: '/event-edit', params: { church: id } } as any)} chevron={false} /> : null}
        </>
      ) : null}

      <Divider />
      <SectionLabel>{total !== null ? `Members · ${fmt(total)}` : 'Members'}</SectionLabel>
    </View>
  );

  return (
    <Screen>
      <ScreenHeader title="Church" right={admin ? <RoundButton name="more" label="More options" onPress={() => setSheet('more')} /> : undefined} />
      <FlatList
        data={members ?? []}
        keyExtractor={keyOfPerson}
        renderItem={renderMember}
        ListHeaderComponent={head}
        ListEmptyComponent={members === null ? <RowsSkeleton count={3} avatar={50} padY={8} trailing="button" /> : <Text style={{ color: C.fg2, paddingHorizontal: 16 }}>{t('churches.noMembers')}</Text>}
        ListFooterComponent={paging ? <Loading /> : null}
        onEndReached={more}
        onEndReachedThreshold={0.6}
        initialNumToRender={10}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { load(true); loadEvents(); }} tintColor={C.fg2} />}
        contentContainerStyle={{ paddingBottom: 60 }}
      />

      <Sheet visible={sheet === 'more'} onClose={() => setSheet(null)}>
        <SheetRow first icon="draw" label="Edit church" onPress={after(openEdit)} />
        <SheetRow icon="trash" label="Delete church" danger onPress={after(confirmDelete)} />
      </Sheet>

      <Sheet visible={sheet === 'edit'} onClose={() => setSheet(null)} title="Edit church" tall footer={<View style={{ paddingHorizontal: 20, paddingTop: 12 }}><Button label="Save" busy={saving} onPress={saveEdit} /></View>}>
        <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" contentContainerStyle={{ paddingHorizontal: 20, gap: 12, paddingBottom: 8 }}>
          <Field label="Name" value={form.name} onChangeText={set('name')} maxLength={120} />
          <Field label="Address" value={form.address} onChangeText={set('address')} placeholder="Street and number" maxLength={200} />
          <Field label="City" value={form.city} onChangeText={set('city')} placeholder="City" maxLength={80} />
          <Field label="Country" value={form.country} onChangeText={set('country')} placeholder="Country" maxLength={80} />
          <Field label="Service times" value={form.service_times} onChangeText={set('service_times')} placeholder="Sabbath School 9:30 · Divine Service 11:00" maxLength={200} />
          <Field label="Website" value={form.website} onChangeText={set('website')} placeholder="https://" autoCapitalize="none" autoCorrect={false} keyboardType="url" maxLength={300} />
          {formErr ? <Text style={{ color: C.like, fontSize: 13 }}>{formErr}</Text> : null}
        </ScrollView>
      </Sheet>
    </Screen>
  );
}
