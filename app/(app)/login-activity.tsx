import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useSession as useClerkSession, useUser } from '@clerk/clerk-expo';
import { Icon } from '../../src/components/Icon';
import { Button, ErrorNote, Loading, Screen, ScreenHeader, SectionLabel, useToast } from '../../src/components/ui';
import { agoLong, C, errText } from '../../src/lib/theme';

/** One place this account is logged in, as Clerk keeps it (one session per device). */
type DeviceSession = Awaited<ReturnType<NonNullable<ReturnType<typeof useUser>['user']>['getSessions']>>[number];

/** "iPhone", or the browser when the device isn't known, or at least what kind of device it is. */
function deviceName(s: DeviceSession): string {
  const a = s.latestActivity;
  return a?.deviceType || a?.browserName || (a?.isMobile ? 'Phone' : 'Computer');
}

/** "Accra, Ghana", or whatever part of it is known. */
function placeOf(s: DeviceSession): string {
  const a = s.latestActivity;
  return [a?.city, a?.country].filter(Boolean).join(', ') || 'Location unknown';
}

/** "Last active 3 hours ago" */
function lastActive(s: DeviceSession): string {
  const when = agoLong(s.lastActiveAt.toISOString());
  return `Last active ${when === 'Just now' ? 'just now' : when}`;
}

/**
 * Where you're logged in: every device with an active session, this one first, and a way to log
 * any of the others out (one at a time, or all at once).
 */
export default function LoginActivity() {
  const { user } = useUser();
  const { session: current } = useClerkSession();
  const toast = useToast();
  const [sessions, setSessions] = useState<DeviceSession[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  // The session being logged out ('all' for every other one), so its button shows it is busy.
  const [ending, setEnding] = useState<string | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const currentId = current?.id ?? '';

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const all = await user.getSessions();
      if (!alive.current) return;
      // Only devices still logged in; this one on top, then the most recently used.
      const active = all.filter((s) => s.status === 'active').sort((a, b) => (a.id === currentId ? -1 : b.id === currentId ? 1 : b.lastActiveAt.getTime() - a.lastActiveAt.getTime()));
      setSessions(active);
      setStatus('ready');
    } catch (e) {
      if (!alive.current) return;
      setError(errText(e));
      setStatus((s) => (s === 'ready' ? 'ready' : 'error'));
    } finally {
      if (alive.current) setRefreshing(false);
    }
  }, [user, currentId]);

  useEffect(() => {
    load();
  }, [load]);

  const others = sessions.filter((s) => s.id !== currentId);

  function logOut(s: DeviceSession) {
    if (ending) return;
    Alert.alert(`Log out of ${deviceName(s)}?`, `${placeOf(s)}. Whoever is using Community there will have to log in again.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log out',
        style: 'destructive',
        onPress: async () => {
          setEnding(s.id);
          try {
            await s.revoke();
            toast(`Logged out of ${deviceName(s)}`);
          } catch (e) {
            toast(errText(e));
          } finally {
            if (alive.current) setEnding(null);
            load();
          }
        },
      },
    ]);
  }

  function logOutOthers() {
    if (ending || !others.length) return;
    Alert.alert('Log out of all other devices?', 'This phone stays logged in. Everywhere else will have to log in again.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log out',
        style: 'destructive',
        onPress: async () => {
          setEnding('all');
          // Each one on its own, so one that fails doesn't stop the rest.
          const results = await Promise.allSettled(others.map((s) => s.revoke()));
          const failed = results.filter((r) => r.status === 'rejected').length;
          toast(failed ? `${failed} of them couldn't be logged out. Try again.` : 'Logged out of all other devices');
          if (alive.current) setEnding(null);
          load();
        },
      },
    ]);
  }

  return (
    <Screen>
      <ScreenHeader title="Login activity" />
      <ScrollView contentContainerStyle={{ paddingBottom: 60 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={C.fg2} />}>
        <SectionLabel>Where you're logged in</SectionLabel>
        {status === 'loading' || !user ? (
          <Loading />
        ) : status === 'error' ? (
          <ErrorNote message={error} onRetry={() => { setStatus('loading'); load(); }} />
        ) : (
          <>
            {sessions.map((s) => {
              const here = s.id === currentId;
              const a = s.latestActivity;
              return (
                <View key={s.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 10 }} accessible={here} accessibilityLabel={here ? `${deviceName(s)}, ${placeOf(s)}, this device, active now` : undefined}>
                  <Icon name={a?.isMobile ? 'phone' : 'devices'} size={26} color={C.fg} />
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={1} style={{ color: C.fg, fontSize: 17, fontWeight: '600' }}>{deviceName(s)}{here ? ' · This device' : ''}</Text>
                    <Text numberOfLines={1} style={{ color: C.fg2, fontSize: 14.5, marginTop: 1 }}>{placeOf(s)}</Text>
                    <Text numberOfLines={1} style={{ color: here ? C.ok : C.fg2, fontSize: 14, marginTop: 1, fontWeight: here ? '600' : '400' }}>{here ? 'Active now' : lastActive(s)}</Text>
                  </View>
                  {here ? null : <Button small kind="ghost" label="Log out" busy={ending === s.id} disabled={!!ending && ending !== s.id} onPress={() => logOut(s)} />}
                </View>
              );
            })}
            {sessions.length === 0 ? <Text style={{ color: C.fg2, paddingHorizontal: 16, lineHeight: 20 }}>No devices to show.</Text> : null}
            {others.length ? (
              <Button label="Log out of all other devices" kind="danger" busy={ending === 'all'} disabled={!!ending && ending !== 'all'} onPress={logOutOthers} style={{ marginHorizontal: 16, marginTop: 20 }} />
            ) : sessions.length ? (
              <Text style={{ color: C.fg3, fontSize: 13.5, paddingHorizontal: 16, paddingTop: 14, lineHeight: 19 }}>You're only logged in on this device.</Text>
            ) : null}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}
