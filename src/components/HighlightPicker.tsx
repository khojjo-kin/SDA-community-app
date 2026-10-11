import React, { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import { fetchHighlights } from '../lib/api';
import { useSession } from '../lib/session';
import { C } from '../lib/theme';
import type { Highlight } from '../lib/types';
import { Icon } from './Icon';
import { RowsSkeleton } from './Skeleton';
import { Button, Sheet } from './ui';

/** Choose one of your highlights, or name a new one. */
export function HighlightPicker({ visible, onClose, onPick }: { visible: boolean; onClose: () => void; onPick: (choice: { id?: string; title: string }) => void }) {
  const { me } = useSession();
  const [list, setList] = useState<Highlight[] | null>(null);
  const [title, setTitle] = useState('');
  // One choice per opening: a quick second tap must not add the story twice, or make two memories.
  const picked = useRef(false);

  useEffect(() => {
    if (!visible) return;
    setTitle('');
    picked.current = false;
    let live = true;
    fetchHighlights(me)
      .then((h) => { if (live) setList(h); })
      .catch(() => { if (live) setList((cur) => cur ?? []); });
    return () => {
      live = false;
    };
  }, [visible, me]);

  const pick = (choice: { id?: string; title: string }) => {
    if (picked.current) return;
    picked.current = true;
    onPick(choice);
  };
  const create = () => {
    const name = title.trim();
    if (name) pick({ title: name });
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="Add to memories">
      {list === null ? (
        <RowsSkeleton count={3} avatar={46} />
      ) : (
        <ScrollView style={{ maxHeight: 260 }} keyboardShouldPersistTaps="handled">
          {list.map((h) => (
            <Pressable key={h.id} onPress={() => pick({ id: h.id, title: h.title })} accessibilityRole="button" accessibilityLabel={`Add to ${h.title}`} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: pressed ? C.press : 'transparent' })}>
              {h.cover_url ? (
                <Image source={{ uri: h.cover_url }} style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: C.surface2 }} contentFit="cover" cachePolicy="memory-disk" transition={120} />
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
        <TextInput value={title} onChangeText={setTitle} placeholder="New memory name" placeholderTextColor={C.fg3} maxLength={30} keyboardAppearance={C.blurTint} returnKeyType="done" onSubmitEditing={create} style={{ flex: 1, height: 44, paddingHorizontal: 14, borderRadius: 12, backgroundColor: C.field, color: C.fg, fontSize: 16 }} accessibilityLabel="New memory name" />
        <Button small label="Create" disabled={!title.trim()} onPress={create} style={{ height: 44 }} />
      </View>
    </Sheet>
  );
}
