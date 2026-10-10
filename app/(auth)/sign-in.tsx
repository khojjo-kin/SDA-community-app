import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSignIn } from '@clerk/clerk-expo';
import { Link, useRouter } from 'expo-router';
import { AuthShell } from '../../src/components/AuthShell';
import { Icon } from '../../src/components/Icon';
import { SsoButtons } from '../../src/components/SsoButtons';
import { Button, Field } from '../../src/components/ui';
import { C, errText } from '../../src/lib/theme';

type Strategy = 'email_code' | 'phone_code' | 'totp';
type Factor = { strategy: Strategy; emailAddressId?: string; phoneNumberId?: string; safeIdentifier?: string };

/** The ways to confirm it's you that this screen can handle, best first. */
const ORDER: Strategy[] = ['email_code', 'phone_code', 'totp'];

export default function SignIn() {
  const { signIn, setActive, isLoaded } = useSignIn();
  const router = useRouter();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [stage, setStage] = useState<'form' | 'first' | 'second'>('form');
  /** The code in use, and the other ways the account offers. */
  const [factor, setFactor] = useState<Factor | null>(null);
  const [others, setOthers] = useState<Factor[]>([]);
  /** Clerk does not know this phone (or this place): the code is a check that it's really you. */
  const [newDevice, setNewDevice] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');

  async function prepare(f: Factor, second: boolean) {
    if (f.strategy !== 'totp') {
      const params: any = { strategy: f.strategy };
      if (f.emailAddressId) params.emailAddressId = f.emailAddressId;
      if (f.phoneNumberId) params.phoneNumberId = f.phoneNumberId;
      if (second) await (signIn as any).prepareSecondFactor(params);
      else await (signIn as any).prepareFirstFactor(params);
    }
    setFactor(f);
    setCode('');
  }

  async function finish(res: any) {
    if (res.status === 'complete') {
      await setActive!({ session: res.createdSessionId });
      // When adding a second account the sign-in pages stay reachable while signed in, so go home by hand.
      router.replace('/');
      return;
    }
    if (res.status === 'needs_second_factor') {
      const offered: Factor[] = (res.supportedSecondFactors ?? []).filter((x: any) => ORDER.includes(x.strategy));
      offered.sort((a, b) => ORDER.indexOf(a.strategy) - ORDER.indexOf(b.strategy));
      if (offered.length) {
        setNewDevice(res.clientTrustState === 'new' || res.clientTrustState === 'pending');
        await prepare(offered[0], true);
        setOthers(offered.slice(1));
        setStage('second');
        return;
      }
    }
    if (res.status === 'needs_first_factor') {
      const offered: Factor[] = (res.supportedFirstFactors ?? []).filter((x: any) => x.strategy === 'email_code' || x.strategy === 'phone_code');
      offered.sort((a, b) => ORDER.indexOf(a.strategy) - ORDER.indexOf(b.strategy));
      if (offered.length) {
        setNewDevice(false);
        await prepare(offered[0], false);
        setOthers(offered.slice(1));
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
    setNote('');
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
    if (!factor) return;
    if (!code.trim()) return setErr(factor.strategy === 'totp' ? 'Enter the code from your authenticator app.' : 'Enter the code we sent you.');
    const attempt = { strategy: factor.strategy, code: code.trim() };
    run(() => (stage === 'second' ? (signIn as any).attemptSecondFactor(attempt) : (signIn as any).attemptFirstFactor(attempt)));
  };

  async function switchTo(f: Factor) {
    if (busy || !factor) return;
    setBusy(true);
    setErr('');
    setNote('');
    try {
      const was = factor;
      await prepare(f, stage === 'second');
      setOthers((list) => [...list.filter((x) => x !== f), was]);
    } catch (e) {
      setErr(errText(e));
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    if (busy || !factor || factor.strategy === 'totp') return;
    setBusy(true);
    setErr('');
    try {
      await prepare(factor, stage === 'second');
      setNote(factor.strategy === 'phone_code' ? 'We sent a new code by text.' : 'We sent a new code to your email.');
    } catch (e) {
      setErr(errText(e));
    } finally {
      setBusy(false);
    }
  }

  if (stage !== 'form' && factor) {
    const where = factor.safeIdentifier ? ` to ${factor.safeIdentifier}` : '';
    const sent = factor.strategy === 'totp' ? 'Enter the 6-digit code from your authenticator app.' : factor.strategy === 'phone_code' ? `We texted a code${where}. Enter it below.` : `We emailed a code${where}. Enter it below.`;
    const title = newDevice ? "Confirm it's you" : "Enter your code";
    return (
      <AuthShell title={title}>
        {newDevice ? (
          <View style={{ flexDirection: 'row', gap: 10, backgroundColor: 'rgba(31,191,90,0.12)', borderRadius: 14, padding: 12, borderWidth: 1, borderColor: 'rgba(31,191,90,0.35)' }}>
            <Icon name="lock" size={18} color={C.accent2} />
            <Text style={{ color: C.fg, flex: 1, lineHeight: 20 }}>
              You're logging in on a new device or from a new place. To keep your account safe, we need to check it's really you.
            </Text>
          </View>
        ) : null}
        <Text style={{ color: C.fg2, lineHeight: 20 }}>{sent}</Text>
        <Field value={code} onChangeText={setCode} placeholder="6-digit code" keyboardType="number-pad" autoFocus textContentType="oneTimeCode" error={err} onSubmitEditing={verify} returnKeyType="go" />
        {note ? <Text style={{ color: C.ok, textAlign: 'center' }}>{note}</Text> : null}
        <Button label="Confirm" onPress={verify} busy={busy} />
        {factor.strategy !== 'totp' ? (
          <Pressable onPress={resend} style={{ padding: 6 }} accessibilityRole="button">
            <Text style={{ color: C.accent2, textAlign: 'center', fontWeight: '600' }}>Send a new code</Text>
          </Pressable>
        ) : null}
        {others.map((f) => (
          <Pressable key={f.strategy + (f.phoneNumberId ?? f.emailAddressId ?? '')} onPress={() => switchTo(f)} style={{ padding: 6 }} accessibilityRole="button">
            <Text style={{ color: C.accent2, textAlign: 'center', fontWeight: '600' }}>
              {f.strategy === 'phone_code' ? 'Text me a code instead' : f.strategy === 'email_code' ? 'Email me a code instead' : 'Use my authenticator app'}
            </Text>
          </Pressable>
        ))}
        <Pressable onPress={() => { setStage('form'); setErr(''); setNote(''); setFactor(null); }} style={{ padding: 10 }}>
          <Text style={{ color: C.fg2, textAlign: 'center', fontWeight: '600' }}>Back to log in</Text>
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
