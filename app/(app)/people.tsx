import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { PersonRow } from '../../src/components/PersonRow';
import { Empty, ErrorNote, Header, Loading, Screen } from '../../src/components/ui';
import { getProfile, listPeople } from '../../src/lib/api';
import { C, errText, fmt } from '../../src/lib/theme';
import type { Profile } from '../../src/lib/types';

type Which = 'followers' | 'following';

export default function People() {
  const params = useLocalSearchParams<{ id: string; which?: string }>();
  const userId = String(params.id);
  const [which, setWhich] = useState<Which>(params.which === 'following' ? 'following' : 'followers');
  const [owner, setOwner] = useState<Profile | null>(null);
  const [list, setList] = useState<Profile[] | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setList(null);
    setError('');
    try {
      const [o, people] = await Promise.all([getProfile(userId), listPeople(userId, which)]);
      setOwner(o);
      setList(people);
    } catch (e) {
      setError(errText(e));
      setList([]);
    }
  }, [userId, which]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <Screen>
      <Header title={owner?.username ?? ''} center />
      <View style={{ flexDirection: 'row' }} accessibilityRole="tablist">
        {(['followers', 'following'] as Which[]).map((w) => (
          <Pressable key={w} onPress={() => setWhich(w)} accessibilityRole="tab" accessibilityState={{ selected: which === w }} style={{ flex: 1, height: 44, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 1.5, borderBottomColor: which === w ? C.fg : C.line }}>
            <Text style={{ color: which === w ? C.fg : C.fg2, fontWeight: '600' }}>
              {owner ? fmt(w === 'followers' ? owner.followers_count : owner.following_count) + ' ' : ''}
              {w}
            </Text>
          </Pressable>
        ))}
      </View>
      {error ? (
        <ErrorNote message={error} onRetry={load} />
      ) : (
        <FlatList
          data={list ?? []}
          keyExtractor={(p) => p.id}
          renderItem={({ item }) => <PersonRow person={item} />}
          ListEmptyComponent={list === null ? <Loading /> : <Empty icon="people" title={which === 'followers' ? 'No followers yet' : 'Not following anyone yet'} body={which === 'followers' ? 'People who follow this account will appear here.' : 'Accounts this person follows will appear here.'} />}
          contentContainerStyle={{ paddingTop: 8, paddingBottom: 40 }}
        />
      )}
    </Screen>
  );
}
