import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Linking, Modal, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AdminFrame, CardsSkeleton, Chips } from '../../src/components/AdminFrame';
import { Icon, VerifiedTick } from '../../src/components/Icon';
import { Avatar, Button, Empty, ErrorNote, IconButton, Screen, ScreenHeader, useToast } from '../../src/components/ui';
import { decidePlusRequest, fetchPlusRequests, verificationFileUrl } from '../../src/lib/api';
import { tap } from '../../src/lib/haptics';
import { useSession } from '../../src/lib/session';
import { agoLong, C, errText } from '../../src/lib/theme';
import type { PlusRequest } from '../../src/lib/types';

type Kind = PlusRequest['kind'];
type Decision = 'approve' | 'decline';

const DOC_LABEL: Record<PlusRequest['document_type'], string> = {
  passport: 'Passport',
  driving_licence: 'Driving licence',
  national_id: 'National ID card',
  other: 'Other document',
  '': 'Not given',
};

/** How the member asked: the free notable-account application, or verification with Plus. */
const PATH_LABEL: Record<PlusRequest['path'], string> = {
  notable: 'Notable account application',
  plus: 'Verified with Community Plus',
  '': 'Identity check',
};

/** A link a member gave, as an address that opens in the browser. Anything that isn't a web address is shown, not opened. */
function webAddress(link: string): string | null {
  const t = link.trim();
  if (!t || /\s/.test(t)) return null;
  if (/^https?:\/\//i.test(t)) return t;
  if (/^[a-z][a-z0-9+.-]*:/i.test(t)) return null;
  return `https://${t}`;
}

/*
 * Identity photos sit in a private bucket and are opened with short-lived signed addresses. An
 * address is kept for a while once fetched, so a card scrolled back into view shows its photo at
 * once instead of fetching a new address (and the photo) again. The photos are only ever held in
 * memory, never written to the phone's disk.
 */
const signed = new Map<string, { url: string; until: number }>();
/** A signed address still good for a minute or more, if there is one. */
function knownUrl(path: string): string | null {
  const hit = signed.get(path);
  return hit && hit.until > Date.now() ? hit.url : null;
}
async function photoUrl(path: string): Promise<string> {
  const known = knownUrl(path);
  if (known) return known;
  const url = await verificationFileUrl(path);
  // The address lasts ten minutes; it is used for eight.
  signed.set(path, { url, until: Date.now() + 8 * 60e3 });
  return url;
}

/** One answer from the notability step: a small label over what the member wrote. */
function Answer({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ gap: 2 }}>
      <Text style={{ color: C.fg2, fontSize: 12.5, fontWeight: '600' }}>{label}</Text>
      <Text style={{ color: value ? C.fg : C.fg3, lineHeight: 20, fontStyle: value ? 'normal' : 'italic' }}>{value || 'Not given'}</Text>
    </View>
  );
}

/** One identity photo; tapping a loaded photo shows it full size, tapping one that failed tries again. */
function PrivatePhoto({ path, label, onOpen }: { path: string; label: string; onOpen: (url: string, label: string) => void }) {
  const [url, setUrl] = useState<string | null>(() => (path ? knownUrl(path) : null));
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!path) return;
    const ready = attempt === 0 ? knownUrl(path) : null;
    if (ready) {
      setUrl(ready);
      return;
    }
    let live = true;
    setFailed(false);
    setUrl(null);
    photoUrl(path)
      .then((u) => {
        if (live) setUrl(u);
      })
      .catch(() => {
        if (live) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, [path, attempt]);

  function retry() {
    signed.delete(path);
    setAttempt((a) => a + 1);
  }

  const press = failed ? retry : url ? () => onOpen(url, label) : undefined;
  return (
    <View style={{ flex: 1, gap: 6 }}>
      <Text style={{ color: C.fg2, fontSize: 12.5, fontWeight: '600' }}>{label}</Text>
      <Pressable
        onPress={press}
        accessibilityRole="button"
        accessibilityLabel={!path ? `${label}: no photo` : failed ? `${label} did not load. Try again` : `${label}. Open full size`}
        style={({ pressed }) => ({ aspectRatio: 3 / 4, borderRadius: 12, backgroundColor: C.bg2, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.8 : 1 })}>
        {!path ? (
          <Text style={{ color: C.fg3, fontSize: 13 }}>No photo</Text>
        ) : failed ? (
          <View style={{ alignItems: 'center', gap: 6, padding: 10 }}>
            <Icon name="repeat" size={20} color={C.fg2} />
            <Text style={{ color: C.fg2, fontSize: 12.5, textAlign: 'center' }}>Tap to try again</Text>
          </View>
        ) : url ? (
          <Image source={{ uri: url }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory" transition={120} recyclingKey={path} onError={() => { signed.delete(path); setFailed(true); }} />
        ) : (
          <ActivityIndicator color={C.fg2} />
        )}
      </Pressable>
    </View>
  );
}

/** One request, with what the admin needs to decide it and the two buttons. */
const RequestCard = React.memo(function RequestCard({ r, working, onDecide, onOpenPhoto, onOpenProfile }: { r: PlusRequest; working?: Decision; onDecide: (r: PlusRequest, approve: boolean) => void; onOpenPhoto: (url: string, label: string) => void; onOpenProfile: (userId: string) => void }) {
  const toast = useToast();
  const verify = r.kind === 'verify';
  // Requests sent before photos were required cannot be checked; they can only be declined.
  const incomplete = verify && (!r.selfie_path || !r.document_path);
  const links = (r.links ?? []).filter((l) => l.trim());
  const buttons = (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <Button small label={verify ? 'Approve: give the tick' : 'Approve: Plus for a month'} busy={working === 'approve'} disabled={incomplete || working === 'decline'} onPress={() => onDecide(r, true)} style={{ flex: 1 }} />
      <Button small kind="ghost" label="Decline" busy={working === 'decline'} disabled={working === 'approve'} onPress={() => onDecide(r, false)} />
    </View>
  );
  return (
    <View style={{ marginHorizontal: 16, marginBottom: 12, padding: 14, borderRadius: 16, backgroundColor: C.surface, gap: 12 }}>
      <Pressable onPress={() => onOpenProfile(r.user_id)} accessibilityRole="button" accessibilityLabel={`Open ${r.username ?? 'this member'}'s profile`} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, opacity: pressed ? 0.7 : 1 })}>
        <Avatar uri={r.avatar_url} name={r.full_name ?? '?'} size={44} />
        <View style={{ flex: 1 }}>
          <Text numberOfLines={1} style={{ color: C.fg, fontWeight: '700' }}>{r.full_name || 'Member'}</Text>
          <Text numberOfLines={1} style={{ color: C.fg2, fontSize: 13 }}>@{r.username ?? '…'} · {agoLong(r.created_at)}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, height: 26, paddingHorizontal: 10, borderRadius: 13, backgroundColor: verify ? C.verified + '24' : C.accentSoft }}>
          {verify ? <VerifiedTick size={14} /> : <Icon name="crown" size={14} color={C.accent2} weight={2.2} />}
          <Text style={{ color: verify ? C.verified : C.accent2, fontSize: 12.5, fontWeight: '700' }}>{verify ? 'Tick' : 'Plus'}</Text>
        </View>
      </Pressable>

      {verify ? (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', height: 28, paddingHorizontal: 10, borderRadius: 14, backgroundColor: r.path === 'plus' ? C.accentSoft : C.surface2 }}>
            <Icon name={r.path === 'plus' ? 'crown' : r.path === 'notable' ? 'star' : 'idcard'} size={14} color={r.path === 'plus' ? C.accent2 : C.fg} weight={2.2} />
            <Text style={{ color: r.path === 'plus' ? C.accent2 : C.fg, fontSize: 13, fontWeight: '700' }}>{PATH_LABEL[r.path ?? ''] ?? PATH_LABEL['']}</Text>
          </View>
          <View style={{ gap: 4 }}>
            <Text style={{ color: C.fg2, fontSize: 13.5 }}>
              Name on document: <Text style={{ color: C.fg, fontWeight: '700' }}>{r.legal_name || 'Not given'}</Text>
            </Text>
            <Text style={{ color: C.fg2, fontSize: 13.5 }}>
              Document: <Text style={{ color: C.fg, fontWeight: '700' }}>{DOC_LABEL[r.document_type] ?? 'Not given'}</Text>
            </Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <PrivatePhoto path={r.document_path} label="Document" onOpen={onOpenPhoto} />
            <PrivatePhoto path={r.selfie_path} label="Selfie" onOpen={onOpenPhoto} />
          </View>
          {incomplete ? <Text style={{ color: C.like, fontSize: 13.5, fontWeight: '600' }}>Photos missing</Text> : null}
          {r.path === 'notable' ? (
            <View style={{ gap: 10, padding: 12, borderRadius: 12, backgroundColor: C.bg2 }}>
              <Answer label="Category" value={r.category} />
              <Answer label="Country or region" value={r.country} />
              <Answer label="Who follows them and why" value={r.audience} />
              <Answer label="Also known as" value={r.known_as} />
              <View style={{ gap: 4 }}>
                <Text style={{ color: C.fg2, fontSize: 12.5, fontWeight: '600' }}>Links</Text>
                {links.length ? (
                  links.map((l, i) => {
                    const url = webAddress(l);
                    return url ? (
                      <Pressable key={`${i}-${l}`} onPress={() => Linking.openURL(url).catch(() => toast("That link couldn't be opened."))} accessibilityRole="link" accessibilityLabel={`Open ${l}`} hitSlop={4} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, opacity: pressed ? 0.6 : 1 })}>
                        <Icon name="link" size={15} color={C.accent2} weight={2.2} />
                        <Text numberOfLines={1} style={{ flex: 1, color: C.accent2, fontWeight: '600' }}>{l}</Text>
                      </Pressable>
                    ) : (
                      <Text key={`${i}-${l}`} numberOfLines={2} style={{ color: C.fg }}>{l}</Text>
                    );
                  })
                ) : (
                  <Text style={{ color: C.fg3, fontStyle: 'italic' }}>None given</Text>
                )}
              </View>
            </View>
          ) : null}
          {r.note ? <Text style={{ color: C.fg, lineHeight: 20 }}>{r.note}</Text> : null}
        </>
      ) : r.note ? (
        <Text style={{ color: C.fg, lineHeight: 20 }}>{r.note}</Text>
      ) : (
        <Text style={{ color: C.fg3, fontStyle: 'italic' }}>No note</Text>
      )}
      {buttons}
    </View>
  );
});

const keyOfRequest = (r: PlusRequest) => r.id;

/** Identity checks for the blue tick, and Plus that a church has arranged: approve or decline. */
export default function AdminRequests() {
  const { me, profile } = useSession();
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ kind?: string }>();
  const [kind, setKind] = useState<Kind>(params.kind === 'plus' ? 'plus' : 'verify');
  const [requests, setRequests] = useState<PlusRequest[] | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  // Which requests are being decided, and how: a row's buttons show it, and a second tap does nothing.
  const [working, setWorking] = useState<Record<string, Decision>>({});
  const workingNow = useRef(new Set<string>());
  // Decided here: kept out of a list that was already on its way when the decision went through.
  const decided = useRef(new Set<string>());
  const [viewer, setViewer] = useState<{ url: string; label: string } | null>(null);
  const admin = !!profile?.admin_role;
  const shown = useRef<PlusRequest[] | null>(null);
  shown.current = requests;
  const asked = useRef(0);

  // Both kinds load together so each tab can show how many are waiting. Each is asked for on its own,
  // so a long queue of one can't fill the oldest 100 and leave the other's tab empty. Only the latest
  // ask fills the list.
  const load = useCallback(
    (pull = false) => {
      if (!admin) return;
      const n = ++asked.current;
      if (pull) setRefreshing(true);
      Promise.all([fetchPlusRequests('verify'), fetchPlusRequests('plus')])
        .then(([verify, plus]) => {
          if (n !== asked.current) return;
          setRequests([...verify, ...plus].filter((r) => !decided.current.has(r.id)));
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
    async (r: PlusRequest, approve: boolean) => {
      if (workingNow.current.has(r.id)) return;
      workingNow.current.add(r.id);
      setWorking((w) => ({ ...w, [r.id]: approve ? 'approve' : 'decline' }));
      try {
        await decidePlusRequest(me, r, approve);
        decided.current.add(r.id);
        signed.delete(r.selfie_path);
        signed.delete(r.document_path);
        tap(approve ? 'success' : 'light');
        toast(approve ? (r.kind === 'verify' ? 'Verified' : 'Plus activated for a month') : 'Declined');
        setRequests((list) => (list ? list.filter((x) => x.id !== r.id) : list));
      } catch (e) {
        toast(errText(e));
      } finally {
        workingNow.current.delete(r.id);
        setWorking((w) => {
          const next = { ...w };
          delete next[r.id];
          return next;
        });
      }
    },
    [me, toast],
  );

  // Declining closes the request for good (and deletes the identity photos), so it is confirmed first.
  const decide = useCallback(
    (r: PlusRequest, approve: boolean) => {
      if (workingNow.current.has(r.id)) return;
      if (approve) {
        run(r, true);
        return;
      }
      Alert.alert(r.kind === 'verify' ? 'Decline this identity check?' : 'Decline this Plus request?', undefined, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Decline', style: 'destructive', onPress: () => { run(r, false); } },
      ]);
    },
    [run],
  );
  const openPhoto = useCallback((url: string, label: string) => setViewer({ url, label }), []);
  const openProfile = useCallback((userId: string) => router.push(`/user/${userId}`), [router]);
  const renderItem = useCallback(
    ({ item }: { item: PlusRequest }) => <RequestCard r={item} working={working[item.id]} onDecide={decide} onOpenPhoto={openPhoto} onOpenProfile={openProfile} />,
    [working, decide, openPhoto, openProfile],
  );

  if (!admin) {
    return (
      <Screen>
        <ScreenHeader title="Requests" />
        <Empty icon="shield" title="Admins only" />
      </Screen>
    );
  }

  const shownNow = (requests ?? []).filter((r) => r.kind === kind);
  const waiting = (k: Kind) => (requests ?? []).filter((r) => r.kind === k).length;

  return (
    <AdminFrame section="requests" title="Requests">
      <Chips
        value={kind}
        onChange={setKind}
        options={[
          { key: 'verify', label: 'Identity checks', count: waiting('verify') },
          { key: 'plus', label: 'Plus', count: waiting('plus') },
        ]}
      />
      {requests === null ? (
        error ? <ErrorNote message={error} onRetry={() => { setError(''); load(); }} /> : <CardsSkeleton count={2} />
      ) : (
        <FlatList
          data={shownNow}
          keyExtractor={keyOfRequest}
          renderItem={renderItem}
          extraData={working}
          initialNumToRender={4}
          windowSize={7}
          contentContainerStyle={{ paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={C.fg2} />}
          ListEmptyComponent={kind === 'verify' ? <Empty icon="idcard" title="No identity checks waiting" /> : <Empty icon="crown" title="No Plus requests waiting" />}
        />
      )}

      <Modal visible={!!viewer} animationType="fade" onRequestClose={() => setViewer(null)} statusBarTranslucent>
        <View style={{ flex: 1, backgroundColor: '#000' }}>
          {/* Light clock and battery over the black, even on the White theme; gone again with the viewer. */}
          {viewer ? <StatusBar style="light" /> : null}
          {viewer ? <Image source={{ uri: viewer.url }} style={StyleSheet.absoluteFill} contentFit="contain" cachePolicy="memory" accessibilityLabel={viewer.label} /> : null}
          <View style={{ position: 'absolute', top: insets.top + 4, left: 8, right: 8, flexDirection: 'row', alignItems: 'center' }}>
            <IconButton name="close" size={28} color="#fff" label="Close" onPress={() => setViewer(null)} />
            <Text style={{ flex: 1, color: '#fff', textAlign: 'center', fontWeight: '600', fontSize: 16 }}>{viewer?.label ?? ''}</Text>
            <View style={{ width: 40 }} />
          </View>
        </View>
      </Modal>
    </AdminFrame>
  );
}
