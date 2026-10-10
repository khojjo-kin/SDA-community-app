import React, { useState } from 'react';
import { Pressable, Text } from 'react-native';
import { useSignUp } from '@clerk/clerk-expo';
import { Link, useRouter } from 'expo-router';
import { AuthShell, DARK_FIELD } from '../../src/components/AuthShell';
import { DarkStatusBar } from '../../src/components/OnDark';
import { SsoButtons } from '../../src/components/SsoButtons';
import { Button, Field } from '../../src/components/ui';
import { useT } from '../../src/lib/i18n';
import { DARK, errText } from '../../src/lib/theme';

export default function SignUp() {
  const { signUp, setActive, isLoaded } = useSignUp();
  const router = useRouter();
  // The app's own words are translated; what Clerk says when something fails (errText) stays as Clerk sends it.
  const t = useT();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [stage, setStage] = useState<'form' | 'verify'>('form');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function create() {
    if (!isLoaded || busy) return;
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setErr(t('auth.enterValidEmail'));
    if (password.length < 8) return setErr(t('auth.passwordTooShort'));
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
    if (!code.trim()) return setErr(t('auth.enterEmailCode'));
    setBusy(true);
    setErr('');
    try {
      const res = await signUp!.attemptEmailAddressVerification({ code: code.trim() });
      if (res.status === 'complete') {
        await setActive!({ session: res.createdSessionId });
        router.replace('/');
      } else {
        const missing = ((res as any).missingFields ?? []).join(', ');
        setErr(missing ? t('auth.signUpNeeds', { fields: missing }) : t('auth.codeDidNotFinish'));
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
      <>
        <DarkStatusBar />
        <AuthShell title={t('auth.enterCodeSentTo', { email: email.trim() })}>
          <Field {...DARK_FIELD} value={code} onChangeText={setCode} placeholder={t('auth.codePlaceholder')} keyboardType="number-pad" autoFocus textContentType="oneTimeCode" error={err} />
          <Button label={t('auth.confirmEmail')} onPress={verify} busy={busy} />
          <Pressable onPress={resend} style={{ padding: 10 }}>
            <Text style={{ color: DARK.accent2, textAlign: 'center', fontWeight: '600' }}>{t('auth.sendNewCode')}</Text>
          </Pressable>
          <Pressable onPress={() => { setStage('form'); setCode(''); setErr(''); }} style={{ padding: 10 }}>
            <Text style={{ color: DARK.accent2, textAlign: 'center', fontWeight: '600' }}>{t('auth.differentEmail')}</Text>
          </Pressable>
        </AuthShell>
      </>
    );
  }

  return (
    <>
      <DarkStatusBar />
      <AuthShell
        title={t('auth.joinTagline')}
        footer={
          <Link href="/sign-in" replace asChild>
            <Pressable>
              <Text style={{ color: DARK.fg2 }}>
                {t('auth.haveAccount')} <Text style={{ color: DARK.accent2, fontWeight: '600' }}>{t('auth.logIn')}</Text>
              </Text>
            </Pressable>
          </Link>
        }>
        <Field {...DARK_FIELD} value={email} onChangeText={setEmail} placeholder={t('auth.email')} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" textContentType="emailAddress" />
        <Field {...DARK_FIELD} value={password} onChangeText={setPassword} placeholder={t('auth.password')} secureTextEntry textContentType="newPassword" error={err} onSubmitEditing={create} returnKeyType="go" />
        <Button label={t('auth.signUp')} onPress={create} busy={busy} />
        <SsoButtons onError={setErr} />
      </AuthShell>
    </>
  );
}
