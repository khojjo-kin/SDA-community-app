// What the shared call code needs from the iPhone app's lib/session: who is signed in.
import { useMe } from '../lib/me';
export function useSession() {
  const ctx = useMe();
  return { me: ctx?.me.id ?? null, profile: ctx?.me ?? null };
}
