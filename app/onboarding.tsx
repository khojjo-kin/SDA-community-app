import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { Redirect, useRouter } from 'expo-router';
import { AgeStep } from '../src/components/AgeGate';
import { AuthShell, ConsentBox, DARK_FIELD } from '../src/components/AuthShell';
import { DarkStatusBar } from '../src/components/OnDark';
import { noteBirthDateSaved } from '../src/components/BirthDateForm';
import { useLegalSheet } from '../src/components/LegalDocument';
import { Avatar, Button, Field } from '../src/components/ui';
import { useLogOut } from '../src/lib/accounts';
import { blockDeviceForAge, forgetSignUpBirthDate, isDeviceAgeBlocked, requestChildClosure } from '../src/lib/age';
import { createProfile, setBirthDate, uploadImage } from '../src/lib/api';
import { forgetSignUpConsent, noteConsentToRecord, recordConsentFor, signUpConsent } from '../src/lib/consent';
import { useT } from '../src/lib/i18n';
import { pickFromLibrary } from '../src/lib/pick';
import { useSession } from '../src/lib/session';
import { DARK, errText } from '../src/lib/theme';

/**
 * A sign-in account made this recently is taken to be the one that has just been created to get
 * here, so it may be deleted when its owner turns out to be under 13. An older one with no profile
 * (a parent who never finished setting up, say) is only ever signed out.
 */
const NEW_ACCOUNT_MS = 15 * 60 * 1000;

export default function Onboarding() {
  const { isSignedIn } = useAuth();
  // Only this account: another one signed in on this phone (the one this was added from, say) takes over.
  const signOut = useLogOut();
  const { user } = useUser();
  const { me, profile, loading, error, refresh } = useSession();
  const guess = (user?.primaryEmailAddress?.emailAddress ?? '').split('@')[0].toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 30);
  const [name, setName] = useState(user?.fullName ?? '');
  const [username, setUsername] = useState(guess.length >= 3 ? guess : '');
  const [photo, setPhoto] = useState<{ uri: string; width: number } | null>(null);
  // The date of birth, asked for first, before anything else, for every new account (email, Apple or
  // Google). undefined while checking the phone's age block.
  const [born, setBorn] = useState<{ iso: string; age: number } | null | undefined>(undefined);
  // Consent to use what may show religious belief: true when it was given on the sign-up page on this
  // phone. Apple or Google from the log-in page skip that page, so then the same box is shown here.
  const [consentGiven, setConsentGiven] = useState(false);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const router = useRouter();
  const t = useT();
  const legal = useLegalSheet();

  /**
   * Under 13 (or someone on this phone was in the last day): no profile is made and nothing is saved.
   * A sign-in account made in the last few minutes is the child's own, just made: the sorry screen
   * deletes it and signs out. Any older account is never deleted from here, only signed out.
   */
  function child() {
    blockDeviceForAge();
    const created = user?.createdAt ? new Date(user.createdAt).getTime() : 0;
    const justMade = !!me && !!user && user.id === me && created > 0 && Date.now() - created < NEW_ACCOUNT_MS;
    if (justMade) requestChildClosure(me);
    router.replace('/cannot-join');
    if (!justMade) signOut().catch(() => {});
  }

  useEffect(() => {
    // Only for an account the database has confirmed has no profile yet: never an existing one.
    if (!me || loading || profile || error) return;
    let live = true;
    Promise.all([isDeviceAgeBlocked(), signUpConsent()]).then(([blocked, consented]) => {
      if (!live) return;
      if (blocked) {
        child();
        return;
      }
      setConsentGiven(consented);
      // Not known yet: the birthday step comes first. 13 and over anywhere in the world (as the server
      // judges it) goes on; under 13 is turned away (AgeStep and child()).
      forgetSignUpBirthDate();
      setBorn(null);
    });
    return () => {
      live = false;
    };
    // child() only navigates and signs out.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me, loading, !!profile, !!error]);

  const logOut = (
    <Pressable onPress={() => { signOut().catch(() => {}); }}>
      <Text style={{ color: DARK.accent2, fontWeight: '600' }}>Log out</Text>
    </Pressable>
  );

  if (!isSignedIn) return <Redirect href="/sign-in" />;
  if (loading) return <View style={{ flex: 1, backgroundColor: DARK.bg }} />;
  // The app's own screen explains a database it can't reach, and offers to try again.
  if (profile || error) return <Redirect href="/" />;
  if (born === undefined) return <View style={{ flex: 1, backgroundColor: DARK.bg }} />;
  if (!born) return <AgeStep onAdult={(iso, age) => setBorn({ iso, age })} onChild={child} footer={logOut} />;

  async function choose() {
    try {
      const [a] = await pickFromLibrary({ square: true });
      if (a) setPhoto({ uri: a.uri, width: a.width });
    } catch (e) {
      setErr(errText(e));
    }
  }

  async function save() {
    if (busy) return;
    const u = username.trim().toLowerCase();
    if (!name.trim()) return setErr('Add your name.');
    if (!/^[a-z0-9_]{3,30}$/.test(u)) return setErr('Usernames use 3 to 30 lowercase letters, numbers or underscores.');
    // The keyboard's Go key and a quick tap can reach here before the box is ticked.
    if (!consentGiven && !consent) return setErr(t('legal.consentNeeded'));
    setErr('');
    if (!born) return;
    setBusy(true);
    try {
      let avatar_url = '';
      if (photo) avatar_url = (await uploadImage(me, photo.uri, photo.width, 480)).url;
      // Noted first, so the consent is still recorded if the app closes straight after the profile is made.
      await noteConsentToRecord(me);
      await createProfile({ id: me, username: u, full_name: name.trim().slice(0, 80), avatar_url });
      // The database records the consent now that the profile exists. A failure never holds this up:
      // the note stays and the next launch tries again.
      await recordConsentFor(me);
      forgetSignUpConsent();
      // The birthday is kept apart from the profile, and only once the profile exists. If it doesn't
      // save, the app asks for it again before anything else, so the new profile is never left stuck.
      try {
        await setBirthDate(me, born.iso);
        // Under 14, the app then says once what that means for the account.
        noteBirthDateSaved(me, born.age);
        forgetSignUpBirthDate();
      } catch {
        // asked for again by the birthday step
      }
      await refresh();
    } catch (e) {
      setErr(errText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title="Set up your profile"
      footer={logOut}>
      {/* The sign-up pages sit on a photo and stay dark in every theme. */}
      <DarkStatusBar />
      <Pressable onPress={choose} accessibilityRole="button" accessibilityLabel="Choose a profile photo" style={{ alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <Avatar uri={photo?.uri} name={name || username} size={92} />
        <Text style={{ color: DARK.accent2, fontWeight: '600' }}>{photo ? 'Change photo' : 'Add a photo'}</Text>
      </Pressable>
      <View style={{ gap: 6 }}>
        <Text style={{ color: DARK.fg2, fontSize: 12.5 }}>Name</Text>
        <Field {...DARK_FIELD} keyboardAppearance="dark" value={name} onChangeText={setName} placeholder="Your name" maxLength={80} textContentType="name" accessibilityLabel="Name" />
      </View>
      <View style={{ gap: 6 }}>
        <Text style={{ color: DARK.fg2, fontSize: 12.5 }}>Username</Text>
        <Field {...DARK_FIELD} keyboardAppearance="dark" value={username} onChangeText={(t) => setUsername(t.toLowerCase())} placeholder="username" autoCapitalize="none" autoCorrect={false} maxLength={30} error={err} accessibilityLabel="Username" />
      </View>
      {consentGiven ? null : (
        <ConsentBox
          checked={consent}
          onToggle={() => {
            setConsent((c) => !c);
            if (err === t('legal.consentNeeded')) setErr('');
          }}
          onOpenPrivacy={() => legal.open('privacy')}
        />
      )}
      <View style={{ height: 2 }} />
      <Button label="Continue" onPress={save} busy={busy} disabled={!consentGiven && !consent} />
      {legal.element}
    </AuthShell>
  );
}
