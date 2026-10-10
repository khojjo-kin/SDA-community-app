import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { Icon } from '../../../src/components/Icon';
import { ErrorNote, Loading, Screen, ScreenHeader } from '../../../src/components/ui';
import { chipLabel, Day, dateRange, dayTitle, fetchDay, fetchLesson, Lesson, loadSsSettings, Reading, readingHtml, saveSsSettings, SsSettings, todayIndex } from '../../../src/lib/sabbath-school';
import { C, errText } from '../../../src/lib/theme';

/** Changes the page's text size in place. The trailing `true` keeps iOS from warning about a non-serialisable result. */
const sizeScript = (px: number) => `document.body.style.fontSize='${px}px';true;`;

export default function LessonScreen() {
  const params = useLocalSearchParams<{ id: string; q: string }>();
  const lessonId = String(params.id ?? '');
  const quarterlyId = String(params.q ?? '');
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [settings, setSettings] = useState<SsSettings | null>(null);
  const [lesson, setLesson] = useState<{ lesson: Lesson; days: Day[] } | null>(null);
  const [at, setAt] = useState(0);
  const [reading, setReading] = useState<Reading | null>(null);
  const [error, setError] = useState('');
  const [readError, setReadError] = useState('');
  const web = useRef<WebView>(null);
  const chips = useRef<ScrollView>(null);
  const chipX = useRef<Record<number, number>>({});
  const wanted = useRef('');

  useEffect(() => {
    loadSsSettings().then(setSettings);
  }, []);

  const loadLesson = useCallback(async () => {
    setLesson(null);
    setError('');
    try {
      const data = await fetchLesson(quarterlyId, lessonId);
      setAt(todayIndex(data.days));
      setLesson(data);
    } catch (e) {
      setError(errText(e));
    }
  }, [quarterlyId, lessonId]);
  useEffect(() => {
    loadLesson();
  }, [loadLesson]);

  const day = lesson?.days[at];
  const loadReading = useCallback(async () => {
    if (!day) return;
    setReading(null);
    setReadError('');
    wanted.current = day.id;
    try {
      const r = await fetchDay(quarterlyId, lessonId, day.id);
      // Chips can be tapped faster than the network answers; only the latest choice may land.
      if (wanted.current === day.id) setReading(r);
    } catch (e) {
      if (wanted.current === day.id) setReadError(errText(e));
    }
  }, [quarterlyId, lessonId, day]);
  useEffect(() => {
    loadReading();
  }, [loadReading]);

  const size = settings?.size ?? 18;
  // Built once per reading: a size change is applied live below, so the page does not reload and lose its place.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const source = useMemo(() => ({ html: reading ? readingHtml(reading, size) : '' }), [reading]);
  useEffect(() => {
    web.current?.injectJavaScript(sizeScript(size));
  }, [size]);

  function setSize(delta: number) {
    if (!settings) return;
    const next = { ...settings, size: Math.min(30, Math.max(14, settings.size + delta)) };
    setSettings(next);
    saveSsSettings(next);
  }

  // Keeps the chosen chip on screen: Friday and the extras sit past the right edge of a phone.
  const reveal = useCallback((i: number) => {
    const x = chipX.current[i];
    if (x !== undefined) chips.current?.scrollTo({ x: Math.max(0, x - 16), animated: true });
  }, []);
  useEffect(() => {
    reveal(at);
  }, [at, reveal]);

  const n = parseInt(lessonId, 10);
  const last = (lesson?.days.length ?? 1) - 1;

  return (
    <Screen>
      <ScreenHeader title={n ? `Lesson ${n}` : 'Lesson'} onBack={() => (router.canGoBack() ? router.back() : router.replace('/sabbath-school'))} />

      {error ? (
        <ErrorNote message={error} onRetry={loadLesson} />
      ) : !lesson || !day ? (
        <Loading />
      ) : (
        <>
          <View style={{ paddingHorizontal: 16, paddingTop: 2 }}>
            <Text accessibilityRole="header" style={{ color: C.fg, fontSize: 21, fontWeight: '700', lineHeight: 26 }}>{lesson.lesson.title}</Text>
            <Text style={{ color: C.fg2, fontSize: 14, marginTop: 3 }}>{dateRange(lesson.lesson.start_date, lesson.lesson.end_date)}</Text>
          </View>
          <ScrollView ref={chips} horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 12, gap: 8 }}>
            {lesson.days.map((d, i) => (
              <Pressable key={d.id} onPress={() => setAt(i)} onLayout={(e) => { chipX.current[i] = e.nativeEvent.layout.x; if (i === at) reveal(i); }} accessibilityRole="tab" accessibilityLabel={`${chipLabel(d)}, ${d.title}`} accessibilityState={{ selected: i === at }} style={{ height: 36, paddingHorizontal: 14, borderRadius: 18, justifyContent: 'center', backgroundColor: i === at ? C.accent : C.surface }}>
                <Text style={{ color: C.fg, fontSize: 14.5, fontWeight: '600' }}>{chipLabel(d)}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <View style={{ paddingHorizontal: 16, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line }}>
            <Text accessibilityRole="header" style={{ color: C.fg, fontSize: 17, fontWeight: '700' }}>{day.title}</Text>
            {dayTitle(day.date) ? <Text style={{ color: C.fg2, fontSize: 13, marginTop: 1 }}>{dayTitle(day.date)}</Text> : null}
          </View>

          {readError ? (
            <View style={{ flex: 1 }}>
              <ErrorNote message={readError} onRetry={loadReading} />
            </View>
          ) : !reading ? (
            <View style={{ flex: 1 }}>
              <Loading />
            </View>
          ) : (
            <WebView
              ref={web}
              source={source}
              style={{ flex: 1, backgroundColor: C.bg }}
              containerStyle={{ backgroundColor: C.bg }}
              startInLoadingState
              renderLoading={() => <Loading />}
              onLoadEnd={() => web.current?.injectJavaScript(sizeScript(size))}
              // Links in the study guide open in the phone's browser; the reading itself stays in the app.
              onShouldStartLoadWithRequest={(req) => {
                if (!/^https?:/i.test(req.url)) return true;
                Linking.openURL(req.url).catch(() => {});
                return false;
              }}
              dataDetectorTypes="none"
            />
          )}

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 10, paddingBottom: insets.bottom + 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.line }}>
            <Pressable onPress={() => setAt(at - 1)} disabled={at === 0} accessibilityRole="button" accessibilityLabel="Previous day" style={{ flexDirection: 'row', alignItems: 'center', gap: 6, opacity: at === 0 ? 0.3 : 1 }}>
              <Icon name="back" size={18} color={C.fg2} weight={2.2} />
              <Text style={{ color: C.fg2, fontWeight: '600' }}>Previous</Text>
            </Pressable>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Pressable onPress={() => setSize(-2)} disabled={size <= 14} hitSlop={6} accessibilityRole="button" accessibilityLabel="Smaller text" style={{ width: 42, height: 36, borderRadius: 18, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center', opacity: size <= 14 ? 0.4 : 1 }}>
                <Text style={{ color: C.fg, fontSize: 13, fontWeight: '700' }}>A−</Text>
              </Pressable>
              <Text accessibilityLabel={`Text size ${size}`} style={{ color: C.fg3, fontSize: 12.5, width: 26, textAlign: 'center' }}>{size}</Text>
              <Pressable onPress={() => setSize(2)} disabled={size >= 30} hitSlop={6} accessibilityRole="button" accessibilityLabel="Larger text" style={{ width: 42, height: 36, borderRadius: 18, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center', opacity: size >= 30 ? 0.4 : 1 }}>
                <Text style={{ color: C.fg, fontSize: 17, fontWeight: '700' }}>A+</Text>
              </Pressable>
            </View>
            <Pressable onPress={() => setAt(at + 1)} disabled={at >= last} accessibilityRole="button" accessibilityLabel="Next day" style={{ flexDirection: 'row', alignItems: 'center', gap: 6, opacity: at >= last ? 0.3 : 1 }}>
              <Text style={{ color: C.fg2, fontWeight: '600' }}>Next</Text>
              <Icon name="right" size={18} color={C.fg2} weight={2.2} />
            </Pressable>
          </View>
        </>
      )}
    </Screen>
  );
}
