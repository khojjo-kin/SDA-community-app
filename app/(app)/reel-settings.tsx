import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Row, Screen, ScreenHeader, SectionLabel, Toggle } from '../../src/components/ui';
import { useT } from '../../src/lib/i18n';
import { setPrefs, usePrefs } from '../../src/lib/prefs';
import { C } from '../../src/lib/theme';

/** How clips play. The rest of the clip choices (topics, captions) are in Your feed (clips-settings). */
export default function ReelSettings() {
  const prefs = usePrefs();
  const router = useRouter();
  const t = useT();
  // The same words as the sound switch in Your feed: it is the same setting.
  const muted = t('clips.startMuted');
  return (
    <Screen>
      <ScreenHeader title={t('tabs.clips')} />
      <ScrollView contentContainerStyle={{ paddingBottom: 60 }}>
        <SectionLabel strong>{t('clips.sound')}</SectionLabel>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, minHeight: 56, gap: 16 }}>
          <Text style={{ flex: 1, color: C.fg, fontSize: 17.5 }}>{muted}</Text>
          <Toggle value={prefs.reelsMuted} onChange={(v) => setPrefs({ reelsMuted: v })} label={muted} />
        </View>
        <SectionLabel strong>{t('clips.whatYouSee')}</SectionLabel>
        <Row icon="sliders" title={t('settings.yourFeed')} onPress={() => router.push('/clips-settings')} />
      </ScrollView>
    </Screen>
  );
}
