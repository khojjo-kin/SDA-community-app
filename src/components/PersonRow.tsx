import React, { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { followOrRequest, removeFollowRequest, setFollow } from '../lib/api';
import { t } from '../lib/i18n';
import { useSession } from '../lib/session';
import { C, errText, fmt } from '../lib/theme';
import type { Profile } from '../lib/types';
import { VerifiedTick } from './Icon';
import { Avatar, Button, useToast } from './ui';

type FollowState = 'none' | 'following' | 'requested';

/** A person in a list, with a follow button that works in place. Memoised: search lists draw again on every key typed. */
export const PersonRow = React.memo(function PersonRow({ person, onPress, right, hideFollow }: { person: Profile; onPress?: () => void; right?: React.ReactNode; hideFollow?: boolean }) {
  const { me } = useSession();
  const router = useRouter();
  const toast = useToast();
  const given: FollowState = person.is_following ? 'following' : person.requested ? 'requested' : 'none';
  const [state, setState] = useState<FollowState>(given);
  // A second tap while the first is on its way would undo it half done.
  const busy = useRef(false);
  // The list fetched again with this person (a search typed further): their newer state wins.
  useEffect(() => {
    if (!busy.current) setState(given);
  }, [given]);

  async function change() {
    if (busy.current) return;
    const was = state;
    // A private account's posts go with the follow: ask first, as on their profile.
    if (was === 'following' && person.is_private) {
      const ok = await new Promise<boolean>((resolve) =>
        Alert.alert(`Unfollow ${person.username}?`, 'Their account is private, so you would need to ask again to see their posts.', [
          { text: t('common.cancel'), style: 'cancel', onPress: () => resolve(false) },
          { text: 'Unfollow', style: 'destructive', onPress: () => resolve(true) },
        ]),
      );
      if (!ok) return;
    }
    busy.current = true;
    try {
      if (was === 'none') {
        // Shown at once; a private account (known, or found out from the database's answer) becomes a request.
        setState(person.is_private ? 'requested' : 'following');
        setState(await followOrRequest(me, person.id, person.is_private));
      } else if (was === 'following') {
        setState('none');
        await setFollow(me, person.id, false);
      } else {
        setState('none');
        await removeFollowRequest(me, person.id);
      }
    } catch (e) {
      setState(was);
      toast(errText(e));
    } finally {
      busy.current = false;
    }
  }

  const label = state === 'following' ? t('common.following') : state === 'requested' ? t('profile.requested') : person.follows_me ? t('common.followBack') : t('common.follow');
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 8 }}>
      <Pressable onPress={onPress ?? (() => router.push(`/user/${person.id}`))} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, opacity: pressed ? 0.7 : 1 })} accessibilityRole="button" accessibilityLabel={`${person.full_name}, ${person.username}`}>
        {/* A story ring is drawn inside the same 50 points, so names line up whether or not someone has one. */}
        <Avatar uri={person.avatar_url} name={person.full_name} size={person.has_story ? 40 : 50} ring={person.has_story ? 'new' : null} />
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Text numberOfLines={1} style={{ color: C.fg, fontWeight: '600', fontSize: 14.5, flexShrink: 1 }}>{person.username}</Text>
            {person.verified ? <VerifiedTick size={14} /> : null}
          </View>
          <Text numberOfLines={1} style={{ color: C.fg2, fontSize: 13.5 }}>
            {person.full_name ? `${person.full_name} · ` : ''}
            {fmt(person.followers_count)} {person.followers_count === 1 ? 'follower' : 'followers'}
          </Text>
        </View>
      </Pressable>
      {right ?? (hideFollow || person.id === me ? null : <Button small label={label} kind={state === 'none' ? 'primary' : 'ghost'} onPress={change} />)}
    </View>
  );
});
