import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { ClerkLoaded, ClerkLoading, ClerkProvider } from '@clerk/clerk-expo';
import { tokenCache } from '@clerk/clerk-expo/token-cache';
import { Slot, SplashScreen } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Mark } from '../src/components/Icon';
import { ToastProvider } from '../src/components/ui';
import { SessionProvider } from '../src/lib/session';
import { CLERK_KEY, SUPABASE_KEY, SUPABASE_URL } from '../src/lib/supabase';
import { C } from '../src/lib/theme';

function SetupNeeded() {
  const missing = [!CLERK_KEY && 'EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY', !SUPABASE_URL && 'EXPO_PUBLIC_SUPABASE_URL', !SUPABASE_KEY && 'EXPO_PUBLIC_SUPABASE_KEY'].filter(Boolean);
  return (
    <View style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 14 }}>
      <Mark size={72} />
      <Text style={{ color: C.fg, fontSize: 20, fontWeight: '800', textAlign: 'center' }}>Community isn't connected yet</Text>
      <Text style={{ color: C.fg2, textAlign: 'center', lineHeight: 21 }}>This build is missing {missing.join(' and ')}. Add the value to the .env file in the project, then make a new build.</Text>
    </View>
  );
}

/** Shown while sign-in is starting up, so a phone with no signal doesn't sit on a blank screen. */
function Starting() {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
    const t = setTimeout(() => setSlow(true), 6000);
    return () => clearTimeout(t);
  }, []);
  return (
    <View style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 14 }}>
      <Mark size={72} />
      {slow ? <Text style={{ color: C.fg2, textAlign: 'center', lineHeight: 21 }}>Still connecting. Check your internet connection.</Text> : null}
    </View>
  );
}

export default function RootLayout() {
  if (!CLERK_KEY || !SUPABASE_URL || !SUPABASE_KEY) {
    return (
      <>
        <StatusBar style="light" />
        <SetupNeeded />
      </>
    );
  }
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: C.bg }}>
      <ClerkProvider publishableKey={CLERK_KEY} tokenCache={tokenCache}>
        <ClerkLoading>
          <Starting />
        </ClerkLoading>
        <ClerkLoaded>
          <SessionProvider>
            <ToastProvider>
              <StatusBar style="light" />
              <Slot />
            </ToastProvider>
          </SessionProvider>
        </ClerkLoaded>
      </ClerkProvider>
    </GestureHandlerRootView>
  );
}
