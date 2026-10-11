import React, { useRef } from 'react';
import { ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { Button, Empty, Row, Screen, ScreenHeader } from '../../src/components/ui';
import { useSession } from '../../src/lib/session';

const REPLIES = { everyone: 'Everyone', following: 'People you follow', off: 'Off' } as const;

/** The "Creator" list: the tools that come with a creator account. */
export default function Creator() {
  const { profile } = useSession();
  const router = useRouter();
  // One screen per tap, however quickly a row is tapped twice.
  const lastPush = useRef(0);
  const open = (href: string) => {
    if (Date.now() - lastPush.current < 800) return;
    lastPush.current = Date.now();
    router.push(href);
  };

  if (profile?.account_type !== 'creator') {
    return (
      <Screen>
        <ScreenHeader title="Creator" />
        <Empty icon="chart" title="Creator tools are off" action={<Button small label="Switch account type" onPress={() => open('/account-type')} style={{ marginTop: 8 }} />} />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenHeader title="Creator" />
      <ScrollView contentContainerStyle={{ paddingBottom: 60 }}>
        <Row icon="chart" title="Dashboard" onPress={() => open('/dashboard')} />
        <Row icon="eye" title="View counts on profile" value={profile.show_view_counts ? 'On' : 'Off'} onPress={() => open('/view-counts')} />
        <Row icon="reply" title="Saved Reply" onPress={() => open('/saved-replies')} />
        <Row icon="question" title="Frequently Asked Questions" value={profile.faq_enabled ? 'On' : 'Off'} onPress={() => open('/faq')} />
        <Row icon="tag" title="Category" value={profile.category || 'None'} onPress={() => open('/account-type')} />
        <Row icon="comment" title="Story replies" value={REPLIES[profile.story_replies] ?? ''} onPress={() => open('/story-settings')} />
        <Row icon="swap" title="Switch account type" onPress={() => open('/account-type')} />
      </ScrollView>
    </Screen>
  );
}
