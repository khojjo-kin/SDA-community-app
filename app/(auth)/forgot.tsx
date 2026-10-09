import React, { useState } from 'react';
import { Pressable, Text } from 'react-native';
import { Link } from 'expo-router';
import { AuthShell } from '../../src/components/AuthShell';
import { Button, Field } from '../../src/components/ui';
import { supabase } from '../../src/lib/supabase';
import { C, errText } from '../../src/lib/theme';

export default function Forgot() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [stage, setStage] = useState<'email' | 'reset'>('email');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function send() {
    if (busy) return;
    if (!email.trim()) return setErr('Enter the email you signed up with.');
    setBusy(true);
    setErr('');
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
      if (error) throw error;
      setStage('reset');
    } catch (e) {
      setErr(errText(e));
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    if (busy) return;
    if (!code.trim()) return setErr('Enter the code from your email.');
    if (password.length < 8) return setErr('Use a password with at least 8 characters.');
    setBusy(true);
    setErr('');
    try {
      // The code proves it's them and signs them in; then the new password is saved.
      const { error } = await supabase.auth.verifyOtp({ type: 'recovery', email: email.trim(), token: code.trim() });
      if (error) throw error;
      const res = await supabase.auth.updateUser({ password });
      if (res.error) throw res.error;
    } catch (e) {
      setErr(errText(e));
    } finally {
      setBusy(false);
    }
  }

  const back = (
    <Link href="/sign-in" replace asChild>
      <Pressable>
        <Text style={{ color: C.accent2, fontWeight: '600' }}>Back to log in</Text>
      </Pressable>
    </Link>
  );

  if (stage === 'reset') {
    return (
      <AuthShell title={`Enter the code we sent to ${email.trim()} and choose a new password.`} footer={back}>
        <Field value={code} onChangeText={setCode} placeholder="6-digit code" keyboardType="number-pad" autoFocus textContentType="oneTimeCode" />
        <Field value={password} onChangeText={setPassword} placeholder="New password" secureTextEntry textContentType="newPassword" error={err} />
        <Button label="Change password" onPress={reset} busy={busy} />
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Enter your email and we'll send a code to reset your password." footer={back}>
      <Field value={email} onChangeText={setEmail} placeholder="Email" autoCapitalize="none" autoCorrect={false} keyboardType="email-address" textContentType="emailAddress" error={err} onSubmitEditing={send} returnKeyType="send" />
      <Button label="Send code" onPress={send} busy={busy} />
    </AuthShell>
  );
}
