import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, RefreshControl, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Icon } from '../../../src/components/Icon';
import { Avatar, Button, Empty, ErrorNote, IconButton, Loading, Screen } from '../../../src/components/ui';
import { fetchThreads } from '../../../src/lib/api';
import { useSession } from '../../../src/lib/session';
import { listen } from '../../../src/lib/store';
import { ago, C, errText } from '../../../src/lib/theme';
import type { Thread } from '../../../src/lib/types';

export default function Inbox() {
  const { profile } = useSession();
  const router = useRouter();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [q, setQ] = useState('');

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

  const needle = q.trim().toLowerCase();
  const shown = needle ? threads.filter((t) => t.username.includes(needle) || t.full_name.toLowerCase().includes(needle)) : threads;

  return (
    <Screen>
      <View style={{ height: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8 }}>
        <View style={{ width: 40 }} />
        <Text numberOfLines={1} style={{ flex: 1, textAlign: 'center', color: C.fg, fontSize: 21, fontWeight: '800' }}>{profile?.username}</Text>
        <IconButton name="compose" size={26} label="New message" onPress={() => router.push('/new-message')} />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 14, marginBottom: 8, paddingHorizontal: 12, height: 40, borderRadius: 12, backgroundColor: C.surface2 }}>
        <Icon name="search" size={18} color={C.fg2} />
        <TextInput value={q} onChangeText={setQ} placeholder="Search" placeholderTextColor={C.fg3} style={{ flex: 1, color: C.fg, fontSize: 16 }} autoCapitalize="none" autoCorrect={false} keyboardAppearance="dark" accessibilityLabel="Search messages" />
      </View>
      <FlatList
        data={shown}
        keyExtractor={(t) => t.id}
        renderItem={({ item: t }) => (
          <Pressable onPress={() => router.push(`/chat/${t.id}`)} accessibilityRole="button" accessibilityLabel={`Chat with ${t.full_name}`} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 9, backgroundColor: pressed ? 'rgba(255,255,255,0.04)' : 'transparent' })}>
            <Avatar uri={t.avatar_url} name={t.full_name} size={56} />
            <View style={{ flex: 1 }}>
              <Text numberOfLines={1} style={{ color: C.fg, fontSize: 15.5, fontWeight: t.unread_count ? '700' : '400' }}>{t.full_name}</Text>
              <Text numberOfLines={1} style={{ color: t.unread_count ? C.fg : C.fg2, fontSize: 14, fontWeight: t.unread_count ? '700' : '400' }}>
                {t.unread_count > 1 ? `${t.unread_count} new messages` : t.last_message} · {ago(t.last_message_at)}
              </Text>
            </View>
            {t.unread_count ? <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: C.accent2 }} /> : null}
          </Pressable>
        )}
        ListEmptyComponent={
          status === 'loading' ? (
            <Loading />
          ) : status === 'error' ? (
            <ErrorNote message={error} onRetry={() => { setStatus('loading'); load(); }} />
          ) : needle ? (
            <Empty title="No chats found" body="Try a different name." />
          ) : (
            <Empty icon="send" title="Your messages" body="Send a message to start a chat. Only the two of you can see it." action={<Button small label="Send message" onPress={() => router.push('/new-message')} style={{ marginTop: 8 }} />} />
          )
        }
        contentContainerStyle={{ paddingBottom: 110 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={C.fg2} />}
        keyboardShouldPersistTaps="handled"
      />
    </Screen>
  );
}
