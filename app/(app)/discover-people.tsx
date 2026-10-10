import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, RefreshControl, Share, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { followedBy, followLabel, hideSuggestion, isHidden, peekSuggestions, useSuggestionFollows } from '../../src/components/DiscoverCarousel';
import { Icon, VerifiedTick } from '../../src/components/Icon';
import { RowsSkeleton } from '../../src/components/Skeleton';
import { Avatar, Button, Empty, ErrorNote, Screen, ScreenHeader, SectionLabel, useToast } from '../../src/components/ui';
import { acceptFollowRequest, fetchFollowRequests, fetchSuggestedPeople, removeFollowRequest } from '../../src/lib/api';
import { useSession } from '../../src/lib/session';
import { C, errText } from '../../src/lib/theme';
import type { Profile, SuggestedPerson } from '../../src/lib/types';

const PAGE_SIZE = 50;
/** Requests shown here before "See all" takes over. */
const REQUESTS_SHOWN = 3;

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

function RequestRow({ p, onAnswer }: { p: Profile; onAnswer: (accept: boolean) => void }) {
  const router = useRouter();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 8 }}>
      <Pressable onPress={() => router.push(`/user/${p.id}`)} accessibilityRole="button" accessibilityLabel={`${p.username}, ${p.full_name}`} style={({ pressed }) => ({ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, opacity: pressed ? 0.7 : 1 })}>
        <Avatar uri={p.avatar_url} name={p.full_name} size={52} />
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Text numberOfLines={1} style={{ color: C.fg, fontWeight: '700', fontSize: 14.5, flexShrink: 1 }}>{p.username}</Text>
            {p.verified ? <VerifiedTick size={16} /> : null}
          </View>
          {p.full_name ? <Text numberOfLines={1} style={{ color: C.fg2, fontSize: 13.5 }}>{p.full_name}</Text> : null}
        </View>
      </Pressable>
      <Button small label="Confirm" onPress={() => onAnswer(true)} />
      <Button small kind="ghost" label="Delete" onPress={() => onAnswer(false)} />
    </View>
  );
}

function SuggestionRow({ p, label, following, onFollow, onDismiss }: { p: SuggestedPerson; label: string; following: boolean; onFollow: () => void; onDismiss: () => void }) {
  const router = useRouter();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 16, paddingRight: 10, paddingVertical: 8 }}>
      <Pressable onPress={() => router.push(`/user/${p.id}`)} accessibilityRole="button" accessibilityLabel={`${p.username}, ${p.full_name}. ${followedBy(p)}`} style={({ pressed }) => ({ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, opacity: pressed ? 0.7 : 1 })}>
        <Avatar uri={p.avatar_url} name={p.full_name || p.username} size={52} />
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Text numberOfLines={1} style={{ color: C.fg, fontWeight: '700', fontSize: 14.5, flexShrink: 1 }}>{p.username}</Text>
            {p.verified ? <VerifiedTick size={16} /> : null}
          </View>
          {p.full_name ? <Text numberOfLines={1} style={{ color: C.fg2, fontSize: 13.5 }}>{p.full_name}</Text> : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
            {p.mutual_avatars.length ? <MutualFaces uris={p.mutual_avatars} /> : null}
            <Text numberOfLines={1} style={{ color: C.fg2, fontSize: 12.5, flexShrink: 1 }}>{followedBy(p)}</Text>
          </View>
        </View>
      </Pressable>
      <Button small kind={following ? 'ghost' : 'primary'} label={label} onPress={onFollow} />
      <Pressable onPress={onDismiss} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Stop suggesting ${p.username}`} style={({ pressed }) => ({ padding: 6, opacity: pressed ? 0.5 : 1 })}>
        <Icon name="close" size={17} color={C.fg2} weight={2.1} />
      </Pressable>
    </View>
  );
}

/** Everyone the app thinks you might know, follow requests waiting for you, and a way to invite friends. */
export default function DiscoverPeople() {
  const { me, profile } = useSession();
  const router = useRouter();
  const toast = useToast();
  // What the profile carousel last fetched, so the page opens with something while the full list loads.
  const [people, setPeople] = useState<SuggestedPerson[] | null>(() => peekSuggestions(me));
  const [requests, setRequests] = useState<Profile[]>([]);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const { stateOf, toggle } = useSuggestionFollows();

  const load = useCallback(async () => {
    // Requests are extra here: if they fail, the suggestions still show (and the other way round).
    const asking = fetchFollowRequests(me).then(setRequests, () => {});
    try {
      const rows = await fetchSuggestedPeople(PAGE_SIZE);
      setPeople(rows);
      setError('');
    } catch (e) {
      setError(errText(e));
    }
    await asking;
    setRefreshing(false);
  }, [me]);

  useEffect(() => {
    load();
  }, [load]);

  function dismiss(p: SuggestedPerson) {
    setPeople((cur) => (cur ? cur.filter((x) => x.id !== p.id) : cur));
    hideSuggestion(me, p.id).catch((e) => toast(errText(e)));
  }

  async function answer(p: Profile, accept: boolean) {
    // The row goes straight away; the reload puts it back if the database said no.
    setRequests((cur) => cur.filter((x) => x.id !== p.id));
    try {
      if (accept) await acceptFollowRequest(p.id);
      else await removeFollowRequest(p.id, me);
      toast(accept ? `${p.username} now follows you` : 'Request removed');
    } catch (e) {
      toast(errText(e));
    }
    fetchFollowRequests(me).then(setRequests, () => {});
  }

  async function invite() {
    const handle = profile?.username ? `I'm ${profile.username} there: ` : 'Find me there: ';
    try {
      await Share.share({ message: `Come and join me on Community, the app for our church family to share photos, videos and encouragement. ${handle}community://user/${me}` });
    } catch {
      toast('Sharing could not be opened');
    }
  }

  const visible = people ? people.filter((p) => !isHidden(me, p.id)) : null;

  const header = (
    <View>
      <Pressable onPress={invite} accessibilityRole="button" accessibilityLabel="Invite friends" style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: pressed ? C.press : 'transparent' })}>
        <View style={{ width: 52, height: 52, borderRadius: 26, borderWidth: 1.5, borderColor: C.line, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="share" size={22} color={C.fg} weight={2} />
        </View>
        <Text style={{ flex: 1, color: C.fg, fontWeight: '700', fontSize: 15.5 }}>Invite friends</Text>
        <Icon name="right" size={18} color={C.fg2} weight={2} />
      </Pressable>

      {requests.length ? (
        <>
          <SectionLabel
            right={
              <Pressable onPress={() => router.push('/follow-requests')} hitSlop={8} accessibilityRole="button" accessibilityLabel="See all follow requests">
                <Text style={{ color: C.accent2, fontWeight: '600', fontSize: 15 }}>See all</Text>
              </Pressable>
            }>
            Follow requests
          </SectionLabel>
          {requests.slice(0, REQUESTS_SHOWN).map((p) => (
            <RequestRow key={p.id} p={p} onAnswer={(accept) => answer(p, accept)} />
          ))}
        </>
      ) : null}

      {visible && visible.length ? <SectionLabel>Suggested for you</SectionLabel> : null}
      {/* A failed refresh keeps the list it had; this says why nothing changed. */}
      {error && visible && visible.length ? <Text style={{ color: C.fg2, fontSize: 13.5, paddingHorizontal: 16, paddingBottom: 6 }}>Suggestions didn't refresh. Pull down to try again.</Text> : null}
    </View>
  );

  return (
    <Screen>
      <ScreenHeader title="Discover people" />
      <FlatList
        data={visible ?? []}
        keyExtractor={(p) => p.id}
        renderItem={({ item: p }) => {
          const state = stateOf(p.id);
          return <SuggestionRow p={p} label={followLabel(p, state)} following={state !== 'none'} onFollow={() => toggle(p)} onDismiss={() => dismiss(p)} />;
        }}
        ListHeaderComponent={header}
        ListEmptyComponent={
          visible === null ? (
            error ? <ErrorNote message={error} onRetry={() => { setError(''); load(); }} /> : <RowsSkeleton count={8} avatar={52} trailing="button" />
          ) : error ? (
            <ErrorNote message={error} onRetry={() => { setError(''); load(); }} />
          ) : (
            <Empty icon="people" title="No suggestions right now" />
          )
        }
        contentContainerStyle={{ paddingBottom: 48 }}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={C.fg2} />}
      />
    </Screen>
  );
}
