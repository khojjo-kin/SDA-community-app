import React, { useCallback, useEffect, useState } from 'react';
import { FlatList } from 'react-native';
import { PersonRow } from '../../src/components/PersonRow';
import { RowsSkeleton } from '../../src/components/Skeleton';
import { Button, Empty, ErrorNote, Screen, ScreenHeader, useToast } from '../../src/components/ui';
import { listMuted, setMute } from '../../src/lib/api';
import { useT } from '../../src/lib/i18n';
import { useSession } from '../../src/lib/session';
import { patchAuthor } from '../../src/lib/store';
import { errText } from '../../src/lib/theme';
import type { Profile } from '../../src/lib/types';

/** Settings → Muted accounts: everyone whose posts or stories I have muted, newest first, each with Unmute. */
export default function Muted() {
  const { me } = useSession();
  const toast = useToast();
  const t = useT();
  const [list, setList] = useState<Profile[] | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    listMuted(me)
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

  /** Unmutes both their posts and their stories. The row goes at once; it comes back if the server says no. */
  function unmute(p: Profile) {
    setList((cur) => (cur ? cur.filter((x) => x.id !== p.id) : cur));
    setMute(me, p.id, { posts: false, stories: false })
      .then(() => {
        patchAuthor(p.id, { author_muted: false });
        toast(t('mute.unmuted', { username: p.username }));
      })
      .catch((e) => {
        toast(errText(e));
        load();
      });
  }

  return (
    <Screen>
      <ScreenHeader title={t('settings.muted')} />
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
          renderItem={({ item: p }) => <PersonRow person={p} right={<Button small kind="ghost" label={t('mute.unmute')} onPress={() => unmute(p)} />} />}
          ListEmptyComponent={<Empty icon="mute" title={t('mute.empty')} />}
          contentContainerStyle={{ paddingBottom: 40 }}
        />
      )}
    </Screen>
  );
}
