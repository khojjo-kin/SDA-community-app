import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { AdminFrame } from '../../src/components/AdminFrame';
import { Icon } from '../../src/components/Icon';
import { Avatar, Empty, ErrorNote, Loading } from '../../src/components/ui';
import { fetchSupportChats, fetchSupportTickets } from '../../src/lib/api';
import { supabase } from '../../src/lib/supabase';
import { agoLong, C, errText } from '../../src/lib/theme';
import type { SupportChat, SupportTicket } from '../../src/lib/types';
import { agentActive, AssistantMark } from './support-chat';

type Channel = ReturnType<typeof supabase.channel>;

/** Who is looking after a chat: the assistant, or the last person from the team who answered. */
function WhoPill({ chat }: { chat: SupportChat }) {
  const person = !!chat.agent_name;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, height: 24, paddingHorizontal: 9, borderRadius: 12, backgroundColor: person ? C.close + '24' : C.accentSoft, maxWidth: 170 }}>
      {person ? null : <AssistantMark size={12} />}
      <Text numberOfLines={1} style={{ color: person ? C.close : C.accent2, fontSize: 12, fontWeight: '700', flexShrink: 1 }}>
        {person ? `Answered by ${chat.agent_name}` : 'With assistant'}
      </Text>
    </View>
  );
}

/** A function, not a table, so the colours are read from the theme in use when it is drawn. */
function ticketLook(status: SupportTicket['status']): { label: string; color: string } {
  if (status === 'open') return { label: 'Open', color: C.like };
  if (status === 'answered') return { label: 'Answered', color: C.accent2 };
  return { label: 'Closed', color: C.fg2 };
}

/** A ticket from before live chat, to read. Answering happens in chats now. */
function OldTicket({ t }: { t: SupportTicket }) {
  const look = ticketLook(t.status);
  return (
    <View style={{ marginHorizontal: 16, marginBottom: 10, padding: 14, borderRadius: 16, backgroundColor: C.surface, gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Avatar uri={t.avatar_url} name={t.full_name} size={32} />
        <View style={{ flex: 1 }}>
          <Text numberOfLines={1} style={{ color: C.fg, fontWeight: '700' }}>{t.subject || 'No subject'}</Text>
          <Text numberOfLines={1} style={{ color: C.fg2, fontSize: 12.5 }}>@{t.username} · {agoLong(t.created_at)}</Text>
        </View>
        <Text style={{ color: look.color, fontSize: 12, fontWeight: '700' }}>{look.label}</Text>
      </View>
      <Text style={{ color: C.fg, lineHeight: 20 }}>{t.body}</Text>
      {t.reply ? (
        <View style={{ padding: 12, borderRadius: 12, backgroundColor: C.bg2, gap: 4 }}>
          <Text style={{ color: C.fg3, fontSize: 12.5 }}>Reply</Text>
          <Text style={{ color: C.fg2, lineHeight: 20 }}>{t.reply}</Text>
        </View>
      ) : null}
    </View>
  );
}

/** Support chats with members, most recent first. Open one to read it and answer under your own name. */
export default function AdminSupport() {
  const router = useRouter();
  const [which, setWhich] = useState<'open' | 'all'>('open');
  const [chats, setChats] = useState<SupportChat[] | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  // Tickets from before live chat: kept readable under the list while there are any.
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [showTickets, setShowTickets] = useState(false);

  // Only the latest ask may fill the list, so a slow answer for the other tab can't land on this one.
  const asked = useRef(0);
  const load = useCallback(() => {
    const n = ++asked.current;
    setError('');
    return fetchSupportChats(which)
      .then((list) => {
        if (n === asked.current) setChats(list);
      })
      .catch((e) => {
        if (n === asked.current) setError(errText(e));
      });
  }, [which]);

  useFocusEffect(
    useCallback(() => {
      load();
      fetchSupportTickets(true).then(setTickets).catch(() => {});
    }, [load]),
  );

  // Switching tabs shows the loader rather than the other tab's chats.
  const firstTab = useRef(true);
  useEffect(() => {
    if (firstTab.current) {
      firstTab.current = false;
      return;
    }
    setChats(null);
  }, [which]);

  // A new chat, a new message or an answer elsewhere moves a chat up the list: reload when one changes.
  const loadRef = useRef(load);
  loadRef.current = load;
  useEffect(() => {
    let alive = true;
    let channel: Channel | null = null;
    let soon: ReturnType<typeof setTimeout> | null = null;
    supabase.realtime
      .setAuth()
      .catch(() => {})
      .then(() => {
        if (!alive) return;
        channel = supabase
          .channel(`support-chats-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'community_support_chats' }, () => {
            // Several changes arrive together (a message updates its chat): one reload for the lot.
            if (soon) clearTimeout(soon);
            soon = setTimeout(() => {
              soon = null;
              if (alive) loadRef.current();
            }, 400);
          })
          .subscribe();
      });
    return () => {
      alive = false;
      if (soon) clearTimeout(soon);
      if (channel) supabase.removeChannel(channel).catch(() => {});
    };
  }, []);

  async function pull() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  const footer = tickets.length ? (
    <View style={{ paddingTop: 12 }}>
      <Pressable onPress={() => setShowTickets(!showTickets)} accessibilityRole="button" accessibilityState={{ expanded: showTickets }} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, minHeight: 52, backgroundColor: pressed ? C.press : 'transparent' })}>
        <Icon name="archive" size={24} color={C.fg2} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: C.fg, fontSize: 16.5 }}>Older tickets</Text>
          <Text style={{ color: C.fg2, fontSize: 13.5 }}>Messages from before live chat, to read</Text>
        </View>
        <Text style={{ color: C.fg2, fontSize: 15 }}>{tickets.length}</Text>
        <Icon name={showTickets ? 'down' : 'right'} size={16} color={C.fg2} weight={2} />
      </Pressable>
      {showTickets ? <View style={{ paddingTop: 6 }}>{tickets.map((t) => <OldTicket key={t.id} t={t} />)}</View> : null}
    </View>
  ) : null;

  return (
    <AdminFrame section="support" title="Support chats">
      <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 8 }}>
        {(['open', 'all'] as const).map((w) => (
          <Pressable key={w} onPress={() => setWhich(w)} accessibilityRole="tab" accessibilityLabel={w === 'open' ? 'Open chats' : 'All chats'} accessibilityState={{ selected: which === w }} style={({ pressed }) => ({ paddingHorizontal: 14, height: 34, borderRadius: 17, backgroundColor: which === w ? C.fg : C.surface, justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}>
            <Text style={{ color: which === w ? C.bg : C.fg, fontWeight: '600' }}>{w === 'open' ? 'Open' : 'All'}</Text>
          </Pressable>
        ))}
      </View>
      {chats === null ? (
        error ? <ErrorNote message={error} onRetry={load} /> : <Loading />
      ) : (
        <FlatList
          data={chats}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ paddingBottom: 60 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={pull} tintColor={C.fg2} />}
          ListEmptyComponent={<Empty icon="lifebuoy" title={which === 'open' ? 'Nothing open' : 'No chats yet'} body={which === 'open' ? 'When a member starts a support chat, it appears here.' : 'Support chats with members appear here.'} />}
          ListFooterComponent={footer}
          renderItem={({ item: c }) => {
            const name = c.profile?.full_name || c.profile?.username || 'Member';
            const closed = c.status === 'closed';
            const live = agentActive(c);
            return (
              <Pressable
                onPress={() => router.push(`/admin-support/${c.id}` as any)}
                accessibilityRole="button"
                accessibilityLabel={`${name}, ${c.agent_name ? `answered by ${c.agent_name}` : 'with the assistant'}, ${agoLong(c.updated_at)}${closed ? ', closed' : ''}`}
                style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: pressed ? C.press : 'transparent', opacity: closed ? 0.6 : 1 })}>
                <Avatar uri={c.profile?.avatar_url} name={name} size={48} />
                <View style={{ flex: 1, gap: 3 }}>
                  <Text numberOfLines={1} style={{ color: C.fg, fontSize: 16, fontWeight: '700' }}>{name}</Text>
                  <Text numberOfLines={1} style={{ color: C.fg2, fontSize: 13 }}>
                    {c.profile?.username ? `@${c.profile.username} · ` : ''}
                    {agoLong(c.updated_at)}
                    {closed ? ' · Closed' : live ? ' · Team answering' : ''}
                  </Text>
                </View>
                <WhoPill chat={c} />
              </Pressable>
            );
          }}
        />
      )}
    </AdminFrame>
  );
}
