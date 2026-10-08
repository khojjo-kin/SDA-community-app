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
        <Text style={{ color: C.fg3, textAlign: 'center', lineHeight: 19, fontSize: 13 }}>If this app was only just set up, Supabase may not be accepting Clerk sign-ins yet. See "Connect Clerk to Supabase" in the project README.</Text>
        <Button label="Try again" onPress={refresh} style={{ alignSelf: 'stretch' }} />
        <Button label="Log out" kind="ghost" onPress={() => signOut()} style={{ alignSelf: 'stretch' }} />
      </View>
    );
  }

  if (!profile) return <Redirect href="/onboarding" />;

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.bg } }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="create" options={{ animation: 'slide_from_bottom', gestureDirection: 'vertical' }} />
      <Stack.Screen name="story/[id]" options={{ animation: 'fade', gestureDirection: 'vertical' }} />
      <Stack.Screen name="watch/[id]" options={{ animation: 'fade' }} />
      <Stack.Screen name="comments/[id]" options={{ animation: 'slide_from_bottom', gestureDirection: 'vertical' }} />
      <Stack.Screen name="share/[id]" options={{ animation: 'slide_from_bottom', gestureDirection: 'vertical' }} />
    </Stack>
  );
}
