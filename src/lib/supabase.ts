import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
export const SUPABASE_KEY = process.env.EXPO_PUBLIC_SUPABASE_KEY ?? '';
export const CLERK_KEY = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ?? '';
export const MEDIA_BUCKET = 'community-media';

// Clerk owns sign-in. Every request to Supabase carries the Clerk session token,
// and the database rules read the Clerk user id from it (auth.jwt()->>'sub').
let tokenGetter: () => Promise<string | null> = async () => null;

export function setTokenGetter(fn: () => Promise<string | null>) {
  tokenGetter = fn;
}

export const supabase = createClient(SUPABASE_URL || 'https://missing.supabase.co', SUPABASE_KEY || 'missing', {
  accessToken: async () => {
    try {
      return await tokenGetter();
    } catch {
      return null;
    }
  },
});
