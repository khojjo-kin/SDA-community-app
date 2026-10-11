import React, { useCallback, useEffect, useState } from 'react';
import { FlatList } from 'react-native';
import { PersonRow } from '../../src/components/PersonRow';
import { RowsSkeleton } from '../../src/components/Skeleton';
import { Button, Empty, ErrorNote, Screen, ScreenHeader, useToast } from '../../src/components/ui';
import { listRestricted, setRestricted } from '../../src/lib/api';
import { useT } from '../../src/lib/i18n';
import { useSession } from '../../src/lib/session';
import { errText } from '../../src/lib/theme';
import type { Profile } from '../../src/lib/types';

/** Settings → Restricted accounts: everyone I have restricted, newest first, each with Unrestrict. */
export default function Restricted() {
  const { me } = useSession();
  const toast = useToast();
  const t = useT();
  const [list, setList] = useState<Profile[] | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    listRestricted(me)
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
  function unrestrict(p: Profile) {
    setList((cur) => (cur ? cur.filter((x) => x.id !== p.id) : cur));
    setRestricted(me, p.id, false)
      .then(() => toast(t('restrict.undone', { username: p.username })))
      .catch((e) => {
        toast(errText(e));
        load();
      });
  }

  return (
    <Screen>
      <ScreenHeader title={t('settings.restricted')} />
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
          renderItem={({ item: p }) => <PersonRow person={p} right={<Button small kind="ghost" label={t('restrict.unrestrict')} onPress={() => unrestrict(p)} />} />}
          ListEmptyComponent={<Empty icon="shield" title={t('restrict.empty')} />}
          contentContainerStyle={{ paddingBottom: 40 }}
        />
      )}
    </Screen>
  );
}
