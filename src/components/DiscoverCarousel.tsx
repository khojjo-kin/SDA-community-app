import React, { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Pressable, ScrollView, Text, View, ViewStyle } from 'react-native';
import { useRouter } from 'expo-router';
import { dismissSuggestion, fetchSuggestedPeople, removeFollowRequest, requestFollow, setFollow } from '../lib/api';
import { useAppFont } from '../lib/fonts';
import { useSession } from '../lib/session';
import { C, errText, fmt } from '../lib/theme';
import type { SuggestedPerson } from '../lib/types';
import { Icon, VerifiedTick } from './Icon';
import { Avatar, Button, useToast } from './ui';

/* ---------- suggestions shared by the profile carousel and the Discover people page ---------- */

const CAROUSEL_SIZE = 20;

// Kept for the whole run of the app (not in storage), keyed by account so a switch of account never
// shows someone else's suggestions. The cache lets the carousel open full instead of empty.
let cache: { me: string; rows: SuggestedPerson[] } | null = null;
let inflight: { me: string; job: Promise<SuggestedPerson[]> } | null = null;
// People dismissed or followed here, so the carousel and the full page agree while both are open.
const dismissed = new Set<string>();
const follows = new Map<string, SuggestionFollow>();

/** Where I stand with someone I was suggested. */
export type SuggestionFollow = 'none' | 'following' | 'requested';

/** A profile theme's button colours, or null for the app's own. */
export type Accent = { bg: string; fg: string } | null;

function loadSuggestions(me: string): Promise<SuggestedPerson[]> {
  if (inflight?.me === me) return inflight.job;
  const job = fetchSuggestedPeople(CAROUSEL_SIZE).then((rows) => {
    cache = { me, rows };
    return rows;
  });
  const entry = { me, job };
  inflight = entry;
  const done = () => {
    if (inflight === entry) inflight = null;
  };
  job.then(done, done);
  return job;
}

/** Fetches suggestions quietly in the background so the carousel has them when it opens. */
export function prefetchSuggestions(me: string) {
  if (!me || cache?.me === me || inflight?.me === me) return;
  loadSuggestions(me).catch(() => {});
}

/** What was last fetched for this account, if anything. */
export function peekSuggestions(me: string): SuggestedPerson[] | null {
  return cache?.me === me ? cache.rows.filter((p) => !isHidden(me, p.id)) : null;
}

export function isHidden(me: string, id: string): boolean {
  return dismissed.has(`${me}:${id}`);
}

/** The X on a suggestion: gone from every list at once, and the database stops suggesting them. */
export function hideSuggestion(me: string, id: string): Promise<void> {
  dismissed.add(`${me}:${id}`);
  if (cache?.me === me) cache = { me, rows: cache.rows.filter((p) => p.id !== id) };
  return dismissSuggestion(me, id);
}

/**
 * Follows someone I was suggested. Suggestions don't say whether an account is private, and the
 * database refuses a plain follow of a private account, so a refusal is answered with a request.
 */
async function followSuggested(me: string, userId: string): Promise<'following' | 'requested'> {
  try {
    await setFollow(me, userId, true);
    return 'following';
  } catch (e) {
    try {
      await requestFollow(me, userId);
    } catch {
      // The request failed too, so the first refusal is the one worth showing.
      throw e;
    }
    return 'requested';
  }
}

export function followLabel(p: SuggestedPerson, state: SuggestionFollow): string {
  return state === 'following' ? 'Following' : state === 'requested' ? 'Requested' : p.follows_me ? 'Follow back' : 'Follow';
}

/** The short grey line on a carousel card. */
export function suggestionReason(p: SuggestedPerson): string {
  if (p.mutual_count > 0) return `${fmt(p.mutual_count)} ${p.mutual_count === 1 ? 'mutual' : 'mutuals'}`;
  if (p.follows_me) return 'Follows you';
  return 'Suggested for you';
}

/** "Followed by anna and 3 others", for the longer rows on the Discover people page. */
export function followedBy(p: SuggestedPerson): string {
  const names = p.mutual_names.filter(Boolean);
  if (p.mutual_count > 0 && names.length) {
    const others = p.mutual_count - 1;
    if (others <= 0) return `Followed by ${names[0]}`;
    if (others === 1 && names[1]) return `Followed by ${names[0]} and ${names[1]}`;
    return `Followed by ${names[0]} and ${fmt(others)} ${others === 1 ? 'other' : 'others'}`;
  }
  return suggestionReason(p);
}

/** Follow buttons for suggestions: what each one says, and what a tap does. */
export function useSuggestionFollows() {
  const { me } = useSession();
  const toast = useToast();
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  // A second tap while the first is still on its way would undo it half done.
  const busy = useRef(new Set<string>());

  const stateOf = (id: string): SuggestionFollow => follows.get(`${me}:${id}`) ?? 'none';
  const put = (id: string, s: SuggestionFollow) => {
    follows.set(`${me}:${id}`, s);
    rerender();
  };

  async function toggle(p: SuggestedPerson) {
    if (busy.current.has(p.id)) return;
    busy.current.add(p.id);
    const was = stateOf(p.id);
    try {
      if (was === 'none') {
        put(p.id, 'following');
        const now = await followSuggested(me, p.id);
        put(p.id, now);
        if (now === 'requested') toast(`Requested to follow ${p.username}`);
      } else {
        put(p.id, 'none');
        if (was === 'following') await setFollow(me, p.id, false);
        else await removeFollowRequest(me, p.id);
      }
    } catch (e) {
      put(p.id, was);
      toast(errText(e));
    } finally {
      busy.current.delete(p.id);
    }
  }

  return { stateOf, toggle };
}

/* ---------- buttons ---------- */

/** The small primary button, in a profile theme's colours when one is given (the app's green otherwise). */
export function AccentButton({ label, onPress, accent, style }: { label: string; onPress?: () => void; accent: Accent; style?: ViewStyle }) {
  const font = useAppFont('bold');
  if (!accent) return <Button small label={label} onPress={onPress} style={style} />;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [{ height: 32, paddingHorizontal: 14, borderRadius: 10, backgroundColor: accent.bg, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.75 : 1 }, style]}>
      <Text numberOfLines={1} style={{ color: accent.fg, fontWeight: '600', fontSize: 13.5, fontFamily: font }}>{label}</Text>
    </Pressable>
  );
}

/* ---------- the carousel on your own profile ---------- */

const CARD = 150;

function Card({ p, state, accent, onFollow, onDismiss }: { p: SuggestedPerson; state: SuggestionFollow; accent: Accent; onFollow: () => void; onDismiss: () => void }) {
  const router = useRouter();
  return (
    <View style={{ width: CARD, borderRadius: 14, borderWidth: 1, borderColor: C.line, backgroundColor: C.bg2, paddingHorizontal: 10, paddingTop: 18, paddingBottom: 10, alignItems: 'center' }}>
      <Pressable onPress={() => router.push(`/user/${p.id}`)} accessibilityRole="button" accessibilityLabel={`${p.full_name || p.username}, ${suggestionReason(p)}`} style={({ pressed }) => ({ alignSelf: 'stretch', alignItems: 'center', opacity: pressed ? 0.7 : 1 })}>
        <Avatar uri={p.avatar_url} name={p.full_name || p.username} size={76} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 10, maxWidth: '100%' }}>
          <Text numberOfLines={1} style={{ color: C.fg, fontWeight: '700', fontSize: 14, flexShrink: 1 }}>{p.full_name || p.username}</Text>
          {p.verified ? <VerifiedTick size={13} /> : null}
        </View>
        <Text numberOfLines={1} style={{ color: C.fg2, fontSize: 12.5, marginTop: 2 }}>{suggestionReason(p)}</Text>
      </Pressable>
      {state === 'none' ? (
        <AccentButton label={followLabel(p, state)} accent={accent} onPress={onFollow} style={{ alignSelf: 'stretch', marginTop: 12 }} />
      ) : (
        <Button small kind="ghost" label={followLabel(p, state)} onPress={onFollow} style={{ alignSelf: 'stretch', marginTop: 12 }} />
      )}
      {/* Last, so it sits on top of the card. */}
      <Pressable onPress={onDismiss} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Stop suggesting ${p.username}`} style={({ pressed }) => ({ position: 'absolute', top: 6, right: 6, padding: 2, opacity: pressed ? 0.5 : 1 })}>
        <Icon name="close" size={15} color={C.fg2} weight={2.2} />
      </Pressable>
    </View>
  );
}

/**
 * "Discover people" under the buttons on your own profile: slides open and shut with `open`,
 * fetching fresh suggestions every time it opens.
 */
export function DiscoverCarousel({ open, accent, link }: { open: boolean; accent: Accent; link: string }) {
  const { me } = useSession();
  const router = useRouter();
  const toast = useToast();
  const [list, setList] = useState<SuggestedPerson[] | null>(() => peekSuggestions(me));
  const [error, setError] = useState('');
  const { stateOf, toggle } = useSuggestionFollows();
  // Still drawn while it slides shut; the height comes from measuring the content.
  const [shown, setShown] = useState(open);
  const [height, setHeight] = useState(0);
  const anim = useRef(new Animated.Value(open ? 1 : 0)).current;

  useEffect(() => {
    if (open) setShown(true);
    const run = Animated.timing(anim, { toValue: open ? 1 : 0, duration: 220, useNativeDriver: false });
    run.start(({ finished }) => {
      if (finished && !open) setShown(false);
    });
    return () => run.stop();
  }, [open, anim]);

  const load = useCallback(async () => {
    setError('');
    try {
      const rows = await loadSuggestions(me);
      setList(rows.filter((p) => !isHidden(me, p.id)));
    } catch (e) {
      setError(errText(e));
    }
  }, [me]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  function dismiss(p: SuggestedPerson) {
    setList((cur) => (cur ? cur.filter((x) => x.id !== p.id) : cur));
    hideSuggestion(me, p.id).catch((e) => toast(errText(e)));
  }

  if (!shown) return null;
  // Someone dismissed on the full page since this list was fetched.
  const visible = list ? list.filter((p) => !isHidden(me, p.id)) : null;

  let body: React.ReactNode;
  if (visible === null) {
    body = error ? (
      <Pressable onPress={load} accessibilityRole="button" style={{ height: 120, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>
        <Text style={{ color: C.fg2, textAlign: 'center', lineHeight: 20 }}>Suggestions didn't load. <Text style={{ color: link, fontWeight: '600' }}>Try again</Text></Text>
      </Pressable>
    ) : (
      <View style={{ height: 120, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={C.fg2} />
      </View>
    );
  } else if (!visible.length) {
    body = <Text style={{ color: C.fg2, paddingHorizontal: 16, paddingVertical: 18, lineHeight: 20 }}>No one to suggest just now. Tap See all to invite friends from church.</Text>;
  } else {
    body = (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
        {visible.map((p) => (
          <Card key={p.id} p={p} state={stateOf(p.id)} accent={accent} onFollow={() => toggle(p)} onDismiss={() => dismiss(p)} />
        ))}
      </ScrollView>
    );
  }

  return (
    <Animated.View style={{ height: anim.interpolate({ inputRange: [0, 1], outputRange: [0, height] }), opacity: anim, overflow: 'hidden' }}>
      <View onLayout={(e) => setHeight(e.nativeEvent.layout.height)} style={{ position: 'absolute', top: 0, left: 0, right: 0, paddingBottom: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 10 }}>
          <Text accessibilityRole="header" style={{ color: C.fg, fontSize: 15.5, fontWeight: '700' }}>Discover people</Text>
          <Pressable onPress={() => router.push('/discover-people')} hitSlop={8} accessibilityRole="button" accessibilityLabel="See all suggestions">
            <Text style={{ color: link, fontSize: 15, fontWeight: '600' }}>See all</Text>
          </Pressable>
        </View>
        {body}
      </View>
    </Animated.View>
  );
}
