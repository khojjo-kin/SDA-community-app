import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Radio, Screen, ScreenHeader } from '../../src/components/ui';
import { usePrefs } from '../../src/lib/prefs';
import { C, PALETTES, type ThemeName } from '../../src/lib/theme';
import { chooseTheme } from '../../src/lib/theme-return';

const CHOICES: { id: ThemeName; label: string; sub: string }[] = [
  { id: 'dark', label: 'Dark', sub: 'Easy on the eyes at night. The original look.' },
  { id: 'white', label: 'White', sub: 'Bright and clean, for daylight.' },
  { id: 'green', label: 'Green', sub: 'Deep green, calm like a Sabbath walk.' },
];

/** A tiny picture of the app in a theme's colours: a header, a post and a button. */
function Preview({ id }: { id: ThemeName }) {
  const p = PALETTES[id];
  return (
    <View style={{ width: 92, height: 150, borderRadius: 16, backgroundColor: p.bg, borderWidth: 1, borderColor: p.line, padding: 9, gap: 7, overflow: 'hidden' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: p.surface2 }} />
        <View style={{ height: 6, flex: 1, borderRadius: 3, backgroundColor: p.fg, opacity: 0.85 }} />
      </View>
      <View style={{ height: 58, borderRadius: 8, backgroundColor: p.surface }} />
      <View style={{ height: 5, width: '80%', borderRadius: 3, backgroundColor: p.fg2 }} />
      <View style={{ height: 5, width: '55%', borderRadius: 3, backgroundColor: p.fg3 }} />
      <View style={{ height: 16, borderRadius: 8, backgroundColor: p.accent, marginTop: 'auto' }} />
    </View>
  );
}

/** Settings → Theme: Dark, White or Green. The whole app is redrawn in the new colours straight away. */
export default function ThemeScreen() {
  const { theme } = usePrefs();
  return (
    <Screen>
      <ScreenHeader title="Theme" />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 60 }}>
        <Text style={{ color: C.fg2, lineHeight: 20, marginBottom: 4 }}>Choose how Community looks on this phone. Photos, videos, the camera and stories always show on black, whatever you choose.</Text>
        {CHOICES.map((c) => {
          const on = theme === c.id;
          return (
            <Pressable
              key={c.id}
              onPress={() => (on ? undefined : chooseTheme(c.id, '/theme'))}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              accessibilityLabel={`${c.label} theme`}
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 16, padding: 12, borderRadius: 18, backgroundColor: C.surface, borderWidth: 2, borderColor: on ? C.accent : 'transparent', opacity: pressed ? 0.8 : 1 })}>
              <Preview id={c.id} />
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={{ color: C.fg, fontSize: 17, fontWeight: '700' }}>{c.label}</Text>
                <Text style={{ color: C.fg2, lineHeight: 19 }}>{c.sub}</Text>
              </View>
              <Radio on={on} />
            </Pressable>
          );
        })}
      </ScrollView>
    </Screen>
  );
}
