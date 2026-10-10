import React, { useCallback, useEffect, useState } from 'react';
import { FlatList } from 'react-native';
import { PersonRow } from '../../src/components/PersonRow';
import { RowsSkeleton } from '../../src/components/Skeleton';
import { Button, Empty, ErrorNote, Screen, ScreenHeader, useToast } from '../../src/components/ui';
import { listBlocked, setBlock } from '../../src/lib/api';
import { t } from '../../src/lib/i18n';
import { useSession } from '../../src/lib/session';
import { errText } from '../../src/lib/theme';
import type { Profile } from '../../src/lib/types';

export default function Blocked() {
  const { me } = useSession();
  const toast = useToast();
  const [list, setList] = useState<Profile[] | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    listBlocked(me)
      .then((rows) => {
        setError('');
        setList(rows);
      })
      .catch((e) => {
        setError(errText(e));
        setList((cur) => cur ?? []);
      });
  }, [me]);
  useEffect(load, [load]);

  /** The row goes at once; it comes back if the server says no. */
  function unblock(p: Profile) {
    setList((cur) => (cur ? cur.filter((x) => x.id !== p.id) : cur));
    setBlock(me, p.id, false)
      .then(() => toast(t('profile.unblocked', { username: p.username })))
      .catch((e) => {
        toast(errText(e));
        load();
      });
  }

  return (
    <Screen>
      <ScreenHeader title="Blocked" />
      {list === null ? (
        <RowsSkeleton count={6} avatar={50} trailing="button" />
      ) : error && !list.length ? (
        <ErrorNote
          message={error}
          onRetry={() => {
            setError('');
            setList(null);
            load();
          }}
        />
      ) : (
        <FlatList
          data={list}
          keyExtractor={(p) => p.id}
          renderItem={({ item: p }) => <PersonRow person={p} right={<Button small kind="ghost" label="Unblock" onPress={() => unblock(p)} />} />}
          ListEmptyComponent={<Empty icon="block" title="You haven't blocked anyone" />}
          contentContainerStyle={{ paddingBottom: 40 }}
        />
      )}
    </Screen>
  );
}
