import React, { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Divider, Radio, Row, Screen, ScreenHeader, SectionLabel, useToast } from '../../src/components/ui';
import { updateProfile } from '../../src/lib/api';
import { tap } from '../../src/lib/haptics';
import { useSession } from '../../src/lib/session';
import { C, errText } from '../../src/lib/theme';
import type { StoryReplies } from '../../src/lib/types';

const CHOICES: { value: StoryReplies; label: string }[] = [
  { value: 'everyone', label: 'Everyone' },
  { value: 'following', label: 'People you follow' },
  { value: 'off', label: 'Off' },
];

export default function StorySettings() {
  const { me, profile } = useSession();
  const router = useRouter();
  const toast = useToast();
  // The choice shows at once and the profile catches up after the save, so the tick never waits for
  // the network. Taken from the profile once (when it arrives), as Your feed does.
  const [choice, setChoice] = useState<StoryReplies>(profile?.story_replies ?? 'everyone');
  // What the database holds as far as this screen knows: a failed save puts the tick back here.
  const saved = useRef<StoryReplies>(profile?.story_replies ?? 'everyone');
  const seeded = useRef(!!profile);
  useEffect(() => {
    if (seeded.current || !profile) return;
    seeded.current = true;
    saved.current = profile.story_replies ?? 'everyone';
    setChoice(saved.current);
  }, [profile]);
  // Saves go one after another, so quick taps reach the database in the order they were made.
  const queue = useRef<Promise<void>>(Promise.resolve());
  // The number of the latest choice: only it decides what shows if a save fails.
  const latest = useRef(0);
  const alive = useRef(true);
  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );

  function choose(next: StoryReplies) {
    if (next === choice) return;
    tap('select');
    setChoice(next);
    const mine = ++latest.current;
    queue.current = queue.current.then(() =>
      updateProfile(me, { story_replies: next }).then(
        () => {
          saved.current = next;
        },
        (e) => {
          if (!alive.current) return;
          toast(errText(e));
          // An earlier choice that didn't save is overtaken by the later one, still on its way.
          if (mine === latest.current) setChoice(saved.current);
        },
      ),
    );
  }

  return (
    <Screen>
      <ScreenHeader title="Story" />
      <ScrollView contentContainerStyle={{ paddingBottom: 60 }}>
        <SectionLabel strong>Allow replies</SectionLabel>
        <View accessibilityRole="radiogroup">
          {CHOICES.map((c) => (
            <Pressable key={c.value} onPress={() => choose(c.value)} accessibilityRole="radio" accessibilityState={{ checked: choice === c.value }} accessibilityLabel={c.label} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 14, backgroundColor: pressed ? C.press : 'transparent' })}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.fg, fontSize: 17.5 }}>{c.label}</Text>
              </View>
              <Radio on={choice === c.value} />
            </Pressable>
          ))}
        </View>
        <Divider thin />

        <SectionLabel strong>Sharing</SectionLabel>
        <Row icon="star" title="Close friends" onPress={() => router.push('/close-friends')} />
        <Row icon="archive" title="Archive" onPress={() => router.push('/archive')} />
      </ScrollView>
    </Screen>
  );
}
