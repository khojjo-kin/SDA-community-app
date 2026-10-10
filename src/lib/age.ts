import * as SecureStore from 'expo-secure-store';

/*
 * The age check that comes before an account (COPPA, and the UK Children's Code).
 *
 * Sign-up asks for a date of birth before anything else. Under 13, nothing is sent anywhere: the
 * person sees a "sorry" screen (app/cannot-join.tsx), and this phone remembers the answer for a day
 * so that going back and typing another date doesn't get round it. 13 and over, the date is kept here
 * until onboarding saves it with the new profile, so it isn't asked for twice.
 *
 * Both live in SecureStore, which on iPhone survives deleting and reinstalling the app, so the block
 * can't be cleared that way either.
 */

/** Nobody younger can have an account. (Under 14, the restricted experience applies: MINOR_AGE in api.ts.) */
export const MIN_AGE = 13;

/* ---------- the under-13 test ---------- */

/** UTC+14 (Kiribati's Line Islands), where each new date begins before anywhere else. */
const FIRST_ZONE_MS = 14 * 60 * 60 * 1000;

/**
 * Whole years from a YYYY-MM-DD birth date to today's date in UTC+14. A 13th birthday counts as
 * reached once it is that date anywhere in the world, which is the rule the server uses as well
 * (community_is_under_13). Whatever the phone's own time zone, the app and the server then agree, so
 * someone turning 13 today is never let in by one and turned away by the other. Only the under-13
 * test uses this: the under-14 rules (MINOR_AGE) still go by the phone's own date (ageFrom in api.ts).
 */
export function ageAnywhere(iso: string, now = new Date()): number {
  const [y, m, d] = iso.split('-').map(Number);
  const first = new Date(now.getTime() + FIRST_ZONE_MS);
  const ty = first.getUTCFullYear();
  const tm = first.getUTCMonth() + 1;
  const td = first.getUTCDate();
  // Not yet this year's birthday there: one year fewer. (29 February counts from 1 March, as on the server.)
  return ty - y - (tm < m || (tm === m && td < d) ? 1 : 0);
}

/** True for a birth date (YYYY-MM-DD) whose 13th birthday hasn't come yet anywhere in the world. */
export function isUnder13(iso: string, now = new Date()): boolean {
  return ageAnywhere(iso, now) < MIN_AGE;
}

const BLOCK_KEY = 'community.ageBlockedAt';
const BLOCK_MS = 24 * 60 * 60 * 1000;

const PENDING_KEY = 'community.signUpBirthDate';
/** Long enough to find the email code or finish Apple or Google sign-in; short enough not to linger on a shared phone. */
const PENDING_MS = 2 * 60 * 60 * 1000;

/* ---------- the block on this phone ---------- */

/** When this phone was last told a date of birth under 13 (ms), 0 for never, undefined until read. */
let blockedAt: number | undefined;

async function readBlock(): Promise<number> {
  if (blockedAt !== undefined) return blockedAt;
  try {
    blockedAt = Number((await SecureStore.getItemAsync(BLOCK_KEY)) ?? 0) || 0;
  } catch {
    blockedAt = 0;
  }
  return blockedAt;
}

/** True for a day after a date of birth under 13 was given on this phone. */
export async function isDeviceAgeBlocked(): Promise<boolean> {
  const at = await readBlock();
  return at > 0 && Date.now() - at < BLOCK_MS;
}

/** Remembers, for a day, that someone on this phone is too young to have an account. */
export async function blockDeviceForAge(): Promise<void> {
  blockedAt = Date.now();
  forgetSignUpBirthDate();
  try {
    await SecureStore.setItemAsync(BLOCK_KEY, String(blockedAt));
  } catch {
    // Kept in memory for as long as the app stays open, which still covers going straight back.
  }
}

/* ---------- the date given at sign-up, until onboarding saves it ---------- */

type Pending = { iso: string; at: number };
let pending: Pending | null | undefined;

/** Keeps the date of birth (YYYY-MM-DD, already checked to be 13 or over) for onboarding. */
export function rememberSignUpBirthDate(iso: string) {
  pending = { iso, at: Date.now() };
  SecureStore.setItemAsync(PENDING_KEY, JSON.stringify(pending)).catch(() => {});
}

/** The date of birth given at sign-up on this phone in the last two hours, or null. */
export async function signUpBirthDate(): Promise<string | null> {
  if (pending === undefined) {
    try {
      const raw = await SecureStore.getItemAsync(PENDING_KEY);
      pending = raw ? (JSON.parse(raw) as Pending) : null;
    } catch {
      pending = null;
    }
  }
  if (!pending || typeof pending.iso !== 'string' || Date.now() - pending.at > PENDING_MS) return null;
  return pending.iso;
}

/** Once saved with the profile (or no longer wanted), the date isn't kept on the phone. */
export function forgetSignUpBirthDate() {
  pending = null;
  SecureStore.deleteItemAsync(PENDING_KEY).catch(() => {});
}

/* ---------- closing an account that belongs to someone under 13 ---------- */

/*
 * The "sorry" screen deletes the sign-in account and signs out, but only for an account the app
 * itself has just found to be under 13 in this session. A link that opens the screen some other way
 * (community://cannot-join) must never delete anyone's account.
 */
let closeFor = '';
let closing: Promise<void> | null = null;

/** Called by the age checks just before they open the sorry screen for the signed-in account `userId`. */
export function requestChildClosure(userId: string) {
  closeFor = userId;
}

/** True when the age checks asked for `userId` to be closed. */
export function childClosureRequested(userId: string): boolean {
  return !!userId && closeFor === userId;
}

/**
 * Deletes the sign-in account (Clerk) and signs out. The profile in the database has already been
 * closed by then (or was never made), and the server's nightly clean-up deletes it within two days. Each step may fail
 * without stopping the next: signing out matters most. Runs once however many times it is asked.
 */
export function closeChildAccount(deleteUser: () => Promise<unknown>, signOut: () => Promise<unknown>): Promise<void> {
  if (!closing) {
    closing = (async () => {
      await blockDeviceForAge();
      try {
        await deleteUser();
      } catch {
        // Clerk may not allow members to delete their own account. The profile is closed anyway.
      }
      try {
        await signOut();
        closeFor = '';
      } catch {
        // Deleting the account ends its sessions, so this may already be signed out. If not (no
        // connection), the request stands and the sorry screen offers to try again.
      }
    })().finally(() => {
      closing = null;
    });
  }
  return closing;
}
