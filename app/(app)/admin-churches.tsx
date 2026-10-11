import React, { useCallback, useRef, useState } from 'react';
import { Alert, FlatList, Linking, Pressable, RefreshControl, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { AdminFrame, CardsSkeleton } from '../../src/components/AdminFrame';
import { Icon, IconName } from '../../src/components/Icon';
import { Avatar, Button, Empty, ErrorNote, Screen, ScreenHeader, useToast } from '../../src/components/ui';
import { decideChurch, fetchPendingChurches } from '../../src/lib/api';
import { tap } from '../../src/lib/haptics';
import { useSession } from '../../src/lib/session';
import { agoLong, C, errText } from '../../src/lib/theme';

type Pending = Awaited<ReturnType<typeof fetchPendingChurches>>[number];
type Decision = 'approve' | 'reject';

/** "example.org" was allowed when the church was added, so give it a scheme before opening. */
const siteOf = (raw: string) => (raw.trim() ? (/^https?:\/\//i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`) : '');
const keyOfChurch = (c: Pending) => c.id;

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

/** One suggested church: its details, who suggested it, and the two buttons. */
const ChurchCard = React.memo(function ChurchCard({ c, working, onDecide, onOpen, onOpenUser }: { c: Pending; working?: Decision; onDecide: (c: Pending, approve: boolean) => void; onOpen: (id: string) => void; onOpenUser: (id: string) => void }) {
  const toast = useToast();
  const place = [c.address, c.city, c.country].map((s) => (s ?? '').trim()).filter(Boolean).join(', ');
  const site = siteOf(c.website ?? '');
  const who = c.submitted_by;
  return (
    <View style={{ marginHorizontal: 16, marginBottom: 12, padding: 14, borderRadius: 16, backgroundColor: C.surface, gap: 12 }}>
      <Pressable onPress={() => onOpen(c.id)} accessibilityRole="button" accessibilityLabel={`Open ${c.name}`} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, opacity: pressed ? 0.7 : 1 })}>
        <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="church" size={24} color={C.fg} />
        </View>
        <View style={{ flex: 1 }}>
          <Text numberOfLines={2} style={{ color: C.fg, fontSize: 16.5, fontWeight: '700' }}>{c.name}</Text>
          <Text numberOfLines={1} style={{ color: C.fg2, fontSize: 13 }}>Suggested {agoLong(c.created_at).toLowerCase()}</Text>
        </View>
        <Icon name="right" size={16} color={C.fg2} weight={2} />
      </Pressable>

      <View style={{ gap: 8 }}>
        <Detail icon="location" text={place || 'No address given'} />
        <Detail icon="clock" text={(c.service_times ?? '').trim() || 'No service times given'} />
        {site ? <Detail icon="link" text={site.replace(/^https?:\/\//i, '')} onPress={() => Linking.openURL(site).catch(() => toast('Could not open that link'))} /> : <Detail icon="link" text="No website given" />}
      </View>

      <Pressable
        disabled={!who}
        onPress={() => who && onOpenUser(who.id)}
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
        <Button small label="Approve" busy={working === 'approve'} disabled={working === 'reject'} onPress={() => onDecide(c, true)} style={{ flex: 1 }} />
        <Button small kind="ghost" label="Reject" busy={working === 'reject'} disabled={working === 'approve'} onPress={() => onDecide(c, false)} />
      </View>
    </View>
  );
});

/** Churches suggested by members wait here until an admin approves them; only then does everyone see them. */
export default function AdminChurches() {
  const { me, profile } = useSession();
  const router = useRouter();
  const toast = useToast();
  const [list, setList] = useState<Pending[] | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [working, setWorking] = useState<Record<string, Decision>>({});
  const workingNow = useRef(new Set<string>());
  // Decided here: kept out of a list that was already on its way when the decision went through.
  const decided = useRef(new Set<string>());
  const shown = useRef<Pending[] | null>(null);
  shown.current = list;
  const asked = useRef(0);
  const admin = !!profile?.admin_role;

  const load = useCallback(
    (pull = false) => {
      if (!admin) return;
      const n = ++asked.current;
      if (pull) setRefreshing(true);
      fetchPendingChurches()
        .then((rows) => {
          if (n !== asked.current) return;
          setList(rows.filter((c) => !decided.current.has(c.id)));
          setError('');
        })
        .catch((e) => {
          if (n !== asked.current) return;
          if (shown.current === null) setError(errText(e));
          else if (pull) toast(errText(e));
        })
        .finally(() => {
          if (pull) setRefreshing(false);
        });
    },
    [admin, toast],
  );
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const run = useCallback(
    async (c: Pending, approve: boolean) => {
      if (workingNow.current.has(c.id)) return;
      workingNow.current.add(c.id);
      setWorking((w) => ({ ...w, [c.id]: approve ? 'approve' : 'reject' }));
      try {
        await decideChurch(me, c.id, approve);
        decided.current.add(c.id);
        tap(approve ? 'success' : 'light');
        toast(approve ? `${c.name} is now listed` : 'Church not approved');
        setList((l) => (l ? l.filter((x) => x.id !== c.id) : l));
      } catch (e) {
        toast(errText(e));
      } finally {
        workingNow.current.delete(c.id);
        setWorking((w) => {
          const next = { ...w };
          delete next[c.id];
          return next;
        });
      }
    },
    [me, toast],
  );
  const decide = useCallback(
    (c: Pending, approve: boolean) => {
      if (workingNow.current.has(c.id)) return;
      if (approve) {
        run(c, true);
        return;
      }
      Alert.alert(`Reject ${c.name}?`, "It won't be listed.", [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Reject', style: 'destructive', onPress: () => { run(c, false); } },
      ]);
    },
    [run],
  );
  const open = useCallback((id: string) => router.push({ pathname: '/church/[id]', params: { id } } as any), [router]);
  const openUser = useCallback((id: string) => router.push(`/user/${id}`), [router]);
  const renderItem = useCallback(({ item }: { item: Pending }) => <ChurchCard c={item} working={working[item.id]} onDecide={decide} onOpen={open} onOpenUser={openUser} />, [working, decide, open, openUser]);

  if (!admin) {
    return (
      <Screen>
        <ScreenHeader title="Churches to approve" />
        <Empty icon="shield" title="Admins only" />
      </Screen>
    );
  }

  return (
    <AdminFrame section="churches" title="Churches to approve">
      {list === null ? (
        error ? <ErrorNote message={error} onRetry={() => { setError(''); load(); }} /> : <CardsSkeleton count={2} />
      ) : (
        <FlatList
          data={list}
          keyExtractor={keyOfChurch}
          renderItem={renderItem}
          extraData={working}
          initialNumToRender={4}
          windowSize={7}
          contentContainerStyle={{ paddingTop: 4, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={C.fg2} />}
          ListEmptyComponent={<Empty icon="church" title="No churches waiting" />}
        />
      )}
    </AdminFrame>
  );
}
