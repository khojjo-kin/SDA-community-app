import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { VerifiedTick } from '../../src/components/Icon';
import { RowsSkeleton } from '../../src/components/Skeleton';
import { Avatar, Empty, ErrorNote, Screen, ScreenHeader, useToast } from '../../src/components/ui';
import { deleteMessageRequest, fetchMessageRequests } from '../../src/lib/api';
import { cacheKey, keepSame, peekCache } from '../../src/lib/cache';
import { tap } from '../../src/lib/haptics';
import { useT } from '../../src/lib/i18n';
import { useSession } from '../../src/lib/session';
import { listen } from '../../src/lib/store';
import { ago, C, errText } from '../../src/lib/theme';
import type { Thread } from '../../src/lib/types';

/** A request's look, pressed or not, as the chats in Messages. */
const rowStyle = ({ pressed }: { pressed: boolean }) => ({ flexDirection: 'row' as const, alignItems: 'center' as const, gap: 14, paddingHorizontal: 16, paddingVertical: 9, backgroundColor: pressed ? C.press : 'transparent' });

/**
 * Message requests: chats someone else started that you haven't answered or accepted, from people you
 * don't follow (or have restricted). Opening one shows the chat with Accept, Delete and Block where the
 * message box would be. Until it is accepted, they can't see that you have read it.
 */
export default function MessageRequests() {
  const { me } = useSession();
  const router = useRouter();
  const toast = useToast();
  const t = useT();
  // The requests among the chats Messages saved last, so the list is there at once and refreshes behind.
  const [list, setList] = useState<Thread[] | null>(() => peekCache<Thread[]>(cacheKey(me, 'threads'))?.filter((x) => x.request && x.has_messages) ?? null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  // Each load is numbered: an older answer never replaces a newer one, nor a change made here since it was asked.
  const asked = useRef(0);
  const shown = useRef(0);
  const lastNav = useRef(0);

  const load = useCallback(
    async (pulled = false) => {
      const mine = ++asked.current;
      try {
        const rows = (await fetchMessageRequests()).filter((x) => x.has_messages);
        if (mine < shown.current) return;
        shown.current = mine;
        setError('');
        setList((cur) => keepSame(cur ?? [], rows));
      } catch (e) {
        if (mine < shown.current) return;
        // A list already on screen stays; with nothing to show, the screen says it didn't load.
        setError(errText(e));
        if (pulled) toast(errText(e));
        setList((cur) => cur ?? []);
      } finally {
        setRefreshing(false);
      }
    },
    [toast],
  );

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );
  // A request accepted, deleted or answered (in the chat) moves the list on here too.
  useEffect(() => listen('threads', () => { load(); }), [load]);

  function open(th: Thread) {
    const now = Date.now();
    if (now - lastNav.current < 700) return;
    lastNav.current = now;
    router.push(`/chat/${th.id}`);
  }

  /** Touch and hold a request to delete it. Gone from the list at once; back again if the server says no. */
  function options(th: Thread) {
    tap('medium');
    Alert.alert(th.full_name || th.username, undefined, [
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () => {
          shown.current = ++asked.current;
          setList((cur) => (cur ? cur.filter((x) => x.id !== th.id) : cur));
          deleteMessageRequest(th.id)
            .then(() => toast(t('requests.deleted')))
            .catch((e) => {
              toast(errText(e));
              load();
            });
        },
      },
      { text: t('common.cancel'), style: 'cancel' },
    ]);
  }

  return (
    <Screen>
      <ScreenHeader title={t('requests.title')} />
      {list === null ? (
        <RowsSkeleton avatar={56} gap={14} padY={9} />
      ) : error && !list.length ? (
        <ErrorNote
          message={error}
          onRetry={() => {
            setError('');
            setList(null);
            load();
          }}
        />
      ) : (
        <FlatList
          data={list}
          keyExtractor={(th) => th.id}
          renderItem={({ item: th }) => {
            const name = th.full_name || th.username;
            const unread = th.unread_count > 0;
            return (
              <Pressable onPress={() => open(th)} onLongPress={() => options(th)} delayLongPress={350} accessibilityRole="button" accessibilityLabel={t('inbox.chatWith', { name })} accessibilityHint={t('inbox.holdHint')} style={rowStyle}>
                <Avatar uri={th.avatar_url} name={name} size={56} />
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Text numberOfLines={1} style={{ color: C.fg, fontSize: 15.5, fontWeight: unread ? '700' : '400', flexShrink: 1 }}>{name}</Text>
                    {th.verified ? <VerifiedTick size={14} /> : null}
                  </View>
                  <Text numberOfLines={1} style={{ color: unread ? C.fg : C.fg2, fontSize: 14, fontWeight: unread ? '700' : '400' }}>
                    {th.unread_count > 1 ? t('inbox.newMessages', { count: th.unread_count }) : th.last_message} · {ago(th.last_message_at)}
                  </Text>
                </View>
                {unread ? <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: C.accent2 }} /> : null}
              </Pressable>
            );
          }}
          ListEmptyComponent={<Empty icon="send" title={t('requests.empty')} />}
          contentContainerStyle={{ paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} tintColor={C.fg2} />}
        />
      )}
    </Screen>
  );
}
