// A few reads the desktop needs that the iPhone app does differently (it navigates by id; the
// desktop, like Instagram on the web, uses usernames in its addresses). Same tables and rules.
import { supabase } from 'shared/supabase';
import type { Profile } from 'shared/types';

export async function profileByUsername(username: string): Promise<Profile | null> {
  const { data, error } = await supabase.from('community_profile_cards').select('*').eq('username', username.toLowerCase()).maybeSingle();
  if (error) throw error;
  return data as Profile | null;
}

/** People to suggest: popular accounts I don't follow yet. */
export async function suggestions(me: string, limit = 5): Promise<Profile[]> {
  const { data, error } = await supabase.from('community_profile_cards').select('*').eq('is_following', false).neq('id', me).order('followers_count', { ascending: false }).limit(limit + 5);
  if (error) throw error;
  return ((data as Profile[]) ?? []).filter((p) => !p.is_blocked && !p.deleted_at).slice(0, limit);
}
