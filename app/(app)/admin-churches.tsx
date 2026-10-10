import React, { useCallback, useState } from 'react';
import { Alert, FlatList, Linking, Pressable, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { AdminFrame } from '../../src/components/AdminFrame';
import { Icon, IconName } from '../../src/components/Icon';
import { Avatar, Button, Empty, ErrorNote, Loading, Screen, ScreenHeader, useToast } from '../../src/components/ui';
import { decideChurch, fetchPendingChurches } from '../../src/lib/api';
import { useSession } from '../../src/lib/session';
import { agoLong, C, errText } from '../../src/lib/theme';

type Pending = Awaited<ReturnType<typeof fetchPendingChurches>>[number];

/** "example.org" was allowed when the church was added, so give it a scheme before opening. */
const siteOf = (raw: string) => (raw.trim() ? (/^https?:\/\//i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`) : '');

function Detail({ icon, text, onPress }: { icon: IconName; text: string; onPress?: () => void }) {
  const body = (
    <>
      <Icon name={icon} size={17} color={C.fg2} weight={2} />
      <Text style={{ flex: 1, color: onPress ? C.accent2 : C.fg, lineHeight: 20 }}>{text}</Text>
    </>
  );
  if (!onPress) return <View style={{ flexDirection: 'row', gap: 10 }}>{body}</View>;
  return (
    <Pressable onPress={onPress} accessibilityRole="link" accessibilityLabel={text} style={({ pressed }) => ({ flexDirection: 'row', gap: 10, opacity: pressed ? 0.6 : 1 })}>
      {body}
    </Pressable>
  );
}

/** Churches suggested by members wait here until an admin approves them; only then does everyone see them. */
export default function AdminChurches() {
  const { me, profile } = useSession();
  const router = useRouter();
  const toast = useToast();
  const [list, setList] = useState<Pending[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const admin = !!profile?.admin_role;

  const load = useCallback(() => {
    if (!admin) return;
    setError('');
    fetchPendingChurches().then(setList).catch((e) => setError(errText(e)));
  }, [admin]);
  useFocusEffect(load);

  async function decide(c: Pending, approve: boolean) {
    if (busy) return;
    setBusy(c.id);
    try {
      await decideChurch(me, c.id, approve);
      toast(approve ? `${c.name} is now listed` : 'Church not approved');
      setList((l) => (l ?? []).filter((x) => x.id !== c.id));
    } catch (e) {
      toast(errText(e));
    } finally {
      setBusy('');
    }
  }

  function reject(c: Pending) {
    Alert.alert(`Turn down ${c.name}?`, "It won't be listed for anyone. The member who suggested it sees it marked Not approved.", [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reject', style: 'destructive', onPress: () => decide(c, false) },
    ]);
  }

  if (!admin) {
    return (
      <Screen>
        <ScreenHeader title="Churches to approve" />
        <Empty icon="shield" title="Admins only" body="New churches are approved by the admins." />
      </Screen>
    );
  }

  return (
    <AdminFrame section="churches" title="Churches to approve">
      {list === null ? (
        error ? <ErrorNote message={error} onRetry={load} /> : <Loading />
      ) : (
        <FlatList
          data={list}
          keyExtractor={(c) => c.id}
          extraData={busy}
          contentContainerStyle={{ paddingBottom: 40 }}
          ListHeaderComponent={
            list.length ? (
              <Text style={{ color: C.fg2, paddingHorizontal: 16, paddingBottom: 12, lineHeight: 20 }}>
                Members suggested these. Check each is a real church and the details look right; you can correct them after approving from the church's page.
              </Text>
            ) : null
          }
          ListEmptyComponent={<Empty icon="church" title="No churches waiting" body="When a member adds a church, it appears here for an admin to approve." />}
          renderItem={({ item: c }) => {
            const place = [c.address, c.city, c.country].map((s) => s.trim()).filter(Boolean).join(', ');
            const site = siteOf(c.website);
            const who = c.submitted_by;
            return (
              <View style={{ marginHorizontal: 16, marginBottom: 12, padding: 14, borderRadius: 16, backgroundColor: C.surface, gap: 12 }}>
                <Pressable onPress={() => router.push({ pathname: '/church/[id]', params: { id: c.id } } as any)} accessibilityRole="button" accessibilityLabel={`Open ${c.name}`} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, opacity: pressed ? 0.7 : 1 })}>
                  <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="church" size={24} color={C.fg} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: C.fg, fontSize: 16.5, fontWeight: '700' }}>{c.name}</Text>
                    <Text style={{ color: C.fg2, fontSize: 13 }}>Suggested {agoLong(c.created_at).toLowerCase()}</Text>
                  </View>
                  <Icon name="right" size={16} color={C.fg2} weight={2} />
                </Pressable>

                <View style={{ gap: 8 }}>
                  <Detail icon="location" text={place || 'No address given'} />
                  <Detail icon="clock" text={c.service_times.trim() || 'No service times given'} />
                  {site ? <Detail icon="link" text={site.replace(/^https?:\/\//i, '')} onPress={() => Linking.openURL(site).catch(() => toast('Could not open that link'))} /> : <Detail icon="link" text="No website given" />}
                </View>

                <Pressable
                  onPress={who ? () => router.push(`/user/${who.id}`) : undefined}
                  accessibilityRole={who ? 'button' : undefined}
                  accessibilityLabel={who ? `Suggested by ${who.full_name || who.username}. Open their profile` : 'Suggested by a member whose account is gone'}
                  style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 12, backgroundColor: C.bg2, opacity: pressed ? 0.7 : 1 })}>
                  <Avatar uri={who?.avatar_url} name={who?.full_name ?? '?'} size={32} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: C.fg3, fontSize: 12 }}>Suggested by</Text>
                    <Text numberOfLines={1} style={{ color: C.fg, fontWeight: '600' }}>{who ? `${who.full_name || who.username} · @${who.username}` : 'A deleted account'}</Text>
                  </View>
                </Pressable>

                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Button small label="Approve" busy={busy === c.id} disabled={!!busy && busy !== c.id} onPress={() => decide(c, true)} style={{ flex: 1 }} />
                  <Button small kind="ghost" label="Reject" disabled={!!busy} onPress={() => reject(c)} />
                </View>
              </View>
            );
          }}
        />
      )}
    </AdminFrame>
  );
}
