import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { Icon } from '../../src/components/Icon';
import { Button, Divider, ErrorNote, Field, Loading, Screen, ScreenHeader, SectionLabel, Sheet, Toggle, useToast } from '../../src/components/ui';
import { deleteFaq, fetchFaqs, saveFaq, updateProfile } from '../../src/lib/api';
import { useSession } from '../../src/lib/session';
import { C, errText } from '../../src/lib/theme';
import type { Faq } from '../../src/lib/types';

const LIMIT = 4;

/** Questions people can tap at the top of a chat with you. Your answer is sent back automatically. */
export default function FaqScreen() {
  const { me, profile } = useSession();
  const toast = useToast();
  const [list, setList] = useState<Faq[] | null>(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<{ id?: string; question: string; answer: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const on = profile?.faq_enabled ?? false;

  const load = useCallback(() => {
    setError('');
    fetchFaqs(me)
      .then(setList)
      .catch((e) => {
        setError(errText(e));
        setList([]);
      });
  }, [me]);
  useEffect(load, [load]);

  async function save() {
    if (!editing || busy || !editing.question.trim()) return;
    setBusy(true);
    try {
      await saveFaq(me, { ...editing, position: list?.length ?? 0 });
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
    deleteFaq(id).then(load).catch((e) => toast(errText(e)));
  }

  return (
    <Screen>
      <ScreenHeader title="Frequently asked questions" />
      <ScrollView contentContainerStyle={{ paddingTop: 8, paddingBottom: 60 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 16, gap: 16 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: C.fg, fontSize: 17.5 }}>Show questions</Text>
            <Text style={{ color: C.fg2, fontSize: 15, lineHeight: 20, marginTop: 4 }}>People see these questions when they open a chat with you. Tapping one sends it as their message, and your answer is sent back straight away.</Text>
          </View>
          <Toggle value={on} onChange={(v) => updateProfile(me, { faq_enabled: v }).catch((e) => toast(errText(e)))} label="Show frequently asked questions in chats" />
        </View>
        <Divider thin />

        <SectionLabel strong>Questions</SectionLabel>
        {list === null ? (
          <Loading />
        ) : error ? (
          <ErrorNote message={error} onRetry={load} />
        ) : (
          <>
            {list.map((f) => (
              <Pressable key={f.id} onPress={() => setEditing({ id: f.id, question: f.question, answer: f.answer })} accessibilityRole="button" accessibilityLabel={`Edit question: ${f.question}`} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 11, backgroundColor: pressed ? C.press : 'transparent' })}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: C.fg, fontSize: 17 }}>{f.question}</Text>
                  <Text numberOfLines={2} style={{ color: C.fg2, fontSize: 15, lineHeight: 20, marginTop: 2 }}>{f.answer || 'No automatic answer. You reply yourself.'}</Text>
                </View>
                <Icon name="right" size={18} color={C.fg2} weight={2} />
              </Pressable>
            ))}
            {list.length < LIMIT ? (
              <View style={{ paddingHorizontal: 16, paddingTop: 10 }}>
                <Button kind="ghost" label={list.length ? 'Add another question' : 'Add a question'} onPress={() => setEditing({ question: '', answer: '' })} />
              </View>
            ) : (
              <Text style={{ color: C.fg3, paddingHorizontal: 16, paddingTop: 10 }}>You can have up to {LIMIT} questions.</Text>
            )}
            {on && !list.length ? <Text style={{ color: C.fg2, paddingHorizontal: 16, paddingTop: 12, lineHeight: 20 }}>Questions are on, but there are none yet, so nothing shows in your chats.</Text> : null}
          </>
        )}
      </ScrollView>

      <Sheet visible={!!editing} onClose={() => setEditing(null)} title={editing?.id ? 'Edit question' : 'New question'}>
        {editing ? (
          <View style={{ paddingHorizontal: 16, gap: 12 }}>
            <Field label="Question" value={editing.question} onChangeText={(question) => setEditing({ ...editing, question })} placeholder="For example: Do you take commissions?" maxLength={120} style={{ backgroundColor: C.field }} />
            <Field label="Your automatic answer" value={editing.answer} onChangeText={(answer) => setEditing({ ...editing, answer })} placeholder="Sent as your reply when someone taps the question" multiline maxLength={1000} style={{ backgroundColor: C.field, minHeight: 96, textAlignVertical: 'top' }} />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {editing.id ? <Button label="Delete" kind="danger" onPress={remove} style={{ flex: 1 }} /> : null}
              <Button label="Save" onPress={save} busy={busy} disabled={!editing.question.trim()} style={{ flex: 2 }} />
            </View>
          </View>
        ) : null}
      </Sheet>
    </Screen>
  );
}
