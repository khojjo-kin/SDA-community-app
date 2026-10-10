import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Icon } from '../../src/components/Icon';
import { RowsSkeleton } from '../../src/components/Skeleton';
import { Avatar, Empty, ErrorNote, Loading, Screen, ScreenHeader, SearchField, useToast } from '../../src/components/ui';
import { listCloseFriends, listPeople, searchProfiles, setCloseFriend } from '../../src/lib/api';
import { tap } from '../../src/lib/haptics';
import { useSession } from '../../src/lib/session';
import { C, errText } from '../../src/lib/theme';
import type { Profile } from '../../src/lib/types';

/** One person, with the round tick that puts them on the list or takes them off. */
const FriendRow = React.memo(function FriendRow({ person: p, picked, onToggle }: { person: Profile; picked: boolean; onToggle: (p: Profile) => void }) {
  return (
    <Pressable onPress={() => onToggle(p)} accessibilityRole="checkbox" accessibilityState={{ checked: picked }} accessibilityLabel={`${p.full_name || p.username}, ${p.username}`} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: pressed ? C.press : 'transparent' })}>
      <Avatar uri={p.avatar_url} name={p.full_name || p.username} size={50} ring={picked ? 'close' : null} />
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={{ color: C.fg, fontWeight: '600' }}>{p.username}</Text>
        {p.full_name ? <Text numberOfLines={1} style={{ color: C.fg2, fontSize: 13.5 }}>{p.full_name}</Text> : null}
      </View>
      <View style={{ width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, borderColor: picked ? C.close : C.fg3, backgroundColor: picked ? C.close : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
        {picked ? <Icon name="check" size={15} color="#fff" weight={3} /> : null}
      </View>
    </Pressable>
  );
});

export default function CloseFriends() {
  const { me } = useSession();
  const toast = useToast();
  const [on, setOn] = useState<Set<string>>(new Set());
  const [base, setBase] = useState<Profile[] | null>(null);
  const [found, setFound] = useState<Profile[] | null>(null);
  const [q, setQ] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const [friends, following, followers] = await Promise.all([listCloseFriends(me), listPeople(me, 'following'), listPeople(me, 'followers')]);
      const seen = new Set<string>();
      const all = [...friends, ...following, ...followers].filter((p) => p.id !== me && !p.is_blocked && !seen.has(p.id) && seen.add(p.id));
      setOn(new Set(friends.map((p) => p.id)));
      setBase(all);
    } catch (e) {
      setError(errText(e));
      setBase([]);
    }
  }, [me]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!q.trim()) {
      setFound(null);
      return;
    }
    let live = true;
    // The list just typed for is cleared at once, so the last search's answers never show under the new words.
    setFound(null);
    const timer = setTimeout(() => {
      searchProfiles(q)
        .then((r) => { if (live) setFound(r.filter((p) => p.id !== me && !p.is_blocked)); })
        .catch(() => { if (live) setFound([]); });
    }, 220);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [q, me]);

  // The list as last set, so a tap (even a second one before the screen has drawn) starts from the newest.
  const onRef = useRef(on);
  onRef.current = on;
  const change = useCallback((id: string, add: boolean) => {
    const s = new Set(onRef.current);
    if (add) s.add(id);
    else s.delete(id);
    onRef.current = s;
    setOn(s);
  }, []);

  const toggle = useCallback(
    async (p: Profile) => {
      const next = !onRef.current.has(p.id);
      change(p.id, next);
      tap('select');
      try {
        await setCloseFriend(me, p.id, next);
      } catch (e) {
        change(p.id, !next);
        toast(errText(e));
      }
    },
    [me, toast, change],
  );

  const needle = q.trim().toLowerCase();
  // While the search is out, the people already here who match show straight away.
  const people = useMemo(() => {
    if (!needle) return base ?? [];
    if (found) return found;
    return (base ?? []).filter((p) => `${p.username} ${p.full_name}`.toLowerCase().includes(needle));
  }, [needle, found, base]);
  const searching = !!needle && found === null;
  const renderItem = useCallback(({ item }: { item: Profile }) => <FriendRow person={item} picked={on.has(item.id)} onToggle={toggle} />, [on, toggle]);

  return (
    <Screen>
      <ScreenHeader title="Close friends" />
      <SearchField value={q} onChangeText={setQ} placeholder="Search" label="Search people" />
      {error ? (
        <ErrorNote message={error} onRetry={() => { setBase(null); load(); }} />
      ) : base === null ? (
        <View style={{ paddingTop: 10 }}>
          <RowsSkeleton count={8} avatar={50} />
        </View>
      ) : (
        <FlatList
          data={people}
          keyExtractor={(p) => p.id}
          extraData={on}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={{ paddingTop: 10, paddingBottom: 40 }}
          ListHeaderComponent={<Text style={{ color: C.fg2, fontWeight: '700', fontSize: 15.5, paddingHorizontal: 16, paddingVertical: 8 }}>{needle ? 'Results' : on.size === 1 ? '1 person on your list' : `${on.size} people on your list`}</Text>}
          renderItem={renderItem}
          ListEmptyComponent={searching ? <Loading /> : <Empty icon="star" title={needle ? 'No one found' : 'No one to add yet'} />}
        />
      )}
    </Screen>
  );
}
