import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Text, View } from 'react-native';
import { useAuth } from '@clerk/clerk-expo';
import { Redirect, Stack, useRouter } from 'expo-router';
import { SwitchingCover } from '../../src/components/AccountSwitcher';
import { AssistiveButton } from '../../src/components/AssistiveButton';
import { BirthDateGate, useBirthDateGate } from '../../src/components/BirthDateForm';
import { FeedbackPrompt } from '../../src/components/FeedbackPrompt';
import { Mark } from '../../src/components/Icon';
import { Button } from '../../src/components/ui';
import { setAddingAccount, useLogOut, useSwitching } from '../../src/lib/accounts';
import { blockDeviceForAge, isUnder13, requestChildClosure } from '../../src/lib/age';
import { fetchBirthDate, purgeDate, restoreAccount } from '../../src/lib/api';
import { CallProvider } from '../../src/lib/calls';
import { useLiveLocation } from '../../src/lib/liveLocation';
import { usePresence } from '../../src/lib/presence';
import { useSession } from '../../src/lib/session';
import { C, errText } from '../../src/lib/theme';

/** Shown instead of the app while the account is deactivated: restore it, or leave it to be deleted. */
function Deactivated({ me, deletedAt, onRestored, onLogOut }: { me: string; deletedAt: string; onRestored: () => Promise<void>; onLogOut: () => void }) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  // An account closed because its owner is under 13 can't be restored, so it gets the age check's
  // sorry screen instead. The birth date tells (only its owner can read it); null while finding out.
  const [young, setYoung] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    fetchBirthDate(me)
      .then((d) => { if (live) setYoung(!!d && isUnder13(d)); })
      .catch(() => { if (live) setYoung(false); });
    return () => { live = false; };
  }, [me]);
  useEffect(() => {
    if (!young) return;
    requestChildClosure(me);
    blockDeviceForAge();
    router.replace('/cannot-join?closed=1');
  }, [young, me, router]);
  const gone = purgeDate(deletedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
  async function restore() {
    setBusy(true);
    try {
      await restoreAccount(me);
      await onRestored();
    } catch (e) {
      // The server refuses to restore an under-13 account, whatever the app worked out above.
      if (/aged 13 and over/i.test(errText(e))) {
        setYoung(true);
        return;
      }
      Alert.alert('Could not restore', errText(e));
      setBusy(false);
    }
  }
  if (young !== false) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={C.fg2} />
      </View>
    );
  }
  return (
    <View style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 14 }}>
      <Mark size={64} />
      <Text style={{ color: C.fg, fontSize: 21, fontWeight: '800', textAlign: 'center' }}>Your account is deactivated</Text>
      <Text style={{ color: C.fg2, textAlign: 'center', lineHeight: 21 }}>
        Nobody can see your profile, posts or messages. On {gone} everything will be deleted for good. Restore it now to pick up exactly where you left off.
      </Text>
      <Button label="Restore my account" busy={busy} onPress={restore} style={{ alignSelf: 'stretch', marginTop: 6 }} />
      <Button label="Log out" kind="ghost" onPress={onLogOut} style={{ alignSelf: 'stretch' }} />
    </View>
  );
}

export default function AppLayout() {
  const { isSignedIn } = useAuth();
  const { me, loading, profile, error, errorCode, refresh } = useSession();
  // Only the account in use: another one signed in on this phone takes over (src/lib/accounts.ts).
  const logOut = useLogOut();
  // Moving to another account: every screen closes, and opens again at Home as that account.
  const switching = useSwitching();
  // Back in the app, so any adding of an account has finished or was given up.
  useEffect(() => setAddingAccount(false), []);
  // Members who haven't given their birthday yet are asked for it before anything else.
  const needsBirthday = useBirthDateGate(me, profile);
  // "Active now" for the people who can see it, while the app is open and signed in.
  usePresence(!switching && !!isSignedIn && !!profile && !profile.deleted_at);
  // A shared live location moves with the member while the app is open (never in the background).
  // Members under 14 can't share, so it never runs for them.
  useLiveLocation(me, !switching && !!isSignedIn && !!profile && !profile.deleted_at && !profile.restricted);

  if (switching) return <SwitchingCover to={switching} />;
  if (!isSignedIn) return <Redirect href="/sign-in" />;

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', gap: 18 }}>
        <Mark size={72} />
        <ActivityIndicator color={C.fg2} />
      </View>
    );
  }

  if (error && !profile) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 14 }}>
        <Mark size={64} />
        <Text style={{ color: C.fg, fontSize: 19, fontWeight: '800', textAlign: 'center' }}>Can't reach your account</Text>
        <Text style={{ color: C.fg2, textAlign: 'center', lineHeight: 21 }}>{error}</Text>
        {/* Read from the raw failure: `error` is already in friendly words, which never mention tokens. */}
        {/JWT|JWS|PGRST30|token/i.test(errorCode) ? <Text style={{ color: C.fg3, textAlign: 'center', lineHeight: 19, fontSize: 13 }}>Sign-in is still being connected to the database for this app. Try again in a little while.</Text> : null}
        <Button label="Try again" onPress={refresh} style={{ alignSelf: 'stretch' }} />
        <Button label="Log out" kind="ghost" onPress={() => { logOut().catch(() => {}); }} style={{ alignSelf: 'stretch' }} />
      </View>
    );
  }

  if (!profile) return <Redirect href="/onboarding" />;
  if (profile.deleted_at) return <Deactivated me={me} deletedAt={profile.deleted_at} onRestored={refresh} onLogOut={() => { logOut().catch(() => {}); }} />;
  if (needsBirthday) return <BirthDateGate />;

  return (
    // Calls live above every screen: an incoming call can ring over whatever is open.
    <CallProvider>
      {/* No swipe gestures to leave a screen, anywhere: the owner wants screens left only with their buttons. */}
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.bg }, gestureEnabled: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="create" options={{ animation: 'slide_from_bottom', gestureEnabled: false }} />
        <Stack.Screen name="story/[id]" options={{ contentStyle: { backgroundColor: '#000' }, animation: 'fade' }} />
        <Stack.Screen name="watch/[id]" options={{ contentStyle: { backgroundColor: '#000' }, animation: 'fade' }} />
        <Stack.Screen name="shorts" options={{ contentStyle: { backgroundColor: '#000' }, animation: 'fade' }} />
        <Stack.Screen name="comments/[id]" options={{ animation: 'slide_from_bottom', gestureEnabled: false }} />
        <Stack.Screen name="share/[id]" options={{ animation: 'slide_from_bottom', gestureEnabled: false }} />
        <Stack.Screen name="send-to" options={{ animation: 'slide_from_bottom', gestureEnabled: false }} />
        <Stack.Screen name="add-story" options={{ animation: 'slide_from_bottom', gestureEnabled: false }} />
        <Stack.Screen name="note" options={{ animation: 'slide_from_bottom', gestureEnabled: false }} />
        <Stack.Screen name="new-highlight" options={{ animation: 'slide_from_bottom', gestureEnabled: false }} />
        <Stack.Screen name="camera-settings" options={{ animation: 'slide_from_bottom', gestureEnabled: false }} />
        <Stack.Screen name="story-editor" options={{ contentStyle: { backgroundColor: '#000' }, animation: 'fade', gestureEnabled: false }} />
        <Stack.Screen name="highlight/[id]" options={{ contentStyle: { backgroundColor: '#000' }, animation: 'fade' }} />
        <Stack.Screen name="story-archive/[id]" options={{ contentStyle: { backgroundColor: '#000' }, animation: 'fade' }} />
        <Stack.Screen name="group-new" options={{ animation: 'slide_from_bottom', gestureEnabled: false }} />
        <Stack.Screen name="church-new" options={{ animation: 'slide_from_bottom', gestureEnabled: false }} />
        <Stack.Screen name="event-edit" options={{ animation: 'slide_from_bottom', gestureEnabled: false }} />
        <Stack.Screen name="verse-card" options={{ contentStyle: { backgroundColor: '#000' }, animation: 'slide_from_bottom', gestureEnabled: false }} />
        {/* Photo and video screens are black in every theme; their background says so, so no white shows as they open. */}
        {/* Calls and live video fill the screen; a swipe back would leave the camera running, so the gesture is off. */}
        <Stack.Screen name="call/[id]" options={{ contentStyle: { backgroundColor: '#000' }, animation: 'fade', gestureEnabled: false }} />
        <Stack.Screen name="go-live" options={{ contentStyle: { backgroundColor: '#000' }, animation: 'fade', gestureEnabled: false }} />
        <Stack.Screen name="live/[id]" options={{ contentStyle: { backgroundColor: '#000' }, animation: 'fade', gestureEnabled: false }} />
      </Stack>
      {/* Drawn after the screens so it floats above them; it lets every other touch through. */}
      <AssistiveButton />
      {/* The occasional "Enjoying Community?" question. Inside the call provider, so it can stay away from calls. */}
      <FeedbackPrompt />
    </CallProvider>
  );
}
