import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { ClerkProvider, useClerk } from '@clerk/clerk-expo';
import { tokenCache } from '@clerk/clerk-expo/token-cache';
import { Slot, SplashScreen } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Mark } from '../src/components/Icon';
import { Button, ToastProvider } from '../src/components/ui';
import { loadPrefs } from '../src/lib/prefs';
import { SessionProvider } from '../src/lib/session';
import { CLERK_KEY, SUPABASE_KEY, SUPABASE_URL } from '../src/lib/supabase';
import { C } from '../src/lib/theme';

/**
 * The native launch screen sits on top of the app until it is told to go away, so nothing React
 * draws is visible until then. Every path through this file calls this, including the ones that
 * give up early: otherwise the person is left looking at the launch screen with no way to know why.
 */
function useHideLaunchScreen() {
  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);
}

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
function Starting({ failed, onRetry }: { failed: boolean; onRetry: () => void }) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 6000);
    return () => clearTimeout(t);
  }, []);
  return (
    <View style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 14 }}>
      <Mark size={72} />
      {failed ? (
        <>
          <Text style={{ color: C.fg, fontSize: 19, fontWeight: '800', textAlign: 'center' }}>Community can't connect</Text>
          <Text style={{ color: C.fg2, textAlign: 'center', lineHeight: 21 }}>Check your internet connection, then try again.</Text>
          <Button label="Try again" onPress={onRetry} style={{ alignSelf: 'stretch' }} />
        </>
      ) : slow ? (
        <>
          <Text style={{ color: C.fg2, textAlign: 'center', lineHeight: 21 }}>Still connecting. Check your internet connection.</Text>
          <Button label="Try again" kind="ghost" onPress={onRetry} style={{ alignSelf: 'stretch' }} />
        </>
      ) : null}
    </View>
  );
}

/** Shows the app once sign-in has loaded. If it could not load, offers to try again instead of a blank screen. */
function Gate({ children, onRetry }: { children: React.ReactNode; onRetry: () => void }) {
  const clerk = useClerk();
  // Sign-in can fail without ever saying so — a key that points at an instance which no longer
  // exists just never answers. Waiting forever looks like a broken app, so the wait has an end.
  const [gaveUp, setGaveUp] = useState(false);
  useEffect(() => {
    if (clerk.loaded) return;
    const t = setTimeout(() => setGaveUp(true), 20000);
    return () => clearTimeout(t);
  }, [clerk.loaded]);
  if (clerk.loaded) return <>{children}</>;
  return <Starting failed={clerk.status === 'error' || gaveUp} onRetry={onRetry} />;
}

// Saved choices (camera side, sound) are read once, as the app starts.
loadPrefs();

export default function RootLayout() {
  // Changing the key starts sign-in again from scratch, which is what "Try again" does.
  const [attempt, setAttempt] = useState(0);
  useHideLaunchScreen();
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
      <StatusBar style="light" />
      <ClerkProvider key={attempt} publishableKey={CLERK_KEY} tokenCache={tokenCache}>
        <Gate onRetry={() => setAttempt((n) => n + 1)}>
          <SessionProvider>
            <ToastProvider>
              <Slot />
            </ToastProvider>
          </SessionProvider>
        </Gate>
      </ClerkProvider>
    </GestureHandlerRootView>
  );
}
