import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Radio, Screen, ScreenHeader, useToast } from '../../src/components/ui';
import { FONTS } from '../../src/lib/fonts';
import { tap } from '../../src/lib/haptics';
import { setPrefs, usePrefs } from '../../src/lib/prefs';
import { useSession } from '../../src/lib/session';
import { C } from '../../src/lib/theme';

/** Choose the face the app's text is set in. A Community Plus perk; the choice stays on this phone. */
export default function PlusFont() {
  const { profile } = useSession();
  const router = useRouter();
  const toast = useToast();
  const { appFont } = usePrefs();
  const plus = !!profile?.plus;

  function choose(id: string) {
    if (!plus) {
      toast('App fonts are part of Community Plus');
      router.push('/plus');
      return;
    }
    if (id === appFont) return;
    tap('select');
    setPrefs({ appFont: id });
    toast('Font changed');
  }

  return (
    <Screen>
      <ScreenHeader title="App font" />
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        {plus ? null : <Text style={{ color: C.fg2, paddingHorizontal: 16, paddingTop: 4, paddingBottom: 12, lineHeight: 20 }}>Part of Community Plus</Text>}
        <View style={{ marginHorizontal: 16, borderRadius: 16, backgroundColor: C.surface, overflow: 'hidden' }}>
          {FONTS.map((f, i) => {
            const on = plus && appFont === f.id;
            return (
              <Pressable
                key={f.id || 'system'}
                onPress={() => choose(f.id)}
                accessibilityRole="radio"
                accessibilityLabel={`${f.name}. ${f.sample}`}
                accessibilityState={{ checked: on }}
                style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 14, borderTopWidth: i ? 1 : 0, borderTopColor: C.line, backgroundColor: pressed ? C.press : 'transparent' })}>
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={{ color: C.fg, fontSize: 19, fontWeight: '700', fontFamily: f.bold || undefined }}>{f.name}</Text>
                  <Text style={{ color: C.fg2, fontSize: 15, lineHeight: 20, fontFamily: f.regular || undefined }}>{f.sample}</Text>
                </View>
                <Radio on={on} />
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </Screen>
  );
}
