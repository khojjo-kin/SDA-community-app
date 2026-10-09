import React, { useCallback, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Icon, VerifiedTick } from '../../src/components/Icon';
import { Avatar, Button, Empty, ErrorNote, Loading, Screen, ScreenHeader, useToast } from '../../src/components/ui';
import { decidePlusRequest, fetchPlusRequests } from '../../src/lib/api';
import { useSession } from '../../src/lib/session';
import { agoLong, C, errText } from '../../src/lib/theme';
import type { PlusRequest } from '../../src/lib/types';

export default function AdminRequests() {
  const { me } = useSession();
  const router = useRouter();
  const toast = useToast();
  const [requests, setRequests] = useState<PlusRequest[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  const load = useCallback(() => {
    fetchPlusRequests().then(setRequests).catch((e) => setError(errText(e)));
  }, []);
  useFocusEffect(load);

  async function decide(r: PlusRequest, approve: boolean) {
    if (busy) return;
    setBusy(r.id);
    try {
      await decidePlusRequest(me, r, approve);
      toast(approve ? (r.kind === 'plus' ? 'Plus activated for a month, with the tick' : 'Verified') : 'Declined');
      setRequests((list) => (list ?? []).filter((x) => x.id !== r.id));
    } catch (e) {
      toast(errText(e));
    } finally {
      setBusy('');
    }
  }

  return (
    <Screen>
      <ScreenHeader title="Requests" />
      {requests === null ? (
        error ? <ErrorNote message={error} onRetry={load} /> : <Loading />
      ) : (
        <FlatList
          data={requests}
          keyExtractor={(r) => r.id}
          contentContainerStyle={{ paddingBottom: 40 }}
          ListEmptyComponent={<Empty icon="verified" title="Nothing waiting" body="Requests for the tick or for Plus will appear here." />}
          renderItem={({ item: r }) => (
            <View style={{ marginHorizontal: 16, marginBottom: 12, padding: 14, borderRadius: 16, backgroundColor: C.surface, gap: 10 }}>
              <Pressable onPress={() => router.push(`/user/${r.user_id}`)} accessibilityRole="button" accessibilityLabel={`Open ${r.username ?? 'this'} profile`} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Avatar uri={r.avatar_url} name={r.full_name ?? '?'} size={44} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: C.fg, fontWeight: '700' }}>{r.full_name ?? 'Member'}</Text>
                  <Text style={{ color: C.fg2, fontSize: 13 }}>@{r.username ?? '…'} · {agoLong(r.created_at)}</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, height: 26, paddingHorizontal: 10, borderRadius: 13, backgroundColor: 'rgba(61,139,255,0.14)' }}>
                  {r.kind === 'plus' ? <Icon name="crown" size={14} color={C.close} weight={2.2} /> : <VerifiedTick size={14} />}
                  <Text style={{ color: C.close, fontSize: 12.5, fontWeight: '700' }}>{r.kind === 'plus' ? 'Plus' : 'Tick'}</Text>
                </View>
              </Pressable>
              {r.note ? <Text style={{ color: C.fg, lineHeight: 20 }}>{r.note}</Text> : <Text style={{ color: C.fg3, fontStyle: 'italic' }}>No note</Text>}
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Button small label={r.kind === 'plus' ? 'Approve: Plus for a month' : 'Approve'} busy={busy === r.id} onPress={() => decide(r, true)} style={{ flex: 1 }} />
                <Button small kind="ghost" label="Decline" disabled={!!busy} onPress={() => decide(r, false)} />
              </View>
            </View>
          )}
        />
      )}
    </Screen>
  );
}
