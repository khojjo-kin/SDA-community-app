import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { AdminFrame } from '../../src/components/AdminFrame';
import { Button, Empty, ErrorNote, Field, IconButton, Loading, Screen, ScreenHeader, SearchField, SectionLabel, useToast } from '../../src/components/ui';
import { addBlockedWord, fetchBlockedWords, removeBlockedWord } from '../../src/lib/api';
import { useSession } from '../../src/lib/session';
import { C, errText, fmt } from '../../src/lib/theme';

const sorted = (list: string[]) => [...new Set(list)].sort((a, b) => a.localeCompare(b));

/** The list of words the database masks in comments and captions. Admins add and remove them here. */
export default function AdminWords() {
  const { profile } = useSession();
  const toast = useToast();
  const [words, setWords] = useState<string[] | null>(null);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState('');
  const [draftError, setDraftError] = useState('');
  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState('');
  // The word just removed, offered back for a few seconds in case it was a slip.
  const [removed, setRemoved] = useState<string | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const admin = !!profile?.admin_role;

  useEffect(() => () => { if (undoTimer.current) clearTimeout(undoTimer.current); }, []);

  const load = useCallback(() => {
    if (!admin) return;
    setError('');
    fetchBlockedWords().then(setWords).catch((e) => setError(errText(e)));
  }, [admin]);
  useFocusEffect(load);

  function offerUndo(word: string | null) {
    if (undoTimer.current) clearTimeout(undoTimer.current);
    setRemoved(word);
    if (word) undoTimer.current = setTimeout(() => setRemoved(null), 8000);
  }

  async function add(raw: string, fromUndo = false) {
    if (adding) return;
    const w = raw.trim().toLowerCase();
    if (!w) return setDraftError('Type a word first.');
    if (words?.includes(w)) {
      setDraft('');
      setDraftError('');
      return toast(`"${w}" is already on the list`);
    }
    setAdding(true);
    try {
      await addBlockedWord(w);
      setWords((list) => sorted([...(list ?? []), w]));
      if (fromUndo) offerUndo(null);
      else {
        setDraft('');
        setDraftError('');
      }
      toast(fromUndo ? `"${w}" is back on the list` : `Added "${w}"`);
    } catch (e) {
      // addBlockedWord explains what a word may look like when it refuses one.
      if (fromUndo) toast(errText(e));
      else setDraftError(errText(e));
    } finally {
      setAdding(false);
    }
  }

  function remove(word: string) {
    // Off the list at once; put back if the database says no.
    setWords((list) => (list ?? []).filter((x) => x !== word));
    removeBlockedWord(word)
      .then(() => offerUndo(word))
      .catch((e) => {
        setWords((list) => sorted([...(list ?? []), word]));
        toast(errText(e));
      });
  }

  const needle = q.trim().toLowerCase();
  const shown = useMemo(() => (words ?? []).filter((w) => !needle || w.includes(needle)), [words, needle]);

  if (!admin) {
    return (
      <Screen>
        <ScreenHeader title="Offensive words" />
        <Empty icon="shield" title="Admins only" body="The list of masked words is looked after by the admins." />
      </Screen>
    );
  }

  const header = (
    <View>
      <Text style={{ color: C.fg2, paddingHorizontal: 16, lineHeight: 20 }}>
        Words on this list are replaced with asterisks in comments and captions as they are posted, including their plural, -ed and -ing forms. Posts already written are not changed. Words the Bible itself uses are deliberately left off, so quoted Scripture is never masked.
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingHorizontal: 16, paddingTop: 16 }}>
        <View style={{ flex: 1 }}>
          <Field
            value={draft}
            onChangeText={(t) => { setDraft(t); if (draftError) setDraftError(''); }}
            placeholder="Add a word"
            accessibilityLabel="Word to add"
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={30}
            returnKeyType="done"
            onSubmitEditing={() => add(draft)}
            error={draftError}
          />
        </View>
        <Button label="Add" busy={adding} onPress={() => add(draft)} style={{ height: 48 }} />
      </View>
      {removed ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16, marginTop: 12, paddingLeft: 14, paddingRight: 8, paddingVertical: 8, borderRadius: 12, backgroundColor: C.surface }}>
          <Text style={{ flex: 1, color: C.fg }}>Removed "{removed}"</Text>
          <Button small kind="ghost" label="Undo" disabled={adding} onPress={() => add(removed, true)} />
        </View>
      ) : null}
      <View style={{ paddingTop: 16 }}>
        <SearchField value={q} onChangeText={setQ} placeholder="Search the list" label="Search the list" />
      </View>
      {words?.length ? <SectionLabel>{needle ? `${fmt(shown.length)} of ${fmt(words.length)} words` : `${fmt(words.length)} words`}</SectionLabel> : null}
    </View>
  );

  return (
    <AdminFrame section="words" title="Offensive words">
      {words === null ? (
        error ? <ErrorNote message={error} onRetry={load} /> : <Loading />
      ) : (
        <FlatList
          data={shown}
          keyExtractor={(w) => w}
          ListHeaderComponent={header}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={{ paddingBottom: 60 }}
          ListEmptyComponent={needle ? <Empty icon="search" title="No words match" /> : <Empty icon="gavel" title="The list is empty" body="Nothing is masked until you add a word." />}
          renderItem={({ item: w }) => (
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: 16, paddingRight: 8, minHeight: 48, borderBottomWidth: 1, borderBottomColor: C.line }}>
              <Text style={{ flex: 1, color: C.fg, fontSize: 16.5 }}>{w}</Text>
              <IconButton name="trash" size={22} color={C.fg2} label={`Remove ${w}`} onPress={() => remove(w)} />
            </View>
          )}
        />
      )}
    </AdminFrame>
  );
}
