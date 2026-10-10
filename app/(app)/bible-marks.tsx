import React, { useCallback, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { MARK_COLORS, markHex } from '../../src/components/BibleMarks';
import { Icon } from '../../src/components/Icon';
import { RowsSkeleton } from '../../src/components/Skeleton';
import { Empty, ErrorNote, Screen, ScreenHeader, Sheet, SheetRow, useToast } from '../../src/components/ui';
import { fetchBibleMarks } from '../../src/lib/api';
import { cachedChapters, type Chapter, loadBibleSettings, TRANSLATIONS, verseRef } from '../../src/lib/bible';
import { tap } from '../../src/lib/haptics';
import { useT } from '../../src/lib/i18n';
import { useSession } from '../../src/lib/session';
import { ago, C, errText } from '../../src/lib/theme';
import type { BibleMark, BibleMarkColor } from '../../src/lib/types';

type Filter = 'all' | 'notes' | Exclude<BibleMarkColor, ''>;

/**
 * One highlighted verse or note: its colour (or a pencil), the reference, the words if the phone has them, and the note.
 * A long press offers more (a verse card).
 */
const MarkRow = React.memo(function MarkRow({ mark: m, words, cardLabel, onOpen, onMore }: { mark: BibleMark; words: string; cardLabel: string; onOpen: (m: BibleMark) => void; onMore: (m: BibleMark) => void }) {
  const ref = verseRef(m.book, m.chapter, [m.verse]);
  return (
    <Pressable
      onPress={() => onOpen(m)}
      onLongPress={() => onMore(m)}
      delayLongPress={350}
      accessibilityRole="button"
      accessibilityLabel={m.note ? `${ref}. ${m.note}` : ref}
      accessibilityActions={[{ name: 'card', label: cardLabel }]}
      onAccessibilityAction={(e) => e.nativeEvent.actionName === 'card' && onMore(m)}
      style={({ pressed }) => ({ flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: pressed ? C.press : 'transparent' })}>
      <View style={{ width: 22, alignItems: 'center', paddingTop: 2 }}>
        {m.color ? <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: markHex(m.color), marginTop: 2 }} /> : <Icon name="compose" size={18} color={C.accent2} weight={2.2} />}
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text numberOfLines={1} style={{ flex: 1, color: C.fg, fontSize: 16, fontWeight: '700' }}>{ref}</Text>
          <Text style={{ color: C.fg3, fontSize: 12.5 }}>{ago(m.updated_at)}</Text>
        </View>
        {words ? (
          <Text numberOfLines={2} style={{ color: C.fg2, fontSize: 14.5, lineHeight: 20 }}>
            {words}
          </Text>
        ) : null}
        {m.note ? (
          <View style={{ flexDirection: 'row', gap: 6, marginTop: 2 }}>
            {m.color ? <Icon name="compose" size={15} color={C.accent2} weight={2.2} /> : null}
            <Text numberOfLines={3} style={{ flex: 1, color: C.fg, fontSize: 14.5, lineHeight: 20 }}>
              {m.note}
            </Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
});

/** Every verse the member has highlighted or written a note on, newest first. */
export default function BibleMarksScreen() {
  const router = useRouter();
  const t = useT();
  const toast = useToast();
  const { me } = useSession();
  const [marks, setMarks] = useState<BibleMark[] | null>(null);
  const [chapters, setChapters] = useState<Record<string, Chapter>>({});
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [refreshing, setRefreshing] = useState(false);
  const hasList = useRef(false);
  // The long-press menu: the verse it is for stays while the sheet slides away.
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuMark, setMenuMark] = useState<BibleMark | null>(null);
  hasList.current = marks !== null;
  const openedAt = useRef(0);

  const load = useCallback(async () => {
    if (!me) return;
    setError('');
    try {
      const rows = await fetchBibleMarks(me);
      setMarks(rows);
      // The verse's words, where the chapter is already on the phone.
      const { translation } = await loadBibleSettings();
      setChapters(await cachedChapters(rows, translation));
    } catch (e) {
      // With the list already showing, a failed refresh keeps it and says why.
      if (hasList.current) toast(errText(e));
      else setError(errText(e));
    } finally {
      setRefreshing(false);
    }
  }, [me, toast]);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const shown = useMemo(() => (marks ?? []).filter((m) => (filter === 'all' ? true : filter === 'notes' ? !!m.note : m.color === filter)), [marks, filter]);

  const chip = (id: Filter, body: React.ReactNode, label: string) => {
    const on = filter === id;
    return (
      <Pressable
        key={id}
        onPress={() => {
          if (on) return;
          tap('select');
          setFilter(id);
        }}
        accessibilityRole="tab"
        accessibilityLabel={label}
        accessibilityState={{ selected: on }}
        style={({ pressed }) => ({ height: 36, minWidth: 36, paddingHorizontal: typeof body === 'string' ? 16 : 6, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? C.fg : pressed ? C.surface2 : C.surface })}>
        {typeof body === 'string' ? <Text style={{ color: on ? C.bg : C.fg, fontSize: 14.5, fontWeight: '700' }}>{body}</Text> : body}
      </Pressable>
    );
  };

  const open = useCallback(
    (m: BibleMark) => {
      const now = Date.now();
      if (now - openedAt.current < 700) return;
      openedAt.current = now;
      router.push({ pathname: '/bible/[book]', params: { book: m.book, c: String(m.chapter), v: String(m.verse) } } as any);
    },
    [router],
  );
  const onMore = useCallback((m: BibleMark) => {
    tap('medium');
    setMenuMark(m);
    setMenuOpen(true);
  }, []);
  const makeCard = (m: BibleMark) => {
    setMenuOpen(false);
    const now = Date.now();
    if (now - openedAt.current < 700) return;
    openedAt.current = now;
    const tr = TRANSLATIONS.some((x) => x.id === m.translation) ? m.translation : '';
    router.push({ pathname: '/verse-card', params: { book: m.book, c: String(m.chapter), v: String(m.verse), tr } } as any);
  };
  const cardLabel = t('verseCard.make');
  const renderItem = useCallback(({ item }: { item: BibleMark }) => <MarkRow mark={item} words={chapters[`${item.book} ${item.chapter}`]?.verses.find((v) => v.verse === item.verse)?.text ?? ''} cardLabel={cardLabel} onOpen={open} onMore={onMore} />, [chapters, open, onMore, cardLabel]);

  return (
    <Screen>
      <ScreenHeader title={t('bibleMarks.title')} />
      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} accessibilityRole="tablist" contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 10, gap: 8, alignItems: 'center' }}>
          {chip('all', t('bibleMarks.all'), t('bibleMarks.all'))}
          {chip('notes', t('bibleMarks.notes'), t('bibleMarks.notes'))}
          {MARK_COLORS.map((c) => chip(c.id, <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: c.hex, borderWidth: filter === c.id ? 2 : 0, borderColor: C.bg }} />, t(c.label)))}
        </ScrollView>
      </View>

      {marks === null ? (
        error ? <ErrorNote message={error} onRetry={load} /> : <RowsSkeleton count={8} avatar={14} gap={20} padY={14} />
      ) : (
        <FlatList
          data={shown}
          keyExtractor={(m) => `${m.book}.${m.chapter}.${m.verse}`}
          initialNumToRender={12}
          windowSize={9}
          contentContainerStyle={{ paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={C.fg2} />}
          ListEmptyComponent={<Empty icon="compose" title={marks.length ? t('bibleMarks.emptyFilter') : t('bibleMarks.empty')} />}
          renderItem={renderItem}
        />
      )}

      <Sheet visible={menuOpen} onClose={() => setMenuOpen(false)} title={menuMark ? verseRef(menuMark.book, menuMark.chapter, [menuMark.verse]) : undefined}>
        <SheetRow first icon="image" label={t('verseCard.make')} onPress={() => menuMark && makeCard(menuMark)} />
        <SheetRow
          icon="book"
          label={t('bible.readChapter')}
          onPress={() => {
            setMenuOpen(false);
            if (menuMark) open(menuMark);
          }}
        />
      </Sheet>
    </Screen>
  );
}
