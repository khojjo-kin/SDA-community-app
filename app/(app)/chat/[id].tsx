import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { thumbOf } from '../../../src/components/Grid';
import { Icon } from '../../../src/components/Icon';
import { Avatar, Empty, ErrorNote, IconButton, Loading, Screen, useToast } from '../../../src/components/ui';
import { fetchMessages, fetchThread, markThreadRead, sendMessage, uploadImage } from '../../../src/lib/api';
import { pickFromLibrary } from '../../../src/lib/pick';
import { useSession } from '../../../src/lib/session';
import { getPostNow } from '../../../src/lib/store';
import { supabase } from '../../../src/lib/supabase';
import { C, errText } from '../../../src/lib/theme';
import type { Message, Thread } from '../../../src/lib/types';

function stamp(iso: string) {
  return new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function Chat() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const threadId = String(id);
  const { me } = useSession();
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const [thread, setThread] = useState<Thread | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error' | 'missing'>('loading');
  const [error, setError] = useState('');
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const count = useRef(0);

  const load = useCallback(async () => {
    try {
      const list = await fetchMessages(threadId);
      setMessages(list);
      setStatus((s) => (s === 'missing' ? s : 'ready'));
      if (list.length !== count.current) {
        count.current = list.length;
        if (list.length && list[list.length - 1].sender_id !== me) markThreadRead(me, threadId);
      }
    } catch (e) {
      setError(errText(e));
      setStatus((s) => (s === 'ready' ? 'ready' : 'error'));
    }
  }, [threadId, me]);

  useEffect(() => {
    fetchThread(threadId)
      .then((t) => {
        if (!t) setStatus('missing');
        else setThread(t);
      })
      .catch(() => {});
    load();
    markThreadRead(me, threadId);
    const timer = setInterval(load, 6000);
    const channel = supabase
      .channel(`thread-${threadId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'community_messages', filter: `thread_id=eq.${threadId}` }, () => { load(); })
      .subscribe();
    return () => {
      clearInterval(timer);
      supabase.removeChannel(channel);
    };
  }, [threadId, me, load]);

  async function send(msg: { text?: string; media_url?: string }) {
    if (sending) return;
    setSending(true);
    try {
      await sendMessage(me, threadId, msg);
      if (msg.text !== undefined) setText('');
      await load();
    } catch (e) {
      toast(errText(e));
    } finally {
      setSending(false);
    }
  }

  async function photo() {
    try {
      const [a] = await pickFromLibrary();
      if (!a) return;
      setSending(true);
      const m = await uploadImage(me, a.uri, a.width, 1280);
      setSending(false);
      await send({ media_url: m.url });
    } catch (e) {
      setSending(false);
      toast(errText(e));
    }
  }

  const data = [...messages].reverse();

  return (
    <Screen>
      <View style={{ height: 54, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, gap: 6 }}>
        <IconButton name="back" label="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/inbox'))} />
        {thread ? (
          <Pressable onPress={() => router.push(`/user/${thread.other_id}`)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }} accessibilityRole="button" accessibilityLabel={`Open ${thread.full_name}'s profile`}>
            <Avatar uri={thread.avatar_url} name={thread.full_name} size={36} />
            <View style={{ flex: 1 }}>
              <Text numberOfLines={1} style={{ color: C.fg, fontWeight: '700' }}>{thread.full_name}</Text>
              <Text numberOfLines={1} style={{ color: C.fg2, fontSize: 12.5 }}>{thread.username}</Text>
            </View>
          </Pressable>
        ) : null}
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {status === 'loading' ? (
          <View style={{ flex: 1 }}><Loading /></View>
        ) : status === 'error' ? (
          <View style={{ flex: 1 }}><ErrorNote message={error} onRetry={() => { setStatus('loading'); load(); }} /></View>
        ) : status === 'missing' ? (
          <View style={{ flex: 1 }}><Empty title="This chat isn't available" body="The other account may have been deleted." /></View>
        ) : (
          <FlatList
            data={data}
            inverted
            keyExtractor={(m) => m.id}
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 12, gap: 3 }}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item: m, index }) => {
              const mine = m.sender_id === me;
              const older = data[index + 1];
              const showTime = !older || new Date(m.created_at).getTime() - new Date(older.created_at).getTime() > 3600e3;
              const post = m.post_id ? getPostNow(m.post_id) : undefined;
              const heart = m.text.trim() === '❤️' && !m.media_url && !m.post_id;
              const plainText = m.text && !(m.post_id && m.text === 'Sent a post');
              return (
                <View>
                  {showTime ? <Text style={{ color: C.fg2, fontSize: 12, textAlign: 'center', paddingTop: 12, paddingBottom: 6 }}>{stamp(m.created_at)}</Text> : null}
                  <View style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '78%', gap: 3 }}>
                    {m.post_id ? (
                      post ? (
                        <Pressable onPress={() => router.push(post.kind === 'reel' ? `/watch/${post.id}` : `/post/${post.id}`)} accessibilityRole="button" accessibilityLabel={`Post by ${post.username}`} style={{ width: 210, borderRadius: 18, overflow: 'hidden', backgroundColor: C.surface }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 9 }}>
                            <Avatar uri={post.avatar_url} name={post.full_name} size={24} />
                            <Text numberOfLines={1} style={{ color: C.fg, fontWeight: '600', fontSize: 13, flex: 1 }}>{post.username}</Text>
                          </View>
                          <Image source={{ uri: thumbOf(post) }} style={{ width: 210, height: 262, backgroundColor: C.bg2 }} contentFit="cover" />
                          {post.caption ? <Text numberOfLines={2} style={{ color: C.fg2, fontSize: 13, padding: 9 }}>{post.caption}</Text> : null}
                        </Pressable>
                      ) : (
                        <View style={{ borderRadius: 18, backgroundColor: C.surface, paddingHorizontal: 13, paddingVertical: 9 }}>
                          <Text style={{ color: C.fg2 }}>This post is no longer available</Text>
                        </View>
                      )
                    ) : null}
                    {m.media_url ? <Image source={{ uri: m.media_url }} style={{ width: 220, height: 280, borderRadius: 18, backgroundColor: C.bg2 }} contentFit="cover" accessibilityLabel="Photo" /> : null}
                    {heart ? (
                      <Text style={{ fontSize: 44, lineHeight: 52 }}>❤️</Text>
                    ) : plainText ? (
                      <View style={{ alignSelf: mine ? 'flex-end' : 'flex-start', borderRadius: 20, backgroundColor: mine ? C.accent : C.surface2, paddingHorizontal: 13, paddingVertical: 9 }}>
                        <Text style={{ color: mine ? '#fff' : C.fg, fontSize: 15.5, lineHeight: 21 }} selectable>{m.text}</Text>
                      </View>
                    ) : null}
                  </View>
                </View>
              );
            }}
            ListEmptyComponent={
              <View style={{ transform: [{ scaleY: -1 }] }}>
                <Empty title={thread ? thread.full_name : 'New chat'} body="Say hello to start the chat." />
              </View>
            }
          />
        )}

        {status === 'ready' ? (
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 4, marginHorizontal: 12, marginTop: 6, marginBottom: insets.bottom + 8, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 26, backgroundColor: C.surface }}>
            <Pressable onPress={photo} disabled={sending} accessibilityRole="button" accessibilityLabel="Send a photo" style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center', marginBottom: 3 }}>
              <Icon name="image" size={20} color="#fff" />
            </Pressable>
            <TextInput value={text} onChangeText={setText} placeholder="Message…" placeholderTextColor={C.fg3} multiline maxLength={5000} keyboardAppearance="dark" style={{ flex: 1, color: C.fg, fontSize: 16, minHeight: 42, maxHeight: 120, paddingHorizontal: 8, paddingTop: 11, paddingBottom: 11 }} accessibilityLabel="Message" />
            {text.trim() ? (
              <Pressable onPress={() => send({ text })} disabled={sending} hitSlop={8} accessibilityRole="button" style={{ paddingHorizontal: 10, height: 42, justifyContent: 'center' }}>
                <Text style={{ color: C.accent2, fontWeight: '700', opacity: sending ? 0.4 : 1 }}>Send</Text>
              </Pressable>
            ) : (
              <IconButton name="heart" label="Send a heart" onPress={() => send({ text: '❤️' })} />
            )}
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </Screen>
  );
}
