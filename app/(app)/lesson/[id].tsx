import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Linking, NativeScrollEvent, NativeSyntheticEvent, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { WebView } from 'react-native-webview';
import { Icon, IconName } from '../../../src/components/Icon';
import { alpha, dayName, HERO_GRADIENT, lessonLine, Skeleton as Line } from '../../../src/components/sabbath/kit';
import { Skeleton, SkeletonFrame } from '../../../src/components/Skeleton';
import { ErrorNote, IconButton, Screen, ScreenHeader, Sheet, useToast } from '../../../src/components/ui';
import { useAppFont } from '../../../src/lib/fonts';
import { tap } from '../../../src/lib/haptics';
import { dayKey, daySlot, dayState, isSaved, lessonKey, markDayDone, markDayOpened, toggleSaved, useLessonProgress } from '../../../src/lib/lesson-progress';
import { chipLabel, Day, dateRange, dayTitle, fetchDay, fetchLesson, fetchMemoryText, Lesson, loadSsSettings, MemoryText, Reading, readingHtml, SsSettings, todayIndex, updateSsSettings } from '../../../src/lib/sabbath-school';
import { C, errText } from '../../../src/lib/theme';

/** Changes the page's text size in place. The trailing `true` keeps iOS from warning about a non-serialisable result. */
const sizeScript = (px: number) => `document.body.style.fontSize='${px}px';true;`;

/** Lora is loaded for everyone at start-up; until it lands the system font stands in. */
const SERIF = 'Lora_400Regular';

/**
 * The reading sits inside the page's scroll (under the picture and the memory text), so the
 * WebView is made exactly as tall as its content. This reports the height whenever it changes:
 * on load, as pictures arrive, when the text size changes and when a verse box opens or closes.
 */
const HEIGHT_SCRIPT = `(function(){var last=0;function post(){var h=Math.ceil(document.body.getBoundingClientRect().height);if(h>0&&h!==last&&window.ReactNativeWebView){last=h;window.ReactNativeWebView.postMessage(String(h));}}
if(window.ResizeObserver){new ResizeObserver(post).observe(document.body);}else{setInterval(post,700);}
window.addEventListener('load',post);document.addEventListener('click',function(){setTimeout(post,60);});post();})();`;

/**
 * Comfortable long-form reading over the standard page: a book face for the text, generous side
 * margins, and Bible references as accent chips that still open the verse when tapped.
 * Built at render time from `C`, so it follows the app's theme.
 */
function readingCss(): string {
  const sans = "-apple-system,system-ui,Roboto,'Segoe UI',sans-serif";
  // On a wide screen (a tablet) the lines stop at a comfortable length, about 75 letters, in the middle.
  return `body{padding:4px 22px 20px;line-height:1.6;font-family:'Iowan Old Style',Palatino,Georgia,'Noto Serif',serif;max-width:44em;margin:0 auto}
h1,h2,h3,h4{font-family:${sans};letter-spacing:-.01em}
p{margin:0 0 1.05em}
a.verse{color:${C.accent2};background:${alpha(C.accent, 0.16)};border:0;border-radius:999px;padding:.08em .55em;font-family:${sans};font-size:.84em;font-weight:600;-webkit-box-decoration-break:clone;box-decoration-break:clone}
a.verse.open{background:${alpha(C.accent, 0.32)}}
.verse-box{font-family:${sans};line-height:1.55}`;
}

/** A round button over the lesson's picture; it stays readable once the bar behind it turns solid. */
function BandButton({ icon, text, label, onPress, fill, colour = '#ffffff' }: { icon?: IconName; text?: string; label: string; onPress: () => void; fill?: boolean; colour?: string }) {
  return (
    <Pressable onPress={() => { tap('light'); onPress(); }} hitSlop={6} accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => ({ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? 'rgba(0,0,0,0.55)' : 'rgba(0,0,0,0.38)' })}>
      {icon ? <Icon name={icon} size={21} color={colour} fill={fill} weight={2.1} /> : <Text style={{ color: colour, fontSize: 15, fontWeight: '700' }}>{text}</Text>}
    </Pressable>
  );
}

/** Lines of a reading while it is on its way, at the reading's own margins. */
function ReadingSkeleton() {
  const { width } = useWindowDimensions();
  const w = Math.min(width, 748) - 44;
  const lines = [0.96, 0.9, 0.98, 0.72, -1, 0.94, 0.88, 0.97, 0.6, -1, 0.92, 0.85, 0.95, 0.4];
  return (
    <SkeletonFrame style={{ paddingHorizontal: 22, paddingTop: 10, gap: 12 }}>
      {lines.map((f, i) => (f < 0 ? <View key={i} style={{ height: 8 }} /> : <Skeleton key={i} width={Math.round(w * f)} height={14} x={22} />))}
    </SkeletonFrame>
  );
}

/**
 * The page's own shape while the lesson is on its way: the picture band with the back button and the
 * lesson's number, the memory text card, the days and the reading. Nothing moves when it arrives.
 */
function LessonSkeleton({ n, onBack }: { n: number; onBack: () => void }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const bandH = insets.top + 250;
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <StatusBar style="light" />
      <View style={{ height: bandH, backgroundColor: HERO_GRADIENT[0] }}>
        <LinearGradient colors={HERO_GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        <View style={{ position: 'absolute', left: 20, right: 20, bottom: 50, gap: 10 }}>
          <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 14, fontWeight: '700' }}>{n ? `Lesson ${n}` : 'Lesson'}</Text>
          <Line light style={{ height: 26, width: '82%' }} />
          <Line light style={{ height: 13, width: '38%' }} />
        </View>
        <View style={{ position: 'absolute', top: insets.top + 8, left: 12 }}>
          <BandButton icon="back" label="Back" onPress={onBack} />
        </View>
      </View>
      <View style={{ marginHorizontal: 16, marginTop: -30, padding: 18, borderRadius: 20, backgroundColor: C.surface, gap: 12 }}>
        <Line style={{ height: 13, width: 110, backgroundColor: C.surface2 }} />
        <Line style={{ height: 17, width: '94%', backgroundColor: C.surface2 }} />
        <Line style={{ height: 17, width: '78%', backgroundColor: C.surface2 }} />
      </View>
      <SkeletonFrame style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 18, paddingBottom: 16 }}>
        {[64, 56, 56, 56, 56].map((w, i) => (
          <Skeleton key={i} width={w} height={38} radius={19} x={16 + i * 64} />
        ))}
      </SkeletonFrame>
      <View style={{ paddingHorizontal: 22, paddingBottom: 14, gap: 8 }}>
        <Skeleton width={120} height={11} x={22} />
        <Skeleton width={Math.round((width - 44) * 0.7)} height={22} radius={8} x={22} />
      </View>
      <ReadingSkeleton />
    </View>
  );
}

/** Previous day or next day, with the day's short name. */
function DayStep({ dir, name, onPress }: { dir: 'back' | 'right'; name: string; onPress: () => void }) {
  const back = dir === 'back';
  return (
    <Pressable
      onPress={() => {
        tap('light');
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={`${back ? 'Previous day' : 'Next day'}: ${name}`}
      style={({ pressed }) => ({ flex: 1, minHeight: 62, borderRadius: 16, backgroundColor: C.surface, paddingHorizontal: 14, flexDirection: back ? 'row' : 'row-reverse', alignItems: 'center', gap: 10, opacity: pressed ? 0.7 : 1 })}>
      <Icon name={dir} size={18} color={C.fg2} weight={2.2} />
      <View style={{ flex: 1, alignItems: back ? 'flex-start' : 'flex-end' }}>
        <Text style={{ color: C.fg3, fontSize: 12.5 }}>{back ? 'Previous day' : 'Next day'}</Text>
        <Text numberOfLines={1} style={{ color: C.fg, fontSize: 15.5, fontWeight: '700', marginTop: 1 }}>{name}</Text>
      </View>
    </Pressable>
  );
}

export default function LessonScreen() {
  // `day` (a day id such as "03" or "inside-story") opens that day; without it the screen opens at today's reading.
  const params = useLocalSearchParams<{ id: string; q: string; day?: string }>();
  const lessonId = String(params.id ?? '');
  const quarterlyId = String(params.q ?? '');
  const wantDay = typeof params.day === 'string' ? params.day : '';
  const router = useRouter();
  const toast = useToast();
  const font = useAppFont('bold');
  const insets = useSafeAreaInsets();
  const { height: screenH } = useWindowDimensions();
  const progress = useLessonProgress();
  const [settings, setSettings] = useState<SsSettings | null>(null);
  const [lesson, setLesson] = useState<{ lesson: Lesson; days: Day[] } | null>(null);
  const [at, setAt] = useState(0);
  const [reading, setReading] = useState<Reading | null>(null);
  const [error, setError] = useState('');
  const [readError, setReadError] = useState('');
  /** `undefined` while loading, `null` when the lesson has none. */
  const [memory, setMemory] = useState<MemoryText | null | undefined>(undefined);
  /** The reading's measured height; 0 until the page reports it. */
  const [webHeight, setWebHeight] = useState(0);
  const [webLoaded, setWebLoaded] = useState(false);
  const [sizing, setSizing] = useState(false);
  /** True while the picture is under the status bar, which then wants light text even on White. */
  const [overPicture, setOverPicture] = useState(true);
  const overPictureRef = useRef(true);
  const web = useRef<WebView>(null);
  const page = useRef<ScrollView>(null);
  const chips = useRef<ScrollView>(null);
  const chipX = useRef<Record<number, number>>({});
  const daysY = useRef(0);
  const offset = useRef(0);
  const wanted = useRef('');
  const scrollY = useRef(new Animated.Value(0)).current;

  const n = parseInt(lessonId, 10) || 0;
  const back = () => (router.canGoBack() ? router.back() : router.replace('/sabbath-school'));

  useEffect(() => {
    loadSsSettings().then(setSettings);
  }, []);

  const loadLesson = useCallback(async () => {
    setLesson(null);
    setError('');
    try {
      const data = await fetchLesson(quarterlyId, lessonId);
      // A chosen day (from today's card or Saved) wins; otherwise today's reading when this is the current week.
      const chosen = wantDay ? data.days.findIndex((d) => d.id === wantDay) : -1;
      setAt(chosen >= 0 ? chosen : todayIndex(data.days));
      setLesson(data);
    } catch (e) {
      setError(errText(e));
    }
  }, [quarterlyId, lessonId, wantDay]);
  useEffect(() => {
    loadLesson();
  }, [loadLesson]);

  useEffect(() => {
    let live = true;
    setMemory(undefined);
    fetchMemoryText(quarterlyId, lessonId)
      .then((m) => {
        if (live) setMemory(m);
      })
      .catch(() => {
        if (live) setMemory(null);
      });
    return () => {
      live = false;
    };
  }, [quarterlyId, lessonId]);

  const day = lesson?.days[at];
  const loadReading = useCallback(async () => {
    if (!day || !lesson) return;
    setReading(null);
    setReadError('');
    setWebHeight(0);
    setWebLoaded(false);
    wanted.current = day.id;
    try {
      const r = await fetchDay(quarterlyId, lessonId, day.id);
      // Chips can be tapped faster than the network answers; only the latest choice may land.
      if (wanted.current !== day.id) return;
      setReading(r);
      markDayOpened(quarterlyId, lessonId, daySlot(day.id), { title: lesson.lesson.title, sub: lessonLine(lesson.lesson, n) });
    } catch (e) {
      if (wanted.current === day.id) setReadError(errText(e));
    }
  }, [quarterlyId, lessonId, day, lesson, n]);
  useEffect(() => {
    loadReading();
  }, [loadReading]);

  const size = settings?.size ?? 17;
  // Built once per reading: a size change is applied live below, so the page does not reload and lose its place.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const source = useMemo(() => ({ html: reading ? readingHtml(reading, size, { css: readingCss(), script: HEIGHT_SCRIPT }) : '' }), [reading]);
  useEffect(() => {
    web.current?.injectJavaScript(sizeScript(size));
  }, [size]);

  function setSize(delta: number) {
    if (!settings) return;
    tap('select');
    const next = { ...settings, size: Math.min(30, Math.max(14, settings.size + delta)) };
    setSettings(next);
    // Only the size is saved: this screen's copy of the chosen quarter may be older than the main page's.
    updateSsSettings({ size: next.size });
  }

  // Keeps the chosen chip on screen: Friday and the extras sit past the right edge of a phone.
  const reveal = useCallback((i: number) => {
    const x = chipX.current[i];
    if (x !== undefined) chips.current?.scrollTo({ x: Math.max(0, x - 16), animated: true });
  }, []);
  useEffect(() => {
    reveal(at);
  }, [at, reveal]);

  const barH = insets.top + 56;

  function go(i: number) {
    if (!lesson || i < 0 || i >= lesson.days.length || i === at) return;
    tap('select');
    setAt(i);
    // From further down a long reading, bring the new day's start up under the bar.
    const top = Math.max(0, daysY.current - barH);
    if (offset.current > top) page.current?.scrollTo({ y: top, animated: true });
  }

  if (error || !lesson || !day) {
    // A lesson with no day readings (some are published as a PDF only) would otherwise spin for ever.
    const empty = !!lesson && !lesson.days.length;
    if (!error && !empty) return <LessonSkeleton n={n} onBack={back} />;
    return (
      <Screen>
        <ScreenHeader title={n ? `Lesson ${n}` : 'Lesson'} onBack={back} />
        <ErrorNote message={error || 'This lesson has no daily readings in the app yet.'} onRetry={loadLesson} />
      </Screen>
    );
  }

  const l = lesson.lesson;
  const slot = daySlot(day.id);
  const name = dayName(day);
  const done = dayState(quarterlyId, lessonId, slot, progress) === 'done';
  const lessonSaved = isSaved(lessonKey(quarterlyId, lessonId), progress);
  const daySaved = isSaved(dayKey(quarterlyId, lessonId, slot), progress);
  const prev = lesson.days[at - 1];
  const next = lesson.days[at + 1];
  const info = { title: l.title, sub: lessonLine(l, n) };

  function toggleDone() {
    tap(done ? 'light' : 'success');
    markDayDone(quarterlyId, lessonId, slot, !done, info);
    if (!done) toast(`${name} marked as done`);
  }
  function saveLesson() {
    const now = toggleSaved({ k: lessonKey(quarterlyId, lessonId), t: l.title, s: info.sub });
    toast(now ? 'Saved' : 'Removed from Saved');
  }
  function saveDay() {
    if (!day) return;
    const now = toggleSaved({ k: dayKey(quarterlyId, lessonId, slot), t: day.title, s: n ? `Lesson ${n}, ${name}` : name });
    toast(now ? 'Saved' : 'Removed from Saved');
  }

  const bandH = insets.top + 250;
  // The bar behind the buttons turns solid, and the title appears in it, as the picture scrolls away.
  const barFade = scrollY.interpolate({ inputRange: [bandH - barH - 70, bandH - barH - 10], outputRange: [0, 1], extrapolate: 'clamp' });
  // Until the page reports its height it gets a screenful and scrolls itself, so it can never be cut short.
  const webH = webHeight || Math.max(320, screenH - barH);
  const when = dayTitle(day.date);

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {/* Light over the dark top of the picture; the theme's own once the bar above turns solid. */}
      <StatusBar style={overPicture ? 'light' : C.statusBar} />
      <Animated.ScrollView
        ref={page}
        scrollEventThrottle={16}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
          useNativeDriver: true,
          listener: (e: NativeSyntheticEvent<NativeScrollEvent>) => {
            offset.current = e.nativeEvent.contentOffset.y;
            // The page draws again only when the status bar's colour has to change, not on every frame of a scroll.
            const over = offset.current < bandH - barH - 40;
            if (over !== overPictureRef.current) {
              overPictureRef.current = over;
              setOverPicture(over);
            }
          },
        })}
        contentContainerStyle={{ paddingBottom: insets.bottom + 28 }}>
        {/* The lesson's picture (or a deep green wash) with its number, title and week. */}
        <View style={{ height: bandH, backgroundColor: HERO_GRADIENT[0] }}>
          <LinearGradient colors={HERO_GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
          {l.cover ? <Image source={{ uri: l.cover }} contentFit="cover" transition={200} style={StyleSheet.absoluteFill} accessibilityIgnoresInvertColors /> : null}
          {/* Dark at the top for the status bar and buttons, dark at the bottom for the title. */}
          <LinearGradient colors={['rgba(0,0,0,0.45)', 'rgba(0,0,0,0.08)', 'rgba(0,0,0,0.82)']} locations={[0, 0.35, 1]} style={StyleSheet.absoluteFill} />
          <View style={{ position: 'absolute', left: 20, right: 20, bottom: memory === null ? 22 : 50, gap: 4 }}>
            <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 14, fontWeight: '700' }}>{n ? `Lesson ${n}` : 'Lesson'}</Text>
            <Text accessibilityRole="header" numberOfLines={3} adjustsFontSizeToFit minimumFontScale={0.8} style={{ color: '#ffffff', fontSize: 28, fontWeight: '800', lineHeight: 34, fontFamily: font }}>
              {l.title}
            </Text>
            <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 14.5 }}>{dateRange(l.start_date, l.end_date)}</Text>
          </View>
        </View>

        {/* The memory text, lifted over the bottom of the picture. */}
        {memory === null ? null : (
          <View style={{ marginHorizontal: 16, marginTop: -30, padding: 18, borderRadius: 20, backgroundColor: C.surface, gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Icon name="sparkle" size={17} color={C.accent2} weight={2} />
              <Text style={{ color: C.accent2, fontSize: 13.5, fontWeight: '700' }}>Memory text</Text>
            </View>
            {memory ? (
              <Text selectable style={{ color: C.fg, fontSize: 18.5, lineHeight: 28, fontFamily: SERIF }}>{memory.text}</Text>
            ) : (
              <View style={{ gap: 9 }}>
                <Line style={{ height: 17, width: '94%', backgroundColor: C.surface2 }} />
                <Line style={{ height: 17, width: '78%', backgroundColor: C.surface2 }} />
              </View>
            )}
            {memory?.reference ? (
              <View style={{ alignSelf: 'flex-start', height: 30, paddingHorizontal: 12, borderRadius: 15, backgroundColor: alpha(C.accent, 0.16), justifyContent: 'center' }}>
                <Text style={{ color: C.accent2, fontSize: 13.5, fontWeight: '700' }}>{memory.reference}</Text>
              </View>
            ) : null}
          </View>
        )}

        {/* The days as pills, Sabbath to Friday and then the extra sections. */}
        <View
          onLayout={(e) => {
            daysY.current = e.nativeEvent.layout.y;
          }}>
          <ScrollView ref={chips} horizontal showsHorizontalScrollIndicator={false} accessibilityRole="tablist" contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 18, paddingBottom: 16, gap: 8 }}>
            {lesson.days.map((d, i) => {
              const on = i === at;
              const finished = dayState(quarterlyId, lessonId, daySlot(d.id), progress) === 'done';
              return (
                <Pressable
                  key={d.id}
                  onPress={() => go(i)}
                  onLayout={(e) => {
                    chipX.current[i] = e.nativeEvent.layout.x;
                    if (i === at) reveal(i);
                  }}
                  accessibilityRole="tab"
                  accessibilityLabel={`${chipLabel(d)}, ${d.title}${finished ? ', done' : ''}`}
                  accessibilityState={{ selected: on }}
                  style={({ pressed }) => ({ height: 38, paddingHorizontal: 16, borderRadius: 19, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: on ? C.fg : 'transparent', borderWidth: 1.5, borderColor: on ? C.fg : alpha(C.fg, 0.24), opacity: pressed ? 0.7 : 1 })}>
                  {finished ? <Icon name="check" size={14} color={on ? C.bg : C.accent2} weight={2.8} /> : null}
                  <Text style={{ color: on ? C.bg : C.fg, fontSize: 14.5, fontWeight: '700' }}>{chipLabel(d)}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        {/* The day's heading, with a bookmark to save just this day. */}
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6, paddingLeft: 22, paddingRight: 12, paddingBottom: 8 }}>
          <View style={{ flex: 1 }}>
            {when ? <Text style={{ color: C.fg2, fontSize: 13.5, fontWeight: '600' }}>{when}</Text> : null}
            <Text accessibilityRole="header" style={{ color: C.fg, fontSize: 23, fontWeight: '800', lineHeight: 29, marginTop: 2, fontFamily: font }}>{day.title}</Text>
          </View>
          <IconButton name="bookmark" fill={daySaved} color={daySaved ? C.accent2 : C.fg2} label={daySaved ? `Remove ${name}'s study from Saved` : `Save ${name}'s study`} onPress={saveDay} />
        </View>

        {readError ? (
          <ErrorNote message={readError} onRetry={loadReading} />
        ) : !reading ? (
          <View style={{ minHeight: screenH * 0.45 }}>
            <ReadingSkeleton />
          </View>
        ) : (
          <View style={{ height: webH }}>
            <WebView
              ref={web}
              source={source}
              style={{ backgroundColor: C.bg }}
              containerStyle={{ flex: 0, height: webH, backgroundColor: C.bg }}
              scrollEnabled={!webHeight}
              nestedScrollEnabled={!webHeight}
              showsVerticalScrollIndicator={false}
              overScrollMode="never"
              onMessage={(e) => {
                const h = Math.ceil(Number(e.nativeEvent.data));
                if (Number.isFinite(h) && h > 0) setWebHeight((old) => (Math.abs(old - h) > 1 ? h : old));
              }}
              onLoadEnd={() => {
                setWebLoaded(true);
                web.current?.injectJavaScript(sizeScript(size));
              }}
              // Links in the study guide open in the phone's browser; the reading itself stays in the app.
              onShouldStartLoadWithRequest={(req: { url: string; isTopFrame?: boolean }) => {
                // An embedded frame in the reading (a video, say) loads in place rather than in the browser.
                if (req.isTopFrame === false) return true;
                if (!/^https?:/i.test(req.url)) return true;
                Linking.openURL(req.url).catch(() => {});
                return false;
              }}
              dataDetectorTypes="none"
            />
            {webLoaded ? null : (
              <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: C.bg }]}>
                <ReadingSkeleton />
              </View>
            )}
          </View>
        )}

        {/* Finish the day, then move on. */}
        <View style={{ paddingHorizontal: 16, paddingTop: 16, gap: 12 }}>
          <Pressable
            onPress={toggleDone}
            accessibilityRole="button"
            accessibilityLabel={done ? `${name} is done` : `Mark ${name} as done`}
            accessibilityHint={done ? 'Marks it as not done' : undefined}
            accessibilityState={{ checked: done }}
            style={({ pressed }) => ({ height: 54, borderRadius: 27, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: done ? alpha(C.accent, 0.14) : C.accent, borderWidth: done ? 1.5 : 0, borderColor: C.accent2, opacity: pressed ? 0.8 : 1 })}>
            <Icon name="check" size={20} color={done ? C.accent2 : C.onAccent} weight={2.6} />
            <Text style={{ color: done ? C.accent2 : C.onAccent, fontSize: 16.5, fontWeight: '700', fontFamily: font }}>{done ? 'Done' : 'Mark as done'}</Text>
          </Pressable>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            {prev ? <DayStep dir="back" name={chipLabel(prev)} onPress={() => go(at - 1)} /> : <View style={{ flex: 1 }} />}
            {next ? <DayStep dir="right" name={chipLabel(next)} onPress={() => go(at + 1)} /> : <View style={{ flex: 1 }} />}
          </View>
        </View>
      </Animated.ScrollView>

      {/* The bar over the picture: back, save the lesson, text size. */}
      <View pointerEvents="box-none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: barH, paddingTop: insets.top }}>
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: C.bg, opacity: barFade, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line }]} />
        <View pointerEvents="box-none" style={{ flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 8 }}>
          <BandButton icon="back" label="Back" onPress={back} />
          {/* Touches pass through the title to the page, so a drag that starts on it still scrolls. */}
          <Animated.View pointerEvents="none" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={{ flex: 1, opacity: barFade }}>
            <Text numberOfLines={1} style={{ color: C.fg, fontSize: 17, fontWeight: '700', fontFamily: font }}>
              {l.title}
            </Text>
          </Animated.View>
          <BandButton icon="heart" fill={lessonSaved} colour={lessonSaved ? '#ff6b7a' : '#ffffff'} label={lessonSaved ? 'Remove this lesson from Saved' : 'Save this lesson'} onPress={saveLesson} />
          <BandButton text="Aa" label="Text size" onPress={() => setSizing(true)} />
        </View>
      </View>

      <Sheet visible={sizing} onClose={() => setSizing(false)} title="Text size">
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 18, paddingBottom: 18 }}>
          <Pressable onPress={() => setSize(-2)} disabled={size <= 14} hitSlop={6} accessibilityRole="button" accessibilityLabel="Smaller text" style={{ width: 64, height: 46, borderRadius: 23, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center', opacity: size <= 14 ? 0.4 : 1 }}>
            <Text style={{ color: C.fg, fontSize: 14, fontWeight: '700' }}>A−</Text>
          </Pressable>
          <Text accessibilityLabel={`Text size ${size}`} style={{ color: C.fg, fontSize: 17, fontWeight: '700', width: 36, textAlign: 'center' }}>{size}</Text>
          <Pressable onPress={() => setSize(2)} disabled={size >= 30} hitSlop={6} accessibilityRole="button" accessibilityLabel="Larger text" style={{ width: 64, height: 46, borderRadius: 23, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center', opacity: size >= 30 ? 0.4 : 1 }}>
            <Text style={{ color: C.fg, fontSize: 19, fontWeight: '700' }}>A+</Text>
          </Pressable>
        </View>
        <Text style={{ color: C.fg2, fontSize: size, lineHeight: Math.round(size * 1.6), paddingHorizontal: 28, paddingBottom: 18, textAlign: 'center', fontFamily: SERIF }}>Thy word is a lamp unto my feet, and a light unto my path.</Text>
      </Sheet>
    </View>
  );
}
