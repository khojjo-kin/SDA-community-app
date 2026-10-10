import React, { useRef, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useSignIn } from '@clerk/clerk-expo';
import { Link, useRouter } from 'expo-router';
import { AuthField, AuthShell } from '../../src/components/AuthShell';
import { Icon } from '../../src/components/Icon';
import { DarkStatusBar } from '../../src/components/OnDark';
import { LinkedSentence, useLegalSheet } from '../../src/components/LegalDocument';
import { SsoButtons } from '../../src/components/SsoButtons';
import { Button } from '../../src/components/ui';
import { useT } from '../../src/lib/i18n';
import { DARK, errText } from '../../src/lib/theme';

type Strategy = 'email_code' | 'phone_code' | 'totp';
type Factor = { strategy: Strategy; emailAddressId?: string; phoneNumberId?: string; safeIdentifier?: string };

/** The ways to confirm it's you that this screen can handle, best first. */
const ORDER: Strategy[] = ['email_code', 'phone_code', 'totp'];

export default function SignIn() {
  const { signIn, setActive, isLoaded } = useSignIn();
  const router = useRouter();
  // The app's own words are translated; what Clerk says when something fails (errText) stays as Clerk sends it.
  const t = useT();
  // Apple or Google can make a new account from here too, so the Terms and Privacy Policy are a tap away.
  // There is no consent box here, unlike sign-up: an account made this way is asked for it in
  // onboarding, before it gets a profile.
  const legal = useLegalSheet();
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
  // A ref as well: the keyboard's Go key and a tap on the button can both arrive before `busy` has drawn.
  const busyRef = useRef(false);
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');
  const passwordRef = useRef<TextInput>(null);

  /** Runs one step with Clerk, one at a time, with the button busy meanwhile. */
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
    setErr(t('auth.unsupportedStep'));
  }

  function run(fn: () => Promise<any>) {
    return step(async () => finish(await fn()));
  }

  const submit = () => {
    if (busyRef.current) return;
    if (!identifier.trim() || !password) return setErr(t('auth.enterIdAndPassword'));
    run(() => signIn!.create({ identifier: identifier.trim(), password }));
  };

  const verify = () => {
    if (!factor || busyRef.current) return;
    if (!code.trim()) return setErr(factor.strategy === 'totp' ? t('auth.enterAuthenticatorCode') : t('auth.enterSentCode'));
    const attempt = { strategy: factor.strategy, code: code.trim() };
    run(() => (stage === 'second' ? (signIn as any).attemptSecondFactor(attempt) : (signIn as any).attemptFirstFactor(attempt)));
  };

  function switchTo(f: Factor) {
    if (!factor) return;
    const was = factor;
    step(async () => {
      await prepare(f, stage === 'second');
      setOthers((list) => [...list.filter((x) => x !== f), was]);
    });
  }

  function resend() {
    if (!factor || factor.strategy === 'totp') return;
    const f = factor;
    step(async () => {
      await prepare(f, stage === 'second');
      setNote(f.strategy === 'phone_code' ? t('auth.newCodeByText') : t('auth.newCodeByEmail'));
    });
  }

  if (stage !== 'form' && factor) {
    const where = factor.safeIdentifier;
    const sent =
      factor.strategy === 'totp'
        ? t('auth.codeFromAuthenticator')
        : factor.strategy === 'phone_code'
          ? where ? t('auth.textedCodeTo', { where }) : t('auth.textedCode')
          : where ? t('auth.emailedCodeTo', { where }) : t('auth.emailedCode');
    const title = newDevice ? t('auth.confirmItsYou') : t('auth.enterYourCode');
    return (
      <>
        <DarkStatusBar />
        <AuthShell title={title}>
          {newDevice ? (
            <View style={{ flexDirection: 'row', gap: 10, backgroundColor: 'rgba(31,191,90,0.12)', borderRadius: 14, padding: 12, borderWidth: 1, borderColor: 'rgba(31,191,90,0.35)' }}>
              <Icon name="lock" size={18} color={DARK.accent2} />
              <Text style={{ color: DARK.fg, flex: 1, lineHeight: 20 }}>{t('auth.newDevice')}</Text>
            </View>
          ) : null}
          <Text style={{ color: DARK.fg2, lineHeight: 20 }}>{sent}</Text>
          <AuthField value={code} onChangeText={setCode} placeholder={t('auth.codePlaceholder')} keyboardType="number-pad" autoFocus textContentType="oneTimeCode" autoComplete="one-time-code" error={err} onSubmitEditing={verify} returnKeyType="go" />
          {note ? <Text style={{ color: DARK.ok, textAlign: 'center' }} accessibilityLiveRegion="polite">{note}</Text> : null}
          <Button label={t('auth.confirm')} onPress={verify} busy={busy} />
          {factor.strategy !== 'totp' ? (
            <Pressable onPress={resend} disabled={busy} style={({ pressed }) => ({ padding: 6, opacity: busy ? 0.5 : pressed ? 0.6 : 1 })} accessibilityRole="button" accessibilityState={{ disabled: busy }}>
              <Text style={{ color: DARK.accent2, textAlign: 'center', fontWeight: '600' }}>{t('auth.sendNewCode')}</Text>
            </Pressable>
          ) : null}
          {others.map((f) => (
            <Pressable key={f.strategy + (f.phoneNumberId ?? f.emailAddressId ?? '')} onPress={() => switchTo(f)} disabled={busy} style={({ pressed }) => ({ padding: 6, opacity: busy ? 0.5 : pressed ? 0.6 : 1 })} accessibilityRole="button" accessibilityState={{ disabled: busy }}>
              <Text style={{ color: DARK.accent2, textAlign: 'center', fontWeight: '600' }}>
                {f.strategy === 'phone_code' ? t('auth.textInstead') : f.strategy === 'email_code' ? t('auth.emailInstead') : t('auth.useAuthenticator')}
              </Text>
            </Pressable>
          ))}
          <Pressable
            onPress={() => {
              if (busyRef.current) return;
              setStage('form');
              setErr('');
              setNote('');
              setFactor(null);
            }}
            accessibilityRole="button"
            style={({ pressed }) => ({ padding: 10, opacity: pressed ? 0.6 : 1 })}>
            <Text style={{ color: DARK.fg2, textAlign: 'center', fontWeight: '600' }}>{t('auth.backToLogIn')}</Text>
          </Pressable>
        </AuthShell>
      </>
    );
  }

  return (
    <>
      <DarkStatusBar />
      <AuthShell
        footer={
          <Link href="/sign-up" replace asChild>
            <Pressable accessibilityRole="button" hitSlop={8} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
              <Text style={{ color: DARK.fg2 }}>
                {t('auth.noAccount')} <Text style={{ color: DARK.accent2, fontWeight: '600' }}>{t('auth.signUp')}</Text>
              </Text>
            </Pressable>
          </Link>
        }>
        {/* Clerk takes a username or an email address here, so the keyboard is the ordinary one. */}
        <AuthField
          value={identifier}
          onChangeText={setIdentifier}
          placeholder={t('auth.usernameOrEmail')}
          accessibilityLabel={t('auth.usernameOrEmail')}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="default"
          textContentType="username"
          autoComplete="username"
          returnKeyType="next"
          submitBehavior="submit"
          onSubmitEditing={() => passwordRef.current?.focus()}
        />
        <AuthField ref={passwordRef} value={password} onChangeText={setPassword} placeholder={t('auth.password')} secureTextEntry textContentType="password" autoComplete="current-password" autoCapitalize="none" error={err} onSubmitEditing={submit} returnKeyType="go" />
        <Button label={t('auth.logIn')} onPress={submit} busy={busy} />
        <Link href="/forgot" replace asChild>
          <Pressable accessibilityRole="button" style={({ pressed }) => ({ padding: 6, opacity: pressed ? 0.6 : 1 })}>
            <Text style={{ color: DARK.accent2, textAlign: 'center', fontWeight: '600' }}>{t('auth.forgotPassword')}</Text>
          </Pressable>
        </Link>
        <SsoButtons onError={setErr} />
        <LinkedSentence
          text={t('legal.agreeSignUp')}
          slots={{ terms: { label: t('legal.termsLink'), onPress: () => legal.open('terms') }, privacy: { label: t('legal.privacyLink'), onPress: () => legal.open('privacy') } }}
          style={{ color: DARK.fg2, fontSize: 13, lineHeight: 18, textAlign: 'center', marginTop: 2 }}
          linkStyle={{ color: DARK.accent2 }}
        />
        {legal.element}
      </AuthShell>
    </>
  );
}
