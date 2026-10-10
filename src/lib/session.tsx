import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { getProfile, updateProfile } from './api';
import { cacheKey, clearCache, readCache, writeCache } from './cache';
import { listen } from './store';
import { setTokenGetter } from './supabase';
import { errText } from './theme';
import type { Profile } from './types';

type Session = {
  /** Clerk user id, also the profile id in the database. Empty when signed out. */
  me: string;
  profile: Profile | null;
  /** True until we know whether this person has a profile yet. */
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
};

const Ctx = createContext<Session>({ me: '', profile: null, loading: true, error: '', refresh: async () => {} });
export const useSession = () => useContext(Ctx);

/**
 * `fresh` is false while the profile shown is last session's copy from the phone, and true once
 * the database has answered in this session. `away` is true when the last ask failed for want of a
 * connection.
 */
type State = { id: string | null; profile: Profile | null; error: string; fresh: boolean; away?: boolean };

type ClerkUser = NonNullable<ReturnType<typeof useUser>['user']>;

/** "Ghana" from "GH". Clerk may give either; a code is turned into a name where the phone knows how. */
function countryName(raw: string | null | undefined): string {
  const value = (raw ?? '').trim();
  if (!/^[A-Za-z]{2}$/.test(value)) return value.slice(0, 60);
  const code = value.toUpperCase();
  try {
    const Names = (Intl as unknown as { DisplayNames?: new (locales: string[], options: { type: 'region' }) => { of(code: string): string | undefined } }).DisplayNames;
    const name = Names ? new Names(['en-GB'], { type: 'region' }).of(code) : undefined;
    if (name && name !== code) return name;
  } catch {
    // An older JavaScript engine without region names: the code is still better than nothing.
  }
  return code;
}

/**
 * Keeps Clerk and the profile in step, once per launch and entirely in the background: nothing waits
 * on it and every failure is swallowed, so it can never hold up or break start-up.
 * - Members can log in with their username, which Clerk checks, so Clerk's copy follows the app's.
 *   Clerk may refuse one the app allows (too short for its rules, or taken there): email still works.
 * - Where the account is based (About this account) comes from where this session was signed in.
 *   The database only takes it while it is still empty, so it is set once and never moves after.
 */
async function keepClerkInStep(me: string, user: ClerkUser, profile: Profile, sessionId: string | null) {
  if (profile.username && user.username !== profile.username) {
    try {
      await user.update({ username: profile.username });
    } catch {
      // Logging in with the username isn't available for this one; nothing to tell anyone.
    }
  }
  if (!profile.country && sessionId) {
    try {
      const sessions = await user.getSessions();
      const country = countryName(sessions.find((s) => s.id === sessionId)?.latestActivity?.country);
      if (country) await updateProfile(me, { country });
    } catch {
      // Unknown for now; the next launch asks again.
    }
  }
}

/** No connection or no answer in time: worth keeping last session's copy on screen and trying again. */
function offline(e: unknown): boolean {
  const msg = String((e as any)?.message ?? '');
  return /Network request failed|Failed to fetch|FetchError|network error|did not answer|timed? ?out/i.test(msg);
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn, userId, getToken, sessionId } = useAuth();
  const { user } = useUser();
  const [state, setState] = useState<State>({ id: null, profile: null, error: '', fresh: false });

  // Hand Supabase the current Clerk session token on every request.
  const tokenRef = useRef(getToken);
  tokenRef.current = getToken;
  setTokenGetter(() => tokenRef.current());

  const me = isSignedIn && userId ? userId : '';
  const meRef = useRef(me);
  meRef.current = me;

  /** Asks the database for the profile. 'offline' when it could not be reached, so it is worth asking again. */
  const load = useCallback(async (): Promise<'ok' | 'offline' | 'failed'> => {
    if (!me) {
      setState({ id: '', profile: null, error: '', fresh: false });
      return 'ok';
    }
    try {
      const p = await getProfile(me);
      // Signed out or switched account while waiting: this answer belongs to nobody on screen.
      if (meRef.current !== me) return 'ok';
      setState({ id: me, profile: p, error: '', fresh: true });
      writeCache(cacheKey(me, 'profile'), p);
      return 'ok';
    } catch (e) {
      if (meRef.current !== me) return 'ok';
      const away = offline(e);
      setState((s) => {
        const mine = s.id === me ? s : null;
        // A profile confirmed in this session stays, as before. Last session's copy only stays while
        // the database cannot be reached: any other failure (a sign-in problem above all) shows the
        // error screen, exactly as it did before there was a copy.
        const keep = mine?.profile && (mine.fresh || away) ? mine.profile : null;
        return { id: me, profile: keep, error: errText(e), fresh: !!mine?.fresh, away };
      });
      return away ? 'offline' : 'failed';
    }
  }, [me]);

  const refresh = useCallback(async () => {
    await load();
  }, [load]);

  useEffect(() => {
    if (!isLoaded) return;
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (me) {
      // Last session's profile, so the app opens at once. Only ever this account's own copy, and
      // never a deactivated one: that waits for the database to say so.
      readCache<Profile>(cacheKey(me, 'profile')).then((p) => {
        if (!live || !p || p.id !== me || p.deleted_at) return;
        // It never covers an answer from the database, only no answer at all (no connection yet).
        setState((s) => (s.id !== me ? { id: me, profile: p, error: '', fresh: false } : !s.profile && s.away ? { ...s, profile: p } : s));
      });
    }
    // While the app runs on last session's copy without a connection, keep asking now and then.
    const attempt = async (n: number) => {
      const outcome = await load();
      if (!live || outcome !== 'offline' || n >= 5) return;
      timer = setTimeout(() => attempt(n + 1), 15000 * (n + 1));
    };
    attempt(0);
    return () => {
      live = false;
      if (timer) clearTimeout(timer);
    };
  }, [isLoaded, me, load]);

  useEffect(() => listen('profile', () => { refresh(); }), [refresh]);

  // Once per launch for each account, after the database has confirmed the profile (never from last
  // session's copy). Remembering the account here is what stops it running again when the profile
  // reloads, including the reload its own save sets off.
  const synced = useRef('');
  useEffect(() => {
    const p = state.profile;
    if (!me || !user || user.id !== me || state.id !== me || !state.fresh || !p || p.id !== me || p.deleted_at) return;
    if (synced.current === me) return;
    synced.current = me;
    keepClerkInStep(me, user, p, sessionId ?? null).catch(() => {});
  }, [me, user, state, sessionId]);

  // Signing out forgets what was kept for that account on this phone.
  const lastUser = useRef('');
  useEffect(() => {
    if (!isLoaded) return;
    if (!me && lastUser.current) clearCache(lastUser.current);
    lastUser.current = me;
  }, [isLoaded, me]);

  const ready = isLoaded && state.id === me;
  return <Ctx.Provider value={{ me, profile: ready ? state.profile : null, loading: !ready, error: ready ? state.error : '', refresh }}>{children}</Ctx.Provider>;
}
