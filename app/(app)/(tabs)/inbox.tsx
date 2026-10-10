import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { ErhaAvatar } from '../../../src/components/ErhaAvatar';
import { Icon, VerifiedTick } from '../../../src/components/Icon';
import { NotesRow } from '../../../src/components/NotesRow';
import { RowsSkeleton, SlowLine } from '../../../src/components/Skeleton';
import { Avatar, Button, Empty, ErrorNote, IconButton, Screen, SearchField, useToast } from '../../../src/components/ui';
import { activeLabel, ERHA_ID, fetchThreads, getProfile, hideThread, isOnline, openThread, setThreadMuted } from '../../../src/lib/api';
import { cacheKey, keepSame, peekCache, readCache, writeCache } from '../../../src/lib/cache';
import { type Key, type Vars, useT } from '../../../src/lib/i18n';
import { useSession } from '../../../src/lib/session';
import { listen } from '../../../src/lib/store';
import { ago, C, errText } from '../../../src/lib/theme';
import type { Profile, Thread } from '../../../src/lib/types';

/** A chat, or the one row that offers a first chat with Erha when there is none yet. */
type Item = { kind: 'thread'; t: Thread } | { kind: 'erha' };

/** Streaks only show from three days, so a couple of quick replies don't light a flame. */
const STREAK_FROM = 3;
const FLAME = '#ff8a3d';

const keyOfItem = (it: Item) => (it.kind === 'thread' ? it.t.id : 'erha');

/** A row's look, pressed or not. Read from C as it draws, so it follows the theme. */
const rowStyle = ({ pressed }: { pressed: boolean }) => ({ flexDirection: 'row' as const, alignItems: 'center' as const, gap: 14, paddingHorizontal: 16, paddingVertical: 9, backgroundColor: pressed ? C.press : 'transparent' });

/** What a row can do, through the latest version of the screen's handlers, so the object itself never changes. */
type RowActions = { open: (th: Thread) => void; hold: (th: Thread) => void; streak: (days: number) => void; erha: () => void };

/** The small flame and day count next to a name. Tapping it says what it means. */
function StreakBadge({ days, onPress }: { days: number; onPress: () => void }) {
  const t = useT();
  return (
    <Pressable onPress={onPress} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('inbox.streak', { days })} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 2, opacity: pressed ? 0.6 : 1 })}>
      <Icon name="flame" size={14} color={FLAME} />
      <Text style={{ color: C.fg2, fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'] }}>{days}</Text>
    </Pressable>
  );
}

/**
 * One chat. Memoised, with its time words worked out by the list: Messages refreshes every 15 seconds,
 * and a row only draws again when its chat or those words have changed.
 */
const ThreadRow = React.memo(function ThreadRow({ th, when, active, online, actions, t }: { th: Thread; when: string; active: string; online: boolean; actions: RowActions; t: (key: Key, vars?: Vars) => string }) {
  // Older saved copies of the list may not carry a streak or activity yet.
  const streak = th.streak ?? 0;
  return (
    <Pressable onPress={() => actions.open(th)} onLongPress={() => actions.hold(th)} delayLongPress={350} accessibilityRole="button" accessibilityLabel={t(online ? 'inbox.chatWithActive' : 'inbox.chatWith', { name: th.full_name })} accessibilityHint={t('inbox.holdHint')} style={rowStyle}>
      <Avatar uri={th.avatar_url} name={th.full_name} size={56} online={online} />
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Text numberOfLines={1} style={{ color: C.fg, fontSize: 15.5, fontWeight: th.unread_count ? '700' : '400', flexShrink: 1 }}>{th.full_name}</Text>
          {th.verified ? <VerifiedTick size={14} /> : null}
          {streak >= STREAK_FROM ? <StreakBadge days={streak} onPress={() => actions.streak(streak)} /> : null}
        </View>
        {active ? (
          // The preview gives way first, so the activity label is never cut off.
          <View style={{ flexDirection: 'row' }}>
            <Text numberOfLines={1} style={{ color: C.fg2, fontSize: 14, flexShrink: 1 }}>{th.last_message}</Text>
            <Text numberOfLines={1} style={{ color: C.fg3, fontSize: 14 }}> · {active}</Text>
          </View>
        ) : (
          <Text numberOfLines={1} style={{ color: th.unread_count ? C.fg : C.fg2, fontSize: 14, fontWeight: th.unread_count ? '700' : '400' }}>
            {th.unread_count > 1 ? t('inbox.newMessages', { count: th.unread_count }) : th.last_message} · {when}
          </Text>
        )}
      </View>
      {th.muted ? <Icon name="mute" size={17} color={C.fg3} /> : null}
      {th.unread_count ? <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: C.accent2 }} /> : null}
    </Pressable>
  );
});

export default function Inbox() {
  const { me, profile } = useSession();
  const router = useRouter();
  const toast = useToast();
  const t = useT();
  // The chats as they were last shown, so the list is there at once and refreshes behind.
  const key = cacheKey(me, 'threads');
  const [seed] = useState(() => peekCache<Thread[]>(key));
  const [threads, setThreads] = useState<Thread[]>(() => seed ?? []);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>(() => (seed ? 'ready' : 'loading'));
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  // Bumped by pull to refresh, so the notes above the chats load again too.
  const [notesKey, setNotesKey] = useState(0);
  const [q, setQ] = useState('');
  // Erha's account card, for her picture on the starter row. Null until it has loaded, or if it cannot.
  const [erha, setErha] = useState<Profile | null>(null);
  // Counts the refreshes, so each one draws the list again and the times next to the chats move on
  // even when the chats themselves are just as they were.
  const [polls, setPolls] = useState(0);
  const opening = useRef(false);
  // Set once a fresh list has come back, so a saved copy arriving late cannot cover it.
  const fresh = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    try {
      const list = (await fetchThreads()).filter((x) => x.has_messages);
      fresh.current = true;
      // Chats that haven't changed keep the object already on screen, so their rows aren't drawn again.
      setThreads((cur) => keepSame(cur, list));
      setPolls((n) => n + 1);
      setStatus('ready');
      if (alive.current) writeCache(key, list);
    } catch (e) {
      setError(errText(e));
      setStatus((s) => (s === 'ready' ? 'ready' : 'error'));
    } finally {
      setRefreshing(false);
    }
  }, [key]);

  // Nothing in memory yet: show the copy saved on the phone while the fresh list loads.
  useEffect(() => {
    if (seed) return;
    let live = true;
    readCache<Thread[]>(key).then((saved) => {
      if (!live || !saved || fresh.current) return;
      setThreads(saved);
      setStatus('ready');
    });
    return () => {
      live = false;
    };
  }, [key, seed]);

  useFocusEffect(
    useCallback(() => {
      load();
      const timer = setInterval(load, 15000);
      return () => clearInterval(timer);
    }, [load]),
  );
  useEffect(() => listen('threads', () => { load(); }), [load]);

  // Erha chats like anyone else, so her row only needs an invitation until the first message is sent.
  const hasErhaChat = threads.some((th) => th.other_id === ERHA_ID);
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
  function options(th: Thread) {
    Alert.alert(th.full_name, undefined, [
      { text: th.muted ? t('inbox.unmute') : t('inbox.mute'), onPress: () => { setThreadMuted(me, th.id, !th.muted).then(load).catch((e) => toast(errText(e))); } },
      {
        text: t('inbox.deleteChat'),
        style: 'destructive',
        onPress: () =>
          Alert.alert(t('inbox.deleteQuestion'), t('inbox.deleteBody'), [
            { text: t('common.cancel'), style: 'cancel' },
            { text: t('common.delete'), style: 'destructive', onPress: () => { hideThread(th.id).then(load).catch((e) => toast(errText(e))); } },
          ]),
      },
      { text: t('common.cancel'), style: 'cancel' },
    ]);
  }

  const needle = q.trim().toLowerCase();
  const items = useMemo(() => {
    const shown = needle ? threads.filter((th) => th.username.includes(needle) || th.full_name.toLowerCase().includes(needle)) : threads;
    const list: Item[] = shown.map((th) => ({ kind: 'thread', t: th }));
    if (offerErha && (!needle || 'erha'.includes(needle))) list.push({ kind: 'erha' });
    return list;
  }, [threads, needle, offerErha]);

  const latest = useRef<RowActions>(null as unknown as RowActions);
  latest.current = {
    open: (th) => router.push(`/chat/${th.id}`),
    hold: options,
    streak: (days) => toast(t('inbox.streakToast', { days })),
    erha: startErha,
  };
  const actions = useMemo<RowActions>(
    () => ({
      open: (th) => latest.current.open(th),
      hold: (th) => latest.current.hold(th),
      streak: (days) => latest.current.streak(days),
      erha: () => latest.current.erha(),
    }),
    [],
  );

  // The time words are worked out here each time the list draws (every refresh), and handed to the
  // memoised row, which only draws again when they or its chat have changed.
  const renderItem = useCallback(
    ({ item }: { item: Item }) => {
      if (item.kind === 'erha') {
        return (
          <Pressable onPress={actions.erha} accessibilityRole="button" accessibilityLabel={t('inbox.erhaLabel')} style={rowStyle}>
            {erha?.avatar_url ? <Avatar uri={erha.avatar_url} name="Erha" size={56} /> : <ErhaAvatar size={56} />}
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text numberOfLines={1} style={{ color: C.fg, fontSize: 15.5, flexShrink: 1 }}>Erha</Text>
                <VerifiedTick size={14} />
              </View>
              <Text numberOfLines={1} style={{ color: C.fg2, fontSize: 14 }}>{t('inbox.erhaSub')}</Text>
            </View>
          </Pressable>
        );
      }
      const th = item.t;
      // "Active now" / "Active 5m ago" once you've read everything: new messages matter more than presence.
      return <ThreadRow th={th} when={ago(th.last_message_at)} active={th.unread_count ? '' : activeLabel(th.active_at)} online={isOnline(th.active_at)} actions={actions} t={t} />;
    },
    [actions, t, erha],
  );

  return (
    <Screen>
      <View style={{ height: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8 }}>
        {/* As wide as the two buttons on the right, so the name stays in the middle. */}
        <View style={{ width: 80 }} />
        <Text numberOfLines={1} style={{ flex: 1, textAlign: 'center', color: C.fg, fontSize: 21, fontWeight: '800' }}>{profile?.username}</Text>
        <IconButton name="compose" size={26} label={t('inbox.newMessage')} onPress={() => router.push('/new-message')} />
        <IconButton name="location" size={26} label={t('inbox.map')} onPress={() => router.push('/map')} />
      </View>
      <View style={{ marginBottom: 8 }}>
        <SearchField value={q} onChangeText={setQ} label={t('inbox.search')} />
      </View>
      <SlowLine active={refreshing} />
      <FlatList
        data={items}
        keyExtractor={keyOfItem}
        renderItem={renderItem}
        extraData={polls}
        ListEmptyComponent={
          status === 'loading' ? (
            <RowsSkeleton avatar={56} gap={14} padY={9} />
          ) : status === 'error' ? (
            <ErrorNote message={error} onRetry={() => { setStatus('loading'); load(); }} />
          ) : needle ? (
            <Empty title={t('inbox.noneFound')} body={t('common.tryDifferentName')} />
          ) : (
            <Empty icon="send" title={t('inbox.emptyTitle')} action={<Button small label={t('inbox.sendMessage')} onPress={() => router.push('/new-message')} style={{ marginTop: 8 }} />} />
          )
        }
        // Notes sit above the chats and scroll with them; they step aside while you search.
        ListHeaderComponent={needle ? null : <NotesRow refreshKey={notesKey} />}
        contentContainerStyle={{ paddingBottom: 110 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); setNotesKey((k) => k + 1); load(); }} tintColor={C.fg2} />}
        keyboardShouldPersistTaps="handled"
      />
    </Screen>
  );
}
