import React, { useState } from 'react';
import { ActivityIndicator, Platform, Text, View } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { signInWithApple, signInWithGoogle } from '../lib/sso';
import { C, errText } from '../lib/theme';
import { Button } from './ui';

/** "Continue with Apple / Google" under the email form. On success the session changes and the auth screens close on their own. */
export function SsoButtons({ onError }: { onError: (message: string) => void }) {
  const [busy, setBusy] = useState<'apple' | 'google' | null>(null);

  async function run(kind: 'apple' | 'google', fn: () => Promise<boolean>) {
    if (busy) return;
    setBusy(kind);
    onError('');
    try {
      await fn();
    } catch (e) {
      onError(errText(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 2 }}>
        <View style={{ flex: 1, height: 1, backgroundColor: C.line }} />
        <Text style={{ color: C.fg3, fontSize: 13 }}>or</Text>
        <View style={{ flex: 1, height: 1, backgroundColor: C.line }} />
      </View>
      {Platform.OS === 'ios' ? (
        busy === 'apple' ? (
          <View style={{ height: 46, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color={C.fg2} />
          </View>
        ) : (
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
            buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
            cornerRadius={12}
            style={{ height: 46 }}
            onPress={() => run('apple', signInWithApple)}
          />
        )
      ) : null}
      <Button label="Continue with Google" kind="ghost" busy={busy === 'google'} onPress={() => run('google', signInWithGoogle)} />
    </View>
  );
}
