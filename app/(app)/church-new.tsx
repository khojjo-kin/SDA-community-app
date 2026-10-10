import React, { useEffect, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, Text } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { Button, Field, Screen, ScreenHeader, useToast } from '../../src/components/ui';
import { addChurch, updateProfile } from '../../src/lib/api';
import { tap } from '../../src/lib/haptics';
import { t } from '../../src/lib/i18n';
import { useSession } from '../../src/lib/session';
import { announce } from '../../src/lib/store';
import { C, errText } from '../../src/lib/theme';

type Errors = { name?: string; website?: string; form?: string };

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
  const { me, refresh } = useSession();
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
  // Set the moment Add is tapped: finding the address on the map takes a moment, and a second tap must not add the church twice.
  const busyNow = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // Replace this form in the stack, so Back from the church goes to the list rather than an empty form.
  const open = (id: string) => (picking ? router.dismissTo({ pathname: '/edit-profile', params: { church: id } } as any) : router.replace({ pathname: '/church/[id]', params: { id } } as any));

  async function save() {
    if (busyNow.current) return;
    const n = name.trim();
    const site = siteOf(website);
    const errs: Errors = {};
    if (n.length < 2) errs.name = "Add the church's name.";
    if (site === null) errs.website = 'That website address does not look right.';
    setErrors(errs);
    if (errs.name || errs.website) return;
    busyNow.current = true;
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
      tap('success');
      // A member's church waits for an admin (the database decides; an admin's goes straight in).
      const pending = church.status === 'pending';
      if (picking) {
        if (!pending) return open(church.id);
        Alert.alert('Thanks!', t('churches.pendingNote'), [{ text: 'OK', onPress: () => open(church.id) }], { cancelable: false });
        return;
      }
      Alert.alert(
        pending ? t('churches.thanksMakeYours') : 'Make this your church?',
        pending ? t('churches.pendingNote') : undefined,
        [
          { text: 'Not now', style: 'cancel', onPress: () => open(church.id) },
          {
            text: 'Yes',
            onPress: () => {
              updateProfile(me, { church_id: church.id })
                .then(async () => {
                  announce('profile');
                  await refresh();
                })
                .catch((e) => toast(errText(e)))
                .finally(() => open(church.id));
            },
          },
        ],
        { cancelable: false }, // tapping outside would otherwise leave the form stuck on busy
      );
    } catch (e) {
      busyNow.current = false;
      if (!alive.current) return;
      setErrors({ form: errText(e) });
      setBusy(false);
    }
  }

  return (
    <Screen>
      <ScreenHeader title="Add a church" close />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 6, paddingBottom: 48, gap: 12 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive">
          <Field label="Church name" value={name} onChangeText={(v) => { setName(v); if (errors.name) setErrors((e) => ({ ...e, name: undefined })); }} placeholder="e.g. Ebenezer SDA Church" maxLength={120} error={errors.name} autoFocus />
          <Field label="Address" value={address} onChangeText={setAddress} placeholder="Street and number" maxLength={200} />
          <Field label="City" value={city} onChangeText={setCity} placeholder="City" maxLength={80} />
          <Field label="Country" value={country} onChangeText={setCountry} placeholder="Country" maxLength={80} />
          <Field label="Service times" value={times} onChangeText={setTimes} placeholder="Sabbath School 9:30 · Divine Service 11:00" maxLength={200} />
          <Field label="Website" value={website} onChangeText={(v) => { setWebsite(v); if (errors.website) setErrors((e) => ({ ...e, website: undefined })); }} placeholder="https://" autoCapitalize="none" autoCorrect={false} keyboardType="url" maxLength={300} error={errors.website} />
          {errors.form ? <Text style={{ color: C.like, lineHeight: 19 }}>{errors.form}</Text> : null}
          <Button label="Add church" busy={busy} onPress={save} style={{ marginTop: 6 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
