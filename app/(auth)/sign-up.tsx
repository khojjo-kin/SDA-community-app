import React, { useState } from 'react';
import { Pressable, Text } from 'react-native';
import { useSignUp } from '@clerk/clerk-expo';
import { Link, useRouter } from 'expo-router';
import { AuthShell } from '../../src/components/AuthShell';
import { SsoButtons } from '../../src/components/SsoButtons';
import { Button, Field } from '../../src/components/ui';
import { C, errText } from '../../src/lib/theme';

export default function SignUp() {
  const { signUp, setActive, isLoaded } = useSignUp();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [stage, setStage] = useState<'form' | 'verify'>('form');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function create() {
    if (!isLoaded || busy) return;
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setErr('Enter a valid email address.');
    if (password.length < 8) return setErr('Use a password with at least 8 characters.');
    setBusy(true);
    setErr('');
    try {
      const res = await signUp!.create({ emailAddress: email.trim(), password });
      if (res.status === 'complete') {
        await setActive!({ session: res.createdSessionId });
        router.replace('/');
        return;
      }
      await signUp!.prepareEmailAddressVerification({ strategy: 'email_code' });
      setStage('verify');
    } catch (e) {
      setErr(errText(e));
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    if (!isLoaded || busy) return;
    if (!code.trim()) return setErr('Enter the code from your email.');
    setBusy(true);
    setErr('');
    try {
      const res = await signUp!.attemptEmailAddressVerification({ code: code.trim() });
      if (res.status === 'complete') {
        await setActive!({ session: res.createdSessionId });
        router.replace('/');
      } else {
        const missing = ((res as any).missingFields ?? []).join(', ');
        setErr(missing ? `Sign-up also needs: ${missing}. Ask the app owner to turn those requirements off in Clerk.` : 'That code did not finish sign-up. Request a new code and try again.');
      }
    } catch (e) {
      setErr(errText(e));
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    try {
      await signUp!.prepareEmailAddressVerification({ strategy: 'email_code' });
      setErr('');
    } catch (e) {
      setErr(errText(e));
    }
  }

  if (stage === 'verify') {
    return (
      <AuthShell title={`Enter the code we sent to ${email.trim()}.`}>
        <Field value={code} onChangeText={setCode} placeholder="6-digit code" keyboardType="number-pad" autoFocus textContentType="oneTimeCode" error={err} />
        <Button label="Confirm email" onPress={verify} busy={busy} />
        <Pressable onPress={resend} style={{ padding: 10 }}>
          <Text style={{ color: C.accent2, textAlign: 'center', fontWeight: '600' }}>Send a new code</Text>
        </Pressable>
        <Pressable onPress={() => { setStage('form'); setCode(''); setErr(''); }} style={{ padding: 10 }}>
          <Text style={{ color: C.accent2, textAlign: 'center', fontWeight: '600' }}>Use a different email</Text>
        </Pressable>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Join your church family: share, pray and grow together."
      footer={
        <Link href="/sign-in" replace asChild>
          <Pressable>
            <Text style={{ color: C.fg2 }}>
              Have an account? <Text style={{ color: C.accent2, fontWeight: '600' }}>Log in</Text>
            </Text>
          </Pressable>
        </Link>
      }>
      <Field value={email} onChangeText={setEmail} placeholder="Email" autoCapitalize="none" autoCorrect={false} keyboardType="email-address" textContentType="emailAddress" />
      <Field value={password} onChangeText={setPassword} placeholder="Password" secureTextEntry textContentType="newPassword" error={err} onSubmitEditing={create} returnKeyType="go" />
      <Button label="Sign up" onPress={create} busy={busy} />
      <SsoButtons onError={setErr} />
    </AuthShell>
  );
}
