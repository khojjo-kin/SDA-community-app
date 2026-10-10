import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Screen, ScreenHeader, Toggle, useToast } from '../../src/components/ui';
import { updateProfile } from '../../src/lib/api';
import { useSession } from '../../src/lib/session';
import { C, errText } from '../../src/lib/theme';

export default function ViewCounts() {
  const { me, profile } = useSession();
  const toast = useToast();
  const on = profile?.show_view_counts ?? true;
  return (
    <Screen>
      <ScreenHeader title="View counts on profile" />
      <ScrollView contentContainerStyle={{ paddingTop: 8, paddingBottom: 60 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, minHeight: 56, gap: 16 }}>
          <Text style={{ flex: 1, color: C.fg, fontSize: 17.5 }}>Show view counts</Text>
          <Toggle value={on} onChange={(v) => updateProfile(me, { show_view_counts: v }).catch((e) => toast(errText(e)))} label="Show view counts on your profile" />
        </View>
      </ScrollView>
    </Screen>
  );
}
