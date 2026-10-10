import React, { useRef, useState } from 'react';
import { Pressable, Text, TextInput } from 'react-native';
import { useSignIn } from '@clerk/clerk-expo';
import { Link, useRouter } from 'expo-router';
import { AuthField, AuthShell } from '../../src/components/AuthShell';
import { DarkStatusBar } from '../../src/components/OnDark';
import { Button } from '../../src/components/ui';
import { DARK, errText } from '../../src/lib/theme';

export default function Forgot() {
  const { signIn, setActive, isLoaded } = useSignIn();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [stage, setStage] = useState<'email' | 'reset'>('email');
  const [busy, setBusy] = useState(false);
  // A ref as well: the keyboard's Go key and a tap on the button can both arrive before `busy` has drawn.
  const busyRef = useRef(false);
  const [err, setErr] = useState('');
  const passwordRef = useRef<TextInput>(null);

  /** One step with Clerk at a time, with the button busy meanwhile. */
  async function step(work: () => Promise<void>) {
    if (!isLoaded || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setErr('');
    try {
      await work();
    } catch (e) {
      setErr(errText(e));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  function send() {
    if (busyRef.current) return;
    if (!email.trim()) return setErr('Enter the email you signed up with.');
    step(async () => {
      await signIn!.create({ strategy: 'reset_password_email_code', identifier: email.trim() } as any);
      setStage('reset');
    });
  }

  function reset() {
    if (busyRef.current) return;
    if (!code.trim()) return setErr('Enter the code from your email.');
    if (password.length < 8) return setErr('Use a password with at least 8 characters.');
    step(async () => {
      const res: any = await signIn!.attemptFirstFactor({ strategy: 'reset_password_email_code', code: code.trim(), password } as any);
      if (res.status === 'complete') {
        await setActive!({ session: res.createdSessionId });
        // When adding a second account these pages stay reachable while signed in, so go home by hand.
        router.replace('/');
      } else setErr('Your password was changed. Go back and log in with it.');
    });
  }

  const back = (
    <Link href="/sign-in" replace asChild>
      <Pressable accessibilityRole="button" hitSlop={8} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
        <Text style={{ color: DARK.accent2, fontWeight: '600' }}>Back to log in</Text>
      </Pressable>
    </Link>
  );

  if (stage === 'reset') {
    return (
      <>
        <DarkStatusBar />
        <AuthShell title={`Enter the code we sent to ${email.trim()} and choose a new password.`} footer={back}>
          <AuthField
            value={code}
            onChangeText={setCode}
            placeholder="6-digit code"
            keyboardType="number-pad"
            autoFocus
            textContentType="oneTimeCode"
            autoComplete="one-time-code"
            returnKeyType="next"
            submitBehavior="submit"
            onSubmitEditing={() => passwordRef.current?.focus()}
          />
          <AuthField ref={passwordRef} value={password} onChangeText={setPassword} placeholder="New password" secureTextEntry textContentType="newPassword" autoComplete="new-password" autoCapitalize="none" error={err} onSubmitEditing={reset} returnKeyType="go" />
          <Button label="Change password" onPress={reset} busy={busy} />
        </AuthShell>
      </>
    );
  }

  return (
    <>
      <DarkStatusBar />
      <AuthShell title="Enter your email and we'll send a code to reset your password." footer={back}>
        <AuthField value={email} onChangeText={setEmail} placeholder="Email" autoCapitalize="none" autoCorrect={false} keyboardType="email-address" textContentType="emailAddress" autoComplete="email" error={err} onSubmitEditing={send} returnKeyType="send" />
        <Button label="Send code" onPress={send} busy={busy} />
      </AuthShell>
    </>
  );
}
