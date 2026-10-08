import React from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button, Empty } from '../src/components/ui';
import { C } from '../src/lib/theme';

export default function NotFound() {
  const router = useRouter();
  return (
    <View style={{ flex: 1, backgroundColor: C.bg, justifyContent: 'center' }}>
      <Empty title="This page isn't available" body="The link may be broken, or the post may have been removed." action={<Button small label="Go to home" onPress={() => router.replace('/')} style={{ marginTop: 8 }} />} />
    </View>
  );
}
