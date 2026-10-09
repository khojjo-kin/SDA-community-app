import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Divider, Radio, Row, Screen, ScreenHeader, SectionLabel, useToast } from '../../src/components/ui';
import { updateProfile } from '../../src/lib/api';
import { useSession } from '../../src/lib/session';
import { C, errText } from '../../src/lib/theme';
import type { StoryReplies } from '../../src/lib/types';

const CHOICES: { value: StoryReplies; label: string; sub: string }[] = [
  { value: 'everyone', label: 'Everyone', sub: 'Anyone who sees your story can reply.' },
  { value: 'following', label: 'People you follow', sub: 'Only accounts you follow can reply.' },
  { value: 'off', label: 'Off', sub: 'Nobody can reply to your stories.' },
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
        <Text style={{ color: C.fg2, paddingHorizontal: 16, paddingBottom: 6, lineHeight: 20 }}>Replies to your story arrive in your messages.</Text>
        <View accessibilityRole="radiogroup">
          {CHOICES.map((c) => (
            <Pressable key={c.value} onPress={() => { if (c.value !== current) updateProfile(me, { story_replies: c.value }).catch((e) => toast(errText(e))); }} accessibilityRole="radio" accessibilityState={{ checked: current === c.value }} accessibilityLabel={`${c.label}. ${c.sub}`} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: pressed ? 'rgba(255,255,255,0.05)' : 'transparent' })}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.fg, fontSize: 17.5 }}>{c.label}</Text>
                <Text style={{ color: C.fg2, fontSize: 15, marginTop: 1 }}>{c.sub}</Text>
              </View>
              <Radio on={current === c.value} />
            </Pressable>
          ))}
        </View>
        <Divider thin />

        <SectionLabel strong>Sharing</SectionLabel>
        <Row icon="star" title="Close friends" sub="Choose who sees stories you share with close friends" onPress={() => router.push('/close-friends')} />
        <Row icon="archive" title="Archive" sub="Your stories are saved here automatically after 24 hours" onPress={() => router.push('/archive')} />
      </ScrollView>
    </Screen>
  );
}
