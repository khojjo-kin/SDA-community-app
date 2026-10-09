import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { SplashScreen } from 'expo-router';
import type { Session as AuthSession } from '@supabase/supabase-js';
import { getProfile } from './api';
import { listen } from './store';
import { supabase } from './supabase';
import { errText } from './theme';
import type { Profile } from './types';

type Session = {
  /** Supabase user id, also the profile id in the database. Empty when signed out. */
  me: string;
  /** The email on the sign-in, for showing in Account and guessing a username. */
  email: string;
  /** The name Apple or Google shared at sign-in, used to pre-fill onboarding. */
  fullName: string;
  profile: Profile | null;
  /** True until we know whether this person has a profile yet. */
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
};

const Ctx = createContext<Session>({ me: '', email: '', fullName: '', profile: null, loading: true, error: '', refresh: async () => {}, signOut: async () => {} });
export const useSession = () => useContext(Ctx);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [auth, setAuth] = useState<{ ready: boolean; session: AuthSession | null }>({ ready: false, session: null });
  const [state, setState] = useState<{ id: string | null; profile: Profile | null; error: string }>({ id: null, profile: null, error: '' });

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setAuth({ ready: true, session: data.session }));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => setAuth({ ready: true, session }));
    return () => sub.subscription.unsubscribe();
  }, []);

  // The saved session is read from the phone, not the network, so this is quick.
  useEffect(() => {
    if (auth.ready) SplashScreen.hideAsync().catch(() => {});
  }, [auth.ready]);

  const me = auth.session?.user?.id ?? '';
  const email = auth.session?.user?.email ?? '';
  const meta = (auth.session?.user?.user_metadata ?? {}) as Record<string, unknown>;
  const fullName = typeof meta.full_name === 'string' ? meta.full_name : typeof meta.name === 'string' ? (meta.name as string) : '';

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
    if (auth.ready) refresh();
  }, [auth.ready, refresh]);

  useEffect(() => listen('profile', () => { refresh(); }), [refresh]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const ready = auth.ready && state.id === me;
  return <Ctx.Provider value={{ me, email, fullName, profile: ready ? state.profile : null, loading: !ready, error: ready ? state.error : '', refresh, signOut }}>{children}</Ctx.Provider>;
}
