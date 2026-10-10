import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import { fetchHighlights } from '../lib/api';
import { useSession } from '../lib/session';
import { C } from '../lib/theme';
import type { Highlight } from '../lib/types';
import { Icon } from './Icon';
import { Button, Loading, Sheet } from './ui';

/** Choose one of your highlights, or name a new one. */
export function HighlightPicker({ visible, onClose, onPick }: { visible: boolean; onClose: () => void; onPick: (choice: { id?: string; title: string }) => void }) {
  const { me } = useSession();
  const [list, setList] = useState<Highlight[] | null>(null);
  const [title, setTitle] = useState('');

  useEffect(() => {
    if (!visible) return;
    setTitle('');
    let live = true;
    fetchHighlights(me)
      .then((h) => { if (live) setList(h); })
      .catch(() => { if (live) setList([]); });
    return () => {
      live = false;
    };
  }, [visible, me]);

  return (
    <Sheet visible={visible} onClose={onClose} title="Add to memories">
      {list === null ? (
        <Loading />
      ) : (
        <ScrollView style={{ maxHeight: 260 }} keyboardShouldPersistTaps="handled">
          {list.map((h) => (
            <Pressable key={h.id} onPress={() => onPick({ id: h.id, title: h.title })} accessibilityRole="button" accessibilityLabel={`Add to ${h.title}`} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: pressed ? C.press : 'transparent' })}>
              {h.cover_url ? (
                <Image source={{ uri: h.cover_url }} style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: C.surface2 }} contentFit="cover" />
              ) : (
                <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="highlight" size={22} color={C.fg2} />
                </View>
              )}
              <Text numberOfLines={1} style={{ flex: 1, color: C.fg, fontSize: 17 }}>{h.title}</Text>
              <Icon name="right" size={18} color={C.fg2} weight={2} />
            </Pressable>
          ))}
        </ScrollView>
      )}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 12 }}>
        <TextInput value={title} onChangeText={setTitle} placeholder="New memory name" placeholderTextColor={C.fg3} maxLength={30} keyboardAppearance={C.blurTint} returnKeyType="done" onSubmitEditing={() => { if (title.trim()) onPick({ title: title.trim() }); }} style={{ flex: 1, height: 44, paddingHorizontal: 14, borderRadius: 12, backgroundColor: C.field, color: C.fg, fontSize: 16 }} accessibilityLabel="New memory name" />
        <Button small label="Create" disabled={!title.trim()} onPress={() => onPick({ title: title.trim() })} style={{ height: 44 }} />
      </View>
    </Sheet>
  );
}
