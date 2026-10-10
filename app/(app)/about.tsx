import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import Constants from 'expo-constants';
import { Mark } from '../../src/components/Icon';
import { LegalRows, useLegalSheet } from '../../src/components/LegalDocument';
import { Divider, Screen, ScreenHeader, SectionLabel } from '../../src/components/ui';
import { useT } from '../../src/lib/i18n';
import { C } from '../../src/lib/theme';

const FACTS: [string, string][] = [
  ['What Community keeps', 'Your profile, the photos and videos you post, your stories and memories, comments, likes, who you follow, and your messages. It also counts how many people have seen your posts and stories.'],
  ['Who can see it', 'Posts, shorts and your profile are visible to everyone on Community. Stories are visible to everyone, or only to your close friends when you choose that. Messages can only be opened by the two people in the chat. Saved posts and your archive are only visible to you. Each photo, video and voice message is stored at a long web address that cannot be guessed; someone who is given that address can open that one file.'],
  ['What stays on your phone', 'Your camera and sound choices, and your photo library. A photo or video only leaves your phone when you share it.'],
  ['Removing your data', 'You can delete any post, story, comment or memory from the place you see it. Deleting your account, under Account, removes everything at once, including the photos and videos you uploaded.'],
];

export default function About() {
  const t = useT();
  // Terms of use, Privacy policy and the rest open in a sheet over this page.
  const legal = useLegalSheet();
  return (
    <Screen>
      <ScreenHeader title="About" />
      <ScrollView contentContainerStyle={{ paddingBottom: 60 }}>
        <View style={{ alignItems: 'center', paddingVertical: 22, gap: 10 }}>
          <Mark size={64} />
          <Text style={{ color: C.fg, fontSize: 20, fontWeight: '700' }}>Community</Text>
          <Text style={{ color: C.fg2 }}>Version {Constants.expoConfig?.version ?? ''}</Text>
        </View>
        <Divider />
        <SectionLabel>{t('legal.title')}</SectionLabel>
        <LegalRows onOpen={legal.open} />
        <Divider />
        {FACTS.map(([title, body]) => (
          <View key={title}>
            <SectionLabel strong>{title}</SectionLabel>
            <Text style={{ color: C.fg2, paddingHorizontal: 16, lineHeight: 21, fontSize: 15.5 }}>{body}</Text>
          </View>
        ))}
      </ScrollView>
      {legal.element}
    </Screen>
  );
}
