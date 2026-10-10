import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { fetchLives, fetchStoryTray } from '../lib/api';
import { tap } from '../lib/haptics';
import { useSession } from '../lib/session';
import { listen } from '../lib/store';
import { C } from '../lib/theme';
import type { LiveCard, StoryGroup } from '../lib/types';
import { Icon } from './Icon';
import { LiveAvatar } from './LiveBadge';
import { StoryCircleSkeleton } from './Skeleton';
import { Avatar, useToast } from './ui';

export function StoryTray({ refreshKey }: { refreshKey: number }) {
  const { me, profile } = useSession();
  const router = useRouter();
  const toast = useToast();
  const [groups, setGroups] = useState<StoryGroup[]>([]);
  const [lives, setLives] = useState<LiveCard[]>([]);
  // Until the first answer (or failure), empty circles stand where the stories will be. A refresh
  // keeps the circles already shown.
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(() => {
    fetchStoryTray(me)
      .then(setGroups)
      .catch(() => {})
      .finally(() => setLoaded(true));
    // Anyone broadcasting right now sits at the front of the tray.
    fetchLives()
      .then((cards) => setLives(cards.filter((c) => !c.ended_at)))
      .catch(() => {});
  }, [me]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);
  useEffect(() => listen('stories', load), [load]);

  const mine = groups.find((g) => g.user_id === me);
  const others = groups.filter((g) => g.user_id !== me);
  const myLive = lives.find((l) => l.user_id === me);
  const otherLives = lives.filter((l) => l.user_id !== me);

  /** Holding "Your story" offers the two things you can start from here. */
  function storyMenu() {
    // Members under 14 cannot broadcast live, so they are only offered a story.
    Alert.alert('Your story', undefined, [
      { text: 'Add to story', onPress: () => router.push('/add-story') },
      ...(profile?.restricted ? [] : [{ text: 'Go live', onPress: () => router.push('/go-live') }]),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  }

  /**
   * Holding someone else's circle: a Plus member watches quietly (the viewer records nothing, so they
   * stay off the viewer list); anyone else is told it's a Plus perk.
   */
  function preview(g: StoryGroup) {
    if (!profile?.plus) {
      tap('warning');
      toast('Quiet story previews are part of Community Plus');
      return;
    }
    tap('medium');
    router.push(`/story/${g.user_id}?quiet=1`);
  }

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, paddingTop: 6, paddingBottom: 12, gap: 14 }}>
      {myLive ? (
        <Pressable onPress={() => router.push('/go-live')} accessibilityRole="button" accessibilityLabel="Your live broadcast" style={({ pressed }) => ({ width: 76, alignItems: 'center', gap: 5, opacity: pressed ? 0.7 : 1 })}>
          <LiveAvatar uri={myLive.avatar_url} name={myLive.full_name} size={66} />
          <Text numberOfLines={1} style={{ color: C.fg, fontSize: 12, marginTop: 2 }}>You</Text>
        </Pressable>
      ) : null}
      {otherLives.map((l) => (
        <Pressable key={l.id} onPress={() => router.push(`/live/${l.id}`)} accessibilityRole="button" accessibilityLabel={`${l.username} is live`} style={({ pressed }) => ({ width: 76, alignItems: 'center', gap: 5, opacity: pressed ? 0.7 : 1 })}>
          <LiveAvatar uri={l.avatar_url} name={l.username} size={66} />
          <Text numberOfLines={1} style={{ color: C.fg, fontSize: 12, maxWidth: 76, marginTop: 2 }}>{l.username}</Text>
        </Pressable>
      ))}
      <Pressable onPress={() => router.push(mine ? `/story/${me}` : '/add-story')} onLongPress={storyMenu} accessibilityRole="button" accessibilityLabel={mine ? 'View your story' : 'Add to your story'} accessibilityHint="Hold for more options" style={{ width: 76, alignItems: 'center', gap: 5 }}>
        <View>
          <Avatar uri={profile?.avatar_url} name={profile?.full_name} size={mine ? 66 : 71} ring={mine ? 'seen' : null} />
          {!mine ? (
            <View style={{ position: 'absolute', right: -2, bottom: -2, width: 26, height: 26, borderRadius: 13, backgroundColor: C.fg, borderWidth: 3, borderColor: C.bg, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="plus" size={14} color={C.bg} weight={3} />
            </View>
          ) : null}
        </View>
        <Text numberOfLines={1} style={{ color: C.fg, fontSize: 12 }}>Your story</Text>
      </Pressable>
      {others.map((g) => (
        <Pressable key={g.user_id} onPress={() => router.push(`/story/${g.user_id}`)} onLongPress={() => preview(g)} accessibilityRole="button" accessibilityLabel={`${g.username}'s story`} accessibilityHint="Hold to preview quietly" style={{ width: 76, alignItems: 'center', gap: 5 }}>
          <Avatar uri={g.avatar_url} name={g.username} size={66} ring={g.seen ? 'seen' : g.close ? 'close' : 'new'} />
          <Text numberOfLines={1} style={{ color: g.seen ? C.fg2 : C.fg, fontSize: 12, maxWidth: 76 }}>{g.username}</Text>
        </Pressable>
      ))}
      {loaded ? null : [1, 2, 3, 4, 5].map((i) => <StoryCircleSkeleton key={i} index={i} />)}
    </ScrollView>
  );
}
