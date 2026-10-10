import React, { useEffect } from 'react';
import { BackHandler, Pressable, View } from 'react-native';
import { useAuth } from '@clerk/clerk-expo';
import { Redirect, Stack, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '../../src/components/Icon';
import { useAddingAccount, useResumeAccount } from '../../src/lib/accounts';
import { useT } from '../../src/lib/i18n';
import { C } from '../../src/lib/theme';

export default function AuthLayout() {
  const { isSignedIn } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const t = useT();
  // The account switcher opens these pages to add another account while one is signed in (logging
  // in, signing up, Apple or Google all add a session). Otherwise a signed-in person goes to the app.
  const adding = useAddingAccount();
  // Signed out while other accounts are still signed in on this phone: the latest of them carries on.
  useResumeAccount(!adding);
  // Adding an account can always be given up, back to the account in use: the close button, or Android's back.
  useEffect(() => {
    if (!adding) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      router.replace('/');
      return true;
    });
    return () => sub.remove();
  }, [adding, router]);
  if (isSignedIn && !adding) return <Redirect href="/" />;
  return (
    // The sign-in pages follow the theme, so the fade between them never flashes another colour.
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.bg }, animation: 'fade', gestureEnabled: false }} />
      {adding ? (
        <Pressable
          onPress={() => router.replace('/')}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
          style={({ pressed }) => ({ position: 'absolute', top: insets.top + 8, left: 14, width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(0,0,0,0.38)', alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
          <Icon name="close" size={22} color="#fff" weight={2.2} />
        </Pressable>
      ) : null}
    </View>
  );
}
