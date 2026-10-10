import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Animated, Easing, FlatList, Pressable, RefreshControl, Text, useWindowDimensions, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { followLabel, hideSuggestion, isHidden, type SuggestionFollow, suggestionReason, useSuggestionFollows } from '../../src/components/DiscoverCarousel';
import { Icon, VerifiedTick } from '../../src/components/Icon';
import { Avatar, Button, Empty, ErrorNote, IconButton, Loading, Screen, SearchField, useToast } from '../../src/components/ui';
import { fetchSuggestedPeople, getProfile, isOnline, listPeople, mySubscriptions, removeFollowRequest, requestFollow, setFollow } from '../../src/lib/api';
import { tap } from '../../src/lib/haptics';
import { money } from '../../src/lib/payments';
import { useSession } from '../../src/lib/session';
import { announce } from '../../src/lib/store';
import { ringColors } from '../../src/lib/styling';
import { supabase } from '../../src/lib/supabase';
import { C, count, dayLabel, errText, fmt } from '../../src/lib/theme';
import type { CreatorSub, Profile, SuggestedPerson } from '../../src/lib/types';

/*
 * Someone's followers and the accounts they follow, and on your own page the creators you subscribe
 * to. Admins can hide their lists: the counts still show, but nobody else can open them.
 */

type Tab = 'followers' | 'following' | 'subscriptions';
type Lists = 'followers' | 'following';
type FollowState = 'none' | 'following' | 'requested';

/** A search box appears once a list is long enough to need one. */
const SEARCH_FROM = 9;
const SUGGESTIONS = 12;

/**
 * Removes one of my followers. There is no helper for this in api.ts yet, so it goes to Supabase
 * directly; the database lets anyone remove their own followers (policy follows_remove_follower).
 */
async function removeFollower(me: string, followerId: string) {
  const { error } = await supabase.from('community_follows').delete().eq('follower_id', followerId).eq('following_id', me);
  if (error) throw error;
  announce('profile');
}

/** Up to two of the people I follow who follow them, slightly overlapping. */
function MutualFaces({ uris }: { uris: string[] }) {
  return (
    <View style={{ flexDirection: 'row' }}>
      {uris.slice(0, 2).map((uri, i) => (
        <View key={`${i}-${uri}`} style={{ borderRadius: 10, borderWidth: 1.5, borderColor: C.bg, marginLeft: i ? -7 : 0 }}>
          <Avatar uri={uri} size={16} />
        </View>
      ))}
    </View>
  );
}

/** A person in one of the lists: their face (with the green dot when they're about), names, and a button on the right. */
function PersonLine({ p, onOpen, after, right }: { p: Profile; onOpen: () => void; after?: React.ReactNode; right?: React.ReactNode }) {
  const online = isOnline(p.active_at);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 16, paddingRight: 12, paddingVertical: 7 }}>
      <Pressable
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={`${p.username}${p.full_name ? `, ${p.full_name}` : ''}${online ? ', active now' : ''}`}
        style={({ pressed }) => ({ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, opacity: pressed ? 0.7 : 1 })}>
        {/* A story ring adds ten points round the face, so the face shrinks to keep every row the same height. */}
        <Avatar uri={p.avatar_url} name={p.full_name || p.username} size={p.has_story ? 46 : 56} ring={p.has_story ? 'new' : null} ringColors={ringColors(p.ring_color)} online={online} />
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Text numberOfLines={1} style={{ color: C.fg, fontWeight: '700', fontSize: 15, flexShrink: 1 }}>{p.username}</Text>
            {p.verified ? <VerifiedTick size={16} /> : null}
            {after}
          </View>
          {p.full_name ? <Text numberOfLines={1} style={{ color: C.fg2, fontSize: 14, marginTop: 1 }}>{p.full_name}</Text> : null}
        </View>
      </Pressable>
      {right}
    </View>
  );
}

/** One creator I subscribe to: their price and when it next renews (or ends). */
function SubLine({ s, onOpen }: { s: CreatorSub; onOpen: () => void }) {
  const p = s.profile;
  const name = p?.username ?? 'Creator';
  const when = s.current_period_end ? dayLabel(new Date(s.current_period_end)) : '';
  const state = s.status === 'past_due' ? 'Payment due' : s.cancel_at_period_end ? (when ? `Ends ${when}` : 'Ending') : when ? `Renews ${when}` : 'Active';
  const line = `${money(s.amount_pence)} a month · ${state}`;
  return (
    <Pressable onPress={onOpen} accessibilityRole="button" accessibilityLabel={`${name}, ${line}`} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 16, paddingRight: 14, paddingVertical: 8, backgroundColor: pressed ? C.press : 'transparent' })}>
      <Avatar uri={p?.avatar_url} name={p?.full_name || name} size={56} online={isOnline(p?.active_at)} />
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Text numberOfLines={1} style={{ color: C.fg, fontWeight: '700', fontSize: 15, flexShrink: 1 }}>{name}</Text>
          {p?.verified ? <VerifiedTick size={16} /> : null}
        </View>
        <Text numberOfLines={1} style={{ color: s.status === 'past_due' ? C.warn : C.fg2, fontSize: 14, marginTop: 1 }}>{line}</Text>
      </View>
      <Icon name="right" size={18} color={C.fg2} weight={2} />
    </Pressable>
  );
}

/** "Suggested for you" under the lists: a rounded Follow pill and an X to stop suggesting them. */
function SuggestionLine({ p, state, onOpen, onFollow, onDismiss }: { p: SuggestedPerson; state: SuggestionFollow; onOpen: () => void; onFollow: () => void; onDismiss: () => void }) {
  const on = state !== 'none';
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 16, paddingRight: 8, paddingVertical: 7 }}>
      <Pressable onPress={onOpen} accessibilityRole="button" accessibilityLabel={`${p.full_name || p.username}, ${suggestionReason(p)}`} style={({ pressed }) => ({ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, opacity: pressed ? 0.7 : 1 })}>
        <Avatar uri={p.avatar_url} name={p.full_name || p.username} size={56} />
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Text numberOfLines={1} style={{ color: C.fg, fontWeight: '700', fontSize: 15, flexShrink: 1 }}>{p.full_name || p.username}</Text>
            {p.verified ? <VerifiedTick size={16} /> : null}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
            {p.mutual_avatars.length ? <MutualFaces uris={p.mutual_avatars} /> : null}
            <Text numberOfLines={1} style={{ color: C.fg2, fontSize: 13, flexShrink: 1 }}>{suggestionReason(p)}</Text>
          </View>
        </View>
      </Pressable>
      <Pressable
        onPress={onFollow}
        accessibilityRole="button"
        accessibilityLabel={`${followLabel(p, state)}, ${p.username}`}
        style={({ pressed }) => ({ height: 32, paddingHorizontal: 18, borderRadius: 16, backgroundColor: on ? C.surface2 : C.accent, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.75 : 1 })}>
        <Text numberOfLines={1} style={{ color: on ? C.fg : C.onAccent, fontWeight: '700', fontSize: 13.5 }}>{followLabel(p, state)}</Text>
      </Pressable>
      <Pressable onPress={onDismiss} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Stop suggesting ${p.username}`} style={({ pressed }) => ({ padding: 6, opacity: pressed ? 0.5 : 1 })}>
        <Icon name="close" size={17} color={C.fg2} weight={2.1} />
      </Pressable>
    </View>
  );
}

export default function People() {
  const params = useLocalSearchParams<{ id: string; which?: string }>();
  const userId = String(params.id);
  const { me } = useSession();
  const router = useRouter();
  const toast = useToast();
  const { width } = useWindowDimensions();
  const mine = userId === me;
  const tabs: Tab[] = mine ? ['followers', 'following', 'subscriptions'] : ['followers', 'following'];
  const [tab, setTab] = useState<Tab>(() => (params.which === 'following' ? 'following' : params.which === 'subscriptions' && mine ? 'subscriptions' : 'followers'));
  const [owner, setOwner] = useState<Profile | null>(null);
  const [lists, setLists] = useState<Partial<Record<Lists, Profile[]>>>({});
  const [subs, setSubs] = useState<CreatorSub[] | null>(null);
  const [errors, setErrors] = useState<Partial<Record<Tab, string>>>({});
  const [suggested, setSuggested] = useState<SuggestedPerson[] | null>(null);
  const [query, setQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  // Follows changed on this page, over what the list said when it loaded.
  const [changed, setChanged] = useState<Record<string, FollowState>>({});
  const busy = useRef(new Set<string>());
  const suggestions = useSuggestionFollows();

  // Admins may hide who follows them and whom they follow: the lists stay shut to everyone else.
  const hidden = !mine && !!owner?.hide_connections;

  const loadOwner = useCallback(async () => {
    try {
      setOwner(await getProfile(userId));
    } catch {
      // The header just stays bare; the lists below say what went wrong.
    }
  }, [userId]);

  const loadTab = useCallback(
    async (t: Tab) => {
      setErrors((e) => ({ ...e, [t]: '' }));
      try {
        if (t === 'subscriptions') setSubs(await mySubscriptions(me));
        else {
          const rows = await listPeople(userId, t);
          setLists((l) => ({ ...l, [t]: rows }));
        }
      } catch (e) {
        setErrors((x) => ({ ...x, [t]: errText(e) }));
      }
    },
    [userId, me],
  );

  const loadSuggested = useCallback(async () => {
    try {
      setSuggested(await fetchSuggestedPeople(SUGGESTIONS));
    } catch {
      // Suggestions are extra: without them the page is simply shorter.
    }
  }, []);

  useEffect(() => {
    loadOwner();
    loadSuggested();
  }, [loadOwner, loadSuggested]);

  // Each tab loads the first time it is opened, and keeps its list while you switch back and forth.
  const loaded = tab === 'subscriptions' ? subs !== null : lists[tab] !== undefined;
  useEffect(() => {
    if (!loaded) loadTab(tab);
  }, [tab, loaded, loadTab]);

  async function refresh() {
    setRefreshing(true);
    await Promise.all([loadOwner(), loadTab(tab), loadSuggested()]);
    setRefreshing(false);
  }

  // The underline slides to the chosen tab.
  const index = Math.max(0, tabs.indexOf(tab));
  const tabWidth = width / tabs.length;
  const slide = useRef(new Animated.Value(index)).current;
  useEffect(() => {
    const run = Animated.timing(slide, { toValue: index, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true });
    run.start();
    return () => run.stop();
  }, [index, slide]);

  function choose(t: Tab) {
    if (t === tab) return;
    tap('select');
    setQuery('');
    setTab(t);
  }

  const stateOf = (p: Profile): FollowState => changed[p.id] ?? (p.is_following ? 'following' : p.requested ? 'requested' : 'none');
  const put = (id: string, s: FollowState) => setChanged((c) => ({ ...c, [id]: s }));

  async function follow(p: Profile) {
    // A second tap while the first is on its way would undo it half done.
    if (busy.current.has(p.id)) return;
    const was = stateOf(p);
    if (was === 'following' && p.is_private) {
      const ok = await new Promise<boolean>((resolve) =>
        Alert.alert(`Unfollow ${p.username}?`, 'Their account is private, so you would need to ask again to see their posts.', [
          { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
          { text: 'Unfollow', style: 'destructive', onPress: () => resolve(true) },
        ]),
      );
      if (!ok) return;
    }
    busy.current.add(p.id);
    tap();
    const now: FollowState = was !== 'none' ? 'none' : p.is_private ? 'requested' : 'following';
    put(p.id, now);
    // On my own page the count in the tab follows along.
    const step = (was === 'following' ? -1 : 0) + (now === 'following' ? 1 : 0);
    if (mine && step) setOwner((o) => (o ? { ...o, following_count: Math.max(0, o.following_count + step) } : o));
    try {
      if (now === 'following') await setFollow(me, p.id, true);
      else if (now === 'requested') {
        await requestFollow(me, p.id);
        toast(`Requested to follow ${p.username}`);
      } else if (was === 'following') await setFollow(me, p.id, false);
      else await removeFollowRequest(me, p.id);
    } catch (e) {
      put(p.id, was);
      if (mine && step) setOwner((o) => (o ? { ...o, following_count: Math.max(0, o.following_count - step) } : o));
      toast(errText(e));
    } finally {
      busy.current.delete(p.id);
    }
  }

  function remove(p: Profile) {
    Alert.alert('Remove this follower?', `${p.username} won't be told that you removed them.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          tap();
          setLists((l) => ({ ...l, followers: l.followers?.filter((x) => x.id !== p.id) }));
          setOwner((o) => (o ? { ...o, followers_count: Math.max(0, o.followers_count - 1) } : o));
          try {
            await removeFollower(me, p.id);
          } catch (e) {
            toast(errText(e));
            loadTab('followers');
            loadOwner();
          }
        },
      },
    ]);
  }

  function dismiss(p: SuggestedPerson) {
    setSuggested((cur) => (cur ? cur.filter((x) => x.id !== p.id) : cur));
    hideSuggestion(me, p.id).catch((e) => toast(errText(e)));
  }

  const open = (id: string) => router.push(`/user/${id}`);

  function buttonFor(p: Profile) {
    if (p.id === me) return null;
    if (mine && tab === 'followers') return <Button small kind="ghost" label="Remove" onPress={() => remove(p)} />;
    const s = stateOf(p);
    if (s === 'none') return <Button small label={p.follows_me ? 'Follow back' : 'Follow'} onPress={() => follow(p)} />;
    return <Button small kind="ghost" label={s === 'following' ? 'Following' : 'Requested'} onPress={() => follow(p)} />;
  }

  /** On my own followers: a quiet "Follow" beside the name of anyone I don't follow back. */
  function inlineFollow(p: Profile) {
    if (!mine || tab !== 'followers' || p.id === me || stateOf(p) !== 'none') return null;
    return (
      <Text onPress={() => follow(p)} accessibilityRole="button" accessibilityLabel={`Follow ${p.username}`} style={{ color: C.accent2, fontWeight: '700', fontSize: 15 }}>
        <Text style={{ color: C.fg3 }}>· </Text>Follow
      </Text>
    );
  }

  const label = (t: Tab) => (t === 'followers' ? count(owner?.followers_count ?? 0, 'follower') : t === 'following' ? `${fmt(owner?.following_count ?? 0)} following` : 'Subscriptions');
  const others = (suggested ?? []).filter((p) => p.id !== userId && p.id !== me && !isHidden(me, p.id));

  const suggestionsBlock = others.length ? (
    <View style={{ paddingTop: 18 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 8 }}>
        <Text accessibilityRole="header" style={{ color: C.fg, fontSize: 16.5, fontWeight: '700' }}>Suggested for you</Text>
        <Pressable onPress={() => router.push('/discover-people')} hitSlop={8} accessibilityRole="button" accessibilityLabel="See all suggestions">
          <Text style={{ color: C.accent2, fontWeight: '600', fontSize: 15 }}>See all</Text>
        </Pressable>
      </View>
      {others.map((p) => (
        <SuggestionLine key={p.id} p={p} state={suggestions.stateOf(p.id)} onOpen={() => open(p.id)} onFollow={() => suggestions.toggle(p)} onDismiss={() => dismiss(p)} />
      ))}
    </View>
  ) : null;

  const refresher = <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={C.fg2} />;
  const error = errors[tab] ?? '';

  let body: React.ReactNode;
  if (tab === 'subscriptions') {
    body = (
      <FlatList
        data={subs ?? []}
        keyExtractor={(s) => s.id}
        renderItem={({ item }) => <SubLine s={item} onOpen={() => router.push(`/subscribe/${item.creator_id}`)} />}
        ListHeaderComponent={subs?.length ? <Text style={{ color: C.fg2, fontSize: 13.5, lineHeight: 19, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 6 }}>Creators you support each month. Tap one to see your subscription.</Text> : null}
        ListEmptyComponent={
          subs === null ? (
            error ? <ErrorNote message={error} onRetry={() => loadTab('subscriptions')} /> : <Loading />
          ) : error ? (
            <ErrorNote message={error} onRetry={() => loadTab('subscriptions')} />
          ) : (
            <Empty icon="star" title="No subscriptions yet" body="When you subscribe to a creator, they appear here with the date it renews." />
          )
        }
        contentContainerStyle={{ paddingBottom: 48 }}
        refreshControl={refresher}
      />
    );
  } else {
    const list = lists[tab];
    const needle = query.trim().toLowerCase();
    const shown = list && needle ? list.filter((p) => p.username.toLowerCase().includes(needle) || p.full_name.toLowerCase().includes(needle)) : list;
    body = (
      <FlatList
        data={hidden ? [] : shown ?? []}
        keyExtractor={(p) => p.id}
        renderItem={({ item }) => <PersonLine p={item} onOpen={() => open(item.id)} after={inlineFollow(item)} right={buttonFor(item)} />}
        ListHeaderComponent={!hidden && list && list.length >= SEARCH_FROM ? <View style={{ paddingTop: 12, paddingBottom: 6 }}><SearchField value={query} onChangeText={setQuery} label={`Search ${tab}`} /></View> : null}
        ListEmptyComponent={
          hidden ? (
            <Empty icon="lock" title="This list is private" body={`${owner?.username ?? 'This account'} keeps who they follow and who follows them to themselves.`} />
          ) : list === undefined ? (
            error ? <ErrorNote message={error} onRetry={() => loadTab(tab)} /> : <Loading />
          ) : error ? (
            <ErrorNote message={error} onRetry={() => loadTab(tab)} />
          ) : needle ? (
            <Empty title="No one by that name" body="Check the spelling, or try part of their name." />
          ) : tab === 'followers' ? (
            <Empty icon="people" title="No followers yet" body={mine ? 'When people follow you, you will see them here.' : 'People who follow this account will appear here.'} />
          ) : (
            <Empty icon="people" title="Not following anyone yet" body={mine ? 'Accounts you follow will appear here.' : 'Accounts this person follows will appear here.'} />
          )
        }
        // Suggestions wait for the list, so they don't jump down the page as it arrives.
        ListFooterComponent={hidden || list !== undefined ? suggestionsBlock : null}
        contentContainerStyle={{ paddingTop: 4, paddingBottom: 48 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshControl={refresher}
      />
    );
  }

  return (
    <Screen>
      <View style={{ height: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, gap: 6 }}>
        <IconButton name="back" label="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
        <View accessible accessibilityRole="header" accessibilityLabel={owner?.username ?? ''} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
          <Text numberOfLines={1} style={{ color: C.fg, fontSize: 18, fontWeight: '700', flexShrink: 1 }}>{owner?.username ?? ''}</Text>
          {owner?.verified ? <VerifiedTick /> : null}
        </View>
        <IconButton name="adduser" label="Discover people" onPress={() => router.push('/discover-people')} />
      </View>

      <View accessibilityRole="tablist" style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: C.line }}>
        {tabs.map((t) => {
          const on = t === tab;
          const shut = hidden && t !== 'subscriptions';
          const text = <Text numberOfLines={1} style={{ color: on ? C.fg : C.fg2, fontWeight: on ? '700' : '600', fontSize: 14.5 }}>{label(t)}</Text>;
          // A hidden list's tab is only a label: it neither opens nor reacts to a touch.
          if (shut) return <View key={t} accessibilityLabel={`${label(t)}, hidden`} style={{ flex: 1, height: 46, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 }}>{text}</View>;
          return (
            <Pressable key={t} onPress={() => choose(t)} accessibilityRole="tab" accessibilityLabel={label(t)} accessibilityState={{ selected: on }} style={{ flex: 1, height: 46, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 }}>
              {text}
            </Pressable>
          );
        })}
        <Animated.View pointerEvents="none" style={{ position: 'absolute', left: 0, bottom: -1, width: tabWidth, height: 2, alignItems: 'center', transform: [{ translateX: Animated.multiply(slide, tabWidth) }] }}>
          <View style={{ width: '62%', height: 2, borderRadius: 1, backgroundColor: C.fg }} />
        </Animated.View>
      </View>

      {body}
    </Screen>
  );
}
