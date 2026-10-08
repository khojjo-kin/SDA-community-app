import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { fetchStoryTray } from '../lib/api';
import { useSession } from '../lib/session';
import { listen } from '../lib/store';
import { C } from '../lib/theme';
import type { StoryGroup } from '../lib/types';
import { Icon } from './Icon';
import { Avatar } from './ui';

export function StoryTray({ refreshKey }: { refreshKey: number }) {
  const { me, profile } = useSession();
  const router = useRouter();
  const [groups, setGroups] = useState<StoryGroup[]>([]);

  const load = useCallback(() => {
    fetchStoryTray(me).then(setGroups).catch(() => {});
  }, [me]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);
  useEffect(() => listen('stories', load), [load]);

  const mine = groups.find((g) => g.user_id === me);
  const others = groups.filter((g) => g.user_id !== me);

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, paddingTop: 6, paddingBottom: 12, gap: 14 }}>
      <Pressable onPress={() => router.push(mine ? `/story/${me}` : '/create?mode=story')} accessibilityRole="button" accessibilityLabel={mine ? 'View your story' : 'Add to your story'} style={{ width: 76, alignItems: 'center', gap: 5 }}>
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
        <Pressable key={g.user_id} onPress={() => router.push(`/story/${g.user_id}`)} accessibilityRole="button" accessibilityLabel={`${g.username}'s story`} style={{ width: 76, alignItems: 'center', gap: 5 }}>
          <Avatar uri={g.avatar_url} name={g.username} size={66} ring={g.seen ? 'seen' : 'new'} />
          <Text numberOfLines={1} style={{ color: g.seen ? C.fg2 : C.fg, fontSize: 12, maxWidth: 76 }}>{g.username}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}
