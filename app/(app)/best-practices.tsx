import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Icon, IconName } from '../../src/components/Icon';
import { Screen, ScreenHeader } from '../../src/components/ui';
import { C } from '../../src/lib/theme';

const TIPS: { icon: IconName; title: string; body: string; action: string; href: string }[] = [
  { icon: 'story', title: 'Share to your story often', body: 'Stories sit at the top of the home screen for 24 hours, so they are the first thing followers see. Add text, stickers or a drawing to make them yours.', action: 'Add to your story', href: '/add-story' },
  { icon: 'highlight', title: 'Keep your best stories as memories', body: 'Memories stay on your profile after a story disappears. Use them for the things new visitors ask about most.', action: 'New memory', href: '/new-highlight' },
  { icon: 'reels', title: 'Share shorts', body: 'Shorts up to 60 seconds get their own tab, with captions made from the sound, and you can see how many people watched each one.', action: 'New short', href: '/create?mode=shorts' },
  { icon: 'reply', title: 'Answer faster with saved replies', body: 'Write an answer once and drop it into any chat from the + button.', action: 'Saved replies', href: '/saved-replies' },
  { icon: 'question', title: 'Set up frequently asked questions', body: 'People tap a question at the top of your chat and get your answer straight away, even when you are busy.', action: 'Frequently asked questions', href: '/faq' },
  { icon: 'star', title: 'Use close friends for the personal things', body: 'Share some stories with a smaller list. They get a green ring so your friends know it is just for them.', action: 'Close friends', href: '/close-friends' },
  { icon: 'chart', title: 'Check what works', body: 'Your dashboard shows views, new followers and your most viewed posts, so you can do more of what people respond to.', action: 'Open dashboard', href: '/dashboard' },
];

export default function BestPractices() {
  const router = useRouter();
  return (
    <Screen>
      <ScreenHeader title="Best practices" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 4, gap: 12, paddingBottom: 60 }}>
        {TIPS.map((t) => (
          <View key={t.title} style={{ padding: 16, borderRadius: 14, backgroundColor: C.surface, gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Icon name={t.icon} size={26} />
              <Text style={{ flex: 1, color: C.fg, fontSize: 17.5, fontWeight: '700' }}>{t.title}</Text>
            </View>
            <Text style={{ color: C.fg2, fontSize: 15.5, lineHeight: 21 }}>{t.body}</Text>
            <Pressable onPress={() => router.push(t.href as any)} hitSlop={8} accessibilityRole="link" style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4, paddingTop: 2 }}>
              <Text style={{ color: C.accent2, fontWeight: '700', fontSize: 15.5 }}>{t.action}</Text>
              <Icon name="right" size={15} color={C.accent2} weight={2.4} />
            </Pressable>
          </View>
        ))}
      </ScrollView>
    </Screen>
  );
}
