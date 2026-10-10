import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Empty, Radio, Screen, ScreenHeader, SearchField } from '../../src/components/ui';
import { tap } from '../../src/lib/haptics';
import { LANGUAGES, languageName, phoneLanguage, useT } from '../../src/lib/i18n';
import { usePrefs } from '../../src/lib/prefs';
import { C } from '../../src/lib/theme';
import { chooseLanguage } from '../../src/lib/theme-return';

/** One choice in the list: the big name, the smaller one under it, and the round mark on the right. */
function Choice({ title, sub, on, onPress, first }: { title: string; sub: string; on: boolean; onPress: () => void; first: boolean }) {
  return (
    <Pressable
      onPress={
        on
          ? undefined
          : () => {
              tap('select');
              onPress();
            }
      }
      accessibilityRole="radio"
      accessibilityState={{ checked: on }}
      accessibilityLabel={`${title}, ${sub}`}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, minHeight: 62, backgroundColor: pressed ? C.press : 'transparent', borderTopWidth: first ? 0 : StyleSheet.hairlineWidth, borderTopColor: C.line })}>
      <View style={{ flex: 1, paddingVertical: 10 }}>
        <Text style={{ color: C.fg, fontSize: 17, fontWeight: '600' }}>{title}</Text>
        <Text style={{ color: C.fg2, fontSize: 13.5, marginTop: 2 }}>{sub}</Text>
      </View>
      <Radio on={on} />
    </Pressable>
  );
}

/**
 * Settings → Language: the phone's language, or one of the app's languages. The whole app is drawn
 * again in the new words straight away, and the member is brought back here (chooseLanguage).
 */
export default function LanguageScreen() {
  const { language } = usePrefs();
  const t = useT();
  const [q, setQ] = useState('');
  const needle = q.trim().toLowerCase();
  // Searching finds a language by its own name, its English name or its code ("fr").
  const shown = needle ? LANGUAGES.filter((l) => `${l.native} ${l.name} ${l.code}`.toLowerCase().includes(needle)) : LANGUAGES;
  return (
    <Screen>
      <ScreenHeader title={t('language.title')} />
      <View style={{ paddingTop: 4, paddingBottom: 4 }}>
        <SearchField value={q} onChangeText={setQ} label={t('language.search')} />
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 60 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        {/* Following the phone stays at the top while searching: it is never what the search hides. Under it, the language the phone is in. */}
        <View style={{ borderRadius: 18, backgroundColor: C.surface, overflow: 'hidden' }}>
          <Choice first title={t('language.phone')} sub={languageName(phoneLanguage())} on={language === ''} onPress={() => chooseLanguage('', '/language')} />
        </View>
        {shown.length ? (
          <View style={{ borderRadius: 18, backgroundColor: C.surface, overflow: 'hidden' }}>
            {shown.map((l, i) => (
              <Choice key={l.code} first={i === 0} title={l.native} sub={l.name} on={language === l.code} onPress={() => chooseLanguage(l.code, '/language')} />
            ))}
          </View>
        ) : (
          <Empty title={t('language.noneFound')} body={t('common.tryDifferentName')} />
        )}
      </ScrollView>
    </Screen>
  );
}
