import React, { useEffect, useRef, useState } from 'react';
import { Pressable, Text, TextInput } from 'react-native';
import { useSignUp } from '@clerk/clerk-expo';
import { Link, useRouter } from 'expo-router';
import { AUTH_FIELD_HEIGHT, AUTH_SMALL_PRINT, AuthAction, AuthField, AuthShell, ConsentBox } from '../../src/components/AuthShell';
import { LinkedSentence, useLegalSheet } from '../../src/components/LegalDocument';
import { SsoButtons } from '../../src/components/SsoButtons';
import { Button } from '../../src/components/ui';
import { isDeviceAgeBlocked } from '../../src/lib/age';
import { rememberSignUpConsent } from '../../src/lib/consent';
import { useAppFont } from '../../src/lib/fonts';
import { useT } from '../../src/lib/i18n';
import { C, errText } from '../../src/lib/theme';

export default function SignUp() {
  const { signUp, setActive, isLoaded } = useSignUp();
  const router = useRouter();
  // The app's own words are translated; what Clerk says when something fails (errText) stays as Clerk sends it.
  const t = useT();
  const font = useAppFont();
  const fontBold = useAppFont('bold');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  // The date of birth is asked once, in onboarding, for every new account however it was made.
  const [stage, setStage] = useState<'form' | 'verify'>('form');
  const [busy, setBusy] = useState(false);
  // A ref as well: the keyboard's Go key and a tap on the button can both arrive before `busy` has drawn.
  const busyRef = useRef(false);
  const [err, setErr] = useState('');
  // "We sent a new code" after Send a new code.
  const [note, setNote] = useState('');
  const passwordRef = useRef<TextInput>(null);

  /** One step with Clerk at a time, with the button busy meanwhile. */
  async function step(work: () => Promise<void>) {
    if (!isLoaded || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setErr('');
    setNote('');
    try {
      await work();
    } catch (e) {
      setErr(errText(e));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  // Explicit consent to use what may show religious belief (a church, using a Christian app), which
  // UK GDPR (Article 9) needs. Unticked to begin with; every way of making an account on this page
  // waits for it, and the yes is kept for onboarding to record once the profile exists. (Apple or
  // Google on the log-in page can make an account without this page, so onboarding asks there.)
  const [consent, setConsent] = useState(false);
  // The Terms and Privacy Policy open in a sheet, so the form keeps what has been typed.
  const legal = useLegalSheet();

  // Someone on this phone said they were under 13 in the last day: the answer stands.
  useEffect(() => {
    isDeviceAgeBlocked().then((blocked) => {
      if (blocked) router.replace('/cannot-join');
    });
  }, [router]);

  function create() {
    if (!isLoaded || busyRef.current) return;
    // The keyboard's Go key reaches here even while the button is greyed out.
    if (!consent) return setErr(t('legal.consentNeeded'));
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setErr(t('auth.enterValidEmail'));
    if (password.length < 8) return setErr(t('auth.passwordTooShort'));
    step(async () => {
      rememberSignUpConsent();
      const res = await signUp!.create({ emailAddress: email.trim(), password });
      if (res.status === 'complete') {
        await setActive!({ session: res.createdSessionId });
        router.replace('/');
        return;
      }
      await signUp!.prepareEmailAddressVerification({ strategy: 'email_code' });
      setCode('');
      setStage('verify');
    });
  }

  function verify() {
    if (!isLoaded || busyRef.current) return;
    if (!code.trim()) return setErr(t('auth.enterEmailCode'));
    step(async () => {
      const res = await signUp!.attemptEmailAddressVerification({ code: code.trim() });
      if (res.status === 'complete') {
        await setActive!({ session: res.createdSessionId });
        router.replace('/');
      } else {
        const missing = ((res as any).missingFields ?? []).join(', ');
        setErr(missing ? t('auth.signUpNeeds', { fields: missing }) : t('auth.codeDidNotFinish'));
      }
    });
  }

  function resend() {
    step(async () => {
      await signUp!.prepareEmailAddressVerification({ strategy: 'email_code' });
      setNote(t('auth.newCodeByEmail'));
    });
  }

  const haveAccount = (
    <Link href="/sign-in" replace asChild>
      <Pressable accessibilityRole="button" hitSlop={8} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
        <Text style={{ color: C.fg2, fontSize: 14.5, fontFamily: font }}>
          {t('auth.haveAccount')} <Text style={{ color: C.accent2, fontWeight: '600', fontFamily: fontBold }}>{t('auth.logIn')}</Text>
        </Text>
      </Pressable>
    </Link>
  );
  const link = { color: C.accent2, textAlign: 'center' as const, fontWeight: '600' as const, fontSize: 15, fontFamily: fontBold };

  if (stage === 'verify') {
    return (
      <AuthShell title={t('auth.enterCodeSentTo', { email: email.trim() })}>
        <AuthField value={code} onChangeText={setCode} placeholder={t('auth.codePlaceholder')} keyboardType="number-pad" autoFocus textContentType="oneTimeCode" autoComplete="one-time-code" error={err} onSubmitEditing={verify} returnKeyType="go" />
        {note ? <Text style={{ color: C.ok, textAlign: 'center', fontFamily: font }} accessibilityLiveRegion="polite">{note}</Text> : null}
        <Button label={t('auth.confirmEmail')} onPress={verify} busy={busy} style={{ height: AUTH_FIELD_HEIGHT, marginTop: 4 }} />
        <Pressable onPress={resend} disabled={busy} accessibilityRole="button" accessibilityState={{ disabled: busy }} style={({ pressed }) => ({ alignSelf: 'center', paddingVertical: 6, paddingHorizontal: 10, opacity: busy ? 0.5 : pressed ? 0.6 : 1 })}>
          <Text style={link}>{t('auth.sendNewCode')}</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            if (busyRef.current) return;
            setStage('form');
            setCode('');
            setErr('');
            setNote('');
          }}
          accessibilityRole="button"
          style={({ pressed }) => ({ alignSelf: 'center', paddingVertical: 6, paddingHorizontal: 10, opacity: pressed ? 0.6 : 1 })}>
          <Text style={[link, { color: C.fg2 }]}>{t('auth.differentEmail')}</Text>
        </Pressable>
      </AuthShell>
    );
  }

  return (
    <AuthShell title={t('auth.joinTagline')} footer={haveAccount}>
      <AuthField
        value={email}
        onChangeText={setEmail}
        placeholder={t('auth.email')}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        textContentType="emailAddress"
        autoComplete="email"
        returnKeyType="next"
        submitBehavior="submit"
        onSubmitEditing={() => passwordRef.current?.focus()}
      />
      <AuthField ref={passwordRef} value={password} onChangeText={setPassword} placeholder={t('auth.password')} secureTextEntry textContentType="newPassword" autoComplete="new-password" autoCapitalize="none" error={err} onSubmitEditing={create} returnKeyType="go" />
      {/* Right above the button it unlocks. */}
      <ConsentBox
        checked={consent}
        onToggle={() => {
          setConsent((c) => !c);
          if (err === t('legal.consentNeeded')) setErr('');
        }}
        onOpenPrivacy={() => legal.open('privacy')}
      />
      {/* Kept in view with the field being typed in, past the consent box (AuthAction). */}
      <AuthAction>
        <Button label={t('auth.signUp')} onPress={create} busy={busy} disabled={!consent} style={{ height: AUTH_FIELD_HEIGHT, marginTop: 4 }} />
      </AuthAction>
      <SsoButtons onError={setErr} disabled={!consent} onStart={rememberSignUpConsent} />
      <LinkedSentence
        text={t('legal.agreeSignUp')}
        slots={{ terms: { label: t('legal.termsLink'), onPress: () => legal.open('terms') }, privacy: { label: t('legal.privacyLink'), onPress: () => legal.open('privacy') } }}
        style={{ ...AUTH_SMALL_PRINT, color: C.fg3, textAlign: 'center', marginTop: 6, fontFamily: font }}
        linkStyle={{ color: C.fg2, fontWeight: '600' }}
      />
      {legal.element}
    </AuthShell>
  );
}
