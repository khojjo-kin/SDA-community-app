import React, { useEffect, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, Text } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { Button, Field, Screen, ScreenHeader, useToast } from '../../src/components/ui';
import { addChurch, updateProfile } from '../../src/lib/api';
import { useSession } from '../../src/lib/session';
import { announce } from '../../src/lib/store';
import { C, errText } from '../../src/lib/theme';

type Errors = { name?: string; website?: string; form?: string };

/** Said when a member's church goes in as 'pending'. */
const PENDING_NOTE = 'An admin will check this church before it appears for everyone. You can see it in your list meanwhile.';

/** Accepts "example.org" or "https://example.org". Empty stays empty; anything that does not look like a site is null. */
function siteOf(raw: string): string | null {
  const s = raw.trim();
  if (!s) return '';
  const url = /^https?:\/\//i.test(s) ? s : `https://${s}`;
  return /^https?:\/\/[\w-]+(\.[\w-]+)+(\/\S*)?$/i.test(url) ? url : null;
}

export default function ChurchNew() {
  const router = useRouter();
  const toast = useToast();
  const { me, profile, refresh } = useSession();
  const params = useLocalSearchParams<{ pick?: string }>();
  // Opened from Edit profile (through the church list): hand the new church straight back instead of asking.
  const picking = params.pick === '1';
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [country, setCountry] = useState('');
  const [times, setTimes] = useState('');
  const [website, setWebsite] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  // Replace this form in the stack, so Back from the church goes to the list rather than an empty form.
  const open = (id: string) => (picking ? router.dismissTo({ pathname: '/edit-profile', params: { church: id } } as any) : router.replace({ pathname: '/church/[id]', params: { id } } as any));

  async function save() {
    if (busy) return;
    const n = name.trim();
    const site = siteOf(website);
    const errs: Errors = {};
    if (!n) errs.name = "Add the church's name.";
    if (site === null) errs.website = 'That website address does not look right.';
    setErrors(errs);
    if (errs.name || errs.website) return;
    setBusy(true);

    // Try to pin the church so the list can sort by distance. Nothing here is fatal: a church without a pin still lists, just without a distance.
    let lat: number | null = null;
    let lng: number | null = null;
    const where = [address, city, country].map((s) => s.trim()).filter(Boolean).join(', ');
    if (where) {
      try {
        if (Platform.OS === 'android') await Location.requestForegroundPermissionsAsync(); // Android's geocoder needs location permission
        const [hit] = await Location.geocodeAsync(where);
        if (hit) {
          lat = hit.latitude;
          lng = hit.longitude;
        }
      } catch {
        // Offline, denied, or no geocoder on this device.
      }
    }

    try {
      const church = await addChurch(me, { name: n, address: address.trim(), city: city.trim(), country: country.trim(), lat, lng, website: site ?? '', service_times: times.trim() });
      if (!alive.current) return;
      // A member's church waits for an admin (the database decides; an admin's goes straight in), so say so before anything else.
      const pending = church.status === 'pending';
      if (picking) {
        if (!pending) return open(church.id);
        Alert.alert('Thanks!', PENDING_NOTE, [{ text: 'OK', onPress: () => open(church.id) }], { cancelable: false });
        return;
      }
      Alert.alert(
        pending ? 'Thanks!' : 'Make this your church?',
        pending ? `${PENDING_NOTE}\n\nMake ${church.name} your church as well? You would appear in its members list.` : `${church.name} would show on your profile, and you would appear in its members list.`,
        [
          { text: 'Not now', style: 'cancel', onPress: () => open(church.id) },
          {
            text: 'Yes',
            onPress: () => {
              updateProfile(me, { church_id: church.id })
                .then(async () => { announce('profile'); await refresh(); })
                .catch((e) => toast(errText(e)))
                .finally(() => open(church.id));
            },
          },
        ],
        { cancelable: false }, // tapping outside would otherwise leave the form stuck on busy
      );
    } catch (e) {
      setErrors({ form: errText(e) });
      setBusy(false);
    }
  }

  return (
    <Screen>
      <ScreenHeader title="Add a church" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 6, paddingBottom: 48, gap: 12 }} keyboardShouldPersistTaps="handled">
          <Text style={{ color: C.fg2, lineHeight: 20, paddingBottom: 4 }}>
            {profile?.admin_role
              ? 'List a church so the family can find it. As an admin, yours goes straight into the list.'
              : 'List your church so the family can find it. An admin checks each new church before it appears for everyone, and can correct the details later.'}
          </Text>
          <Field label="Church name" value={name} onChangeText={setName} placeholder="e.g. Ebenezer SDA Church" maxLength={120} error={errors.name} autoFocus />
          <Field label="Address" value={address} onChangeText={setAddress} placeholder="Street and number" maxLength={200} />
          <Field label="City" value={city} onChangeText={setCity} placeholder="City" maxLength={80} />
          <Field label="Country" value={country} onChangeText={setCountry} placeholder="Country" maxLength={80} />
          <Field label="Service times" value={times} onChangeText={setTimes} placeholder="Sabbath School 9:30 · Divine Service 11:00" maxLength={200} />
          <Field label="Website" value={website} onChangeText={setWebsite} placeholder="https://" autoCapitalize="none" autoCorrect={false} keyboardType="url" maxLength={500} error={errors.website} />
          {errors.form ? <Text style={{ color: C.like, lineHeight: 19 }}>{errors.form}</Text> : null}
          <Button label="Add church" busy={busy} onPress={save} style={{ marginTop: 6 }} />
          <Text style={{ color: C.fg3, fontSize: 12.5, lineHeight: 17, textAlign: 'center' }}>The address places the church on the map and sorts the list by distance.</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
