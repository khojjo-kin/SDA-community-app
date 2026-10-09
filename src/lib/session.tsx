import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useAuth } from '@clerk/clerk-expo';
import { getProfile } from './api';
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

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn, userId, getToken } = useAuth();
  const [state, setState] = useState<{ id: string | null; profile: Profile | null; error: string }>({ id: null, profile: null, error: '' });

  // Hand Supabase the current Clerk session token on every request.
  const tokenRef = useRef(getToken);
  tokenRef.current = getToken;
  setTokenGetter(() => tokenRef.current());

  const me = isSignedIn && userId ? userId : '';

  const refresh = useCallback(async () => {
    if (!me) {
      setState({ id: '', profile: null, error: '' });
      return;
    }
    try {
      const p = await getProfile(me);
      setState({ id: me, profile: p, error: '' });
    } catch (e) {
      setState((s) => ({ id: me, profile: s.id === me ? s.profile : null, error: errText(e) }));
    }
  }, [me]);

  useEffect(() => {
    if (isLoaded) refresh();
  }, [isLoaded, refresh]);

  useEffect(() => listen('profile', () => { refresh(); }), [refresh]);

  const ready = isLoaded && state.id === me;
  return <Ctx.Provider value={{ me, profile: ready ? state.profile : null, loading: !ready, error: ready ? state.error : '', refresh }}>{children}</Ctx.Provider>;
}
