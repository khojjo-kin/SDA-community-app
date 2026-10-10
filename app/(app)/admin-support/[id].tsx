import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { AdminFrame } from '../../../src/components/AdminFrame';
import { Icon } from '../../../src/components/Icon';
import { Avatar, Button, Empty, ErrorNote, Loading, useToast } from '../../../src/components/ui';
import { closeSupportChat, fetchSupportMessages, getProfile, sendAgentReply } from '../../../src/lib/api';
import { useAppFont } from '../../../src/lib/fonts';
import { useSession } from '../../../src/lib/session';
import { supabase } from '../../../src/lib/supabase';
import { C, errText } from '../../../src/lib/theme';
import type { Profile, SupportChat, SupportMessage } from '../../../src/lib/types';
import { agentActive, bubbleRows, localMessage, mergeMessage, reconcile, SupportBubble, SupportComposer, type SupportView, useSupportLive, useSupportTyping } from '../support-chat';

/** Tell the member "typing" at most this often while the admin types. */
const TYPING_EVERY_MS = 2000;
/** A safety net under Realtime: the conversation is fetched again this often. */
const POLL_MS = 10000;

/**
 * One support chat, from the team's side. Answering here puts your name on the reply, and the
 * assistant steps back for half an hour so the member hears from one voice at a time.
 */
export default function AdminSupportChat() {
  const params = useLocalSearchParams<{ id: string }>();
  const chatId = typeof params.id === 'string' ? params.id : '';
  const { me, profile } = useSession();
  const router = useRouter();
  const toast = useToast();
  const font = useAppFont();
  const [chat, setChat] = useState<SupportChat | null>(null);
  const [member, setMember] = useState<Profile | null>(null);
  const [messages, setMessages] = useState<SupportMessage[] | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading');
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [text, setText] = useState('');
  const [closing, setClosing] = useState(false);
  const lastTyping = useRef(0);
  const alive = useRef(true);
  // The same name the database puts on our replies (full name, or the username when there isn't one).
  const myName = (profile?.full_name || '').trim() || profile?.username || 'Support';

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // The chat itself has no fetch of its own in api.ts, so it is read here (admins can read every chat).
  useEffect(() => {
    if (!chatId) return;
    let live = true;
    setStatus('loading');
    (async () => {
      try {
        const { data, error: err } = await supabase.from('community_support_chats').select('*').eq('id', chatId).maybeSingle();
        if (err) throw err;
        if (!live) return;
        if (!data) {
          setStatus('missing');
          return;
        }
        const c = data as SupportChat;
        setChat(c);
        getProfile(c.user_id)
          .then((p) => {
            if (live) setMember(p);
          })
          .catch(() => {});
        const list = await fetchSupportMessages(chatId);
        if (!live) return;
        setMessages((prev) => reconcile(list, prev));
        setStatus('ready');
      } catch (e) {
        if (live) {
          setError(errText(e));
          setStatus('error');
        }
      }
    })();
    return () => {
      live = false;
    };
  }, [chatId, attempt]);

  const refetch = useCallback(() => {
    if (!chatId) return;
    fetchSupportMessages(chatId)
      .then((list) => {
        if (alive.current) setMessages((prev) => reconcile(list, prev));
      })
      .catch(() => {});
  }, [chatId]);

  useEffect(() => {
    if (status !== 'ready') return;
    const poll = setInterval(refetch, POLL_MS);
    return () => clearInterval(poll);
  }, [status, refetch]);

  useSupportLive(
    status === 'ready' ? chatId : undefined,
    (m) => setMessages((prev) => mergeMessage(prev, m)),
    (c) => setChat((prev) => (prev ? { ...prev, ...c, profile: prev.profile } : c)),
  );

  const sendTyping = useSupportTyping(status === 'ready' ? chatId : undefined);

  function change(t: string) {
    setText(t);
    // Enough to keep the member's "typing" showing (it lasts 4 seconds), without a message per key.
    if (t.trim() && Date.now() - lastTyping.current >= TYPING_EVERY_MS) {
      lastTyping.current = Date.now();
      sendTyping(myName);
    }
  }

  async function send() {
    const body = text.trim();
    if (!body || !chat) return;
    const local = localMessage(chat.id, me, 'agent', body, myName);
    setText('');
    // The next words typed count as a new burst of typing, told at once.
    lastTyping.current = 0;
    setMessages((prev) => [...(prev ?? []), local]);
    try {
      await sendAgentReply(me, chat.id, body);
      // The database hands the chat to us for half an hour; show it now rather than when the update lands.
      setChat((c) => (c ? { ...c, agent_id: me, agent_name: myName, status: 'open', ai_paused_until: new Date(Date.now() + 30 * 60e3).toISOString() } : c));
      refetch();
    } catch (e) {
      if (!alive.current) return;
      setMessages((prev) => (prev ?? []).filter((x) => x.id !== local.id));
      setText((t) => (t.trim() ? t : body));
      toast(errText(e));
    }
  }

  function close() {
    if (!chat || closing) return;
    Alert.alert('Close this chat?', 'The member can still read it. If they need more help, they can write again and it comes back to this list.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Close chat',
        style: 'destructive',
        onPress: () => {
          setClosing(true);
          closeSupportChat(chat.id)
            .then(() => {
              toast('Chat closed');
              if (!alive.current) return;
              setChat((c) => (c ? { ...c, status: 'closed' } : c));
              if (router.canGoBack()) router.back();
            })
            .catch((e) => toast(errText(e)))
            .finally(() => {
              if (alive.current) setClosing(false);
            });
        },
      },
    ]);
  }

  const memberName = member?.full_name || member?.username || 'Member';
  const view: SupportView = { side: 'team', me, memberName };
  const team = agentActive(chat);
  const rows = messages ? bubbleRows(messages) : [];
  const right =
    chat && chat.status === 'open' ? (
      <Button small kind="ghost" label="Close chat" busy={closing} onPress={close} />
    ) : chat ? (
      <Text style={{ color: C.fg3, fontSize: 14, fontWeight: '600', fontFamily: font }}>Closed</Text>
    ) : null;

  return (
    <AdminFrame section="support" title="Support chat" right={right}>
      {status === 'loading' ? (
        <Loading />
      ) : status === 'error' ? (
        <ErrorNote message={error} onRetry={() => setAttempt((n) => n + 1)} />
      ) : status === 'missing' || !chat ? (
        <Empty icon="lifebuoy" title="This chat isn't available" body="It may have been deleted along with the member's account." />
      ) : (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          {/* Who this is, and who is answering. */}
          <Pressable onPress={() => router.push(`/admin-member/${chat.user_id}` as any)} accessibilityRole="button" accessibilityLabel={`${memberName}, open in Members`} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 16, padding: 12, borderRadius: 16, backgroundColor: pressed ? C.surface2 : C.surface })}>
            <Avatar uri={member?.avatar_url} name={memberName} size={40} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text numberOfLines={1} style={{ color: C.fg, fontWeight: '700', fontSize: 15.5, fontFamily: font }}>{memberName}</Text>
              <Text numberOfLines={2} style={{ color: C.fg2, fontSize: 13, lineHeight: 17, fontFamily: font }}>
                {team ? `${chat.agent_name === myName ? 'You are' : `${chat.agent_name || 'The team'} is`} answering. The assistant is paused for now.` : 'The assistant is answering. Your reply takes over for half an hour.'}
              </Text>
            </View>
            <Icon name="right" size={16} color={C.fg2} weight={2} />
          </Pressable>
          <FlatList
            data={rows}
            inverted
            keyExtractor={(r) => r.m.id}
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 12, gap: 4 }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            renderItem={({ item }) => <SupportBubble m={item.m} view={view} first={item.first} stamp={item.stamp} />}
            ListEmptyComponent={<Text style={{ color: C.fg2, textAlign: 'center', padding: 24, fontFamily: font }}>No messages yet.</Text>}
          />
          <SupportComposer value={text} onChange={change} onSend={send} placeholder={`Reply as ${myName}…`} />
        </KeyboardAvoidingView>
      )}
    </AdminFrame>
  );
}
