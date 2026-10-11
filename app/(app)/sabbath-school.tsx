import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Share, Text, useWindowDimensions, View } from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Icon } from '../../src/components/Icon';
import { QuarterRow } from '../../src/components/sabbath/discover';
import { lessonLine, PillTabs, tileColour, WEEKDAY } from '../../src/components/sabbath/kit';
import { ItemRow, LessonTile, QuarterHero } from '../../src/components/sabbath/plans';
import { loadLatestSabbathPosts, openOnce, PublishersSection } from '../../src/components/sabbath/publishers';
import { Greeting, MemoryHero, TodayCard } from '../../src/components/sabbath/today';
import { Skeleton, SkeletonFrame } from '../../src/components/Skeleton';
import { Empty, ErrorNote, IconButton, RoundButton, Screen, SectionLabel, Sheet, useToast } from '../../src/components/ui';
import { useAppFont } from '../../src/lib/fonts';
import { dayState, daysRead, isSaved, lessonComplete, lessonKey, LessonProgress, parseKey, quarterStarted, slotDayId, toggleSaved, useLessonProgress } from '../../src/lib/lesson-progress';
import { currentLesson, currentQuarterly, dateRange, Day, fetchLesson, fetchMemoryText, fetchQuarterlies, fetchQuarterly, isStandard, isThisWeek, Lesson, loadSsSettings, MemoryText, parseDate, Quarterly, SsSettings, startOfToday, updateSsSettings } from '../../src/lib/sabbath-school';
import { useSession } from '../../src/lib/session';
import { C, errText } from '../../src/lib/theme';

type Tab = 'quarter' | 'saved' | 'done';

/** This week's lesson's days and memory text. `null` days are still loading; `undefined` memory is still loading, `null` means none. */
type Week = { key: string; days: Day[] | null; memory: MemoryText | null | undefined };

const lessonNumber = (l: Lesson, i: number) => parseInt(l.id, 10) || i + 1;

/**
 * The day to study in a lesson: today, when today is in the lesson's own week (Sabbath = 0 to
 * Friday = 6); otherwise the first day not read yet, so a member reading ahead or catching up
 * picks up where they stopped.
 */
function studySlot(quarterId: string, l: Lesson, p: LessonProgress): { slot: number; inWeek: boolean } {
  if (isThisWeek(l)) {
    // Rounded, because a clock change makes one day of the year 23 or 25 hours long.
    const diff = Math.round((startOfToday().getTime() - parseDate(l.start_date).getTime()) / 86400e3);
    if (diff >= 0 && diff <= 6) return { slot: diff, inWeek: true };
  }
  for (let i = 0; i < 7; i++) if (!dayState(quarterId, l.id, i, p)) return { slot: i, inWeek: false };
  return { slot: 0, inWeek: false };
}

/** The weekday of day `slot` of a lesson, counted on the calendar from its first day. */
function slotName(l: Lesson, slot: number): string {
  const s = parseDate(l.start_date);
  if (isNaN(s.getTime())) return WEEKDAY[(slot + 6) % 7];
  return WEEKDAY[new Date(s.getFullYear(), s.getMonth(), s.getDate() + slot).getDay()];
}

/** Shapes where the page will be, so it does not jump about when the lessons land. */
function PageSkeleton({ browse, tile, cols }: { browse: boolean; tile: number; cols: number }) {
  const { width } = useWindowDimensions();
  const card = width - 32;
  return (
    <SkeletonFrame>
      {browse ? null : (
        <>
          <Skeleton width={card} height={340} radius={20} x={16} style={{ marginHorizontal: 16 }} />
          <Skeleton width={card} height={236} radius={20} x={16} style={{ marginHorizontal: 16, marginTop: 14 }} />
        </>
      )}
      <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 26, paddingBottom: 16 }}>
        {[118, 80, 110].map((w, i) => (
          <Skeleton key={w} width={w} height={38} radius={19} x={16 + [0, 126, 214][i]} />
        ))}
      </View>
      <Skeleton width={card} height={156} radius={20} x={16} style={{ marginHorizontal: 16 }} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingHorizontal: 16, paddingTop: 16 }}>
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} width={tile} height={tile} radius={18} x={16 + (i % cols) * (tile + 12)} />
        ))}
      </View>
    </SkeletonFrame>
  );
}

export default function SabbathSchool() {
  const router = useRouter();
  const toast = useToast();
  const font = useAppFont('bold');
  const { width } = useWindowDimensions();
  // `q` opens one particular quarter (from "Other quarters"); without it the page is the member's own quarter.
  const params = useLocalSearchParams<{ q?: string }>();
  const browse = typeof params.q === 'string' ? params.q : '';
  const { profile } = useSession();
  const progress = useLessonProgress();
  const [settings, setSettings] = useState<SsSettings | null>(null);
  const [list, setList] = useState<Quarterly[] | null>(null);
  const [data, setData] = useState<{ quarterly: Quarterly; lessons: Lesson[] } | null>(null);
  const [week, setWeek] = useState<Week | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<Tab>('quarter');
  const [sheet, setSheet] = useState(false);
  const [expanded, setExpanded] = useState(false);
  // Bumped on pull to refresh, so the publishers' posts are fetched again too.
  const [pulled, setPulled] = useState(0);
  /** Only the latest load may land: a refresh and a quarter change can overlap. */
  const ticket = useRef(0);
  const catalogue = useRef<Quarterly[] | null>(null);
  const shown = useRef(false);
  shown.current = !!data;

  useEffect(() => {
    loadSsSettings().then(setSettings);
  }, []);

  // The publishers' newest posts are fetched beside the lessons, so their row is ready when the page is.
  useEffect(() => {
    if (!browse) loadLatestSabbathPosts().catch(() => {});
  }, [browse]);

  const load = useCallback(
    async (fresh = false) => {
      if (!settings) {
        setRefreshing(false);
        return;
      }
      const mine = ++ticket.current;
      if (!fresh) {
        setData(null);
        setError('');
      }
      try {
        // The catalogue is fetched once per visit, and again on pull to refresh.
        let all = fresh ? null : catalogue.current;
        if (!all) {
          try {
            all = await fetchQuarterlies();
            catalogue.current = all;
          } catch (e) {
            // Opening one known quarter does not need the catalogue: only the row of other quarters goes missing.
            if (!browse) throw e;
            all = catalogue.current ?? [];
          }
        }
        if (ticket.current !== mine) return;
        setList(all);
        let id = browse;
        if (!id) {
          // A chosen quarter is honoured until it ends; after that the page moves on to the current one by itself.
          const saved = all.find((q) => q.id === settings.quarterly);
          const q = saved && parseDate(saved.end_date) >= startOfToday() ? saved : currentQuarterly(all);
          if (!q) throw new Error('No lessons are available right now. Try again later.');
          id = q.id;
        }
        const d = await fetchQuarterly(id, fresh);
        if (ticket.current !== mine) return;
        setData(d);
        setError('');
        if (!fresh) setExpanded(false);
      } catch (e) {
        if (ticket.current !== mine) return;
        // A failed pull to refresh keeps what is already on screen; a failed first load says why, with a retry.
        if (fresh && shown.current) toast(errText(e));
        else setError(errText(e));
      } finally {
        if (ticket.current === mine) setRefreshing(false);
      }
    },
    [settings, browse, toast],
  );
  useEffect(() => {
    load();
  }, [load]);

  const quarterly = data?.quarterly;
  const quarterId = quarterly?.id ?? '';
  const lessons = useMemo(() => data?.lessons ?? [], [data]);
  const thisLesson = useMemo(() => (data && !browse ? currentLesson(data.lessons) : null), [data, browse]);

  // This week's days (for today's title) and memory text, fetched beside the quarter; both are kept on the phone.
  useEffect(() => {
    if (!thisLesson || !quarterId) {
      setWeek(null);
      return;
    }
    const key = lessonKey(quarterId, thisLesson.id);
    let live = true;
    setWeek((w) => (w?.key === key ? w : { key, days: null, memory: undefined }));
    const patch = (p: Partial<Week>) => {
      if (live) setWeek((w) => (w?.key === key ? { ...w, ...p } : w));
    };
    fetchLesson(quarterId, thisLesson.id)
      .then((r) => patch({ days: r.days }))
      .catch(() => patch({ days: [] }));
    fetchMemoryText(quarterId, thisLesson.id)
      .then((m) => patch({ memory: m }))
      .catch(() => patch({ memory: null }));
    return () => {
      live = false;
    };
  }, [quarterId, thisLesson]);

  const openLesson = (q: string, id: string, day?: string) => openOnce(() => router.push({ pathname: '/lesson/[id]', params: day ? { id, q, day } : { id, q } } as any));
  const openQuarter = (q: Quarterly) => openOnce(() => router.push({ pathname: '/sabbath-school', params: { q: q.id } } as any));
  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));

  function choose(id: string) {
    if (!settings) return;
    setSettings({ ...settings, quarterly: id });
    // Only the quarter is saved: this screen's copy of the text size may be older than the lesson screen's.
    updateSsSettings({ quarterly: id });
    setSheet(false);
  }

  const firstName = (profile?.full_name ?? '').trim().split(/\s+/)[0] || profile?.username || '';

  // Two columns on a phone; more on a tablet, so the squares stay a sensible size.
  const cols = Math.max(2, Math.floor((width - 32 + 12) / 232));
  const tile = Math.floor((width - 32 - 12 * (cols - 1)) / cols);

  const others = useMemo(() => {
    const cutoff = new Date(Date.now() - 2 * 365 * 86400e3);
    return (list ?? [])
      .filter((q) => q.id !== quarterId && parseDate(q.end_date) >= cutoff)
      .sort((a, b) => parseDate(b.start_date).getTime() - parseDate(a.start_date).getTime() || (a.quarterly_group?.order ?? 0) - (b.quarterly_group?.order ?? 0))
      .slice(0, 24);
  }, [list, quarterId]);

  // The chooser lists quarters still running or to come: an ended one would be passed over at once.
  const choosable = useMemo(
    () =>
      (list ?? [])
        .filter((q) => parseDate(q.end_date) >= startOfToday())
        .sort((a, b) => parseDate(a.start_date).getTime() - parseDate(b.start_date).getTime() || (a.quarterly_group?.order ?? 0) - (b.quarterly_group?.order ?? 0)),
    [list],
  );

  /* ---------- this week ---------- */

  function renderToday() {
    if (!thisLesson || !quarterly) return null;
    const l = thisLesson;
    const n = lessonNumber(l, lessons.indexOf(l));
    const { slot, inWeek } = studySlot(quarterId, l, progress);
    const states = [0, 1, 2, 3, 4, 5, 6].map((i) => dayState(quarterId, l.id, i, progress));
    const mine = week?.key === lessonKey(quarterId, l.id) ? week : null;
    const days = mine?.days ?? null;
    const memory = mine?.memory;
    const dayTitle = days === null ? null : days.find((d) => d.id === slotDayId(slot))?.title || l.title;
    const state = states[slot];
    const key = lessonKey(quarterId, l.id);
    const saved = isSaved(key, progress);
    const read = () => openLesson(quarterId, l.id, slotDayId(slot));
    const share = () => {
      const message = memory ? `“${memory.text}”${memory.reference ? ` (${memory.reference})` : ''}` : `${l.title}, Sabbath School lesson ${n}`;
      Share.share({ message }).catch(() => {});
    };
    const save = () => {
      const now = toggleSaved({ k: key, t: l.title, s: lessonLine(l, n) });
      toast(now ? 'Saved' : 'Removed from Saved');
    };
    return (
      <>
        <MemoryHero
          image={l.cover || quarterly.splash || undefined}
          label={memory ? (inWeek ? "This week's memory text" : `Memory text, lesson ${n}`) : inWeek ? "This week's lesson" : `Lesson ${n}`}
          text={memory ? memory.text : l.title}
          reference={memory ? memory.reference : dateRange(l.start_date, l.end_date)}
          loading={memory === undefined}
          saved={saved}
          onSave={save}
          onShare={share}
          onRead={read}
        />
        <TodayCard
          heading={inWeek ? "Today's study" : 'Up next'}
          dayName={slotName(l, slot)}
          title={dayTitle}
          states={states}
          today={inWeek ? slot : undefined}
          action={state === 'done' ? 'Read again' : state ? 'Continue' : 'Start'}
          onPress={read}
        />
      </>
    );
  }

  /* ---------- the tabs ---------- */

  function renderQuarter() {
    if (!quarterly) return null;
    const finished = lessons.filter((l) => lessonComplete(quarterId, l.id, 7, progress)).length;
    return (
      <>
        <QuarterHero quarterly={quarterly} total={lessons.length} done={finished} />
        {quarterly.description ? (
          <Pressable onPress={() => setExpanded(!expanded)} accessibilityRole="button" accessibilityLabel={expanded ? 'Show less of the introduction' : 'Read the whole introduction'} accessibilityState={{ expanded }} style={{ paddingHorizontal: 16, paddingTop: 14 }}>
            <Text numberOfLines={expanded ? undefined : 3} style={{ color: C.fg2, fontSize: 15, lineHeight: 21 }}>{quarterly.description.trim()}</Text>
            <Text style={{ color: C.accent2, fontSize: 14, fontWeight: '600', paddingTop: 6 }}>{expanded ? 'Show less' : 'Read more'}</Text>
          </Pressable>
        ) : null}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingHorizontal: 16, paddingTop: 16 }}>
          {lessons.map((l, i) => {
            const n = lessonNumber(l, i);
            return (
              <LessonTile
                key={l.id}
                n={n}
                title={l.title}
                dates={dateRange(l.start_date, l.end_date)}
                colour={tileColour(n)}
                size={tile}
                done={lessonComplete(quarterId, l.id, 7, progress)}
                thisWeek={isThisWeek(l)}
                read={daysRead(quarterId, l.id, 7, progress)}
                onPress={() => openLesson(quarterId, l.id)}
              />
            );
          })}
        </View>
      </>
    );
  }

  function renderSaved() {
    const items = [...progress.saved].reverse();
    if (!items.length) return <Empty icon="heart" title="Nothing saved yet" />;
    return items.map((s) => {
      const { quarterId: q, lessonId, day } = parseKey(s.k);
      return (
        <ItemRow
          key={s.k}
          colour={tileColour(parseInt(lessonId, 10) || 1)}
          icon={day === undefined ? 'lesson' : 'bookmark'}
          title={s.t}
          sub={s.s}
          onPress={() => openLesson(q, lessonId, day === undefined ? undefined : slotDayId(day))}
          right={<IconButton name="heart" fill color={C.like} label={`Remove ${s.t} from Saved`} onPress={() => toggleSaved(s)} />}
        />
      );
    });
  }

  function renderDone() {
    const items = [...progress.lessons].reverse().filter((x) => {
      const { quarterId: q, lessonId } = parseKey(x.k);
      return lessonComplete(q, lessonId, 7, progress);
    });
    if (!items.length) return <Empty icon="check" title="No finished lessons yet" />;
    return items.map((x) => {
      const { quarterId: q, lessonId } = parseKey(x.k);
      return <ItemRow key={x.k} colour={tileColour(parseInt(lessonId, 10) || 1)} icon="check" title={x.t} sub={x.s} onPress={() => openLesson(q, lessonId)} />;
    });
  }

  return (
    <Screen>
      <View style={{ height: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16 }}>
        <RoundButton name="back" label="Back" onPress={back} />
        {browse || !choosable.length ? null : <RoundButton name="calendar" label="Choose a quarter" onPress={() => setSheet(true)} />}
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 48 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              setPulled((n) => n + 1);
              load(true);
            }}
            tintColor={C.fg2}
          />
        }>
        <Text accessibilityRole="header" style={{ color: C.fg, fontSize: 32, fontWeight: '800', letterSpacing: -0.4, lineHeight: 38, paddingHorizontal: 16, paddingBottom: browse ? 16 : 4, fontFamily: font }}>
          Sabbath School
        </Text>
        {browse ? null : <Greeting name={firstName} />}

        {error ? (
          <ErrorNote message={error} onRetry={() => load()} />
        ) : !quarterly ? (
          <PageSkeleton browse={!!browse} tile={tile} cols={cols} />
        ) : (
          <>
            {renderToday()}

            {browse ? null : <PublishersSection refresh={pulled} />}

            <View style={{ paddingTop: 26, paddingBottom: 16 }}>
              <PillTabs<Tab>
                value={tab}
                onChange={setTab}
                tabs={[
                  { id: 'quarter', label: browse ? 'Lessons' : 'This quarter' },
                  { id: 'saved', label: 'Saved' },
                  { id: 'done', label: 'Completed' },
                ]}
              />
            </View>
            {tab === 'quarter' ? renderQuarter() : tab === 'saved' ? renderSaved() : renderDone()}

            {others.length ? (
              <>
                <SectionLabel strong>Other quarters</SectionLabel>
                <QuarterRow quarters={others} started={(id) => quarterStarted(id, progress)} onOpen={openQuarter} />
              </>
            ) : null}

            <Text style={{ color: C.fg3, fontSize: 12.5, textAlign: 'center', paddingTop: 28, paddingHorizontal: 24, lineHeight: 17 }}>Lessons from the Sabbath School service by Adventech.</Text>
          </>
        )}
      </ScrollView>

      <Sheet visible={sheet} onClose={() => setSheet(false)} title="Choose a quarter" tall>
        <ScrollView contentContainerStyle={{ paddingBottom: 20 }}>
          {choosable.map((q) => {
            const on = q.id === quarterId;
            return (
              <Pressable key={q.id} onPress={() => choose(q.id)} accessibilityRole="radio" accessibilityLabel={`${q.title}, ${q.human_date}`} accessibilityState={{ checked: on }} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, minHeight: 56, backgroundColor: pressed ? C.press : 'transparent' })}>
                <Image source={{ uri: q.cover }} contentFit="cover" style={{ width: 36, height: 48, borderRadius: 6, backgroundColor: q.color_primary || C.surface2 }} />
                <View style={{ flex: 1, paddingVertical: 8 }}>
                  <Text numberOfLines={2} style={{ color: C.fg, fontSize: 16, fontWeight: on ? '700' : '400' }}>{q.title}</Text>
                  <Text style={{ color: C.fg2, fontSize: 13, marginTop: 1 }}>{q.human_date}{q.quarterly_group && !isStandard(q) ? ` · ${q.quarterly_group.name}` : ''}</Text>
                </View>
                {on ? <Icon name="check" size={22} color={C.accent2} weight={2.4} /> : null}
              </Pressable>
            );
          })}
        </ScrollView>
      </Sheet>
    </Screen>
  );
}
