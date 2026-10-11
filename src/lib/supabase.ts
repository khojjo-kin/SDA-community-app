import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
export const SUPABASE_KEY = process.env.EXPO_PUBLIC_SUPABASE_KEY ?? '';
export const CLERK_KEY = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ?? '';
export const MEDIA_BUCKET = 'community-media';

// Clerk owns sign-in. Every request to Supabase carries the Clerk session token,
// and the database rules read the Clerk user id from it (auth.jwt()->>'sub').
type TokenGetter = (fresh?: boolean) => Promise<string | null>;
let tokenGetter: TokenGetter = async () => null;
let signedIn = false;

/** `fresh` asks Clerk for a new token rather than the one it has kept. */
export function setTokenGetter(fn: TokenGetter) {
  tokenGetter = fn;
}

/** Whether someone is signed in now: their requests must carry their token. */
export function setSignedIn(next: boolean) {
  signedIn = next;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function askClerk(fresh: boolean): Promise<string | null> {
  try {
    return await tokenGetter(fresh);
  } catch {
    return null;
  }
}

/** How long to wait between asks while Clerk has no token yet (about two seconds in all). */
const WAITS = [250, 600, 1200];

/**
 * The token for a request. Signed out, there is none and the request goes with the public key, as
 * it always has. Signed in, Clerk can briefly have no token — just back from the background, or
 * renewing it on a weak connection — and a request sent then went out as nobody, so the database
 * refused it ("permission denied") and a screen such as Messages showed an error for no reason.
 * So a signed-in request waits a moment for the token instead, and if there is still none it fails
 * the way a dropped connection does: screens keep what they show and try again later.
 */
async function currentToken(fresh = false): Promise<string | null> {
  if (!signedIn) return askClerk(fresh);
  for (let i = 0; ; i++) {
    const token = await askClerk(fresh || i > 0);
    if (token) return token;
    if (!signedIn) return null;
    if (i >= WAITS.length) break;
    await sleep(WAITS[i]);
  }
  throw new Error('Network request failed (no sign-in token yet)');
}

/**
 * A request refused for its token (HTTP 401) while someone is signed in is tried once more with a
 * brand-new token: the one sent may have just expired, or reached the server before Clerk's keys did.
 * The body of every request the app makes (text, form data, a file) can be sent a second time.
 */
async function fetchWithFreshToken(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const res = await fetch(input, init);
  if (res.status !== 401 || !signedIn) return res;
  await sleep(300);
  const token = await currentToken(true).catch(() => null);
  if (!token) return res;
  const headers = new Headers(init?.headers);
  headers.set('Authorization', `Bearer ${token}`);
  return fetch(input, { ...init, headers });
}

/**
 * Realtime asks for the token on its own (connecting, joining a channel, every heartbeat) and doesn't
 * always catch a failed ask: a reconnect waiting on one never connects again, so live updates and
 * incoming calls would stop for good after a spell offline. There, no token yet keeps the one Realtime
 * already has (none when signed out), and the next heartbeat asks again.
 */
async function realtimeToken(): Promise<string | null> {
  try {
    return await currentToken();
  } catch {
    return supabase.realtime.accessTokenValue;
  }
}

export const supabase = createClient(SUPABASE_URL || 'https://missing.supabase.co', SUPABASE_KEY || 'missing', {
  accessToken: () => currentToken(),
  global: { fetch: fetchWithFreshToken },
  realtime: { accessToken: realtimeToken },
});
