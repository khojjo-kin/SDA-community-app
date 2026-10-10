import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Icon, VerifiedTick } from '../../src/components/Icon';
import { Avatar, Button, Empty, ErrorNote, Loading, RoundButton, Screen, ScreenHeader, SearchField, Sheet, useToast } from '../../src/components/ui';
import { fetchStoryWatchList, listPeople, setStoryWatch } from '../../src/lib/api';
import { tap } from '../../src/lib/haptics';
import { useSession } from '../../src/lib/session';
import { C, errText } from '../../src/lib/theme';
import type { Profile } from '../../src/lib/types';

/**
 * Story alerts (Plus): the people whose views of your stories you're told about. They aren't told.
 * The list is the same one the bell on each viewer in a story's Activity sheet changes.
 */
export default function StoryAlerts() {
  const { me, profile } = useSession();
  const router = useRouter();
  const toast = useToast();
  const plus = !!profile?.plus;
  const [list, setList] = useState<Profile[] | null>(null);
  const [error, setError] = useState('');
  const [picking, setPicking] = useState(false);
  // People being added or removed right now: a second tap on them waits for the first to finish.
  const saving = useRef(new Set<string>());
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  const load = useCallback(async () => {
    setError('');
    try {
      const people = await fetchStoryWatchList(me);
      if (alive.current) setList(people);
    } catch (e) {
      if (alive.current) {
        setError(errText(e));
        setList((old) => old ?? []);
      }
    }
  }, [me]);
  useEffect(() => {
    if (plus) load();
  }, [plus, load]);

  /** Adds or removes one person. Shown at once, put back if the save fails. */
  async function setOn(p: Profile, on: boolean) {
    if (saving.current.has(p.id)) return;
    saving.current.add(p.id);
    tap('select');
    // Only this person changes, so other taps still in flight are not undone by a failure here.
    const put = (add: boolean) =>
      setList((cur) => {
        const rest = (cur ?? []).filter((x) => x.id !== p.id);
        return add ? [p, ...rest] : rest;
      });
    put(on);
    try {
      await setStoryWatch(me, p.id, on);
    } catch (e) {
      if (alive.current) put(!on);
      toast(errText(e));
    } finally {
      saving.current.delete(p.id);
    }
  }

  if (!plus) {
    return (
      <Screen>
        <ScreenHeader title="Story alerts" />
        <Empty
          icon="bell"
          title="Story alerts are part of Community Plus"
          body="Pick people, and you'll get a notification each time one of them watches your story. They aren't told."
          action={<Button label="See Community Plus" onPress={() => router.push('/plus')} style={{ marginTop: 10, alignSelf: 'stretch' }} />}
        />
      </Screen>
    );
  }

  const openPicker = () => {
    tap();
    setPicking(true);
  };

  return (
    <Screen>
      <ScreenHeader title="Story alerts" right={<RoundButton name="plus" label="Add people" onPress={openPicker} />} />
      {error && !list?.length ? (
        <ErrorNote message={error} onRetry={load} />
      ) : list === null ? (
        <Loading />
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
          <Text style={{ color: C.fg2, paddingHorizontal: 16, paddingBottom: 14, lineHeight: 20 }}>
            You'll get a notification when one of these people watches your story. They aren't told you added them.
          </Text>
          {list.length === 0 ? (
            <Empty
              icon="bell"
              title="No one yet"
              body="Add people you follow, and you'll hear each time one of them watches your story."
              action={<Button label="Add people" onPress={openPicker} style={{ marginTop: 10, alignSelf: 'stretch' }} />}
            />
          ) : (
            list.map((p) => (
              <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 8 }}>
                <Pressable onPress={() => router.push(`/user/${p.id}`)} accessibilityRole="button" accessibilityLabel={`${p.full_name}, ${p.username}`} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <Avatar uri={p.avatar_url} name={p.full_name} size={50} />
                  <PersonName p={p} />
                </Pressable>
                <Button small kind="ghost" label="Remove" onPress={() => setOn(p, false)} />
              </View>
            ))
          )}
          {list.length ? <Button label="Add people" kind="ghost" onPress={openPicker} style={{ marginHorizontal: 16, marginTop: 14 }} /> : null}
        </ScrollView>
      )}

      <AddPeople visible={picking} chosen={list ?? []} onClose={() => setPicking(false)} onToggle={setOn} />
    </Screen>
  );
}

function PersonName({ p }: { p: Profile }) {
  return (
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <Text numberOfLines={1} style={{ color: C.fg, fontWeight: '600', flexShrink: 1 }}>{p.username}</Text>
        {p.verified ? <VerifiedTick size={14} /> : null}
      </View>
      <Text numberOfLines={1} style={{ color: C.fg2, fontSize: 13.5 }}>{p.full_name}</Text>
    </View>
  );
}

/** The people you follow, ticked when they're on the list. Each tap saves straight away. */
function AddPeople({ visible, chosen, onClose, onToggle }: { visible: boolean; chosen: Profile[]; onClose: () => void; onToggle: (p: Profile, on: boolean) => void }) {
  const { me } = useSession();
  const [people, setPeople] = useState<Profile[] | null>(null);
  const [q, setQ] = useState('');

  useEffect(() => {
    if (!visible) return;
    setQ('');
    setPeople(null);
    let live = true;
    listPeople(me, 'following')
      .then((all) => { if (live) setPeople(all.filter((p) => p.id !== me && !p.is_blocked)); })
      .catch(() => { if (live) setPeople([]); });
    return () => {
      live = false;
    };
  }, [visible, me]);

  const on = useMemo(() => new Set(chosen.map((p) => p.id)), [chosen]);
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!people || !s) return people ?? [];
    return people.filter((p) => p.username.toLowerCase().includes(s) || p.full_name.toLowerCase().includes(s));
  }, [people, q]);

  return (
    <Sheet visible={visible} onClose={onClose} title="Add people" tall footer={<Button label="Done" onPress={onClose} style={{ marginHorizontal: 16, marginTop: 10 }} />}>
      {people === null ? (
        <Loading />
      ) : people.length === 0 ? (
        <Empty icon="people" title="You aren't following anyone yet" body="Story alerts are for people you follow." />
      ) : (
        <>
          <SearchField value={q} onChangeText={setQ} label="Search people you follow" />
          <FlatList
            style={{ flex: 1, marginTop: 8 }}
            data={shown}
            keyExtractor={(p) => p.id}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item: p }) => {
              const picked = on.has(p.id);
              return (
                <Pressable onPress={() => onToggle(p, !picked)} accessibilityRole="checkbox" accessibilityState={{ checked: picked }} accessibilityLabel={`${p.full_name}, ${p.username}`} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: pressed ? C.press : 'transparent' })}>
                  <Avatar uri={p.avatar_url} name={p.full_name} size={46} />
                  <PersonName p={p} />
                  <View style={{ width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, borderColor: picked ? C.accent : C.fg3, backgroundColor: picked ? C.accent : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                    {picked ? <Icon name="check" size={15} color={C.onAccent} weight={3} /> : null}
                  </View>
                </Pressable>
              );
            }}
            ListEmptyComponent={<Text style={{ color: C.fg2, textAlign: 'center', padding: 24 }}>No one by that name.</Text>}
          />
        </>
      )}
    </Sheet>
  );
}
