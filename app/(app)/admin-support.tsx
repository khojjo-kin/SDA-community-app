import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { AdminFrame, Chips, PageSpinner, usePagedList } from '../../src/components/AdminFrame';
import { Icon } from '../../src/components/Icon';
import { RowsSkeleton, SlowLine } from '../../src/components/Skeleton';
import { Avatar, Empty, ErrorNote } from '../../src/components/ui';
import { fetchSupportChats, fetchSupportTickets } from '../../src/lib/api';
import { supabase } from '../../src/lib/supabase';
import { agoLong, C } from '../../src/lib/theme';
import type { SupportChat, SupportTicket } from '../../src/lib/types';
import { agentActive, AssistantMark } from './support-chat';

type Channel = ReturnType<typeof supabase.channel>;
type Which = 'open' | 'all';

const keyOfChat = (c: SupportChat) => c.id;

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
      <Text selectable style={{ color: C.fg, lineHeight: 20 }}>{t.body}</Text>
      {t.reply ? (
        <View style={{ padding: 12, borderRadius: 12, backgroundColor: C.bg2, gap: 4 }}>
          <Text style={{ color: C.fg3, fontSize: 12.5 }}>Reply</Text>
          <Text selectable style={{ color: C.fg2, lineHeight: 20 }}>{t.reply}</Text>
        </View>
      ) : null}
    </View>
  );
}

/** One chat in the list: the member, when it last moved, and who is answering. */
const ChatRow = React.memo(function ChatRow({ c, onOpen }: { c: SupportChat; onOpen: (id: string) => void }) {
  const name = c.profile?.full_name || c.profile?.username || 'Member';
  const closed = c.status === 'closed';
  const live = agentActive(c);
  return (
    <Pressable
      onPress={() => onOpen(c.id)}
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
});

/** Support chats with members, most recent first. Open one to read it and answer under your own name. */
export default function AdminSupport() {
  const router = useRouter();
  const [which, setWhich] = useState<Which>('open');
  // Tickets from before live chat: kept readable under the list while there are any.
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [showTickets, setShowTickets] = useState(false);

  const fetchPage = useCallback((last: SupportChat | null) => fetchSupportChats(which, last?.updated_at), [which]);
  const list = usePagedList(fetchPage, { pageSize: 50, keyOf: keyOfChat });

  useFocusEffect(
    useCallback(() => {
      fetchSupportTickets(true).then(setTickets).catch(() => {});
    }, []),
  );

  // A new chat, a new message or an answer elsewhere moves a chat up the list: refresh when one changes.
  const reload = useRef(list.reload);
  reload.current = list.reload;
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
            // Several changes arrive together (a message updates its chat): one refresh for the lot.
            if (soon) clearTimeout(soon);
            soon = setTimeout(() => {
              soon = null;
              if (alive) reload.current();
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

  const open = useCallback((id: string) => router.push(`/admin-support/${id}` as any), [router]);
  const renderItem = useCallback(({ item }: { item: SupportChat }) => <ChatRow c={item} onOpen={open} />, [open]);

  const footer = (
    <>
      <PageSpinner active={list.paging} />
      {tickets.length ? (
        <View style={{ paddingTop: 12 }}>
          <Pressable onPress={() => setShowTickets(!showTickets)} accessibilityRole="button" accessibilityLabel={`Older tickets, ${tickets.length}`} accessibilityState={{ expanded: showTickets }} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, minHeight: 52, backgroundColor: pressed ? C.press : 'transparent' })}>
            <Icon name="archive" size={24} color={C.fg2} />
            <Text style={{ flex: 1, color: C.fg, fontSize: 16.5 }}>Older tickets</Text>
            <Text style={{ color: C.fg2, fontSize: 15 }}>{tickets.length}</Text>
            <Icon name={showTickets ? 'down' : 'right'} size={16} color={C.fg2} weight={2} />
          </Pressable>
          {showTickets ? <View style={{ paddingTop: 6 }}>{tickets.map((t) => <OldTicket key={t.id} t={t} />)}</View> : null}
        </View>
      ) : null}
    </>
  );

  return (
    <AdminFrame section="support" title="Support chats">
      <Chips
        value={which}
        onChange={setWhich}
        options={[
          { key: 'open', label: 'Open' },
          { key: 'all', label: 'All' },
        ]}
      />
      <SlowLine active={list.slow} />
      {list.items === null ? (
        list.error ? <ErrorNote message={list.error} onRetry={list.retry} /> : <RowsSkeleton count={8} avatar={48} padY={10} />
      ) : (
        <FlatList
          data={list.items}
          keyExtractor={keyOfChat}
          renderItem={renderItem}
          initialNumToRender={12}
          windowSize={11}
          onEndReached={list.more}
          onEndReachedThreshold={0.6}
          contentContainerStyle={{ paddingBottom: 60 }}
          refreshControl={<RefreshControl refreshing={list.refreshing} onRefresh={list.refresh} tintColor={C.fg2} />}
          ListEmptyComponent={<Empty icon="lifebuoy" title={which === 'open' ? 'Nothing open' : 'No chats yet'} />}
          ListFooterComponent={footer}
        />
      )}
    </AdminFrame>
  );
}
