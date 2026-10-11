import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useKeyboardOpen } from '../../src/components/AssistiveButton';
import { AgentTyping, AssistantThinking } from '../../src/components/ThinkingOrb';
import { ErrorNote, Loading, Screen, ScreenHeader, useToast } from '../../src/components/ui';
import { fetchSupportMessages, findSupportChat, sendSupportMessage, startSupportChat, withTimeout } from '../../src/lib/api';
import { useAppFont } from '../../src/lib/fonts';
import { tap } from '../../src/lib/haptics';
import { useT } from '../../src/lib/i18n';
import { useSession } from '../../src/lib/session';
import { supabase } from '../../src/lib/supabase';
import { BUBBLE, C, chatStamp, errText } from '../../src/lib/theme';
import type { SupportChat, SupportMessage } from '../../src/lib/types';

/*
 * Live support, as a conversation. The member writes; the support assistant answers straight away;
 * when someone from the team steps in (an admin answering from app/(app)/admin-support/[id].tsx), the
 * assistant keeps quiet for a while and the member sees that person's name on their replies.
 *
 * The bubbles, the live updates and the typing room below are shared with that admin screen, which
 * imports them from here, so both sides of the conversation look and behave the same.
 */

type Channel = ReturnType<typeof supabase.channel>;

/** How long "… is typing" stays up after the last sign of typing. */
const TYPING_MS = 4000;
/** How often the conversation is fetched again, in case a live update was missed. */
const POLL_MS = 10000;
/** Messages further apart than this get a date and time between them. */
const STAMP_GAP_MS = 60 * 60e3;

/* ---------- shared: is a person from the team answering? ---------- */

/** True while someone from the team has taken the chat over and the assistant is keeping quiet. */
export function agentActive(chat: Pick<SupportChat, 'ai_paused_until'> | null | undefined, now = Date.now()): boolean {
  return !!chat?.ai_paused_until && Date.parse(chat.ai_paused_until) > now;
}

/* ---------- shared: keeping the list in step with the server ---------- */

const isLocal = (m: SupportMessage) => m.id.startsWith('local-');

/** A message just sent from this phone, shown at once and swapped for the real one when it arrives. */
export function localMessage(chatId: string, me: string, role: 'member' | 'agent', text: string, agentName = ''): SupportMessage {
  return { id: `local-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, chat_id: chatId, sender_id: me, role, agent_name: agentName, text, created_at: new Date().toISOString() };
}

/** Is this server message the one a local message stood in for? Same sender, same words. */
const sameAs = (local: SupportMessage, real: SupportMessage) => real.role === local.role && real.sender_id === local.sender_id && real.text.trim() === local.text.trim();

/** One message from Realtime: replaces the local copy it stands for, or is added at the end. */
export function mergeMessage(prev: SupportMessage[] | null, m: SupportMessage): SupportMessage[] {
  const list = prev ?? [];
  if (list.some((x) => x.id === m.id)) return list;
  const i = list.findIndex((x) => isLocal(x) && sameAs(x, m));
  if (i >= 0) return [...list.slice(0, i), m, ...list.slice(i + 1)];
  return [...list, m];
}

/**
 * The server's list, plus any local messages it doesn't have yet (still on their way). A local message
 * is matched only to a server message this list didn't already have, so saying "Thanks" twice works,
 * and no clocks are compared (the phone's may be wrong).
 */
export function reconcile(server: SupportMessage[], prev: SupportMessage[] | null): SupportMessage[] {
  const known = new Set((prev ?? []).filter((m) => !isLocal(m)).map((m) => m.id));
  const claimed = new Set<string>();
  const waiting = (prev ?? []).filter(isLocal).filter((local) => {
    const real = server.find((r) => !known.has(r.id) && !claimed.has(r.id) && sameAs(local, r));
    if (!real) return true;
    claimed.add(real.id);
    return false;
  });
  return [...server, ...waiting];
}

/* ---------- shared: live updates ---------- */

/**
 * New messages in this chat and changes to the chat itself (an admin stepping in, the chat closing),
 * over Realtime. Each screen gets a channel of its own name, as chats do, so two screens never share one.
 */
export function useSupportLive(chatId: string | undefined, onMessage: (m: SupportMessage) => void, onChat: (c: SupportChat) => void) {
  const messageRef = useRef(onMessage);
  messageRef.current = onMessage;
  const chatRef = useRef(onChat);
  chatRef.current = onChat;
  useEffect(() => {
    if (!chatId) return;
    let alive = true;
    let channel: Channel | null = null;
    // The sign-in token first, so the server knows whose rows these are.
    supabase.realtime
      .setAuth()
      .catch(() => {})
      .then(() => {
        if (!alive) return;
        channel = supabase
          .channel(`support-chat-${chatId}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`)
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'community_support_messages', filter: `chat_id=eq.${chatId}` }, (payload) => {
            if (alive) messageRef.current(payload.new as SupportMessage);
          })
          .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'community_support_chats', filter: `id=eq.${chatId}` }, (payload) => {
            if (alive) chatRef.current(payload.new as SupportChat);
          })
          .subscribe();
      });
    return () => {
      alive = false;
      if (channel) supabase.removeChannel(channel).catch(() => {});
    };
  }, [chatId]);
}

/* ---------- shared: the typing room ---------- */

/*
 * "Someone from the team is typing" travels over a broadcast channel both phones join by the same
 * name, support:<chat id>. realtime-js hands back the same channel object for the same name, so if
 * one phone has the chat open twice (an admin testing their own chat), both screens share it and the
 * last to leave closes it. A screen opened while the room is still closing waits for that first.
 */
type Room = { channel: Channel; users: number; closing: Promise<unknown> | null; listeners: Set<(payload: { name?: unknown }) => void> };
const rooms = new Map<string, Room>();

async function joinRoom(chatId: string, listener: (payload: { name?: unknown }) => void): Promise<{ send: (name: string) => void; leave: () => void }> {
  let room = rooms.get(chatId);
  if (room?.closing) {
    await room.closing;
    room = rooms.get(chatId);
  }
  if (!room) {
    await supabase.realtime.setAuth().catch(() => {});
    // Another screen may have opened it while we waited.
    room = rooms.get(chatId);
    if (!room) {
      const listeners: Room['listeners'] = new Set();
      const channel = supabase.channel(`support:${chatId}`, { config: { broadcast: { self: false } } });
      channel.on('broadcast', { event: 'typing' }, ({ payload }) => listeners.forEach((l) => l(payload ?? {})));
      channel.subscribe();
      room = { channel, users: 0, closing: null, listeners };
      rooms.set(chatId, room);
    }
  }
  const mine = room;
  mine.users++;
  mine.listeners.add(listener);
  let left = false;
  return {
    send: (name: string) => {
      if (left) return;
      mine.channel.send({ type: 'broadcast', event: 'typing', payload: { name: name.slice(0, 80) } }).catch(() => {});
    },
    leave: () => {
      if (left) return;
      left = true;
      mine.listeners.delete(listener);
      mine.users--;
      if (mine.users > 0 || mine.closing) return;
      mine.closing = supabase
        .removeChannel(mine.channel)
        .catch(() => {})
        .finally(() => {
          if (rooms.get(chatId) === mine) rooms.delete(chatId);
        });
    },
  };
}

/** Joins the chat's typing room while the screen is open. Returns a function that tells the other side "typing". */
export function useSupportTyping(chatId: string | undefined, onTyping?: (name: string) => void): (name: string) => void {
  const cb = useRef(onTyping);
  cb.current = onTyping;
  const joined = useRef<{ send: (name: string) => void; leave: () => void } | null>(null);
  useEffect(() => {
    if (!chatId) return;
    let alive = true;
    let mine: { send: (name: string) => void; leave: () => void } | null = null;
    joinRoom(chatId, (payload) => {
      if (alive && typeof payload.name === 'string' && payload.name.trim()) cb.current?.(payload.name.trim());
    })
      .then((j) => {
        if (!alive) {
          j.leave();
          return;
        }
        mine = j;
        joined.current = j;
      })
      .catch(() => {});
    return () => {
      alive = false;
      joined.current = null;
      mine?.leave();
    };
  }, [chatId]);
  return useCallback((name: string) => joined.current?.send(name), []);
}

/* ---------- shared: the bubbles ---------- */

/** The assistant's small mark: the orb's colours, standing still (a list of moving orbs would be a lot). */
export function AssistantMark({ size = 18 }: { size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden' }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <LinearGradient colors={['#9be15d', '#1fbf5a', '#0fb5a5', '#f5c84b']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1 }} />
      <View style={{ position: 'absolute', left: size * 0.22, top: size * 0.16, width: size * 0.26, height: size * 0.18, borderRadius: size, backgroundColor: 'rgba(255,255,255,0.55)' }} />
    </View>
  );
}

function TeamBadge() {
  const t = useT();
  return (
    <View style={{ paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6, backgroundColor: C.accentSoft }}>
      <Text style={{ color: C.accent2, fontSize: 11, fontWeight: '700' }}>{t('support.team')}</Text>
    </View>
  );
}

/**
 * Whose point of view the conversation is drawn from. The member sees their own words on the right;
 * the team (admins) see the member on the left and the support side (assistant and team) on the right.
 */
export type SupportView = { side: 'member' } | { side: 'team'; me: string; memberName: string };

/** The member's own point of view: one object, so the memoised bubbles see the same one every time. */
const MEMBER_VIEW: SupportView = { side: 'member' };
const keyOfSupportRow = (r: { m: SupportMessage }) => r.m.id;

/** The small line above a run of messages from one sender. */
function Label({ m, view }: { m: SupportMessage; view: SupportView }) {
  const font = useAppFont();
  const t = useT();
  const style = { color: C.fg3, fontSize: 12.5, fontFamily: font };
  if (m.role === 'ai') {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <AssistantMark size={18} />
        <Text style={style}>{t('support.assistant')}</Text>
      </View>
    );
  }
  if (m.role === 'agent') {
    const name = view.side === 'team' && m.sender_id === view.me ? t('support.you') : m.agent_name || t('support.title');
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Text style={style}>{t('support.fromTeam', { name })}</Text>
        <TeamBadge />
      </View>
    );
  }
  // The member's own messages need no label on their side; the team sees who wrote.
  return view.side === 'team' ? <Text style={style}>{view.memberName}</Text> : null;
}

/**
 * One message. `first` is set on the first of a run from the same sender, which carries the label.
 * Memoised: the screen draws again on every key typed, which changes no message.
 */
export const SupportBubble = React.memo(function SupportBubble({ m, view, first, stamp }: { m: SupportMessage; view: SupportView; first: boolean; stamp: boolean }) {
  const font = useAppFont();
  const right = view.side === 'member' ? m.role === 'member' : m.role !== 'member';
  // Green is "this side's" words: the member's own on their phone, the team's own replies on an admin's.
  const green = view.side === 'member' ? m.role === 'member' : m.role === 'agent';
  const shape = { borderRadius: 20, paddingHorizontal: 15, paddingVertical: 10 };
  const words = (
    <Text selectable style={{ color: green ? '#ffffff' : C.fg, fontSize: 16, lineHeight: 22, fontFamily: font }}>
      {m.text}
    </Text>
  );
  const label = first ? <Label m={m} view={view} /> : null;
  return (
    <View style={{ paddingTop: first ? 8 : 0 }}>
      {stamp ? <Text style={{ color: C.fg3, fontSize: 12, letterSpacing: 0.2, textAlign: 'center', paddingTop: 12, paddingBottom: 8 }}>{chatStamp(m.created_at)}</Text> : null}
      <View style={{ alignSelf: right ? 'flex-end' : 'flex-start', maxWidth: '84%', gap: 4, alignItems: right ? 'flex-end' : 'flex-start', opacity: m.id.startsWith('local-') ? 0.7 : 1 }}>
        {label}
        {green ? (
          <LinearGradient colors={[BUBBLE[0], BUBBLE[1]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={shape}>
            {words}
          </LinearGradient>
        ) : (
          // The assistant's answers sit on a faint wash of green on the team's side, so they stand apart from the team's own.
          <View style={[shape, { backgroundColor: view.side === 'team' && m.role === 'ai' ? C.accentSoft : C.surface2 }]}>{words}</View>
        )}
      </View>
    </View>
  );
});

/**
 * The rows for an inverted list (newest first), each knowing whether it starts a run (gets a label)
 * and whether a date goes above it.
 */
export function bubbleRows(messages: SupportMessage[]): { m: SupportMessage; first: boolean; stamp: boolean }[] {
  const key = (m: SupportMessage) => `${m.role}:${m.role === 'agent' ? m.sender_id ?? m.agent_name : ''}`;
  const rows = messages.map((m, i) => {
    const before = messages[i - 1];
    const stamp = !before || Date.parse(m.created_at) - Date.parse(before.created_at) > STAMP_GAP_MS;
    return { m, first: !before || stamp || key(before) !== key(m), stamp };
  });
  return rows.reverse();
}

/** The message box: grows with the words, Send greyed out until there is something to send. */
export function SupportComposer({ value, onChange, onSend, placeholder, disabled }: { value: string; onChange: (t: string) => void; onSend: () => void; placeholder: string; disabled?: boolean }) {
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardOpen();
  const font = useAppFont();
  const fontBold = useAppFont('bold');
  const t = useT();
  const empty = !value.trim();
  const off = empty || !!disabled;
  return (
    <View style={{ marginHorizontal: 10, marginTop: 6, marginBottom: keyboard ? 8 : Math.max(insets.bottom, 8) + 4 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', minHeight: 52, paddingLeft: 8, paddingRight: 6, borderRadius: 26, backgroundColor: C.inputBar }}>
        <TextInput
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={C.fg2}
          multiline
          maxLength={4000}
          keyboardAppearance={C.blurTint}
          accessibilityLabel={placeholder}
          style={{ flex: 1, color: C.fg, fontSize: 17, minHeight: 52, maxHeight: 130, paddingHorizontal: 10, paddingTop: 15, paddingBottom: 15, fontFamily: font }}
        />
        <Pressable onPress={off ? undefined : onSend} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('common.send')} accessibilityState={{ disabled: off }} style={{ paddingHorizontal: 10, height: 52, justifyContent: 'center' }}>
          <Text style={{ color: C.accent2, fontWeight: '700', fontSize: 16.5, opacity: off ? 0.35 : 1, fontFamily: fontBold }}>{t('common.send')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

/* ---------- the member's screen ---------- */

export default function SupportChatScreen() {
  const { me, profile } = useSession();
  const toast = useToast();
  const font = useAppFont();
  const t = useT();
  const [chat, setChat] = useState<SupportChat | null>(null);
  const [messages, setMessages] = useState<SupportMessage[] | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [text, setText] = useState('');
  // Messages on their way to the assistant; while any are, and nobody from the team is here, the orb shows.
  const [waiting, setWaiting] = useState(0);
  const [typing, setTyping] = useState('');
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alive = useRef(true);
  // The chat being made for the first message, so a second quick message doesn't make another.
  const starting = useRef<Promise<SupportChat> | null>(null);
  // Redraws once a minute, so the team's half hour running out shows without anything else happening.
  const [, setTick] = useState(0);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (typingTimer.current) clearTimeout(typingTimer.current);
    };
  }, []);

  // Find my latest chat (open or closed), then its messages. A chat is only made when I first write.
  useEffect(() => {
    if (!me) return;
    let live = true;
    setError('');
    (async () => {
      try {
        // With deadlines, so a request that never answers ends in Try again rather than loading for good.
        const c = await withTimeout(findSupportChat(me));
        if (!live) return;
        if (!c) {
          setMessages((prev) => prev ?? []);
          return;
        }
        setChat(c);
        const list = await withTimeout(fetchSupportMessages(c.id));
        if (live) setMessages((prev) => reconcile(list, prev));
      } catch (e) {
        if (live) setError(errText(e));
      }
    })();
    return () => {
      live = false;
    };
  }, [me, attempt]);

  const chatId = chat?.id;
  const refetch = useCallback(async () => {
    if (!chatId) return;
    try {
      const list = await fetchSupportMessages(chatId);
      if (alive.current) setMessages((prev) => reconcile(list, prev));
    } catch {
      // The next poll or live update brings it.
    }
  }, [chatId]);

  // A safety net under Realtime, and the minute tick.
  useEffect(() => {
    if (!chatId) return;
    const poll = setInterval(() => {
      refetch();
    }, POLL_MS);
    const minute = setInterval(() => setTick((n) => n + 1), 60e3);
    return () => {
      clearInterval(poll);
      clearInterval(minute);
    };
  }, [chatId, refetch]);

  const hideTyping = useCallback(() => {
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = null;
    setTyping('');
  }, []);

  useSupportLive(
    chatId,
    (m) => {
      setMessages((prev) => mergeMessage(prev, m));
      if (m.role === 'agent') {
        hideTyping();
        // The database gives the chat to this person for half an hour; mirror it until the chat's own update lands.
        setChat((c) => (c ? { ...c, agent_id: m.sender_id, agent_name: m.agent_name, status: 'open', ai_paused_until: agentActive(c) ? c.ai_paused_until : new Date(Date.now() + 30 * 60e3).toISOString() } : c));
      }
    },
    (c) => setChat((prev) => (prev ? { ...prev, ...c, profile: prev.profile } : c)),
  );

  useSupportTyping(chatId, (name) => {
    setTyping(name);
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => {
      typingTimer.current = null;
      setTyping('');
    }, TYPING_MS);
  });

  /**
   * Your message is in the conversation the moment you press Send, and the box is clear for the next
   * one; if it can't be sent it comes out again and its words go back in the box.
   */
  async function send() {
    const body = text.trim();
    if (!body || messages === null) return;
    tap();
    const local = localMessage(chat?.id ?? '', me, 'member', body);
    // What was already here, so a failed send can tell whether this message reached the server.
    const before = new Set((messages ?? []).map((m) => m.id));
    setText('');
    setMessages((prev) => [...(prev ?? []), local]);
    setWaiting((n) => n + 1);
    const undo = (e: unknown) => {
      setMessages((prev) => (prev ?? []).filter((x) => x.id !== local.id));
      // Put the words back so nothing typed is lost, unless something new has been typed since.
      setText((typed) => (typed.trim() ? typed : body));
      toast(errText(e));
    };
    try {
      let target = chat;
      if (!target) {
        // The first message starts the chat (two quick sends share the one being made).
        try {
          starting.current ??= startSupportChat(me);
          target = await starting.current;
        } catch (e) {
          starting.current = null;
          if (alive.current) undo(e);
          return;
        }
        if (!alive.current) return;
        const made = target;
        setChat((c) => c ?? made);
      }
      const id = target.id;
      // Writing again opens a chat the team had closed.
      setChat((c) => (c ? { ...c, status: 'open' } : c));
      try {
        const res = await sendSupportMessage(me, id, body);
        if (res.answered_by === 'agent') setChat((c) => (c && !agentActive(c) ? { ...c, ai_paused_until: new Date(Date.now() + 30 * 60e3).toISOString() } : c));
        // The answer is saved by now; fetch it before the orb goes, in case its live update hasn't arrived.
        const list = await fetchSupportMessages(id).catch(() => null);
        if (list && alive.current) setMessages((prev) => reconcile(list, prev));
      } catch (e) {
        // Either the message didn't save, or it did and the assistant was too slow to answer. Ask the server which.
        const list = await fetchSupportMessages(id).catch(() => null);
        if (!alive.current) return;
        const saved = !!list?.some((r) => !before.has(r.id) && sameAs(local, r));
        if (saved && list) setMessages((prev) => reconcile(list, prev));
        else undo(e);
      }
    } finally {
      if (alive.current) setWaiting((n) => Math.max(0, n - 1));
    }
  }

  const first = (profile?.full_name || '').trim().split(/\s+/)[0] || profile?.username || '';
  const team = agentActive(chat);
  const last = messages?.[messages.length - 1];
  const thinking = waiting > 0 && !team && last?.role === 'member';
  // Worked out again only when the messages change, not on every key typed.
  const rows = useMemo(() => (messages ? bubbleRows(messages) : []), [messages]);
  const renderRow = useCallback(({ item }: { item: { m: SupportMessage; first: boolean; stamp: boolean } }) => <SupportBubble m={item.m} view={MEMBER_VIEW} first={item.first} stamp={item.stamp} />, []);
  const view = MEMBER_VIEW;

  return (
    <Screen>
      <ScreenHeader title={t('support.title')} />
      {/* Who is answering: the assistant, or a named person from the team. */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingBottom: 8, marginTop: -4, paddingHorizontal: 16 }}>
        {team ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: C.ok }} /> : <AssistantMark size={14} />}
        <Text numberOfLines={1} style={{ color: C.fg2, fontSize: 13, fontFamily: font, flexShrink: 1 }}>{team ? t('support.agentHere', { name: chat?.agent_name || t('support.someone') }) : t('support.assistant')}</Text>
      </View>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {messages === null ? (
          <View style={{ flex: 1 }}>{error ? <ErrorNote message={error} onRetry={() => setAttempt((n) => n + 1)} /> : <Loading />}</View>
        ) : (
          <FlatList
            data={rows}
            inverted
            keyExtractor={keyOfSupportRow}
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 12, gap: 4 }}
            // Dragging the conversation puts the keyboard away with it (the box follows it down).
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            renderItem={renderRow}
            // Inverted: the "header" sits at the bottom, under the newest message.
            ListHeaderComponent={
              <View style={{ paddingTop: 6 }}>
                {thinking ? <AssistantThinking name={t('support.assistantName')} /> : null}
                {/* Someone from the team can start typing while the assistant is still working on its answer: both show. */}
                {typing ? <AgentTyping name={typing} /> : null}
                {chat?.status === 'closed' && !waiting ? (
                  <Text style={{ color: C.fg3, fontSize: 13, textAlign: 'center', paddingTop: 10, lineHeight: 18, fontFamily: font }}>{t('support.closed')}</Text>
                ) : null}
              </View>
            }
            // …and the "footer" at the top: a greeting from the assistant, not stored anywhere.
            ListFooterComponent={
              <View style={{ paddingBottom: 6 }}>
                <SupportBubble m={{ id: 'hello', chat_id: chatId ?? '', sender_id: null, role: 'ai', agent_name: '', text: first ? t('support.greeting', { name: first }) : t('support.greetingNoName'), created_at: chat?.created_at ?? new Date().toISOString() }} view={view} first stamp={false} />
              </View>
            }
          />
        )}
        <SupportComposer value={text} onChange={setText} onSend={send} placeholder={t('support.placeholder')} disabled={messages === null} />
      </KeyboardAvoidingView>
    </Screen>
  );
}
