import React, { useCallback, useRef, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { AdminFrame } from '../../src/components/AdminFrame';
import { VerifiedTick } from '../../src/components/Icon';
import { Avatar, Button, Empty, ErrorNote, Loading, Screen, ScreenHeader, SectionLabel, useToast } from '../../src/components/ui';
import { decidePublisher, fetchPublishers } from '../../src/lib/api';
import { useT } from '../../src/lib/i18n';
import { useSession } from '../../src/lib/session';
import { agoLong, C, errText } from '../../src/lib/theme';
import type { Publisher } from '../../src/lib/types';

/** Admins: who may publish in Sabbath School. Requests to approve or decline, and publishers to revoke. */
export default function AdminPublishers() {
  const router = useRouter();
  const toast = useToast();
  const t = useT();
  const { profile } = useSession();
  const admin = !!profile?.admin_role;
  const [list, setList] = useState<Publisher[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  /** Set at once on the first tap, so a quick second tap can't decide twice. */
  const deciding = useRef(false);
  const hasList = useRef(false);
  hasList.current = list !== null;

  const load = useCallback(() => {
    if (!admin) return;
    setError('');
    fetchPublishers()
      .then(setList)
      .catch((e) => {
        // With the list showing, a failed refresh keeps it and says why.
        if (hasList.current) toast(errText(e));
        else setError(errText(e));
      })
      .finally(() => setRefreshing(false));
  }, [admin, toast]);
  useFocusEffect(load);

  const nameOf = (p: Publisher) => p.profile?.full_name || p.profile?.username || '?';

  async function decide(p: Publisher, status: 'approved' | 'rejected' | 'revoked') {
    if (deciding.current) return;
    deciding.current = true;
    setBusy(p.user_id);
    try {
      await decidePublisher(p.user_id, status);
      const at = new Date().toISOString();
      setList((l) => (l ?? []).flatMap((x) => (x.user_id !== p.user_id ? [x] : status === 'approved' ? [{ ...x, status, decided_at: at }] : [])));
      toast(status === 'approved' ? t('adminPub.approvedToast', { name: nameOf(p) }) : status === 'rejected' ? t('adminPub.declinedToast') : t('adminPub.revokedToast', { name: nameOf(p) }));
    } catch (e) {
      toast(errText(e));
    } finally {
      deciding.current = false;
      setBusy('');
    }
  }

  function confirm(p: Publisher, status: 'rejected' | 'revoked') {
    const revoke = status === 'revoked';
    Alert.alert(t(revoke ? 'adminPub.revokeQuestion' : 'adminPub.declineQuestion', { name: nameOf(p) }), undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: revoke ? t('adminPub.revoke') : t('common.decline'), style: 'destructive', onPress: () => decide(p, status) },
    ]);
  }

  if (!admin) {
    return (
      <Screen>
        <ScreenHeader title={t('adminPub.title')} />
        <Empty icon="shield" title={t('adminPub.adminsOnly')} />
      </Screen>
    );
  }

  const card = (p: Publisher) => {
    const who = p.profile;
    const pending = p.status === 'pending';
    return (
      <View key={p.user_id} style={{ marginHorizontal: 16, marginBottom: 12, padding: 14, borderRadius: 16, backgroundColor: C.surface, gap: 12 }}>
        <Pressable onPress={() => router.push(`/user/${p.user_id}` as any)} accessibilityRole="button" accessibilityLabel={nameOf(p)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, opacity: pressed ? 0.7 : 1 })}>
          <Avatar uri={who?.avatar_url} name={nameOf(p)} size={44} />
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <Text numberOfLines={1} style={{ color: C.fg, fontSize: 16, fontWeight: '700', flexShrink: 1 }}>{nameOf(p)}</Text>
              {who?.verified ? <VerifiedTick size={15} /> : null}
            </View>
            <Text numberOfLines={1} style={{ color: C.fg2, fontSize: 13 }}>
              {[who?.username ? `@${who.username}` : '', agoLong(pending ? p.created_at : p.decided_at ?? p.created_at)].filter(Boolean).join(' · ')}
            </Text>
          </View>
        </Pressable>
        {p.note.trim() ? <Text style={{ color: C.fg, fontSize: 15, lineHeight: 21 }}>{p.note.trim()}</Text> : <Text style={{ color: C.fg3, fontSize: 14 }}>{t('adminPub.noNote')}</Text>}
        {pending ? (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button small label={t('adminPub.approve')} busy={busy === p.user_id} disabled={!!busy && busy !== p.user_id} onPress={() => decide(p, 'approved')} style={{ flex: 1 }} />
            <Button small kind="ghost" label={t('common.decline')} disabled={!!busy} onPress={() => confirm(p, 'rejected')} />
          </View>
        ) : (
          <Button small kind="ghost" label={t('adminPub.revoke')} busy={busy === p.user_id} disabled={!!busy && busy !== p.user_id} onPress={() => confirm(p, 'revoked')} style={{ alignSelf: 'flex-start' }} />
        )}
      </View>
    );
  };

  const pending = (list ?? []).filter((p) => p.status === 'pending');
  const approved = (list ?? []).filter((p) => p.status === 'approved').sort((a, b) => (b.decided_at ?? '').localeCompare(a.decided_at ?? ''));

  return (
    <AdminFrame section="publishers" title={t('adminPub.title')}>
      {list === null ? (
        error ? <ErrorNote message={error} onRetry={load} /> : <Loading />
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 48 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={C.fg2} />}>
          <SectionLabel>{`${t('adminPub.requests')}${pending.length ? ` · ${pending.length}` : ''}`}</SectionLabel>
          {pending.length ? pending.map(card) : <Text style={{ color: C.fg3, paddingHorizontal: 16, paddingBottom: 8 }}>{t('adminPub.noRequests')}</Text>}
          <SectionLabel>{`${t('adminPub.title')}${approved.length ? ` · ${approved.length}` : ''}`}</SectionLabel>
          {approved.length ? approved.map(card) : <Text style={{ color: C.fg3, paddingHorizontal: 16 }}>{t('adminPub.noPublishers')}</Text>}
        </ScrollView>
      )}
    </AdminFrame>
  );
}
