import React from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { useAuth } from '@clerk/clerk-expo';
import { Redirect, Stack } from 'expo-router';
import { Mark } from '../../src/components/Icon';
import { Button } from '../../src/components/ui';
import { useSession } from '../../src/lib/session';
import { C } from '../../src/lib/theme';

export default function AppLayout() {
  const { isSignedIn, signOut } = useAuth();
  const { loading, profile, error, refresh } = useSession();

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

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.bg } }}>
      <Stack.Screen name="(tabs)" />
      {/* Screens that slide up have a Close button and scroll, so the swipe-to-dismiss gesture is off: it would fight the scrolling. */}
      <Stack.Screen name="create" options={{ animation: 'slide_from_bottom', gestureEnabled: false }} />
      <Stack.Screen name="story/[id]" options={{ animation: 'fade', gestureDirection: 'vertical' }} />
      <Stack.Screen name="watch/[id]" options={{ animation: 'fade' }} />
      <Stack.Screen name="comments/[id]" options={{ animation: 'slide_from_bottom', gestureEnabled: false }} />
      <Stack.Screen name="share/[id]" options={{ animation: 'slide_from_bottom', gestureEnabled: false }} />
      <Stack.Screen name="send-to" options={{ animation: 'slide_from_bottom', gestureEnabled: false }} />
      <Stack.Screen name="add-story" options={{ animation: 'slide_from_bottom', gestureEnabled: false }} />
      <Stack.Screen name="new-highlight" options={{ animation: 'slide_from_bottom', gestureEnabled: false }} />
      <Stack.Screen name="camera-settings" options={{ animation: 'slide_from_bottom', gestureEnabled: false }} />
      <Stack.Screen name="story-editor" options={{ animation: 'fade', gestureEnabled: false }} />
      <Stack.Screen name="highlight/[id]" options={{ animation: 'fade', gestureDirection: 'vertical' }} />
      <Stack.Screen name="story-archive/[id]" options={{ animation: 'fade', gestureDirection: 'vertical' }} />
    </Stack>
  );
}
