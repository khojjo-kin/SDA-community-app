import React, { useState } from 'react';
import { Pressable, Text } from 'react-native';
import { Link } from 'expo-router';
import { AuthShell } from '../../src/components/AuthShell';
import { SsoButtons } from '../../src/components/SsoButtons';
import { Button, Field } from '../../src/components/ui';
import { supabase } from '../../src/lib/supabase';
import { C, errText } from '../../src/lib/theme';

export default function SignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function submit() {
    if (busy) return;
    if (!email.trim() || !password) return setErr('Enter your email and password.');
    setBusy(true);
    setErr('');
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw error;
      // The session changes and the app leaves this screen on its own.
    } catch (e) {
      setErr(errText(e));
    } finally {
      setBusy(false);
    }
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
      <Field value={email} onChangeText={setEmail} placeholder="Email" autoCapitalize="none" autoCorrect={false} keyboardType="email-address" textContentType="username" />
      <Field value={password} onChangeText={setPassword} placeholder="Password" secureTextEntry textContentType="password" error={err} onSubmitEditing={submit} returnKeyType="go" />
      <Button label="Log in" onPress={submit} busy={busy} />
      <Link href="/forgot" replace asChild>
        <Pressable style={{ padding: 10 }}>
          <Text style={{ color: C.accent2, textAlign: 'center', fontWeight: '600' }}>Forgot password?</Text>
        </Pressable>
      </Link>
      <SsoButtons onError={setErr} />
    </AuthShell>
  );
}
