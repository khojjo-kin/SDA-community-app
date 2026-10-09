import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Screen, ScreenHeader, SectionLabel, Toggle } from '../../src/components/ui';
import { setPrefs, usePrefs } from '../../src/lib/prefs';
import { C } from '../../src/lib/theme';

export default function ReelSettings() {
  const prefs = usePrefs();
  return (
    <Screen>
      <ScreenHeader title="Reels" />
      <ScrollView contentContainerStyle={{ paddingBottom: 60 }}>
        <SectionLabel strong>Sound</SectionLabel>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 16, gap: 16 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: C.fg, fontSize: 17.5 }}>Start with sound off</Text>
            <Text style={{ color: C.fg2, fontSize: 15, lineHeight: 20, marginTop: 4 }}>Reels play silently until you tap the speaker on a video. The speaker button changes this setting too.</Text>
          </View>
          <Toggle value={prefs.reelsMuted} onChange={(v) => setPrefs({ reelsMuted: v })} label="Start reels with sound off" />
        </View>
      </ScrollView>
    </Screen>
  );
}
