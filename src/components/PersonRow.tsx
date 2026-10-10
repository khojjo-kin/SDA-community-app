import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { setFollow } from '../lib/api';
import { useSession } from '../lib/session';
import { C, errText, fmt } from '../lib/theme';
import type { Profile } from '../lib/types';
import { VerifiedTick } from './Icon';
import { Avatar, Button, useToast } from './ui';

/** A person in a list, with a follow button that works in place. Memoised: search lists draw again on every key typed. */
export const PersonRow = React.memo(function PersonRow({ person, onPress, right, hideFollow }: { person: Profile; onPress?: () => void; right?: React.ReactNode; hideFollow?: boolean }) {
  const { me } = useSession();
  const router = useRouter();
  const toast = useToast();
  const [following, setFollowing] = useState(person.is_following);

  async function toggle() {
    const next = !following;
    setFollowing(next);
    try {
      await setFollow(me, person.id, next);
    } catch (e) {
      setFollowing(!next);
      toast(errText(e));
    }
  }

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 8 }}>
      <Pressable onPress={onPress ?? (() => router.push(`/user/${person.id}`))} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }} accessibilityRole="button" accessibilityLabel={`${person.full_name}, ${person.username}`}>
        <Avatar uri={person.avatar_url} name={person.full_name} size={50} ring={person.has_story ? 'new' : null} />
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Text numberOfLines={1} style={{ color: C.fg, fontWeight: '600', flexShrink: 1 }}>{person.username}</Text>
            {person.verified ? <VerifiedTick size={14} /> : null}
          </View>
          <Text numberOfLines={1} style={{ color: C.fg2, fontSize: 13.5 }}>
            {person.full_name} · {fmt(person.followers_count)} {person.followers_count === 1 ? 'follower' : 'followers'}
          </Text>
        </View>
      </Pressable>
      {right ?? (hideFollow || person.id === me ? null : <Button small label={following ? 'Following' : person.follows_me ? 'Follow back' : 'Follow'} kind={following ? 'ghost' : 'primary'} onPress={toggle} />)}
    </View>
  );
});
