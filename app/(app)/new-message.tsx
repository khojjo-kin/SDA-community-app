import React, { useEffect, useState } from 'react';
import { FlatList, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SectionTitle } from '../../src/components/Grid';
import { Icon } from '../../src/components/Icon';
import { PersonRow } from '../../src/components/PersonRow';
import { Empty, Header, Loading, Screen, useToast } from '../../src/components/ui';
import { openThread, peopleToMessage, searchProfiles } from '../../src/lib/api';
import { useSession } from '../../src/lib/session';
import { C, errText } from '../../src/lib/theme';
import type { Profile } from '../../src/lib/types';

export default function NewMessage() {
  const { me } = useSession();
  const router = useRouter();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [base, setBase] = useState<Profile[] | null>(null);
  const [found, setFound] = useState<Profile[] | null>(null);
  const [opening, setOpening] = useState(false);

  useEffect(() => {
    peopleToMessage(me).then(setBase).catch(() => setBase([]));
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
        <TextInput value={q} onChangeText={setQ} placeholder="Search" placeholderTextColor={C.fg3} autoFocus autoCapitalize="none" autoCorrect={false} keyboardAppearance="dark" style={{ flex: 1, color: C.fg, fontSize: 17 }} accessibilityLabel="Search for a person" />
      </View>
      <FlatList
        data={people ?? []}
        keyExtractor={(p) => p.id}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={<SectionTitle>{q.trim() ? 'Results' : 'Suggested'}</SectionTitle>}
        renderItem={({ item }) => <PersonRow person={item} onPress={() => open(item)} right={<Icon name="right" size={20} color={C.fg2} />} />}
        ListEmptyComponent={people === null ? <Loading /> : <Empty title={q.trim() ? 'No one found' : 'No suggestions yet'} body={q.trim() ? 'Check the spelling and try again.' : 'Search for someone by name or username.'} />}
        contentContainerStyle={{ paddingBottom: 40 }}
      />
    </Screen>
  );
}
