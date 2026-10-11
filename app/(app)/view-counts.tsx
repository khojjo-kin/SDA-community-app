import React, { useEffect, useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Screen, ScreenHeader, Toggle, useToast } from '../../src/components/ui';
import { updateProfile } from '../../src/lib/api';
import { useSession } from '../../src/lib/session';
import { C, errText } from '../../src/lib/theme';

export default function ViewCounts() {
  const { me, profile } = useSession();
  const toast = useToast();
  const saved = profile?.show_view_counts ?? true;
  // Shown at once when tapped, then put back if the save fails.
  const [on, setOn] = useState(saved);
  const saving = useRef(false);
  useEffect(() => {
    if (!saving.current) setOn(saved);
  }, [saved]);

  function change(next: boolean) {
    if (saving.current) return;
    saving.current = true;
    setOn(next);
    updateProfile(me, { show_view_counts: next })
      .catch((e) => {
        setOn(!next);
        toast(errText(e));
      })
      .finally(() => {
        saving.current = false;
      });
  }

  return (
    <Screen>
      <ScreenHeader title="View counts on profile" />
      <ScrollView contentContainerStyle={{ paddingTop: 8, paddingBottom: 60 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, minHeight: 56, gap: 16 }}>
          <Text style={{ flex: 1, color: C.fg, fontSize: 17.5 }}>Show view counts</Text>
          <Toggle value={on} onChange={change} label="Show view counts on your profile" />
        </View>
      </ScrollView>
    </Screen>
  );
}
