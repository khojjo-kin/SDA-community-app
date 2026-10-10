import React, { useState } from 'react';
import { ActivityIndicator, Alert, Text, View } from 'react-native';
import { useAuth } from '@clerk/clerk-expo';
import { Redirect, Stack } from 'expo-router';
import { BirthDateGate, useBirthDateGate } from '../../src/components/BirthDateForm';
import { Mark } from '../../src/components/Icon';
import { Button } from '../../src/components/ui';
import { purgeDate, restoreAccount } from '../../src/lib/api';
import { CallProvider } from '../../src/lib/calls';
import { useSession } from '../../src/lib/session';
import { C, errText } from '../../src/lib/theme';

/** Shown instead of the app while the account is deactivated: restore it, or leave it to be deleted. */
function Deactivated({ me, deletedAt, onRestored, onLogOut }: { me: string; deletedAt: string; onRestored: () => Promise<void>; onLogOut: () => void }) {
  const [busy, setBusy] = useState(false);
  const gone = purgeDate(deletedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
  async function restore() {
    setBusy(true);
    try {
      await restoreAccount(me);
      await onRestored();
    } catch (e) {
      Alert.alert('Could not restore', errText(e));
      setBusy(false);
    }
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
  const { isSignedIn, signOut } = useAuth();
  const { me, loading, profile, error, refresh } = useSession();
  // Members who haven't given their birthday yet are asked for it before anything else.
  const needsBirthday = useBirthDateGate(me, profile);

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
        {/JWT|JWS|PGRST30|token/i.test(error) ? <Text style={{ color: C.fg3, textAlign: 'center', lineHeight: 19, fontSize: 13 }}>Sign-in is still being connected to the database for this app. Try again in a little while.</Text> : null}
        <Button label="Try again" onPress={refresh} style={{ alignSelf: 'stretch' }} />
        <Button label="Log out" kind="ghost" onPress={() => signOut()} style={{ alignSelf: 'stretch' }} />
      </View>
    );
  }

  if (!profile) return <Redirect href="/onboarding" />;
  if (profile.deleted_at) return <Deactivated me={me} deletedAt={profile.deleted_at} onRestored={refresh} onLogOut={() => signOut()} />;
  if (needsBirthday) return <BirthDateGate />;

  return (
    // Calls live above every screen: an incoming call can ring over whatever is open.
    <CallProvider>
      {/* Swipe right from anywhere on a pushed screen (a profile, Settings, anything with a back arrow) to go back, not just from the edge. */}
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.bg }, fullScreenGestureEnabled: true }}>
        <Stack.Screen name="(tabs)" />
        {/* Screens that slide up have a Close button and scroll, so the swipe-to-dismiss gesture is off: it would fight the scrolling. */}
        <Stack.Screen name="create" options={{ animation: 'slide_from_bottom', gestureEnabled: false }} />
        <Stack.Screen name="story/[id]" options={{ contentStyle: { backgroundColor: '#000' }, animation: 'fade', gestureDirection: 'vertical' }} />
        <Stack.Screen name="watch/[id]" options={{ contentStyle: { backgroundColor: '#000' }, animation: 'fade' }} />
        <Stack.Screen name="comments/[id]" options={{ animation: 'slide_from_bottom', gestureEnabled: false }} />
        <Stack.Screen name="share/[id]" options={{ animation: 'slide_from_bottom', gestureEnabled: false }} />
        <Stack.Screen name="send-to" options={{ animation: 'slide_from_bottom', gestureEnabled: false }} />
        <Stack.Screen name="add-story" options={{ animation: 'slide_from_bottom', gestureEnabled: false }} />
        <Stack.Screen name="new-highlight" options={{ animation: 'slide_from_bottom', gestureEnabled: false }} />
        <Stack.Screen name="camera-settings" options={{ animation: 'slide_from_bottom', gestureEnabled: false }} />
        <Stack.Screen name="story-editor" options={{ contentStyle: { backgroundColor: '#000' }, animation: 'fade', gestureEnabled: false }} />
        <Stack.Screen name="highlight/[id]" options={{ contentStyle: { backgroundColor: '#000' }, animation: 'fade', gestureDirection: 'vertical' }} />
        <Stack.Screen name="story-archive/[id]" options={{ contentStyle: { backgroundColor: '#000' }, animation: 'fade', gestureDirection: 'vertical' }} />
        <Stack.Screen name="group-new" options={{ animation: 'slide_from_bottom', gestureEnabled: false }} />
        <Stack.Screen name="church-new" options={{ animation: 'slide_from_bottom', gestureEnabled: false }} />
        {/* Photo and video screens are black in every theme; their background says so, so no white shows as they open. */}
        {/* Calls and live video fill the screen; a swipe back would leave the camera running, so the gesture is off. */}
        <Stack.Screen name="call/[id]" options={{ contentStyle: { backgroundColor: '#000' }, animation: 'fade', gestureEnabled: false }} />
        <Stack.Screen name="go-live" options={{ contentStyle: { backgroundColor: '#000' }, animation: 'fade', gestureEnabled: false }} />
        <Stack.Screen name="live/[id]" options={{ contentStyle: { backgroundColor: '#000' }, animation: 'fade', gestureEnabled: false }} />
      </Stack>
    </CallProvider>
  );
}
