import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { ErhaAvatar } from '../../../src/components/ErhaAvatar';
import { Icon, VerifiedTick } from '../../../src/components/Icon';
import { Avatar, Button, Empty, ErrorNote, IconButton, Loading, Screen, SearchField, useToast } from '../../../src/components/ui';
import { ERHA_ID, fetchThreads, getProfile, hideThread, openThread, setThreadMuted } from '../../../src/lib/api';
import { useSession } from '../../../src/lib/session';
import { listen } from '../../../src/lib/store';
import { ago, C, errText } from '../../../src/lib/theme';
import type { Profile, Thread } from '../../../src/lib/types';

/** A chat, or the one row that offers a first chat with Erha when there is none yet. */
type Item = { kind: 'thread'; t: Thread } | { kind: 'erha' };

export default function Inbox() {
  const { me, profile } = useSession();
  const router = useRouter();
  const toast = useToast();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [q, setQ] = useState('');
  // Erha's account card, for her picture on the starter row. Null until it has loaded, or if it cannot.
  const [erha, setErha] = useState<Profile | null>(null);
  const opening = useRef(false);

  const load = useCallback(async () => {
    try {
      const t = await fetchThreads();
      setThreads(t.filter((x) => x.has_messages));
      setStatus('ready');
    } catch (e) {
      setError(errText(e));
      setStatus((s) => (s === 'ready' ? 'ready' : 'error'));
    } finally {
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
      const timer = setInterval(load, 15000);
      return () => clearInterval(timer);
    }, [load]),
  );
  useEffect(() => listen('threads', () => { load(); }), [load]);

  // Erha chats like anyone else, so her row only needs an invitation until the first message is sent.
  const hasErhaChat = threads.some((t) => t.other_id === ERHA_ID);
  const offerErha = status === 'ready' && me !== ERHA_ID && !hasErhaChat;
  useEffect(() => {
    if (!offerErha || erha) return;
    let live = true;
    getProfile(ERHA_ID)
      .then((p) => { if (live && p) setErha(p); })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [offerErha, erha]);

  /** Opens (or makes) the chat with Erha. */
  async function startErha() {
    if (opening.current) return;
    opening.current = true;
    try {
      const id = await openThread(ERHA_ID);
      router.push(`/chat/${id}`);
    } catch (e) {
      toast(errText(e));
    } finally {
      opening.current = false;
    }
  }

  /** Touch and hold a chat for its options. */
  function options(t: Thread) {
    Alert.alert(t.full_name, undefined, [
      { text: t.muted ? 'Unmute messages' : 'Mute messages', onPress: () => { setThreadMuted(me, t.id, !t.muted).then(load).catch((e) => toast(errText(e))); } },
      {
        text: 'Delete chat',
        style: 'destructive',
        onPress: () =>
          Alert.alert('Delete this chat?', 'The messages are removed for you only. A new message starts the chat again.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: () => { hideThread(t.id).then(load).catch((e) => toast(errText(e))); } },
          ]),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  const needle = q.trim().toLowerCase();
  const shown = needle ? threads.filter((t) => t.username.includes(needle) || t.full_name.toLowerCase().includes(needle)) : threads;
  const items: Item[] = shown.map((t) => ({ kind: 'thread', t }));
  if (offerErha && (!needle || 'erha'.includes(needle))) items.push({ kind: 'erha' });

  const rowStyle = ({ pressed }: { pressed: boolean }) => ({ flexDirection: 'row' as const, alignItems: 'center' as const, gap: 14, paddingHorizontal: 16, paddingVertical: 9, backgroundColor: pressed ? 'rgba(255,255,255,0.04)' : 'transparent' });

  return (
    <Screen>
      <View style={{ height: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8 }}>
        <View style={{ width: 40 }} />
        <Text numberOfLines={1} style={{ flex: 1, textAlign: 'center', color: C.fg, fontSize: 21, fontWeight: '800' }}>{profile?.username}</Text>
        <IconButton name="compose" size={26} label="New message" onPress={() => router.push('/new-message')} />
      </View>
      <View style={{ marginBottom: 8 }}>
        <SearchField value={q} onChangeText={setQ} label="Search messages" />
      </View>
      <FlatList
        data={items}
        keyExtractor={(it) => (it.kind === 'thread' ? it.t.id : 'erha')}
        renderItem={({ item }) => {
          if (item.kind === 'erha') {
            return (
              <Pressable onPress={startErha} accessibilityRole="button" accessibilityLabel="Chat with Erha, your church assistant" style={rowStyle}>
                {erha?.avatar_url ? <Avatar uri={erha.avatar_url} name="Erha" size={56} /> : <ErhaAvatar size={56} />}
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Text numberOfLines={1} style={{ color: C.fg, fontSize: 15.5, flexShrink: 1 }}>Erha</Text>
                    <VerifiedTick size={14} />
                  </View>
                  <Text numberOfLines={1} style={{ color: C.fg2, fontSize: 14 }}>Your church assistant · say hello</Text>
                </View>
              </Pressable>
            );
          }
          const t = item.t;
          return (
            <Pressable onPress={() => router.push(`/chat/${t.id}`)} onLongPress={() => options(t)} delayLongPress={350} accessibilityRole="button" accessibilityLabel={`Chat with ${t.full_name}`} accessibilityHint="Touch and hold for options" style={rowStyle}>
              <Avatar uri={t.avatar_url} name={t.full_name} size={56} />
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Text numberOfLines={1} style={{ color: C.fg, fontSize: 15.5, fontWeight: t.unread_count ? '700' : '400', flexShrink: 1 }}>{t.full_name}</Text>
                  {t.verified ? <VerifiedTick size={14} /> : null}
                </View>
                <Text numberOfLines={1} style={{ color: t.unread_count ? C.fg : C.fg2, fontSize: 14, fontWeight: t.unread_count ? '700' : '400' }}>
                  {t.unread_count > 1 ? `${t.unread_count} new messages` : t.last_message} · {ago(t.last_message_at)}
                </Text>
              </View>
              {t.muted ? <Icon name="mute" size={17} color={C.fg3} /> : null}
              {t.unread_count ? <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: C.accent2 }} /> : null}
            </Pressable>
          );
        }}
        ListEmptyComponent={
          status === 'loading' ? (
            <Loading />
          ) : status === 'error' ? (
            <ErrorNote message={error} onRetry={() => { setStatus('loading'); load(); }} />
          ) : needle ? (
            <Empty title="No chats found" body="Try a different name." />
          ) : (
            <Empty icon="send" title="Your messages" body="Send a message to start a chat. Only the two of you can open it." action={<Button small label="Send message" onPress={() => router.push('/new-message')} style={{ marginTop: 8 }} />} />
          )
        }
        contentContainerStyle={{ paddingBottom: 110 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={C.fg2} />}
        keyboardShouldPersistTaps="handled"
      />
    </Screen>
  );
}
