import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Divider, Radio, Row, Screen, ScreenHeader, SectionLabel, useToast } from '../../src/components/ui';
import { updateProfile } from '../../src/lib/api';
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
  const current = profile?.story_replies ?? 'everyone';

  return (
    <Screen>
      <ScreenHeader title="Story" />
      <ScrollView contentContainerStyle={{ paddingBottom: 60 }}>
        <SectionLabel strong>Allow replies</SectionLabel>
        <View accessibilityRole="radiogroup">
          {CHOICES.map((c) => (
            <Pressable key={c.value} onPress={() => { if (c.value !== current) updateProfile(me, { story_replies: c.value }).catch((e) => toast(errText(e))); }} accessibilityRole="radio" accessibilityState={{ checked: current === c.value }} accessibilityLabel={c.label} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 14, backgroundColor: pressed ? C.press : 'transparent' })}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.fg, fontSize: 17.5 }}>{c.label}</Text>
              </View>
              <Radio on={current === c.value} />
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
