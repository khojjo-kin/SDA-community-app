import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Icon } from '../../src/components/Icon';
import { ErrorNote, Loading, RoundButton, Row, Screen, ScreenHeader, SectionLabel, Sheet } from '../../src/components/ui';
import { currentLesson, currentQuarterly, dateRange, fetchQuarterlies, fetchQuarterly, isStandard, Lesson, loadSsSettings, parseDate, Quarterly, saveSsSettings, SsSettings, startOfToday } from '../../src/lib/sabbath-school';
import { C, errText } from '../../src/lib/theme';

const lessonNumber = (l: Lesson, i: number) => parseInt(l.id, 10) || i + 1;

export default function SabbathSchool() {
  const router = useRouter();
  const [settings, setSettings] = useState<SsSettings | null>(null);
  const [list, setList] = useState<Quarterly[] | null>(null);
  const [data, setData] = useState<{ quarterly: Quarterly; lessons: Lesson[] } | null>(null);
  const [error, setError] = useState('');
  const [sheet, setSheet] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    loadSsSettings().then(setSettings);
  }, []);

  const load = useCallback(async () => {
    if (!settings) return;
    setData(null);
    setError('');
    try {
      const all = list ?? (await fetchQuarterlies());
      if (!list) setList(all);
      // A chosen quarter is honoured until it ends; after that the screen moves on to the current one by itself.
      const saved = all.find((q) => q.id === settings.quarterly);
      const q = saved && parseDate(saved.end_date) >= startOfToday() ? saved : currentQuarterly(all);
      if (!q) throw new Error('No lessons are available right now. Try again later.');
      setData(await fetchQuarterly(q.id));
      setExpanded(false);
    } catch (e) {
      setError(errText(e));
    }
    // The catalogue is fetched once; re-running when it lands would load the quarter twice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings?.quarterly]);
  useEffect(() => {
    load();
  }, [load]);

  function choose(id: string) {
    if (!settings) return;
    const next = { ...settings, quarterly: id };
    setSettings(next);
    saveSsSettings(next);
    setSheet(false);
  }

  const open = (l: Lesson) => router.push({ pathname: '/lesson/[id]', params: { id: l.id, q: data?.quarterly.id ?? '' } } as any);

  const quarterly = data?.quarterly;
  const lessons = data?.lessons ?? [];
  const thisWeek = data ? currentLesson(lessons) : null;
  // Recent first; the adult guide and the youth or easy-reading editions of the same quarter sit together.
  const recent = (list ?? [])
    .filter((q) => parseDate(q.end_date) >= new Date(Date.now() - 2 * 365 * 86400e3))
    .sort((a, b) => parseDate(b.start_date).getTime() - parseDate(a.start_date).getTime() || (a.quarterly_group?.order ?? 0) - (b.quarterly_group?.order ?? 0));

  return (
    <Screen>
      <ScreenHeader title="Sabbath School" right={<RoundButton name="calendar" label="Choose a quarter" onPress={() => setSheet(true)} />} />

      {error ? (
        <ErrorNote message={error} onRetry={load} />
      ) : !quarterly ? (
        <Loading />
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 60 }}>
          <View style={{ flexDirection: 'row', gap: 14, paddingHorizontal: 16, paddingTop: 8 }}>
            <Image source={{ uri: quarterly.cover }} contentFit="cover" transition={150} accessibilityLabel={`Cover of ${quarterly.title}`} style={{ width: 96, height: 128, borderRadius: 12, backgroundColor: quarterly.color_primary || C.surface2 }} />
            <View style={{ flex: 1, justifyContent: 'center', gap: 4 }}>
              {quarterly.quarterly_group && !isStandard(quarterly) ? <Text style={{ color: C.accent2, fontSize: 12.5, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' }}>{quarterly.quarterly_group.name}</Text> : null}
              <Text accessibilityRole="header" style={{ color: C.fg, fontSize: 20, fontWeight: '700', lineHeight: 25 }}>{quarterly.title}</Text>
              <Text style={{ color: C.fg2, fontSize: 14.5 }}>{quarterly.human_date}</Text>
            </View>
          </View>
          {quarterly.description ? (
            <Pressable onPress={() => setExpanded(!expanded)} accessibilityRole="button" accessibilityLabel={expanded ? 'Show less of the introduction' : 'Read the whole introduction'} accessibilityState={{ expanded }} style={{ paddingHorizontal: 16, paddingTop: 14 }}>
              <Text numberOfLines={expanded ? undefined : 3} style={{ color: C.fg2, fontSize: 15, lineHeight: 21 }}>{quarterly.description.trim()}</Text>
              <Text style={{ color: C.accent2, fontSize: 14, fontWeight: '600', paddingTop: 6 }}>{expanded ? 'Show less' : 'Read more'}</Text>
            </Pressable>
          ) : null}

          {thisWeek ? (
            <>
              <SectionLabel>This week</SectionLabel>
              <Pressable onPress={() => open(thisWeek)} accessibilityRole="button" accessibilityLabel={`Lesson ${lessonNumber(thisWeek, lessons.indexOf(thisWeek))}, ${thisWeek.title}, ${dateRange(thisWeek.start_date, thisWeek.end_date)}`} style={({ pressed }) => ({ marginHorizontal: 16, padding: 14, borderRadius: 14, backgroundColor: pressed ? C.surface2 : C.surface, flexDirection: 'row', alignItems: 'center', gap: 12 })}>
                <Icon name="lesson" size={26} color={C.accent2} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: C.accent2, fontSize: 12.5, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' }}>Lesson {lessonNumber(thisWeek, lessons.indexOf(thisWeek))}</Text>
                  <Text style={{ color: C.fg, fontSize: 18, fontWeight: '700', lineHeight: 23, marginTop: 2 }}>{thisWeek.title}</Text>
                  <Text style={{ color: C.fg2, fontSize: 14, marginTop: 2 }}>{dateRange(thisWeek.start_date, thisWeek.end_date)}</Text>
                </View>
                <Icon name="right" size={18} color={C.fg2} weight={2} />
              </Pressable>
            </>
          ) : null}

          <SectionLabel>All lessons</SectionLabel>
          {lessons.map((l, i) => (
            <Row key={l.id} title={`${lessonNumber(l, i)} · ${l.title}`} sub={dateRange(l.start_date, l.end_date)} bold={l === thisWeek} onPress={() => open(l)} />
          ))}
          <Text style={{ color: C.fg3, fontSize: 12.5, textAlign: 'center', paddingTop: 24, paddingHorizontal: 24, lineHeight: 17 }}>Adult Bible Study Guide, from the free Sabbath School service by Adventech. Lessons stay on your phone once you have opened them.</Text>
        </ScrollView>
      )}

      <Sheet visible={sheet} onClose={() => setSheet(false)} title="Choose a quarter" tall>
        <ScrollView contentContainerStyle={{ paddingBottom: 20 }}>
          {recent.map((q) => {
            const on = q.id === quarterly?.id;
            return (
              <Pressable key={q.id} onPress={() => choose(q.id)} accessibilityRole="radio" accessibilityLabel={`${q.title}, ${q.human_date}`} accessibilityState={{ checked: on }} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, minHeight: 56, backgroundColor: pressed ? 'rgba(255,255,255,0.05)' : 'transparent' })}>
                <Image source={{ uri: q.cover }} contentFit="cover" style={{ width: 36, height: 48, borderRadius: 6, backgroundColor: q.color_primary || C.surface2 }} />
                <View style={{ flex: 1, paddingVertical: 8 }}>
                  <Text numberOfLines={2} style={{ color: C.fg, fontSize: 16, fontWeight: on ? '700' : '400' }}>{q.title}</Text>
                  <Text style={{ color: C.fg2, fontSize: 13, marginTop: 1 }}>{q.human_date}{q.quarterly_group ? ` · ${q.quarterly_group.name}` : ''}</Text>
                </View>
                {on ? <Icon name="check" size={22} color={C.accent2} weight={2.4} /> : null}
              </Pressable>
            );
          })}
          {!recent.length ? <Text style={{ color: C.fg2, textAlign: 'center', padding: 24 }}>The list of quarters has not loaded yet.</Text> : null}
        </ScrollView>
      </Sheet>
    </Screen>
  );
}
