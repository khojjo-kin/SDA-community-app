import React, { useEffect, useState } from 'react';
import { FlatList, Pressable, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SectionTitle } from '../../src/components/Grid';
import { Icon, VerifiedTick } from '../../src/components/Icon';
import { Avatar, Empty, Header, Loading, Screen, useToast } from '../../src/components/ui';
import { activeLabel, ERHA_ID, getProfile, isOnline, openThread, peopleToMessage, searchProfiles } from '../../src/lib/api';
import { tap } from '../../src/lib/haptics';
import { useSession } from '../../src/lib/session';
import { C, errText } from '../../src/lib/theme';
import type { Profile } from '../../src/lib/types';

/**
 * Someone you could message: their face (with the green dot when they're in the app now), name, and
 * when they were last active. Tapping anywhere on the row opens the chat; there's no follow button here.
 */
function MessageRow({ person, onPress }: { person: Profile; onPress: () => void }) {
  // Profiles loaded before activity status existed have no active_at; they simply show no dot.
  const online = isOnline(person.active_at);
  const active = activeLabel(person.active_at);
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`Message ${person.full_name}, ${person.username}${online ? ', active now' : ''}`} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: pressed ? C.press : 'transparent' })}>
      <Avatar uri={person.avatar_url} name={person.full_name} size={50} ring={person.has_story ? 'new' : null} online={online} />
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Text numberOfLines={1} style={{ color: C.fg, fontWeight: '600', flexShrink: 1 }}>{person.username}</Text>
          {person.verified ? <VerifiedTick size={14} /> : null}
        </View>
        <View style={{ flexDirection: 'row' }}>
          <Text numberOfLines={1} style={{ color: C.fg2, fontSize: 13.5, flexShrink: 1 }}>{person.full_name}</Text>
          {active ? <Text numberOfLines={1} style={{ color: C.fg3, fontSize: 13.5 }}> · {active}</Text> : null}
        </View>
      </View>
      <Icon name="right" size={20} color={C.fg2} />
    </Pressable>
  );
}

export default function NewMessage() {
  const { me } = useSession();
  const router = useRouter();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [base, setBase] = useState<Profile[] | null>(null);
  const [found, setFound] = useState<Profile[] | null>(null);
  const [opening, setOpening] = useState(false);

  useEffect(() => {
    let live = true;
    (async () => {
      let people: Profile[] = [];
      try {
        people = await peopleToMessage(me);
      } catch {
        people = [];
      }
      // Erha, the church assistant, can always be messaged, followed or not: she sits at the top of the list.
      if (me !== ERHA_ID && !people.some((p) => p.id === ERHA_ID)) {
        try {
          const erha = await getProfile(ERHA_ID);
          if (erha && !erha.is_blocked) people = [erha, ...people];
        } catch {
          // Without her card the list is still fine; the search still finds her.
        }
      }
      if (live) setBase(people);
    })();
    return () => {
      live = false;
    };
  }, [me]);

  useEffect(() => {
    if (!q.trim()) {
      setFound(null);
      return;
    }
    let live = true;
    const t = setTimeout(() => {
      searchProfiles(q).then((r) => { if (live) setFound(r.filter((p) => p.id !== me && !p.is_blocked)); }).catch(() => { if (live) setFound([]); });
    }, 220);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [q, me]);

  async function open(p: Profile) {
    if (opening) return;
    setOpening(true);
    tap();
    try {
      const tid = await openThread(p.id);
      router.replace(`/chat/${tid}`);
    } catch (e) {
      toast(errText(e));
      setOpening(false);
    }
  }

  const people = found ?? base;

  return (
    <Screen>
      <Header title="New message" center />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 18, paddingBottom: 12 }}>
        <Text style={{ color: C.fg2, fontSize: 17 }}>To:</Text>
        <TextInput value={q} onChangeText={setQ} placeholder="Search" placeholderTextColor={C.fg3} autoFocus autoCapitalize="none" autoCorrect={false} keyboardAppearance={C.blurTint} style={{ flex: 1, color: C.fg, fontSize: 17 }} accessibilityLabel="Search for a person" />
      </View>
      <FlatList
        data={people ?? []}
        keyExtractor={(p) => p.id}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={<SectionTitle>{q.trim() ? 'Results' : 'Suggested'}</SectionTitle>}
        renderItem={({ item }) => <MessageRow person={item} onPress={() => open(item)} />}
        ListEmptyComponent={people === null ? <Loading /> : <Empty title={q.trim() ? 'No one found' : 'No suggestions yet'} body={q.trim() ? 'Check the spelling and try again.' : 'Search for someone by name or username.'} />}
        contentContainerStyle={{ paddingBottom: 40 }}
      />
    </Screen>
  );
}
