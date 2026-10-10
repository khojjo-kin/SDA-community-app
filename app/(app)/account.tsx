import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { useSession as useClerkSession, useUser } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import { Button, Divider, Field, Row, Screen, ScreenHeader, SectionLabel, useToast } from '../../src/components/ui';
import { useLogOut } from '../../src/lib/accounts';
import { deactivateAccount } from '../../src/lib/api';
import { useSession } from '../../src/lib/session';
import { C, errText } from '../../src/lib/theme';

/** Clerk refuses sensitive changes unless the person proved who they are in the last few minutes. */
const needsFresh = (e: any) => !!e?.errors?.some((x: any) => x?.code === 'session_reverification_required');

function ask(title: string, message: string, secure: boolean): Promise<string | null> {
  return new Promise((resolve) =>
    Alert.prompt(
      title,
      message,
      [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
        { text: 'Continue', onPress: (value?: string) => resolve(value ?? '') },
      ],
      secure ? 'secure-text' : 'plain-text',
      '',
      secure ? 'default' : 'number-pad',
    ),
  );
}

/** A small inline form: one field, a line of help, Cancel and a main button. */
function Inline({ label, value, onChangeText, help, action, onAction, onCancel, busy, error, ...field }: { label: string; value: string; onChangeText: (t: string) => void; help?: string; action: string; onAction: () => void; onCancel: () => void; busy: boolean; error?: string } & Pick<React.ComponentProps<typeof Field>, 'keyboardType' | 'autoCapitalize' | 'textContentType' | 'placeholder' | 'autoCorrect'>) {
  return (
    <View style={{ paddingHorizontal: 16, gap: 12, paddingBottom: 10 }}>
      <Field label={label} value={value} onChangeText={onChangeText} error={error} onSubmitEditing={onAction} returnKeyType="go" {...field} />
      {help ? <Text style={{ color: C.fg2, fontSize: 13.5, lineHeight: 19 }}>{help}</Text> : null}
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Button label="Cancel" kind="ghost" style={{ flex: 1 }} onPress={onCancel} />
        <Button label={action} style={{ flex: 1 }} busy={busy} disabled={!value.trim()} onPress={onAction} />
      </View>
    </View>
  );
}

type Stage = 'idle' | 'enter' | 'code';
// Clerk's resource types, taken from the hook so no extra package has to be resolvable.
type ClerkUser = NonNullable<ReturnType<typeof useUser>['user']>;
type EmailAddressResource = ClerkUser['emailAddresses'][number];
type PhoneNumberResource = ClerkUser['phoneNumbers'][number];

export default function Account() {
  // Only this account: another one signed in on this phone takes over.
  const signOut = useLogOut();
  const { user } = useUser();
  const { session } = useClerkSession();
  const { me, profile } = useSession();
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const [pw, setPw] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');

  const [emailStage, setEmailStage] = useState<Stage>('idle');
  const [newEmail, setNewEmail] = useState('');
  const [emailCode, setEmailCode] = useState('');
  const [pendingEmail, setPendingEmail] = useState<EmailAddressResource | null>(null);

  const [phoneStage, setPhoneStage] = useState<Stage>('idle');
  const [newPhone, setNewPhone] = useState('');
  const [phoneCode, setPhoneCode] = useState('');
  const [pendingPhone, setPendingPhone] = useState<PhoneNumberResource | null>(null);

  const [deleting, setDeleting] = useState(false);

  const email = user?.primaryEmailAddress?.emailAddress ?? '';
  const phone = user?.primaryPhoneNumber ?? user?.phoneNumbers?.[0] ?? null;

  /** Proves it is still you, with your password or a code sent to your email. False means you cancelled. */
  async function confirmIdentity(knownPassword?: string): Promise<boolean> {
    if (!session || !user) return false;
    const check = await session.startVerification({ level: 'first_factor' });
    if (check.status === 'complete') return true;
    const factors = check.supportedFirstFactors ?? [];
    if (user.passwordEnabled && factors.some((f) => f.strategy === 'password')) {
      const password = knownPassword ?? (await ask("Confirm it's you", 'Enter your password to continue.', true));
      if (!password) return false;
      await session.attemptFirstFactorVerification({ strategy: 'password', password });
      return true;
    }
    const mail = factors.find((f) => f.strategy === 'email_code');
    if (!mail || mail.strategy !== 'email_code') throw new Error('Log out, log back in, and try again.');
    await session.prepareFirstFactorVerification({ strategy: 'email_code', emailAddressId: mail.emailAddressId });
    const code = await ask("Confirm it's you", `Enter the code we sent to ${mail.safeIdentifier}.`, false);
    if (!code) return false;
    await session.attemptFirstFactorVerification({ strategy: 'email_code', code: code.trim() });
    return true;
  }

  /** Runs a sensitive change, proving identity first if Clerk asks for it. Returns false if cancelled. */
  async function fresh<T>(work: () => Promise<T>): Promise<T | false> {
    try {
      return await work();
    } catch (e) {
      if (!needsFresh(e)) throw e;
      if (!(await confirmIdentity())) return false;
      return await work();
    }
  }

  function reset() {
    setErr('');
    setBusy(false);
  }

  async function run(work: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setErr('');
    try {
      await work();
    } catch (e) {
      setErr(errText(e));
    } finally {
      setBusy(false);
    }
  }

  /* ---- password ---- */

  function savePassword() {
    if (!user) return;
    if (next.length < 8) return setErr('Use a new password with at least 8 characters.');
    run(async () => {
      const done = await fresh(() => user.updatePassword({ currentPassword: current, newPassword: next, signOutOfOtherSessions: true }));
      if (done === false) return;
      setPw(false);
      setCurrent('');
      setNext('');
      toast('Password changed');
    });
  }

  /* ---- email ---- */

  function sendEmailCode() {
    if (!user) return;
    const address = newEmail.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(address)) return setErr('Enter a valid email address.');
    run(async () => {
      const created = await fresh(() => user.createEmailAddress({ email: address }));
      if (created === false) return;
      await created.prepareVerification({ strategy: 'email_code' });
      setPendingEmail(created);
      setEmailStage('code');
    });
  }

  function verifyEmail() {
    if (!user || !pendingEmail) return;
    run(async () => {
      const verified = await pendingEmail.attemptVerification({ code: emailCode.trim() });
      if (verified.verification.status !== 'verified') throw new Error('That code did not match. Try again.');
      const old = user.primaryEmailAddress;
      const done = await fresh(() => user.update({ primaryEmailAddressId: verified.id }));
      if (done === false) return;
      if (old && old.id !== verified.id) await old.destroy().catch(() => {});
      await user.reload();
      setEmailStage('idle');
      setNewEmail('');
      setEmailCode('');
      setPendingEmail(null);
      toast('Email changed');
    });
  }

  async function cancelEmail() {
    if (pendingEmail && pendingEmail.verification.status !== 'verified') await pendingEmail.destroy().catch(() => {});
    setPendingEmail(null);
    setEmailStage('idle');
    setNewEmail('');
    setEmailCode('');
    reset();
  }

  /* ---- phone ---- */

  function sendPhoneCode() {
    if (!user) return;
    const number = newPhone.replace(/[\s()-]/g, '');
    if (!/^\+?\d{7,15}$/.test(number)) return setErr('Enter the number with its country code, like +44 7700 900123.');
    run(async () => {
      const created = await fresh(() => user.createPhoneNumber({ phoneNumber: number.startsWith('+') ? number : `+${number}` }));
      if (created === false) return;
      await created.prepareVerification();
      setPendingPhone(created);
      setPhoneStage('code');
    });
  }

  function verifyPhone() {
    if (!user || !pendingPhone) return;
    run(async () => {
      const verified = await pendingPhone.attemptVerification({ code: phoneCode.trim() });
      if (verified.verification.status !== 'verified') throw new Error('That code did not match. Try again.');
      await fresh(() => user.update({ primaryPhoneNumberId: verified.id }));
      await user.reload();
      setPhoneStage('idle');
      setNewPhone('');
      setPhoneCode('');
      setPendingPhone(null);
      toast('Phone number added');
    });
  }

  async function cancelPhone() {
    if (pendingPhone && pendingPhone.verification.status !== 'verified') await pendingPhone.destroy().catch(() => {});
    setPendingPhone(null);
    setPhoneStage('idle');
    setNewPhone('');
    setPhoneCode('');
    reset();
  }

  function removePhone() {
    if (!phone || !user) return;
    Alert.alert('Remove this phone number?', phone.phoneNumber, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => { run(async () => { const done = await fresh(() => phone.destroy()); if (done === false) return; await user.reload(); toast('Phone number removed'); }); } },
    ]);
  }

  /* ---- deleting ---- */

  function removeAccount() {
    Alert.alert(
      'Delete your account?',
      'Your account will be hidden straight away, and after 30 days it will be deleted for good — your profile, posts, stories, memories, comments, messages and followers, all of it.\n\nIf you change your mind, log in before then and tap Restore.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete account',
          style: 'destructive',
          onPress: async () => {
            if (deleting) return;
            setDeleting(true);
            try {
              await deactivateAccount(me);
              await signOut();
            } catch (e) {
              toast(errText(e));
              setDeleting(false);
            }
          },
        },
      ],
    );
  }

  return (
    <Screen>
      <ScreenHeader title="Account" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
          <SectionLabel>Personal details</SectionLabel>
          <Row icon="user" title={profile?.full_name ?? ''} sub={`@${profile?.username ?? ''}`} onPress={() => router.push('/edit-profile')} />

          {emailStage === 'idle' ? (
            <Row icon="mail" title="Email" sub={email || 'No email on this account'} value="Change" onPress={() => { reset(); setEmailStage('enter'); }} />
          ) : emailStage === 'enter' ? (
            <Inline label="New email" value={newEmail} onChangeText={setNewEmail} placeholder="you@example.com" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} textContentType="emailAddress" action="Send code" onAction={sendEmailCode} onCancel={cancelEmail} busy={busy} error={err} />
          ) : (
            <Inline label="Code" value={emailCode} onChangeText={setEmailCode} placeholder="123456" keyboardType="number-pad" textContentType="oneTimeCode" help={`Enter the code we sent to ${newEmail.trim()}.`} action="Verify" onAction={verifyEmail} onCancel={cancelEmail} busy={busy} error={err} />
          )}

          {phoneStage === 'idle' ? (
            <Row icon="phone" title="Phone" sub={phone ? phone.phoneNumber : 'Add a phone number'} value={phone ? 'Remove' : 'Add'} onPress={() => { reset(); if (phone) removePhone(); else setPhoneStage('enter'); }} />
          ) : phoneStage === 'enter' ? (
            <Inline label="Phone number" value={newPhone} onChangeText={setNewPhone} placeholder="+44 7700 900123" keyboardType="phone-pad" textContentType="telephoneNumber" action="Send code" onAction={sendPhoneCode} onCancel={cancelPhone} busy={busy} error={err} />
          ) : (
            <Inline label="Code" value={phoneCode} onChangeText={setPhoneCode} placeholder="123456" keyboardType="number-pad" textContentType="oneTimeCode" help={`Enter the code we texted to ${newPhone.trim()}.`} action="Verify" onAction={verifyPhone} onCancel={cancelPhone} busy={busy} error={err} />
          )}
          <Divider />

          <SectionLabel>Accounts</SectionLabel>
          <Row icon="swap" title="Add or switch account" onPress={() => router.push('/accounts' as any)} />
          <Divider />

          <SectionLabel>Password and security</SectionLabel>
          {pw ? (
            <View style={{ paddingHorizontal: 16, gap: 12, paddingBottom: 6 }}>
              <Field label="Current password" value={current} onChangeText={setCurrent} secureTextEntry textContentType="password" autoCapitalize="none" />
              <Field label="New password" value={next} onChangeText={setNext} secureTextEntry textContentType="newPassword" autoCapitalize="none" error={err} onSubmitEditing={savePassword} returnKeyType="go" />
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Button label="Cancel" kind="ghost" style={{ flex: 1 }} onPress={() => { setPw(false); setErr(''); setCurrent(''); setNext(''); }} />
                <Button label="Save password" style={{ flex: 1 }} busy={busy} disabled={!current || !next} onPress={savePassword} />
              </View>
            </View>
          ) : (
            <Row icon="key" title="Change password" onPress={() => { reset(); setPw(true); }} />
          )}
          <Divider />

          <SectionLabel>Delete account</SectionLabel>
          <View style={{ paddingHorizontal: 16, gap: 12 }}>
            <Button label="Delete account" kind="danger" onPress={removeAccount} busy={deleting} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
