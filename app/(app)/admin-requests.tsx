import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Linking, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AdminFrame } from '../../src/components/AdminFrame';
import { Icon, VerifiedTick } from '../../src/components/Icon';
import { Avatar, Button, Empty, ErrorNote, IconButton, Loading, Screen, ScreenHeader, useToast } from '../../src/components/ui';
import { decidePlusRequest, fetchPlusRequests, verificationFileUrl } from '../../src/lib/api';
import { useSession } from '../../src/lib/session';
import { agoLong, C, errText } from '../../src/lib/theme';
import type { PlusRequest } from '../../src/lib/types';

type Kind = PlusRequest['kind'];

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

/** One answer from the notability step: a small label over what the member wrote. */
function Answer({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ gap: 2 }}>
      <Text style={{ color: C.fg2, fontSize: 12.5, fontWeight: '600' }}>{label}</Text>
      <Text style={{ color: value ? C.fg : C.fg3, lineHeight: 20, fontStyle: value ? 'normal' : 'italic' }}>{value || 'Not given'}</Text>
    </View>
  );
}

/**
 * One identity photo. They sit in a private bucket, so each is opened with a short-lived signed
 * address fetched here; tapping a loaded photo shows it full size.
 */
function PrivatePhoto({ path, label, onOpen }: { path: string; label: string; onOpen: (url: string, label: string) => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!path) return;
    let live = true;
    setFailed(false);
    setUrl(null);
    verificationFileUrl(path)
      .then((u) => { if (live) setUrl(u); })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [path, attempt]);

  const press = url && !failed ? () => onOpen(url, label) : failed ? () => setAttempt((a) => a + 1) : undefined;
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
            <Text style={{ color: C.fg2, fontSize: 12.5, textAlign: 'center' }}>Didn't load. Tap to try again</Text>
          </View>
        ) : url ? (
          <Image source={{ uri: url }} style={StyleSheet.absoluteFill} contentFit="cover" onError={() => setFailed(true)} />
        ) : (
          <ActivityIndicator color={C.fg2} />
        )}
      </Pressable>
    </View>
  );
}

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
  const [busy, setBusy] = useState('');
  const [viewer, setViewer] = useState<{ url: string; label: string } | null>(null);
  const admin = !!profile?.admin_role;

  // Both kinds load together so each tab can show how many are waiting.
  const load = useCallback(() => {
    if (!admin) return;
    setError('');
    fetchPlusRequests().then(setRequests).catch((e) => setError(errText(e)));
  }, [admin]);
  useFocusEffect(load);

  async function decide(r: PlusRequest, approve: boolean) {
    if (busy) return;
    setBusy(r.id);
    try {
      await decidePlusRequest(me, r, approve);
      toast(approve ? (r.kind === 'verify' ? 'Verified' : 'Plus activated for a month') : 'Declined');
      setRequests((list) => (list ?? []).filter((x) => x.id !== r.id));
    } catch (e) {
      toast(errText(e));
    } finally {
      setBusy('');
    }
  }

  if (!admin) {
    return (
      <Screen>
        <ScreenHeader title="Requests" />
        <Empty icon="shield" title="Admins only" body="Identity checks and Plus requests are decided by the admins." />
      </Screen>
    );
  }

  const shown = (requests ?? []).filter((r) => r.kind === kind);
  const waiting = (k: Kind) => (requests ?? []).filter((r) => r.kind === k).length;
  const open = (url: string, label: string) => setViewer({ url, label });

  function renderVerify(r: PlusRequest) {
    // Requests sent before photos were required cannot be checked; the member has to start again.
    const incomplete = !r.selfie_path || !r.document_path;
    const links = (r.links ?? []).filter((l) => l.trim());
    return (
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
          <PrivatePhoto path={r.document_path} label="Document" onOpen={open} />
          <PrivatePhoto path={r.selfie_path} label="Selfie" onOpen={open} />
        </View>
        {incomplete ? (
          <Text style={{ color: C.like, fontSize: 13.5, lineHeight: 19 }}>Sent before photos were needed, so it can't be checked. Decline it; the member can then verify with photos.</Text>
        ) : (
          <Text style={{ color: C.fg3, fontSize: 12.5, lineHeight: 17 }}>Check that the face matches and the name on the document matches the account. Both photos are deleted once you decide.</Text>
        )}
        {r.path === 'notable' ? (
          // The notability answers: what admins weigh when deciding whether the account is widely known.
          <View style={{ gap: 10, padding: 12, borderRadius: 12, backgroundColor: C.bg2 }}>
            <Text style={{ color: C.fg, fontWeight: '700' }}>Is this account widely known?</Text>
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
                    <Pressable key={`${i}-${l}`} onPress={() => Linking.openURL(url).catch(() => toast("That link couldn't be opened."))} accessibilityRole="link" accessibilityLabel={`Open ${l}`} hitSlop={4} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
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
        ) : r.path === 'plus' ? (
          <Text style={{ color: C.fg3, fontSize: 12.5, lineHeight: 17 }}>Asked through Community Plus: the identity check is all that's needed. Open their profile to see that Plus is active.</Text>
        ) : null}
        {r.note ? <Text style={{ color: C.fg, lineHeight: 20 }}>{r.note}</Text> : null}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button small label="Approve: give the tick" busy={busy === r.id} disabled={incomplete || (!!busy && busy !== r.id)} onPress={() => decide(r, true)} style={{ flex: 1 }} />
          <Button small kind="ghost" label="Decline" disabled={!!busy} onPress={() => decide(r, false)} />
        </View>
      </>
    );
  }

  function renderPlus(r: PlusRequest) {
    return (
      <>
        {r.note ? <Text style={{ color: C.fg, lineHeight: 20 }}>{r.note}</Text> : <Text style={{ color: C.fg3, fontStyle: 'italic' }}>No note</Text>}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button small label="Approve: Plus for a month" busy={busy === r.id} disabled={!!busy && busy !== r.id} onPress={() => decide(r, true)} style={{ flex: 1 }} />
          <Button small kind="ghost" label="Decline" disabled={!!busy} onPress={() => decide(r, false)} />
        </View>
      </>
    );
  }

  return (
    <AdminFrame section="requests" title="Requests">
      <View accessibilityRole="tablist" style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 8 }}>
        {(['verify', 'plus'] as const).map((k) => {
          const n = waiting(k);
          const label = `${k === 'verify' ? 'Identity checks' : 'Plus'}${n ? ` · ${n}` : ''}`;
          return (
            <Pressable key={k} onPress={() => setKind(k)} accessibilityRole="tab" accessibilityLabel={label} accessibilityState={{ selected: kind === k }} style={({ pressed }) => ({ paddingHorizontal: 14, height: 34, borderRadius: 17, backgroundColor: kind === k ? C.fg : C.surface, justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}>
              <Text style={{ color: kind === k ? C.bg : C.fg, fontWeight: '600' }}>{label}</Text>
            </Pressable>
          );
        })}
      </View>
      {requests === null ? (
        error ? <ErrorNote message={error} onRetry={load} /> : <Loading />
      ) : (
        <FlatList
          data={shown}
          keyExtractor={(r) => r.id}
          extraData={busy}
          contentContainerStyle={{ paddingBottom: 40 }}
          ListEmptyComponent={
            kind === 'verify' ? (
              <Empty icon="idcard" title="No identity checks waiting" body="When a member asks for the blue tick, their document and selfie appear here." />
            ) : (
              <Empty icon="crown" title="No Plus requests waiting" body="Members whose church arranges Plus for them ask here." />
            )
          }
          renderItem={({ item: r }) => (
            <View style={{ marginHorizontal: 16, marginBottom: 12, padding: 14, borderRadius: 16, backgroundColor: C.surface, gap: 12 }}>
              <Pressable onPress={() => router.push(`/user/${r.user_id}`)} accessibilityRole="button" accessibilityLabel={`Open ${r.username ?? 'this member'}'s profile`} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Avatar uri={r.avatar_url} name={r.full_name ?? '?'} size={44} />
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={{ color: C.fg, fontWeight: '700' }}>{r.full_name || 'Member'}</Text>
                  <Text numberOfLines={1} style={{ color: C.fg2, fontSize: 13 }}>@{r.username ?? '…'} · {agoLong(r.created_at)}</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, height: 26, paddingHorizontal: 10, borderRadius: 13, backgroundColor: r.kind === 'plus' ? C.accentSoft : C.verified + '24' }}>
                  {r.kind === 'plus' ? <Icon name="crown" size={14} color={C.accent2} weight={2.2} /> : <VerifiedTick size={14} />}
                  <Text style={{ color: r.kind === 'plus' ? C.accent2 : C.verified, fontSize: 12.5, fontWeight: '700' }}>{r.kind === 'plus' ? 'Plus' : 'Tick'}</Text>
                </View>
              </Pressable>
              {r.kind === 'verify' ? renderVerify(r) : renderPlus(r)}
            </View>
          )}
        />
      )}

      <Modal visible={!!viewer} animationType="fade" onRequestClose={() => setViewer(null)} statusBarTranslucent>
        <View style={{ flex: 1, backgroundColor: '#000' }}>
          {/* Light clock and battery over the black, even on the White theme; gone again with the viewer. */}
          {viewer ? <StatusBar style="light" /> : null}
          {viewer ? <Image source={{ uri: viewer.url }} style={StyleSheet.absoluteFill} contentFit="contain" accessibilityLabel={viewer.label} /> : null}
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
