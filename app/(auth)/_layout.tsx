import React from 'react';
import { useAuth } from '@clerk/clerk-expo';
import { Redirect, Stack, useGlobalSearchParams } from 'expo-router';
import { C } from '../../src/lib/theme';

export default function AuthLayout() {
  const { isSignedIn } = useAuth();
  // "add=1" is how the Accounts screen opens sign-in to add a second account while one is already
  // signed in. Without it, a signed-in person has no business here and goes to the app.
  const { add } = useGlobalSearchParams<{ add?: string }>();
  if (isSignedIn && add !== '1') return <Redirect href="/" />;
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.bg }, animation: 'fade' }} />;
}
