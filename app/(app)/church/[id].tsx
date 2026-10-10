import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Linking, Platform, ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { Icon } from '../../../src/components/Icon';
import { PersonRow } from '../../../src/components/PersonRow';
import { Button, Divider, Empty, ErrorNote, Field, Loading, RoundButton, Row, Screen, ScreenHeader, SectionLabel, Sheet, SheetRow, useToast } from '../../../src/components/ui';
import { deleteChurch, fetchChurch, fetchChurchMembers, updateChurch, updateProfile } from '../../../src/lib/api';
import { useSession } from '../../../src/lib/session';
import { announce } from '../../../src/lib/store';
import { C, errText, fmt } from '../../../src/lib/theme';
import type { Church, Profile } from '../../../src/lib/types';

/** The fields an admin can correct. */
type Form = Pick<Church, 'name' | 'address' | 'city' | 'country' | 'website' | 'service_times'>;

const EMPTY: Form = { name: '', address: '', city: '', country: '', website: '', service_times: '' };
const placeOf = (c: Church) => [c.address, c.city, c.country].map((s) => s.trim()).filter(Boolean).join(', ');
/** "example.org" was allowed when the church was added, so give it a scheme before opening. */
const siteOf = (c: Church) => (c.website.trim() ? (/^https?:\/\//i.test(c.website.trim()) ? c.website.trim() : `https://${c.website.trim()}`) : '');

/** Apple Maps on iOS. On Android the Google Maps link opens the app when it is installed and the browser otherwise. A pin wins over the typed address. */
function mapsUrl(c: Church) {
  const q = encodeURIComponent(placeOf(c) || c.name);
  const pin = c.lat !== null && c.lng !== null ? `${c.lat},${c.lng}` : '';
  if (Platform.OS === 'ios') return pin ? `https://maps.apple.com/?ll=${pin}&q=${encodeURIComponent(c.name)}` : `https://maps.apple.com/?q=${q}`;
  return `https://www.google.com/maps/search/?api=1&query=${pin || q}`;
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
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState<'more' | 'edit' | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [formErr, setFormErr] = useState('');
  const [saving, setSaving] = useState(false);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  const mine = profile?.church_id === id;
  const admin = !!profile?.admin_role;

  const load = useCallback(async () => {
    setError('');
    try {
      const [c, people] = await Promise.all([fetchChurch(id), fetchChurchMembers(id)]);
      setChurch(c);
      setMembers(people);
    } catch (e) {
      setError(errText(e));
    }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  // Let the sheet slide away before the next thing opens, so the two animations do not overlap.
  const after = (fn: () => void) => () => { setSheet(null); setTimeout(fn, 380); };

  /** Join or leave. The session already listens for 'profile'; refresh() as well so the button flips straight away. */
  async function setMembership(next: string | null) {
    setBusy(true);
    try {
      await updateProfile(me, { church_id: next });
      announce('profile');
      await refresh();
      fetchChurchMembers(id).then((p) => { if (alive.current) setMembers(p); }).catch(() => {});
      toast(next ? 'This is your church now' : 'You have left this church');
    } catch (e) {
      toast(errText(e));
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  function join() {
    if (!church) return;
    Alert.alert(`Make ${church.name} your church?`, 'It shows on your profile, and you appear in its members list.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'This is my church', onPress: () => setMembership(id) },
    ]);
  }
  function leave() {
    Alert.alert('Leave this church?', 'It comes off your profile. You can choose a church again any time.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Leave', style: 'destructive', onPress: () => setMembership(null) },
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
    if (!church || saving) return;
    const patch: Form = { name: form.name.trim(), address: form.address.trim(), city: form.city.trim(), country: form.country.trim(), website: form.website.trim(), service_times: form.service_times.trim() };
    if (!patch.name) return setFormErr("Add the church's name.");
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
      toast('Church updated');
      if (mine) announce('profile'); // church_name on the profile comes from this row
    } catch (e) {
      setFormErr(errText(e));
    } finally {
      if (alive.current) setSaving(false);
    }
  }

  function confirmDelete() {
    Alert.alert('Delete this church?', "It disappears from the list and from every member's profile. This cannot be undone.", [
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

  if (error) return <Screen><ScreenHeader title="Church" /><ErrorNote message={error} onRetry={load} /></Screen>;
  if (church === undefined) return <Screen><ScreenHeader title="Church" /><Loading /></Screen>;
  if (church === null) return <Screen><ScreenHeader title="Church" /><Empty icon="church" title="This church isn't listed any more" body="It may have been removed by an admin." /></Screen>;

  const place = placeOf(church);
  const site = siteOf(church);
  const times = church.service_times.trim();

  return (
    <Screen>
      <ScreenHeader title="Church" right={admin ? <RoundButton name="more" label="More options" onPress={() => setSheet('more')} /> : undefined} />
      <ScrollView contentContainerStyle={{ paddingBottom: 60 }}>
        <View style={{ alignItems: 'center', gap: 10, paddingTop: 10, paddingBottom: 18, paddingHorizontal: 24 }}>
          {/* Solid green disc with a white mark: the same look as the verified tick, so a listed church reads as the real thing. */}
          <View accessible={false} style={{ width: 88, height: 88, borderRadius: 44, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="church" size={46} color="#fff" weight={2} />
          </View>
          <Text accessibilityRole="header" style={{ color: C.fg, fontSize: 22, fontWeight: '800', textAlign: 'center' }}>{church.name}</Text>
          {place ? <Text style={{ color: C.fg2, textAlign: 'center', lineHeight: 20 }}>{place}</Text> : null}
          {mine ? <Text style={{ color: C.accent2, fontWeight: '700', fontSize: 14 }}>Your church</Text> : null}
        </View>
        <View style={{ paddingHorizontal: 16 }}>
          {mine ? <Button label="Leave this church" kind="ghost" busy={busy} onPress={leave} /> : <Button label="This is my church" busy={busy} onPress={join} />}
        </View>

        <SectionLabel>About</SectionLabel>
        {times ? <Row icon="clock" title="Service times" sub={times} /> : null}
        {site ? <Row icon="link" title="Website" sub={site.replace(/^https?:\/\//i, '').replace(/\/.*$/, '')} onPress={() => Linking.openURL(site).catch(() => toast('Could not open that link'))} /> : null}
        <Row icon="location" title="Open in Maps" sub={place || undefined} onPress={() => Linking.openURL(mapsUrl(church)).catch(() => toast('Could not open Maps'))} />

        <Divider />
        <SectionLabel>{`Members · ${fmt(members?.length ?? 0)}`}</SectionLabel>
        {members === null ? <Loading /> : members.length === 0 ? <Text style={{ color: C.fg2, paddingHorizontal: 16, lineHeight: 20 }}>Nobody has chosen this church yet.</Text> : members.map((p) => <PersonRow key={p.id} person={p} />)}
      </ScrollView>

      <Sheet visible={sheet === 'more'} onClose={() => setSheet(null)}>
        <SheetRow first icon="draw" label="Edit church" sub="Name, address, times and website" onPress={after(openEdit)} />
        <SheetRow icon="trash" label="Delete church" danger onPress={after(confirmDelete)} />
      </Sheet>

      <Sheet visible={sheet === 'edit'} onClose={() => setSheet(null)} title="Edit church" tall footer={<View style={{ paddingHorizontal: 20, paddingTop: 12 }}><Button label="Save" busy={saving} onPress={saveEdit} /></View>}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 20, gap: 12, paddingBottom: 8 }}>
          <Field label="Name" value={form.name} onChangeText={set('name')} maxLength={120} />
          <Field label="Address" value={form.address} onChangeText={set('address')} placeholder="Street and number" maxLength={200} />
          <Field label="City" value={form.city} onChangeText={set('city')} placeholder="City" maxLength={80} />
          <Field label="Country" value={form.country} onChangeText={set('country')} placeholder="Country" maxLength={80} />
          <Field label="Service times" value={form.service_times} onChangeText={set('service_times')} placeholder="Sabbath School 9:30 · Divine Service 11:00" maxLength={200} />
          <Field label="Website" value={form.website} onChangeText={set('website')} placeholder="https://" autoCapitalize="none" autoCorrect={false} keyboardType="url" maxLength={500} />
          {formErr ? <Text style={{ color: C.like, fontSize: 13 }}>{formErr}</Text> : null}
        </ScrollView>
      </Sheet>
    </Screen>
  );
}
