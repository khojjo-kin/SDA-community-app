import React from 'react';
import { Text, View } from 'react-native';
import { Slot } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Mark } from '../src/components/Icon';
import { ToastProvider } from '../src/components/ui';
import { loadPrefs } from '../src/lib/prefs';
import { SessionProvider } from '../src/lib/session';
import { SUPABASE_KEY, SUPABASE_URL } from '../src/lib/supabase';
import { C } from '../src/lib/theme';

function SetupNeeded() {
  const missing = [!SUPABASE_URL && 'EXPO_PUBLIC_SUPABASE_URL', !SUPABASE_KEY && 'EXPO_PUBLIC_SUPABASE_KEY'].filter(Boolean);
  return (
    <View style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 14 }}>
      <Mark size={72} />
      <Text style={{ color: C.fg, fontSize: 20, fontWeight: '800', textAlign: 'center' }}>Community isn't connected yet</Text>
      <Text style={{ color: C.fg2, textAlign: 'center', lineHeight: 21 }}>This build is missing {missing.join(' and ')}. Add the value to the .env file in the project, then make a new build.</Text>
    </View>
  );
}

// Saved choices (camera side, sound) are read once, as the app starts.
loadPrefs();

export default function RootLayout() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
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
      <SessionProvider>
        <ToastProvider>
          <Slot />
        </ToastProvider>
      </SessionProvider>
    </GestureHandlerRootView>
  );
}
