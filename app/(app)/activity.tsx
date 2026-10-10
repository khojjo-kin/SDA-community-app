import React from 'react';
import { ScrollView, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { Row, Screen, ScreenHeader, SectionLabel } from '../../src/components/ui';
import { C } from '../../src/lib/theme';

export default function Activity() {
  const router = useRouter();
  return (
    <Screen>
      <ScreenHeader title="Your activity" />
      <ScrollView contentContainerStyle={{ paddingBottom: 60 }}>
        <SectionLabel>Interactions</SectionLabel>
        <Row icon="heart" title="Likes" onPress={() => router.push('/saved?which=liked')} />
        <Row icon="comment" title="Comments" onPress={() => router.push('/my-comments')} />
        <Row icon="repost" title="Reposts" onPress={() => router.push('/saved?which=reposts')} />
        <SectionLabel>Content you keep</SectionLabel>
        <Row icon="bookmark" title="Saved" onPress={() => router.push('/saved')} />
        <Row icon="archive" title="Story archive" onPress={() => router.push('/archive')} />
      </ScrollView>
    </Screen>
  );
}
