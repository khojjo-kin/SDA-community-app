import React from 'react';
import { ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { Button, Empty, Row, Screen, ScreenHeader } from '../../src/components/ui';
import { useSession } from '../../src/lib/session';

const REPLIES = { everyone: 'Everyone', following: 'People you follow', off: 'Off' } as const;

/** The "Creator" list: the tools that come with a creator account. */
export default function Creator() {
  const { profile } = useSession();
  const router = useRouter();

  if (profile?.account_type !== 'creator') {
    return (
      <Screen>
        <ScreenHeader title="Creator" />
        <Empty icon="chart" title="Creator tools are off" body="Switch to a creator account to get a dashboard, saved replies, frequently asked questions and a category on your profile. It is free, and you can switch back at any time." action={<Button small label="Switch account type" onPress={() => router.push('/account-type')} style={{ marginTop: 8 }} />} />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenHeader title="Creator" />
      <ScrollView contentContainerStyle={{ paddingBottom: 60 }}>
        <Row title="Dashboard" onPress={() => router.push('/dashboard')} />
        <Row title="View counts on profile" value={profile.show_view_counts ? 'On' : 'Off'} onPress={() => router.push('/view-counts')} />
        <Row title="Saved Reply" onPress={() => router.push('/saved-replies')} />
        <Row title="Frequently Asked Questions" value={profile.faq_enabled ? 'On' : 'Off'} onPress={() => router.push('/faq')} />
        <Row title="Category" value={profile.category || 'None'} onPress={() => router.push('/account-type')} />
        <Row title="Story replies" value={REPLIES[profile.story_replies]} onPress={() => router.push('/story-settings')} />
        <Row title="Switch account type" onPress={() => router.push('/account-type')} />
      </ScrollView>
    </Screen>
  );
}
