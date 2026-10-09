import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, Text } from 'react-native';
import { PersonRow } from '../../src/components/PersonRow';
import { Button, Empty, ErrorNote, Loading, Screen, ScreenHeader, useToast } from '../../src/components/ui';
import { listBlocked, setBlock } from '../../src/lib/api';
import { useSession } from '../../src/lib/session';
import { C, errText } from '../../src/lib/theme';
import type { Profile } from '../../src/lib/types';

export default function Blocked() {
  const { me } = useSession();
  const toast = useToast();
  const [list, setList] = useState<Profile[] | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setError('');
    listBlocked(me)
      .then(setList)
      .catch((e) => {
        setError(errText(e));
        setList([]);
      });
  }, [me]);
  useEffect(load, [load]);

  return (
    <Screen>
      <ScreenHeader title="Blocked" />
      {list === null ? (
        <Loading />
      ) : error ? (
        <ErrorNote message={error} onRetry={load} />
      ) : (
        <FlatList
          data={list}
          keyExtractor={(p) => p.id}
          ListHeaderComponent={list.length ? <Text style={{ color: C.fg2, paddingHorizontal: 16, paddingBottom: 10, lineHeight: 20 }}>You don't see posts, stories or comments from these accounts. They are not told that you blocked them.</Text> : null}
          renderItem={({ item: p }) => <PersonRow person={p} right={<Button small kind="ghost" label="Unblock" onPress={() => setBlock(me, p.id, false).then(() => { toast(`Unblocked ${p.username}`); load(); }).catch((e) => toast(errText(e)))} />} />}
          ListEmptyComponent={<Empty icon="block" title="You haven't blocked anyone" body="To block someone, open their profile and tap the three dots." />}
          contentContainerStyle={{ paddingBottom: 40 }}
        />
      )}
    </Screen>
  );
}
