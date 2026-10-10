import React, { useEffect, useRef, useState } from 'react';
import { Appearance, Image, Text, View } from 'react-native';
import { ClerkProvider, useClerk } from '@clerk/clerk-expo';
import { tokenCache } from '@clerk/clerk-expo/token-cache';
import { Lora_400Regular, Lora_700Bold } from '@expo-google-fonts/lora';
import { Nunito_400Regular, Nunito_700Bold } from '@expo-google-fonts/nunito';
import { Poppins_400Regular, Poppins_600SemiBold } from '@expo-google-fonts/poppins';
import { useFonts } from 'expo-font';
import { Slot, SplashScreen, usePathname, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { LaunchCover, LaunchReady, whenCoverDrawn } from '../src/components/LaunchCover';
import { Button, ToastProvider } from '../src/components/ui';
import { LanguageWatch, useLanguage } from '../src/lib/i18n';
import { loadPrefs, usePrefsLoaded, usePrefTheme } from '../src/lib/prefs';
import { SessionProvider } from '../src/lib/session';
import { CLERK_KEY, SUPABASE_KEY, SUPABASE_URL } from '../src/lib/supabase';
import { applyTheme, C, themeName } from '../src/lib/theme';
import { takeReturn } from '../src/lib/theme-return';

// Hold the launch screen until the saved theme is read (useHideLaunchScreen below takes it down), or
// the router would take it away at once and the first screen could flash in the wrong colours. Nothing
// can leave it up for good: that hook gives up after 1.5 seconds, and launch-deadline.ts, loaded before
// the app, takes it down after 1.5 and 4 seconds whatever happens here.
try {
  SplashScreen.preventAutoHideAsync().catch(() => {});
} catch {
  // Not available: the launch screen simply goes as soon as the router is ready.
}

/**
 * The native launch screen sits on top of the app until it is told to go away, so nothing React
 * draws is visible until then. Every path through this file calls this, including the ones that
 * give up early: otherwise the person is left looking at the launch screen with no way to know why.
 */
function useHideLaunchScreen(ready: boolean) {
  useEffect(() => {
    // Wait for the saved theme so the first screen is drawn in the right colours, but never for long.
    if (ready) {
      // Once the logo cover (LaunchCover) has its logo on screen, so the launch screen gives way to the same picture.
      whenCoverDrawn().then(() => SplashScreen.hideAsync().catch(() => {}));
      return;
    }
    const t = setTimeout(() => SplashScreen.hideAsync().catch(() => {}), 1500);
    return () => clearTimeout(t);
  }, [ready]);
}

/**
 * The phone's own parts of the app (alerts, share sheets, the keyboard) are dark from app.json. On
 * White they are made light to match, and dark again on the other themes.
 */
function useSystemAppearance(theme: string) {
  useEffect(() => {
    try {
      if (typeof Appearance?.setColorScheme === 'function') Appearance.setColorScheme(theme === 'white' ? 'light' : 'dark');
    } catch {
      // Older phones without the setting keep the dark look from app.json.
    }
  }, [theme]);
}

/**
 * After the theme or the language changes every screen below is drawn again (the key on
 * ToastProvider). Where the member is in the app is kept through that, so they normally stay on the
 * screen they made the choice on and this does nothing. It is kept as a safety net: should the app
 * ever come back up somewhere else, it takes them back there (Settings, then Theme or Language).
 */
function ReturnAfterRedraw() {
  const router = useRouter();
  const path = usePathname();
  const pathRef = useRef(path);
  pathRef.current = path;
  useEffect(() => {
    const to = takeReturn();
    if (!to) return;
    const t = setTimeout(() => {
      if (pathRef.current === to) return;
      if (pathRef.current !== '/settings') router.push('/settings');
      router.push(to as any);
    }, 80);
    return () => clearTimeout(t);
  }, [router]);
  return null;
}

/**
 * The logo on the screens shown before sign-in has loaded. These are the first things the app
 * draws, so they use the launch image itself — a plain picture — rather than the vector logo the
 * rest of the app uses, which needs a native drawing component that has not yet proved itself.
 */
function LaunchLogo() {
  // The picture is white: tinted the theme's text colour so it shows on White too.
  return <Image source={require('../assets/splash-icon.png')} style={{ width: 160, height: 160, tintColor: C.fg }} accessibilityIgnoresInvertColors />;
}

function SetupNeeded() {
  const missing = [!CLERK_KEY && 'EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY', !SUPABASE_URL && 'EXPO_PUBLIC_SUPABASE_URL', !SUPABASE_KEY && 'EXPO_PUBLIC_SUPABASE_KEY'].filter(Boolean);
  return (
    <View style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 14 }}>
      <LaunchLogo />
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
      <LaunchLogo />
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

/**
 * The app fonts a Plus member can choose (see src/lib/fonts.ts). They load in the background:
 * nothing waits on them, and the launch screen never does — text simply uses the system font
 * until they arrive, which is a moment after start-up.
 */
function useLoadAppFonts() {
  useFonts({ Nunito_400Regular, Nunito_700Bold, Lora_400Regular, Lora_700Bold, Poppins_400Regular, Poppins_600SemiBold });
}

export default function RootLayout() {
  // Changing the key starts sign-in again from scratch, which is what "Try again" does.
  const [attempt, setAttempt] = useState(0);
  const prefsLoaded = usePrefsLoaded();
  // Only the theme and the language: other choices (camera side, wallpaper…) must not redraw the whole app.
  const theme = usePrefTheme();
  const language = useLanguage();
  // Swap the colours before anything below draws with them.
  if (themeName() !== theme) applyTheme(theme);
  useSystemAppearance(theme);
  useHideLaunchScreen(prefsLoaded);
  useLoadAppFonts();
  // The launch screen is still up for the few milliseconds this takes.
  if (!prefsLoaded) return null;
  if (!CLERK_KEY || !SUPABASE_URL || !SUPABASE_KEY) {
    return (
      <>
        <StatusBar style={C.statusBar} />
        <SetupNeeded />
      </>
    );
  }
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: C.bg }}>
      <StatusBar style={C.statusBar} />
      <ClerkProvider key={attempt} publishableKey={CLERK_KEY} tokenCache={tokenCache}>
        <Gate onRetry={() => setAttempt((n) => n + 1)}>
          <SessionProvider>
            {/* Lets the logo cover lift once the account is known, so it reveals the first real screen. */}
            <LaunchReady />
            {/* Keyed on the theme and the language: a new one draws every screen again in its colours and words. */}
            <ToastProvider key={`${theme}:${language}`}>
              <ReturnAfterRedraw />
              <LanguageWatch />
              <Slot />
            </ToastProvider>
          </SessionProvider>
        </Gate>
      </ClerkProvider>
      {/* The logo at start-up and after a long time away, over everything. Outside the keyed parts above, so a new theme or language never plays it again. */}
      <LaunchCover />
    </GestureHandlerRootView>
  );
}
