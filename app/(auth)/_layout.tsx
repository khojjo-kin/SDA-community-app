import React from 'react';
import { View } from 'react-native';
import { Redirect, Stack } from 'expo-router';
import { useSession } from '../../src/lib/session';
import { C } from '../../src/lib/theme';

export default function AuthLayout() {
  const { me, loading } = useSession();
  if (me) return <Redirect href="/" />;
  // While the saved session is being read, show nothing rather than a sign-in form that may vanish.
  if (loading) return <View style={{ flex: 1, backgroundColor: C.bg }} />;
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.bg }, animation: 'fade' }} />;
}
