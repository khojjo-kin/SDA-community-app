import * as SecureStore from 'expo-secure-store';
import { recordConsent, withTimeout } from './api';

/*
 * Consent to use information that may show religious belief (UK GDPR, Article 9), from the tick box
 * to the database.
 *
 * The sign-up page asks before an account exists, so its yes is kept on this phone, as the date of
 * birth is (age.ts), until onboarding has made the profile: the database can only record it after
 * that. Apple or Google on the log-in page can make an account without passing that box, so when
 * there is no yes from sign-up, onboarding shows the same box itself.
 *
 * Recording it never holds up onboarding. Until the database has it, a note on the phone says whose
 * consent is still to be recorded, and the app tries again quietly once per launch.
 */

const SIGN_UP_KEY = 'community.signUpConsent';
/** As long as the date of birth is kept: time to find the email code or finish Apple or Google. */
const SIGN_UP_MS = 2 * 60 * 60 * 1000;

const RECORD_KEY = 'community.consentToRecord';

/* ---------- the yes from the sign-up page, until onboarding ---------- */

/** When the sign-up page last made (or started making) an account with the box ticked (ms), 0 for never. */
let givenAt: number | undefined;

/** Called by the sign-up page as it makes an account, with the box ticked. */
export function rememberSignUpConsent() {
  givenAt = Date.now();
  SecureStore.setItemAsync(SIGN_UP_KEY, String(givenAt)).catch(() => {});
}

/** True when the sign-up page on this phone made an account with the box ticked in the last two hours. */
export async function signUpConsent(): Promise<boolean> {
  if (givenAt === undefined) {
    try {
      givenAt = Number((await SecureStore.getItemAsync(SIGN_UP_KEY)) ?? 0) || 0;
    } catch {
      givenAt = 0;
    }
  }
  return givenAt > 0 && Date.now() - givenAt < SIGN_UP_MS;
}

/** Once the profile is made, the yes isn't kept on the phone: the next account asks afresh. */
export function forgetSignUpConsent() {
  givenAt = 0;
  SecureStore.deleteItemAsync(SIGN_UP_KEY).catch(() => {});
}

/* ---------- getting it into the database ---------- */

/** Notes that `me` has consented, before the profile is made, so it is recorded even if the app closes first. */
export async function noteConsentToRecord(me: string) {
  try {
    await SecureStore.setItemAsync(RECORD_KEY, me);
  } catch {
    // Recorded straight after the profile is made all the same; only a retry would be lost.
  }
}

/**
 * Records `me`'s consent now (their profile must exist). Never throws, and gives up after a few
 * seconds without an answer: either way the note stays and the next launch tries again. Asking twice
 * does no harm, since the first time stands.
 */
export async function recordConsentFor(me: string): Promise<void> {
  try {
    await withTimeout(recordConsent(), 8000);
  } catch {
    // Kept for the next launch.
    await noteConsentToRecord(me);
    return;
  }
  try {
    if ((await SecureStore.getItemAsync(RECORD_KEY)) === me) await SecureStore.deleteItemAsync(RECORD_KEY);
  } catch {
    // The next launch asks once more, which changes nothing.
  }
}

/** Once per launch, when `me`'s profile has loaded: records consent still waiting from onboarding, if any. */
export async function retryConsentRecord(me: string): Promise<void> {
  let waiting: string | null = null;
  try {
    waiting = await SecureStore.getItemAsync(RECORD_KEY);
  } catch {
    return;
  }
  if (waiting === me) await recordConsentFor(me);
}
