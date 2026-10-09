import React, { useEffect, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '../../src/components/Icon';
import { StoryCanvas } from '../../src/components/StoryCanvas';
import { Button, Empty, ErrorNote, IconButton, Loading, Screen, useToast } from '../../src/components/ui';
import { createHighlight, fetchArchive } from '../../src/lib/api';
import { useSession } from '../../src/lib/session';
import { C, dayLabel, errText } from '../../src/lib/theme';
import type { ArchivedStory } from '../../src/lib/types';

/** Make a highlight: pick stories from your archive and give them a name. */
export default function NewHighlight() {
  const { me } = useSession();
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [list, setList] = useState<ArchivedStory[] | null>(null);
  const [error, setError] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => {
    setError('');
    fetchArchive(me)
      .then(setList)
      .catch((e) => {
        setError(errText(e));
        setList([]);
      });
  };
  useEffect(load, [me]);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  function toggle(id: string) {
    if (list?.find((s) => s.id === id)?.audience === 'close_friends') {
      toast('Close friends stories stay out of highlights, because highlights are for everyone.');
      return;
    }
    setPicked((cur) => {
      if (cur.includes(id)) return cur.filter((x) => x !== id);
      if (cur.length >= 20) {
        toast('A highlight holds up to 20 stories here. Add more later from your archive.');
        return cur;
      }
      return [...cur, id];
    });
  }

  async function create() {
    if (busy || !list) return;
    if (!picked.length) return toast('Choose at least one story.');
    if (!title.trim()) return toast('Give the highlight a name.');
    setBusy(true);
    try {
      // Oldest first, the way a highlight plays.
      const items = list.filter((s) => picked.includes(s.id)).reverse().map((s) => s.item);
      await createHighlight(me, title, items);
      toast('Highlight added to your profile');
      close();
    } catch (e) {
      toast(errText(e));
      setBusy(false);
    }
  }

  const gap = 2;
  const cw = Math.floor((width - gap * 2) / 3);
  const ch = Math.round((cw * 16) / 9);

  return (
    <Screen>
      <View style={{ height: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8 }}>
        <IconButton name="close" size={28} label="Close" onPress={close} />
        <Text accessibilityRole="header" style={{ flex: 1, color: C.fg, fontSize: 20, fontWeight: '700', textAlign: 'center' }}>New highlight</Text>
        <View style={{ width: 40 }} />
      </View>
      {list === null ? (
        <Loading />
      ) : error ? (
        <ErrorNote message={error} onRetry={load} />
      ) : !list.length ? (
        <Empty icon="highlight" title="Share a story first" body="Highlights are made from your stories. Once you have shared one, you can keep it on your profile here." action={<Button small label="Add to your story" onPress={() => router.replace('/add-story')} style={{ marginTop: 8 }} />} />
      ) : (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <FlatList
            data={list}
            keyExtractor={(s) => s.id}
            numColumns={3}
            columnWrapperStyle={{ gap }}
            ItemSeparatorComponent={() => <View style={{ height: gap }} />}
            keyboardShouldPersistTaps="handled"
            ListHeaderComponent={<Text style={{ color: C.fg2, paddingHorizontal: 16, paddingBottom: 14, lineHeight: 20 }}>Choose the stories to keep on your profile. Highlights stay until you remove them.</Text>}
            contentContainerStyle={{ paddingBottom: 16 }}
            renderItem={({ item: s }) => {
              const order = picked.indexOf(s.id);
              const friendsOnly = s.audience === 'close_friends';
              return (
                <Pressable onPress={() => toggle(s.id)} accessibilityRole="checkbox" accessibilityState={{ checked: order >= 0, disabled: friendsOnly }} accessibilityLabel={`Story from ${dayLabel(new Date(s.created_at))}${friendsOnly ? ', shared with close friends only' : ''}`} style={{ width: cw, height: ch }}>
                  <View style={{ opacity: friendsOnly ? 0.4 : 1 }}>
                    <StoryCanvas item={s.item} width={cw} height={ch} />
                  </View>
                  {order >= 0 ? <View style={{ position: 'absolute', left: 0, top: 0, width: cw, height: ch, backgroundColor: 'rgba(74,93,246,0.28)' }} /> : null}
                  {friendsOnly ? (
                    <View style={{ position: 'absolute', top: 7, right: 7, width: 24, height: 24, borderRadius: 12, backgroundColor: C.green, alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name="star" size={14} color="#fff" fill />
                    </View>
                  ) : (
                    <View style={{ position: 'absolute', top: 7, right: 7, width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: '#fff', backgroundColor: order >= 0 ? C.accent : 'rgba(0,0,0,0.25)', alignItems: 'center', justifyContent: 'center' }}>
                      {order >= 0 ? <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>{order + 1}</Text> : null}
                    </View>
                  )}
                  <Text style={{ position: 'absolute', left: 7, bottom: 6, color: '#fff', fontSize: 12, fontWeight: '700', textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 3, textShadowOffset: { width: 0, height: 1 } }}>{dayLabel(new Date(s.created_at))}</Text>
                </Pressable>
              );
            }}
          />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 12, paddingBottom: Math.max(insets.bottom, 12), borderTopWidth: 1, borderTopColor: C.line, backgroundColor: C.bg }}>
            <TextInput value={title} onChangeText={setTitle} placeholder="Highlight name" placeholderTextColor={C.fg3} maxLength={30} keyboardAppearance="dark" returnKeyType="done" style={{ flex: 1, height: 46, paddingHorizontal: 14, borderRadius: 12, backgroundColor: C.field, color: C.fg, fontSize: 16 }} accessibilityLabel="Highlight name" />
            <Button label={picked.length ? `Add (${picked.length})` : 'Add'} busy={busy} disabled={!picked.length || !title.trim()} onPress={create} />
          </View>
        </KeyboardAvoidingView>
      )}
    </Screen>
  );
}
