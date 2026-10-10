import React, { useState } from 'react';
import { Pressable, Text } from 'react-native';
import { useSignIn } from '@clerk/clerk-expo';
import { Link, useRouter } from 'expo-router';
import { AuthShell } from '../../src/components/AuthShell';
import { SsoButtons } from '../../src/components/SsoButtons';
import { Button, Field } from '../../src/components/ui';
import { C, errText } from '../../src/lib/theme';

export default function SignIn() {
  const { signIn, setActive, isLoaded } = useSignIn();
  const router = useRouter();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [stage, setStage] = useState<'form' | 'first' | 'second'>('form');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function finish(res: any) {
    if (res.status === 'complete') {
      await setActive!({ session: res.createdSessionId });
      // When adding a second account the sign-in pages stay reachable while signed in, so go home by hand.
      router.replace('/');
      return;
    }
    if (res.status === 'needs_second_factor') {
      const f = (res.supportedSecondFactors ?? []).find((x: any) => x.strategy === 'email_code');
      if (f) {
        await (signIn as any).prepareSecondFactor({ strategy: 'email_code', emailAddressId: f.emailAddressId });
        setCode('');
        setStage('second');
        return;
      }
    }
    if (res.status === 'needs_first_factor') {
      const f = (res.supportedFirstFactors ?? []).find((x: any) => x.strategy === 'email_code');
      if (f) {
        await (signIn as any).prepareFirstFactor({ strategy: 'email_code', emailAddressId: f.emailAddressId });
        setCode('');
        setStage('first');
        return;
      }
    }
    setErr('This account needs a sign-in step the app does not support yet. Try resetting your password.');
  }

  async function run(fn: () => Promise<any>) {
    if (!isLoaded || busy) return;
    setBusy(true);
    setErr('');
    try {
      await finish(await fn());
    } catch (e) {
      setErr(errText(e));
    } finally {
      setBusy(false);
    }
  }

  const submit = () => {
    if (!identifier.trim() || !password) return setErr('Enter your email and password.');
    run(() => signIn!.create({ identifier: identifier.trim(), password }));
  };
  const verify = () => {
    if (!code.trim()) return setErr('Enter the code from your email.');
    run(() => (stage === 'second' ? (signIn as any).attemptSecondFactor({ strategy: 'email_code', code: code.trim() }) : (signIn as any).attemptFirstFactor({ strategy: 'email_code', code: code.trim() })));
  };

  if (stage !== 'form') {
    return (
      <AuthShell title="We emailed you a code to confirm it's you. Enter it below.">
        <Field value={code} onChangeText={setCode} placeholder="6-digit code" keyboardType="number-pad" autoFocus textContentType="oneTimeCode" error={err} />
        <Button label="Confirm" onPress={verify} busy={busy} />
        <Pressable onPress={() => { setStage('form'); setErr(''); }} style={{ padding: 10 }}>
          <Text style={{ color: C.accent2, textAlign: 'center', fontWeight: '600' }}>Back to log in</Text>
        </Pressable>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      footer={
        <Link href="/sign-up" replace asChild>
          <Pressable>
            <Text style={{ color: C.fg2 }}>
              Don't have an account? <Text style={{ color: C.accent2, fontWeight: '600' }}>Sign up</Text>
            </Text>
          </Pressable>
        </Link>
      }>
      <Field value={identifier} onChangeText={setIdentifier} placeholder="Email" autoCapitalize="none" autoCorrect={false} keyboardType="email-address" textContentType="username" />
      <Field value={password} onChangeText={setPassword} placeholder="Password" secureTextEntry textContentType="password" error={err} onSubmitEditing={submit} returnKeyType="go" />
      <Button label="Log in" onPress={submit} busy={busy} />
      <Link href="/forgot" replace asChild>
        <Pressable style={{ padding: 6 }}>
          <Text style={{ color: C.accent2, textAlign: 'center', fontWeight: '600' }}>Forgot password?</Text>
        </Pressable>
      </Link>
      <SsoButtons onError={setErr} />
    </AuthShell>
  );
}
