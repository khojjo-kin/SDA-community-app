import React, { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { AdminFrame } from '../../src/components/AdminFrame';
import { Icon } from '../../src/components/Icon';
import { Avatar, Button, Empty, ErrorNote, Loading, useToast } from '../../src/components/ui';
import { answerSupportTicket, closeSupportTicket, fetchSupportTickets } from '../../src/lib/api';
import { agoLong, C, errText } from '../../src/lib/theme';
import type { SupportTicket } from '../../src/lib/types';

const STATUS: Record<SupportTicket['status'], { label: string; color: string; bg: string }> = {
  open: { label: 'Open', color: C.like, bg: 'rgba(255,48,64,0.16)' },
  answered: { label: 'Answered', color: C.accent2, bg: 'rgba(31,191,90,0.14)' },
  closed: { label: 'Closed', color: C.fg2, bg: C.surface2 },
};

function StatusPill({ status }: { status: SupportTicket['status'] }) {
  const s = STATUS[status];
  return (
    <View style={{ height: 24, paddingHorizontal: 9, borderRadius: 12, backgroundColor: s.bg, justifyContent: 'center' }}>
      <Text style={{ color: s.color, fontSize: 12, fontWeight: '700' }}>{s.label}</Text>
    </View>
  );
}

/** Messages from members to the admins, answered here; the member reads the reply under Help and support. */
export default function AdminSupport() {
  const router = useRouter();
  const toast = useToast();
  const [which, setWhich] = useState<'open' | 'all'>('open');
  const [tickets, setTickets] = useState<SupportTicket[] | null>(null);
  const [error, setError] = useState('');
  const [openId, setOpenId] = useState('');
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState('');

  const load = useCallback(() => {
    fetchSupportTickets(which === 'all').then(setTickets).catch((e) => setError(errText(e)));
  }, [which]);
  useFocusEffect(load);

  function expand(t: SupportTicket) {
    if (openId === t.id) return setOpenId('');
    setOpenId(t.id);
    setReply(t.reply ?? '');
  }

  async function send(t: SupportTicket) {
    if (busy) return;
    if (!reply.trim()) return toast('Write a reply first');
    setBusy(t.id);
    try {
      await answerSupportTicket(t.id, reply);
      toast('Reply sent');
      setOpenId('');
      setReply('');
      load();
    } catch (e) {
      toast(errText(e));
    } finally {
      setBusy('');
    }
  }

  function close(t: SupportTicket) {
    Alert.alert('Close this ticket?', 'The member can still read your reply. They can open a new ticket if they need more help.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Close ticket', style: 'destructive', onPress: () => { closeSupportTicket(t.id).then(() => { toast('Closed'); setOpenId(''); load(); }).catch((e) => toast(errText(e))); } },
    ]);
  }

  return (
    <AdminFrame section="support" title="Support inbox">
      <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 8 }}>
        {(['open', 'all'] as const).map((w) => (
          <Pressable key={w} onPress={() => setWhich(w)} accessibilityRole="tab" accessibilityLabel={w === 'open' ? 'Open tickets' : 'All tickets'} accessibilityState={{ selected: which === w }} style={({ pressed }) => ({ paddingHorizontal: 14, height: 34, borderRadius: 17, backgroundColor: which === w ? C.fg : C.surface, justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}>
            <Text style={{ color: which === w ? C.bg : C.fg, fontWeight: '600' }}>{w === 'open' ? 'Open' : 'All'}</Text>
          </Pressable>
        ))}
      </View>
      {tickets === null ? (
        error ? <ErrorNote message={error} onRetry={load} /> : <Loading />
      ) : (
        <FlatList
          data={tickets}
          keyExtractor={(t) => t.id}
          extraData={[openId, reply, busy]}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 60 }}
          ListEmptyComponent={<Empty icon="lifebuoy" title={which === 'open' ? 'Nothing waiting' : 'No tickets yet'} body={which === 'open' ? 'Every ticket has been answered or closed.' : 'When a member writes to support, it appears here.'} />}
          renderItem={({ item: t }) => {
            const open = openId === t.id;
            return (
              <View style={{ marginHorizontal: 16, marginBottom: 12, borderRadius: 16, backgroundColor: C.surface, overflow: 'hidden' }}>
                <Pressable onPress={() => expand(t)} accessibilityRole="button" accessibilityLabel={`${t.subject}, from ${t.username}, ${STATUS[t.status].label}`} accessibilityState={{ expanded: open }} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, backgroundColor: pressed ? 'rgba(255,255,255,0.04)' : 'transparent' })}>
                  <Avatar uri={t.avatar_url} name={t.full_name} size={44} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text numberOfLines={open ? undefined : 1} style={{ color: C.fg, fontWeight: '700' }}>{t.subject || 'No subject'}</Text>
                    <Text numberOfLines={1} style={{ color: C.fg2, fontSize: 13 }}>@{t.username} · {agoLong(t.created_at)}</Text>
                  </View>
                  <StatusPill status={t.status} />
                  <Icon name={open ? 'down' : 'right'} size={16} color={C.fg2} weight={2} />
                </Pressable>
                {open ? (
                  <View style={{ paddingHorizontal: 14, paddingBottom: 14, gap: 12 }}>
                    <Text style={{ color: C.fg, lineHeight: 21 }}>{t.body}</Text>
                    <Pressable onPress={() => router.push(`/admin-member/${t.user_id}`)} accessibilityRole="button" accessibilityLabel={`Open ${t.username} in Members`} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, opacity: pressed ? 0.6 : 1 })}>
                      <Icon name="user" size={16} color={C.fg2} weight={2} />
                      <Text style={{ color: C.fg2, fontSize: 13.5 }}>{t.full_name} · open in Members</Text>
                    </Pressable>
                    {t.status === 'closed' ? (
                      t.reply ? (
                        <View style={{ padding: 12, borderRadius: 12, backgroundColor: C.bg2, gap: 4 }}>
                          <Text style={{ color: C.fg3, fontSize: 12.5 }}>Your reply</Text>
                          <Text style={{ color: C.fg2, lineHeight: 20 }}>{t.reply}</Text>
                        </View>
                      ) : null
                    ) : (
                      <>
                        <TextInput
                          value={reply}
                          onChangeText={setReply}
                          placeholder={t.reply ? 'Change your reply' : 'Write a reply'}
                          placeholderTextColor={C.fg3}
                          multiline
                          maxLength={4000}
                          keyboardAppearance="dark"
                          accessibilityLabel="Reply"
                          style={{ minHeight: 90, color: C.fg, fontSize: 16, padding: 12, borderRadius: 12, backgroundColor: C.bg2, textAlignVertical: 'top' }}
                        />
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                          <Button small label={t.reply ? 'Send again' : 'Send reply'} busy={busy === t.id} onPress={() => send(t)} style={{ flex: 1 }} />
                          <Button small kind="ghost" label="Close" disabled={!!busy} onPress={() => close(t)} />
                        </View>
                      </>
                    )}
                  </View>
                ) : null}
              </View>
            );
          }}
        />
      )}
    </AdminFrame>
  );
}
