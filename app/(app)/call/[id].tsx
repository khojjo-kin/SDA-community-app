import React, { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useRouter } from 'expo-router';
import { DarkStatusBar } from '../../../src/components/OnDark';
import { useCalls } from '../../../src/lib/calls';
import { DARK } from '../../../src/lib/theme';

/**
 * A call's own screen lives in the CallProvider's modal, so a ring can show over any screen. This
 * route only exists for links of the form community://call/<id> (and the call notes in chats): the
 * provider picks a ringing call up by itself, so there is nothing to do here but step back.
 */
export default function CallLink() {
  const router = useRouter();
  const { inCall } = useCalls();
  useEffect(() => {
    const t = setTimeout(() => {
      if (router.canGoBack()) router.back();
      else router.replace('/');
    }, inCall ? 0 : 400);
    return () => clearTimeout(t);
  }, [router, inCall]);
  return (
    <View style={{ flex: 1, backgroundColor: DARK.bg, alignItems: 'center', justifyContent: 'center' }}>
      <DarkStatusBar />
      <ActivityIndicator color={DARK.fg2} />
    </View>
  );
}
