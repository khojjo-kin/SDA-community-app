import React, { useCallback, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Icon } from '../../src/components/Icon';
import { Screen, ScreenHeader, SearchField, SectionLabel } from '../../src/components/ui';
import { BOOKS, loadBibleSettings, parseReference } from '../../src/lib/bible';
import { C } from '../../src/lib/theme';

export default function Bible() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [last, setLast] = useState<{ book: string; chapter: number } | null>(null);

  useFocusEffect(
    useCallback(() => {
      loadBibleSettings().then((s) => setLast(s.last ?? null));
    }, []),
  );

  const open = (book: string, chapter = 1) => router.push({ pathname: '/bible/[book]', params: { book, c: String(chapter) } } as any);
  const needle = q.trim().toLowerCase();
  const ref = needle ? parseReference(q) : null;
  const matches = needle ? BOOKS.filter((b) => b.name.toLowerCase().includes(needle)) : [];

  const list = (testament: 'old' | 'new') => (
    <View style={{ paddingHorizontal: 12, flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {BOOKS.filter((b) => b.testament === testament).map((b) => (
        <Pressable key={b.name} onPress={() => open(b.name)} accessibilityRole="button" accessibilityLabel={`${b.name}, ${b.chapters} chapters`} style={({ pressed }) => ({ paddingHorizontal: 14, height: 40, borderRadius: 20, backgroundColor: pressed ? C.surface2 : C.surface, justifyContent: 'center' })}>
          <Text style={{ color: C.fg, fontSize: 15.5 }}>{b.name}</Text>
        </Pressable>
      ))}
    </View>
  );

  return (
    <Screen>
      <ScreenHeader title="Bible" />
      <View style={{ paddingBottom: 6 }}>
        <SearchField value={q} onChangeText={setQ} placeholder="Book, or a reference like John 3" label="Search the Bible" />
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
        {needle ? (
          <View style={{ paddingTop: 8 }}>
            {ref ? (
              <Pressable onPress={() => open(ref.book, ref.chapter)} accessibilityRole="button" style={({ pressed }) => ({ marginHorizontal: 16, marginBottom: 10, padding: 14, borderRadius: 14, backgroundColor: pressed ? C.surface2 : C.surface, flexDirection: 'row', alignItems: 'center', gap: 12 })}>
                <Icon name="book" size={24} color={C.accent2} />
                <Text style={{ color: C.fg, fontSize: 17, fontWeight: '700', flex: 1 }}>Open {ref.book} {ref.chapter}</Text>
                <Icon name="right" size={18} color={C.fg2} weight={2} />
              </Pressable>
            ) : null}
            {matches.map((b) => (
              <Pressable key={b.name} onPress={() => open(b.name)} accessibilityRole="button" style={({ pressed }) => ({ paddingHorizontal: 16, minHeight: 48, justifyContent: 'center', backgroundColor: pressed ? C.press : 'transparent' })}>
                <Text style={{ color: C.fg, fontSize: 17 }}>{b.name}</Text>
                <Text style={{ color: C.fg2, fontSize: 13 }}>{b.chapters} chapters</Text>
              </Pressable>
            ))}
            {!ref && !matches.length ? <Text style={{ color: C.fg2, textAlign: 'center', padding: 24 }}>Try a book name, or a reference like Psalm 23.</Text> : null}
          </View>
        ) : (
          <>
            {last ? (
              <Pressable onPress={() => open(last.book, last.chapter)} accessibilityRole="button" style={({ pressed }) => ({ marginHorizontal: 16, marginTop: 8, padding: 14, borderRadius: 14, backgroundColor: pressed ? C.surface2 : C.surface, flexDirection: 'row', alignItems: 'center', gap: 12 })}>
                <Icon name="bookmark" size={22} color={C.accent2} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: C.fg2, fontSize: 13 }}>Continue reading</Text>
                  <Text style={{ color: C.fg, fontSize: 17, fontWeight: '700' }}>{last.book} {last.chapter}</Text>
                </View>
                <Icon name="right" size={18} color={C.fg2} weight={2} />
              </Pressable>
            ) : null}
            <SectionLabel>Old Testament</SectionLabel>
            {list('old')}
            <SectionLabel>New Testament</SectionLabel>
            {list('new')}
            <Text style={{ color: C.fg3, fontSize: 12.5, textAlign: 'center', paddingTop: 24, paddingHorizontal: 24, lineHeight: 17 }}>King James Version and World English Bible, both public domain. Chapters stay on your phone once you have opened them.</Text>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}
