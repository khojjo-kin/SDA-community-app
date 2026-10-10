import React, { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, Pressable, Text, View } from 'react-native';
import { Button, Empty, ErrorNote, Field, Loading, RoundButton, Screen, ScreenHeader, Sheet, useToast } from '../../src/components/ui';
import { deleteSavedReply, fetchSavedReplies, saveReply } from '../../src/lib/api';
import { useSession } from '../../src/lib/session';
import { C, errText } from '../../src/lib/theme';
import type { SavedReply } from '../../src/lib/types';

const LIMIT = 20;

/** Messages you send often, ready to drop into any chat from the + button. */
export default function SavedReplies() {
  const { me } = useSession();
  const toast = useToast();
  const [list, setList] = useState<SavedReply[] | null>(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<{ id?: string; shortcut: string; body: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setError('');
    fetchSavedReplies(me)
      .then(setList)
      .catch((e) => {
        setError(errText(e));
        setList([]);
      });
  }, [me]);
  useEffect(load, [load]);

  async function save() {
    if (!editing || busy) return;
    if (!editing.body.trim()) return;
    setBusy(true);
    try {
      await saveReply(me, editing);
      setEditing(null);
      load();
    } catch (e) {
      Alert.alert('That did not save', errText(e));
    } finally {
      setBusy(false);
    }
  }

  function remove() {
    if (!editing?.id) return;
    const id = editing.id;
    setEditing(null);
    deleteSavedReply(id).then(load).catch((e) => toast(errText(e)));
  }

  const add = () => {
    if ((list?.length ?? 0) >= LIMIT) toast(`You can keep up to ${LIMIT} saved replies.`);
    else setEditing({ shortcut: '', body: '' });
  };

  return (
    <Screen>
      <ScreenHeader title="Saved replies" right={<RoundButton name="plus" label="New saved reply" onPress={add} />} />
      {list === null ? (
        <Loading />
      ) : error ? (
        <ErrorNote message={error} onRetry={load} />
      ) : (
        <FlatList
          data={list}
          keyExtractor={(r) => r.id}
          contentContainerStyle={{ paddingBottom: 40 }}
          ListHeaderComponent={<Text style={{ color: C.fg2, paddingHorizontal: 16, paddingBottom: 12, lineHeight: 20 }}>Save answers you send often. In any chat, tap + to pick one and it is placed in the message box, ready to send or change.</Text>}
          ListEmptyComponent={<Empty icon="reply" title="No saved replies yet" action={<Button small label="Add a saved reply" onPress={add} style={{ marginTop: 8 }} />} />}
          renderItem={({ item: r }) => (
            <Pressable onPress={() => setEditing({ id: r.id, shortcut: r.shortcut, body: r.body })} accessibilityRole="button" accessibilityLabel={`Edit saved reply: ${r.body}`} style={({ pressed }) => ({ paddingHorizontal: 16, paddingVertical: 12, backgroundColor: pressed ? C.press : 'transparent' })}>
              {r.shortcut ? <Text style={{ color: C.accent2, fontWeight: '700', fontSize: 14 }}>{r.shortcut}</Text> : null}
              <Text numberOfLines={3} style={{ color: C.fg, fontSize: 16.5, lineHeight: 22 }}>{r.body}</Text>
            </Pressable>
          )}
        />
      )}

      <Sheet visible={!!editing} onClose={() => setEditing(null)} title={editing?.id ? 'Edit saved reply' : 'New saved reply'}>
        {editing ? (
          <View style={{ paddingHorizontal: 16, gap: 12 }}>
            <Field label="Name (optional)" value={editing.shortcut} onChangeText={(shortcut) => setEditing({ ...editing, shortcut })} placeholder="For example: Hours" maxLength={30} style={{ backgroundColor: C.field }} />
            <Field label="Message" value={editing.body} onChangeText={(body) => setEditing({ ...editing, body })} placeholder="What you want to send" multiline maxLength={1000} style={{ backgroundColor: C.field, minHeight: 96, textAlignVertical: 'top' }} />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {editing.id ? <Button label="Delete" kind="danger" onPress={remove} style={{ flex: 1 }} /> : null}
              <Button label="Save" onPress={save} busy={busy} disabled={!editing.body.trim()} style={{ flex: 2 }} />
            </View>
          </View>
        ) : null}
      </Sheet>
    </Screen>
  );
}
