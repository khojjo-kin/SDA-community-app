import React, { useCallback, useEffect, useState } from 'react';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { AUTH_FIELD_HEIGHT, AuthShell } from '../src/components/AuthShell';
import { isPlaceholder, LinkedSentence, openLegalLink } from '../src/components/LegalDocument';
import { Button } from '../src/components/ui';
import { LEGAL_DETAILS } from '../src/legal/documents';
import { useLogOut } from '../src/lib/accounts';
import { childClosureRequested, closeChildAccount } from '../src/lib/age';
import { useAppFont } from '../src/lib/fonts';
import { useT } from '../src/lib/i18n';
import { C } from '../src/lib/theme';

/**
 * "Sorry, you can't create an account": where every age check ends for someone under 13.
 *
 * - From sign-up: nobody is signed in and nothing was sent anywhere.
 * - From onboarding (an Apple or Google sign-in with no profile yet): no profile was made. The new
 *   sign-in account is deleted and signed out here.
 * - From the birthday prompt, or signing in to an account already closed for this (?closed=1): the
 *   server has closed the profile and deletes it within two days. The sign-in account is deleted and
 *   signed out here too.
 * - From onboarding with an older account (not one just made), or from the birthday prompt on a
 *   phone where someone said they were under 13 in the last day: nothing is deleted. The screen that
 *   sent it here signs out.
 *
 * It is outside the (app) and (auth) groups so that signing out doesn't send it anywhere else. It only
 * ever deletes an account the age checks asked it to in this session, never because of a link, nor
 * the account already signed in when someone under 13 tries to add a second one.
 */
export default function CannotJoin() {
  const { closed } = useLocalSearchParams<{ closed?: string }>();
  const { isLoaded, isSignedIn, userId } = useAuth();
  // Only the closed account: any other account signed in on this phone stays, and takes over.
  const signOut = useLogOut();
  const { user } = useUser();
  const router = useRouter();
  const t = useT();
  const font = useAppFont();
  const mine = !!userId && childClosureRequested(userId);
  // Busy from the start when there is an account to close, so "Try again" never flashes up first.
  const [working, setWorking] = useState(() => !!isSignedIn && mine);

  const close = useCallback(() => {
    if (!user) return;
    setWorking(true);
    closeChildAccount(() => user.delete(), () => signOut()).finally(() => setWorking(false));
  }, [user, signOut]);

  useEffect(() => {
    if (isLoaded && isSignedIn && mine && user && user.id === userId) close();
    // Once, when the account to close is known; "Try again" covers a failure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, isSignedIn, mine, user?.id, userId]);

  const wasClosed = closed === '1';
  const email: string = LEGAL_DETAILS.contact_email;
  // Until legal/details.json has a real address, it is shown as it is, with nothing to tap.
  const mailable = !isPlaceholder(email);
  // Still signed in once the closing has finished: it couldn't reach the server, so offer another go.
  // (Signed in to some other account, such as when adding a second one, nothing is closed.)
  const stuck = !!isSignedIn && mine && !working;
  const button = { height: AUTH_FIELD_HEIGHT, marginTop: 8 };
  return (
    <AuthShell heading={wasClosed ? t('age.closedTitle') : t('age.sorryTitle')} title={wasClosed ? t('age.closedBody') : t('age.sorryBody')}>
      <LinkedSentence
        text={t('age.parents')}
        slots={{ email: { label: email, onPress: mailable ? () => openLegalLink(`mailto:${encodeURI(email)}`, () => {}) : undefined } }}
        style={{ color: C.fg3, fontSize: 13.5, lineHeight: 19, textAlign: 'center', fontFamily: font }}
        linkStyle={{ color: C.accent2 }}
      />
      {working ? (
        <Button label={t('age.closing')} busy style={button} />
      ) : stuck ? (
        <Button label={t('common.tryAgain')} onPress={close} style={button} />
      ) : (
        <Button label={t('age.backToStart')} onPress={() => router.replace(isSignedIn ? '/' : '/sign-in')} style={button} />
      )}
    </AuthShell>
  );
}
