import React, { useState } from 'react';
import { Pressable, Text } from 'react-native';
import { Link } from 'expo-router';
import { AuthShell } from '../../src/components/AuthShell';
import { SsoButtons } from '../../src/components/SsoButtons';
import { Button, Field } from '../../src/components/ui';
import { supabase } from '../../src/lib/supabase';
import { C, errText } from '../../src/lib/theme';

export default function SignUp() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [stage, setStage] = useState<'form' | 'verify'>('form');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function create() {
    if (busy) return;
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setErr('Enter a valid email address.');
    if (password.length < 8) return setErr('Use a password with at least 8 characters.');
    setBusy(true);
    setErr('');
    try {
      const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
      if (error) throw error;
      // With email confirmation turned on there is no session yet; a code is in their inbox.
      if (!data.session) setStage('verify');
    } catch (e) {
      setErr(errText(e));
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    if (busy) return;
    if (!code.trim()) return setErr('Enter the code from your email.');
    setBusy(true);
    setErr('');
    try {
      const { error } = await supabase.auth.verifyOtp({ type: 'signup', email: email.trim(), token: code.trim() });
      if (error) throw error;
    } catch (e) {
      setErr(errText(e));
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    try {
      const { error } = await supabase.auth.resend({ type: 'signup', email: email.trim() });
      if (error) throw error;
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
      title="Sign up to share photos and videos with your community."
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
