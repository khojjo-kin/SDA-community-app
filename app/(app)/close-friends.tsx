import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Icon } from '../../src/components/Icon';
import { Avatar, Empty, ErrorNote, Loading, Screen, ScreenHeader, SearchField, useToast } from '../../src/components/ui';
import { listCloseFriends, listPeople, searchProfiles, setCloseFriend } from '../../src/lib/api';
import { useSession } from '../../src/lib/session';
import { C, errText } from '../../src/lib/theme';
import type { Profile } from '../../src/lib/types';

export default function CloseFriends() {
  const { me } = useSession();
  const toast = useToast();
  const [on, setOn] = useState<Set<string>>(new Set());
  const [base, setBase] = useState<Profile[] | null>(null);
  const [found, setFound] = useState<Profile[] | null>(null);
  const [q, setQ] = useState('');
  const [error, setError] = useState('');

  const load = async () => {
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
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me]);

  useEffect(() => {
    if (!q.trim()) {
      setFound(null);
      return;
    }
    let live = true;
    const t = setTimeout(() => {
      searchProfiles(q)
        .then((r) => { if (live) setFound(r.filter((p) => p.id !== me && !p.is_blocked)); })
        .catch(() => { if (live) setFound([]); });
    }, 220);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [q, me]);

  async function toggle(p: Profile) {
    const next = !on.has(p.id);
    setOn((cur) => {
      const s = new Set(cur);
      if (next) s.add(p.id);
      else s.delete(p.id);
      return s;
    });
    try {
      await setCloseFriend(me, p.id, next);
    } catch (e) {
      setOn((cur) => {
        const s = new Set(cur);
        if (next) s.delete(p.id);
        else s.add(p.id);
        return s;
      });
      toast(errText(e));
    }
  }

  const people = useMemo(() => found ?? base ?? [], [found, base]);

  return (
    <Screen>
      <ScreenHeader title="Close friends" />
      <SearchField value={q} onChangeText={setQ} placeholder="Search" label="Search people" />
      {error ? (
        <ErrorNote message={error} onRetry={load} />
      ) : (
        <FlatList
          data={people}
          keyExtractor={(p) => p.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingTop: 10, paddingBottom: 40 }}
          ListHeaderComponent={<Text style={{ color: C.fg2, fontWeight: '700', fontSize: 15.5, paddingHorizontal: 16, paddingVertical: 8 }}>{q.trim() ? 'Results' : on.size === 1 ? '1 person on your list' : `${on.size} people on your list`}</Text>}
          renderItem={({ item: p }) => {
            const picked = on.has(p.id);
            return (
              <Pressable onPress={() => toggle(p)} accessibilityRole="checkbox" accessibilityState={{ checked: picked }} accessibilityLabel={`${p.full_name}, ${p.username}`} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: pressed ? C.press : 'transparent' })}>
                <Avatar uri={p.avatar_url} name={p.full_name} size={50} ring={picked ? 'close' : null} />
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={{ color: C.fg, fontWeight: '600' }}>{p.username}</Text>
                  <Text numberOfLines={1} style={{ color: C.fg2, fontSize: 13.5 }}>{p.full_name}</Text>
                </View>
                <View style={{ width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, borderColor: picked ? C.close : C.fg3, backgroundColor: picked ? C.close : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                  {picked ? <Icon name="check" size={15} color="#fff" weight={3} /> : null}
                </View>
              </Pressable>
            );
          }}
          ListEmptyComponent={base === null || (q.trim() && found === null) ? <Loading /> : <Empty icon="star" title={q.trim() ? 'No one found' : 'No one to add yet'} body={q.trim() ? 'Check the spelling and try again.' : 'Follow people, or search for someone by name.'} />}
        />
      )}
    </Screen>
  );
}
