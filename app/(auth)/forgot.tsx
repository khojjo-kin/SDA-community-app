import React, { useState } from 'react';
import { Pressable, Text } from 'react-native';
import { useSignIn } from '@clerk/clerk-expo';
import { Link } from 'expo-router';
import { AuthShell, DARK_FIELD } from '../../src/components/AuthShell';
import { DarkStatusBar } from '../../src/components/OnDark';
import { Button, Field } from '../../src/components/ui';
import { DARK, errText } from '../../src/lib/theme';

export default function Forgot() {
  const { signIn, setActive, isLoaded } = useSignIn();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [stage, setStage] = useState<'email' | 'reset'>('email');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function send() {
    if (!isLoaded || busy) return;
    if (!email.trim()) return setErr('Enter the email you signed up with.');
    setBusy(true);
    setErr('');
    try {
      await signIn!.create({ strategy: 'reset_password_email_code', identifier: email.trim() } as any);
      setStage('reset');
    } catch (e) {
      setErr(errText(e));
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    if (!isLoaded || busy) return;
    if (!code.trim()) return setErr('Enter the code from your email.');
    if (password.length < 8) return setErr('Use a password with at least 8 characters.');
    setBusy(true);
    setErr('');
    try {
      const res: any = await signIn!.attemptFirstFactor({ strategy: 'reset_password_email_code', code: code.trim(), password } as any);
      if (res.status === 'complete') await setActive!({ session: res.createdSessionId });
      else setErr('Your password was changed. Go back and log in with it.');
    } catch (e) {
      setErr(errText(e));
    } finally {
      setBusy(false);
    }
  }

  const back = (
    <Link href="/sign-in" replace asChild>
      <Pressable>
        <Text style={{ color: DARK.accent2, fontWeight: '600' }}>Back to log in</Text>
      </Pressable>
    </Link>
  );

  if (stage === 'reset') {
    return (
      <>
        <DarkStatusBar />
        <AuthShell title={`Enter the code we sent to ${email.trim()} and choose a new password.`} footer={back}>
          <Field {...DARK_FIELD} value={code} onChangeText={setCode} placeholder="6-digit code" keyboardType="number-pad" autoFocus textContentType="oneTimeCode" />
          <Field {...DARK_FIELD} value={password} onChangeText={setPassword} placeholder="New password" secureTextEntry textContentType="newPassword" error={err} />
          <Button label="Change password" onPress={reset} busy={busy} />
        </AuthShell>
      </>
    );
  }

  return (
    <>
      <DarkStatusBar />
      <AuthShell title="Enter your email and we'll send a code to reset your password." footer={back}>
        <Field {...DARK_FIELD} value={email} onChangeText={setEmail} placeholder="Email" autoCapitalize="none" autoCorrect={false} keyboardType="email-address" textContentType="emailAddress" error={err} onSubmitEditing={send} returnKeyType="send" />
        <Button label="Send code" onPress={send} busy={busy} />
      </AuthShell>
    </>
  );
}
