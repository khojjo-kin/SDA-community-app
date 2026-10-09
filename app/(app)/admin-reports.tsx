import React, { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { Avatar, Button, Empty, ErrorNote, Loading, Screen, ScreenHeader, useToast } from '../../src/components/ui';
import { adminSetAccount, decideReport, deletePost, fetchReports } from '../../src/lib/api';
import { useSession } from '../../src/lib/session';
import { agoLong, C, errText } from '../../src/lib/theme';
import type { ReportCard } from '../../src/lib/types';

export default function AdminReports() {
  const { me } = useSession();
  const router = useRouter();
  const toast = useToast();
  const [which, setWhich] = useState<'open' | 'all'>('open');
  const [reports, setReports] = useState<ReportCard[] | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    fetchReports(which).then(setReports).catch((e) => setError(errText(e)));
  }, [which]);
  useFocusEffect(load);

  const run = (fn: () => Promise<unknown>, done: string) => () => {
    fn().then(() => { toast(done); load(); }).catch((e) => toast(errText(e)));
  };

  function removePost(r: ReportCard) {
    if (!r.reported_post) return;
    Alert.alert('Remove this post?', 'It disappears for everyone. The report is marked as actioned.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: run(async () => { await deletePost(r.reported_post!); await decideReport(me, r.id, 'actioned'); }, 'Post removed') },
    ]);
  }

  function suspend(r: ReportCard) {
    const who = r.reported_user ?? r.reported_post_owner;
    if (!who) return;
    Alert.alert(`Suspend ${r.reported_username ?? 'this account'}?`, 'They can still read, but cannot post, comment, share stories or send messages until an admin lifts it.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Suspend', style: 'destructive', onPress: run(async () => { await adminSetAccount(who, { suspended: true }); await decideReport(me, r.id, 'actioned'); }, 'Account suspended') },
    ]);
  }

  return (
    <Screen>
      <ScreenHeader title="Reports" />
      <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 8 }}>
        {(['open', 'all'] as const).map((w) => (
          <Pressable key={w} onPress={() => setWhich(w)} accessibilityRole="tab" accessibilityState={{ selected: which === w }} style={{ paddingHorizontal: 14, height: 34, borderRadius: 17, backgroundColor: which === w ? C.fg : C.surface, justifyContent: 'center' }}>
            <Text style={{ color: which === w ? C.bg : C.fg, fontWeight: '600' }}>{w === 'open' ? 'Open' : 'Everything'}</Text>
          </Pressable>
        ))}
      </View>
      {reports === null ? (
        error ? <ErrorNote message={error} onRetry={load} /> : <Loading />
      ) : (
        <FlatList
          data={reports}
          keyExtractor={(r) => r.id}
          contentContainerStyle={{ paddingBottom: 40 }}
          ListEmptyComponent={<Empty icon="flag" title={which === 'open' ? 'Nothing waiting' : 'No reports yet'} body={which === 'open' ? 'Every report has been looked at.' : 'Reports from members will appear here.'} />}
          renderItem={({ item: r }) => {
            const who = r.reported_user ?? r.reported_post_owner;
            return (
              <View style={{ marginHorizontal: 16, marginBottom: 12, padding: 14, borderRadius: 16, backgroundColor: C.surface, gap: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Pressable onPress={() => (who ? router.push(`/user/${who}`) : undefined)} accessibilityRole="button" accessibilityLabel="Open the reported account">
                    <Avatar uri={r.reported_avatar_url} name={r.reported_full_name ?? '?'} size={44} />
                  </Pressable>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: C.fg, fontWeight: '700' }}>{r.reported_username ? `@${r.reported_username}` : 'Deleted account'}{r.reported_post ? ' · a post' : ''}</Text>
                    <Text style={{ color: C.fg2, fontSize: 13 }}>Reported by @{r.reporter_username ?? 'someone'} · {agoLong(r.created_at)}</Text>
                  </View>
                  <View style={{ height: 24, paddingHorizontal: 9, borderRadius: 12, backgroundColor: r.status === 'open' ? 'rgba(255,48,64,0.16)' : C.surface2, justifyContent: 'center' }}>
                    <Text style={{ color: r.status === 'open' ? C.like : C.fg2, fontSize: 12, fontWeight: '700', textTransform: 'capitalize' }}>{r.status}</Text>
                  </View>
                </View>
                <Text style={{ color: C.fg, lineHeight: 20 }}>{r.reason}</Text>
                {r.reported_post ? (
                  <Pressable onPress={() => (r.post_exists ? router.push(`/post/${r.reported_post}`) : undefined)} accessibilityRole="button" accessibilityLabel="Open the reported post" style={{ flexDirection: 'row', gap: 10, alignItems: 'center', padding: 8, borderRadius: 12, backgroundColor: C.bg2 }}>
                    {r.post_media?.url ? <Image source={{ uri: r.post_media.poster ?? r.post_media.url }} style={{ width: 54, height: 54, borderRadius: 8, backgroundColor: C.surface2 }} contentFit="cover" /> : null}
                    <Text numberOfLines={2} style={{ flex: 1, color: r.post_exists ? C.fg2 : C.fg3, fontSize: 13.5 }}>{r.post_exists ? r.post_caption || 'No caption' : 'This post has been removed'}</Text>
                  </Pressable>
                ) : null}
                {r.status === 'open' ? (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {r.reported_post && r.post_exists ? <Button small kind="danger" label="Remove post" onPress={() => removePost(r)} /> : null}
                    {who ? <Button small kind="danger" label="Suspend account" onPress={() => suspend(r)} /> : null}
                    <Button small kind="ghost" label="Dismiss" onPress={run(() => decideReport(me, r.id, 'dismissed'), 'Report dismissed')} />
                    <Button small kind="ghost" label="Mark as handled" onPress={run(() => decideReport(me, r.id, 'actioned'), 'Marked as handled')} />
                  </View>
                ) : null}
              </View>
            );
          }}
        />
      )}
    </Screen>
  );
}
