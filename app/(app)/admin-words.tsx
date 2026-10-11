import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { AdminFrame } from '../../src/components/AdminFrame';
import { Skeleton, SkeletonFrame } from '../../src/components/Skeleton';
import { Button, Empty, ErrorNote, Field, IconButton, Screen, ScreenHeader, SearchField, SectionLabel, useToast } from '../../src/components/ui';
import { addBlockedWord, fetchBlockedWords, removeBlockedWord } from '../../src/lib/api';
import { useSession } from '../../src/lib/session';
import { C, errText, fmt } from '../../src/lib/theme';

const sorted = (list: string[]) => [...new Set(list)].sort((a, b) => a.localeCompare(b));
const WORD_WIDTHS = [0.32, 0.22, 0.4, 0.27, 0.35, 0.2, 0.3, 0.25];

/** The list of words while it loads: a line of each length. */
function WordsSkeleton() {
  const { width } = useWindowDimensions();
  return (
    <SkeletonFrame style={{ paddingTop: 8 }}>
      {WORD_WIDTHS.map((w, i) => (
        <View key={i} style={{ height: 48, justifyContent: 'center', paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line }}>
          <Skeleton width={Math.round((width - 32) * w)} height={13} x={16} />
        </View>
      ))}
    </SkeletonFrame>
  );
}

/** One word on the list, with its bin. */
const WordRow = React.memo(function WordRow({ word, onRemove }: { word: string; onRemove: (word: string) => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: 16, paddingRight: 8, minHeight: 48, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line }}>
      <Text style={{ flex: 1, color: C.fg, fontSize: 16.5 }}>{word}</Text>
      <IconButton name="trash" size={22} color={C.fg2} label={`Remove ${word}`} onPress={() => onRemove(word)} />
    </View>
  );
});

/** The list of words the database masks in comments and captions. Admins add and remove them here. */
export default function AdminWords() {
  const { profile } = useSession();
  const toast = useToast();
  const [words, setWords] = useState<string[] | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [draft, setDraft] = useState('');
  const [draftError, setDraftError] = useState('');
  const [adding, setAdding] = useState(false);
  const addingNow = useRef(false);
  const [q, setQ] = useState('');
  // The word just removed, offered back for a few seconds in case it was a slip.
  const [removed, setRemoved] = useState<string | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shown = useRef<string[] | null>(null);
  shown.current = words;
  const admin = !!profile?.admin_role;

  useEffect(() => () => { if (undoTimer.current) clearTimeout(undoTimer.current); }, []);

  const load = useCallback(
    (pull = false) => {
      if (!admin) return;
      if (pull) setRefreshing(true);
      fetchBlockedWords()
        .then((list) => {
          setWords(list);
          setError('');
        })
        .catch((e) => {
          if (shown.current === null) setError(errText(e));
          else if (pull) toast(errText(e));
        })
        .finally(() => {
          if (pull) setRefreshing(false);
        });
    },
    [admin, toast],
  );
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  function offerUndo(word: string | null) {
    if (undoTimer.current) clearTimeout(undoTimer.current);
    setRemoved(word);
    if (word) undoTimer.current = setTimeout(() => setRemoved(null), 8000);
  }

  async function add(raw: string, fromUndo = false) {
    if (addingNow.current) return;
    const w = raw.trim().toLowerCase();
    if (!w) return setDraftError('Type a word first.');
    if (words?.includes(w)) {
      setDraft('');
      setDraftError('');
      return toast(`"${w}" is already on the list`);
    }
    addingNow.current = true;
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
      addingNow.current = false;
      setAdding(false);
    }
  }

  const remove = useCallback(
    (word: string) => {
      // Off the list at once; put back if the database says no.
      setWords((list) => (list ?? []).filter((x) => x !== word));
      removeBlockedWord(word)
        .then(() => offerUndo(word))
        .catch((e) => {
          setWords((list) => sorted([...(list ?? []), word]));
          toast(errText(e));
        });
    },
    [toast],
  );
  const renderItem = useCallback(({ item }: { item: string }) => <WordRow word={item} onRemove={remove} />, [remove]);

  const needle = q.trim().toLowerCase();
  const filtered = useMemo(() => (words ?? []).filter((w) => !needle || w.includes(needle)), [words, needle]);

  if (!admin) {
    return (
      <Screen>
        <ScreenHeader title="Offensive words" />
        <Empty icon="shield" title="Admins only" />
      </Screen>
    );
  }

  const header = (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingHorizontal: 16, paddingTop: 4 }}>
        <View style={{ flex: 1 }}>
          <Field
            value={draft}
            onChangeText={(v) => {
              setDraft(v);
              if (draftError) setDraftError('');
            }}
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
          <Text numberOfLines={1} style={{ flex: 1, color: C.fg }}>Removed "{removed}"</Text>
          <Button small kind="ghost" label="Undo" disabled={adding} onPress={() => add(removed, true)} />
        </View>
      ) : null}
      <View style={{ paddingTop: 16 }}>
        <SearchField value={q} onChangeText={setQ} placeholder="Search the list" label="Search the list" />
      </View>
      {words?.length ? <SectionLabel>{needle ? `${fmt(filtered.length)} of ${fmt(words.length)} words` : `${fmt(words.length)} words`}</SectionLabel> : null}
    </View>
  );

  return (
    <AdminFrame section="words" title="Offensive words">
      {words === null ? (
        error ? <ErrorNote message={error} onRetry={() => { setError(''); load(); }} /> : <WordsSkeleton />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(w) => w}
          renderItem={renderItem}
          ListHeaderComponent={header}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          initialNumToRender={16}
          contentContainerStyle={{ paddingBottom: 60 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={C.fg2} />}
          ListEmptyComponent={needle ? <Empty icon="search" title="No words match" /> : <Empty icon="gavel" title="The list is empty" />}
        />
      )}
    </AdminFrame>
  );
}
