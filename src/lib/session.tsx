import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useAuth } from '@clerk/clerk-expo';
import { getProfile } from './api';
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

/** No connection or no answer in time: worth keeping last session's copy on screen and trying again. */
function offline(e: unknown): boolean {
  const msg = String((e as any)?.message ?? '');
  return /Network request failed|Failed to fetch|FetchError|network error|did not answer|timed? ?out/i.test(msg);
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn, userId, getToken } = useAuth();
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
