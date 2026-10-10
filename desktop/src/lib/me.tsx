// The signed-in person's Community profile, shared by every screen.
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { getProfile } from 'shared/api';
import { listen } from 'shared/store';
import type { Profile } from 'shared/types';

type MeState = { me: Profile; refresh: () => Promise<void> };
const Ctx = createContext<MeState | null>(null);

export const useMe = () => useContext(Ctx)!;

export function MeProvider({ profile, children }: { profile: Profile; children: React.ReactNode }) {
  const [me, setMe] = useState(profile);
  const refresh = useCallback(async () => {
    const p = await getProfile(profile.id);
    if (p) setMe(p);
  }, [profile.id]);
  useEffect(() => listen('profile', () => void refresh().catch(() => {})), [refresh]);
  return <Ctx.Provider value={{ me, refresh }}>{children}</Ctx.Provider>;
}
