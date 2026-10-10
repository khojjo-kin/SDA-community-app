import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Radio, Screen, ScreenHeader } from '../../src/components/ui';
import { type Key, useT } from '../../src/lib/i18n';
import { usePrefs } from '../../src/lib/prefs';
import { C, PALETTES, type ThemeName } from '../../src/lib/theme';
import { chooseTheme } from '../../src/lib/theme-return';

// Keys rather than words: the words are looked up as the screen draws, in the app's language.
const CHOICES: { id: ThemeName; label: Key }[] = [
  { id: 'dark', label: 'theme.dark' },
  { id: 'white', label: 'theme.white' },
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

/** Settings → Theme: Dark or White. The whole app is redrawn in the new colours straight away. */
export default function ThemeScreen() {
  const { theme } = usePrefs();
  const t = useT();
  return (
    <Screen>
      <ScreenHeader title={t('theme.title')} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 60 }}>
        {CHOICES.map((c) => {
          const on = theme === c.id;
          const label = t(c.label);
          return (
            <Pressable
              key={c.id}
              onPress={() => (on ? undefined : chooseTheme(c.id, '/theme'))}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              accessibilityLabel={t('theme.label', { name: label })}
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 16, padding: 12, borderRadius: 18, backgroundColor: C.surface, borderWidth: 2, borderColor: on ? C.accent : 'transparent', opacity: pressed ? 0.8 : 1 })}>
              <Preview id={c.id} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.fg, fontSize: 17, fontWeight: '700' }}>{label}</Text>
              </View>
              <Radio on={on} />
            </Pressable>
          );
        })}
      </ScrollView>
    </Screen>
  );
}
