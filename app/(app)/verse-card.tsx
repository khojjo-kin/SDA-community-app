import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, PixelRatio, Platform, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Lora_400Regular, Lora_700Bold } from '@expo-google-fonts/lora';
import { Nunito_700Bold } from '@expo-google-fonts/nunito';
import { Poppins_400Regular, Poppins_600SemiBold } from '@expo-google-fonts/poppins';
import { useFonts } from 'expo-font';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import * as MediaLibrary from 'expo-media-library';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { captureRef } from 'react-native-view-shot';
import { useHideAssistiveButton } from '../../src/components/AssistiveButton';
import { Icon, IconName } from '../../src/components/Icon';
import { DarkEmpty, DarkStatusBar } from '../../src/components/OnDark';
import { Skeleton, SkeletonFrame } from '../../src/components/Skeleton';
import { Button, RoundButton, useToast } from '../../src/components/ui';
import { CARD_BACKGROUNDS, CARD_FONTS, CardAlign, CardDesign, cardRatio, CardShape, DEFAULT_DESIGN, fontOf, PHOTO_BG, VerseCardView } from '../../src/components/VerseCard';
import { BOOKS, Chapter, fetchChapter, loadBibleSettings, peekBibleSettings, peekChapter, spokenRef, TRANSLATIONS, TranslationId } from '../../src/lib/bible';
import { tap } from '../../src/lib/haptics';
import { useT } from '../../src/lib/i18n';
import { pickFromLibrary } from '../../src/lib/pick';
import { DARK, errText } from '../../src/lib/theme';

/*
 * Verse cards: any verse (or a few) as a designed picture, to add to a story, post, save or send.
 * Opened as /verse-card?book=John&c=3&v=16,17 (verses as a list or a range like 16-18), with
 * &tr=kjv for the translation being read (the member's own otherwise).
 */

/** The longest passage a card takes; anything longer is cut at a verse so the words stay readable. */
const MAX_CHARS = 480;
const MAX_VERSES = 8;
/** The saved picture is this many pixels wide (1080 × 1080, or 1080 × 1920 for a story). */
const OUT_W = 1080;
/** A moment for the offscreen card to be drawn before it is captured, and how long to wait at most. */
const SETTLE_MS = 140;
const GIVE_UP_MS = 12000;
const DESIGN_KEY = 'community.versecard.design';

type Passage = { text: string; reference: string; shortened: boolean };
type Tab = 'bg' | 'font' | 'layout';
type Action = 'story' | 'post' | 'save' | 'share';
type Job = { seq: number; design: CardDesign; photo: string; resolve: (uri: string) => void; reject: (e: Error) => void };

/** "16,17", "16-18" or "16–18, 20" to verse numbers, in order. */
function parseVerses(raw: string): number[] {
  const out = new Set<number>();
  for (const part of raw.split(',')) {
    const m = part.trim().match(/^(\d+)(?:\s*[-–]\s*(\d+))?$/);
    if (!m) continue;
    const a = parseInt(m[1], 10);
    const b = m[2] ? parseInt(m[2], 10) : a;
    for (let v = Math.min(a, b); v <= Math.max(a, b) && out.size < 200; v++) if (v > 0) out.add(v);
  }
  return [...out].sort((x, y) => x - y);
}

/** The words of the chosen verses, cut to what a card can hold, with the reference of what is shown. */
function passageOf(ch: Chapter, wanted: number[], short: string): Passage | null {
  const verses = ch.verses.filter((v) => wanted.includes(v.verse));
  if (!verses.length) return null;
  const used: typeof verses = [];
  let total = 0;
  for (const v of verses) {
    if (used.length >= MAX_VERSES) break;
    if (used.length && total + v.text.length + 1 > MAX_CHARS) break;
    used.push(v);
    total += v.text.length + 1;
  }
  // Verses that follow each other run on; a gap between chosen verses shows as an ellipsis.
  let text = used.map((v, i) => (i && v.verse !== used[i - 1].verse + 1 ? `… ${v.text}` : v.text)).join(' ');
  let cut = false;
  if (text.length > MAX_CHARS + 120) {
    text = `${text.slice(0, MAX_CHARS).replace(/\s+\S*$/, '')}…`;
    cut = true;
  }
  const reference = `${spokenRef(ch.book, ch.chapter, used.map((v) => v.verse))} · ${short}`;
  return { text, reference, shortened: cut || used.length < verses.length };
}

function isDesign(d: unknown): d is CardDesign {
  const x = d as CardDesign;
  return !!x && typeof x === 'object' && typeof x.bg === 'string' && typeof x.font === 'string' && ['left', 'center', 'right'].includes(x.align) && ['square', 'tall'].includes(x.shape);
}

/* ---------- small pieces of the tool strip ---------- */

function Swatch({ selected, label, onPress, children }: { selected: boolean; label: string; onPress: () => void; children: React.ReactNode }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected }} style={({ pressed }) => ({ width: 58, height: 58, borderRadius: 18, padding: 3, borderWidth: 2, borderColor: selected ? DARK.fg : 'transparent', opacity: pressed ? 0.75 : 1 })}>
      <View style={{ flex: 1, borderRadius: 13, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: DARK.surface2 }}>{children}</View>
    </Pressable>
  );
}

/** Three bars, lined up the way the words will be. */
function AlignGlyph({ align, color }: { align: CardAlign; color: string }) {
  const items = align === 'left' ? 'flex-start' : align === 'right' ? 'flex-end' : 'center';
  return (
    <View style={{ width: 22, gap: 3.5, alignItems: items }}>
      {[22, 14, 18].map((w, i) => (
        <View key={i} style={{ width: w, height: 2.4, borderRadius: 1.2, backgroundColor: color }} />
      ))}
    </View>
  );
}

function ToolChip({ selected, label, onPress, children, wide }: { selected: boolean; label: string; onPress: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected }} style={({ pressed }) => ({ minWidth: wide ? 76 : 54, height: 58, paddingHorizontal: 10, borderRadius: 16, alignItems: 'center', justifyContent: 'center', gap: 5, backgroundColor: selected ? DARK.fg : DARK.surface2, opacity: pressed ? 0.75 : 1 })}>
      {children}
    </Pressable>
  );
}

function ActionButton({ icon, label, onPress, busy, disabled }: { icon: IconName; label: string; onPress: () => void; busy: boolean; disabled: boolean }) {
  return (
    <Pressable onPress={disabled ? undefined : onPress} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled, busy }} style={({ pressed }) => ({ flex: 1, alignItems: 'center', gap: 7, opacity: disabled && !busy ? 0.45 : pressed ? 0.7 : 1 })}>
      <View style={{ width: 54, height: 54, borderRadius: 27, backgroundColor: DARK.surface2, alignItems: 'center', justifyContent: 'center' }}>{busy ? <ActivityIndicator color={DARK.fg} /> : <Icon name={icon} size={24} color={DARK.fg} />}</View>
      <Text numberOfLines={1} style={{ color: DARK.fg, fontSize: 12.5, fontWeight: '600' }}>
        {label}
      </Text>
    </Pressable>
  );
}

/* ---------- the screen ---------- */

export default function VerseCardScreen() {
  const params = useLocalSearchParams<{ book?: string; c?: string; v?: string; tr?: string }>();
  const router = useRouter();
  const toast = useToast();
  const t = useT();
  const insets = useSafeAreaInsets();

  const bookName = String(params.book ?? '');
  const chapterNo = parseInt(String(params.c ?? ''), 10);
  const versesParam = String(params.v ?? '');
  const trParam = String(params.tr ?? '');

  /** The passage straight away when the chapter was read in this session (it nearly always was). */
  const fromSession = (): Passage | null => {
    const s = peekBibleSettings();
    const tr = (TRANSLATIONS.find((x) => x.id === trParam)?.id ?? s?.translation) as TranslationId | undefined;
    if (!tr) return null;
    const ch = peekChapter(bookName, chapterNo, tr);
    return ch ? passageOf(ch, parseVerses(versesParam), TRANSLATIONS.find((x) => x.id === tr)?.short ?? tr.toUpperCase()) : null;
  };
  const [passage, setPassage] = useState<Passage | null>(fromSession);
  const [error, setError] = useState('');
  const [design, setDesignState] = useState<CardDesign>(DEFAULT_DESIGN);
  const [photo, setPhoto] = useState('');
  const [tab, setTab] = useState<Tab>('bg');
  const [area, setArea] = useState<{ w: number; h: number } | null>(null);
  const [busy, setBusy] = useState<Action | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const busyRef = useRef(false);
  const picking = useRef(false);
  const seq = useRef(0);
  const shotRef = useRef<View>(null);
  // Pictures already made, by everything that went into them, so Save then Share doesn't draw it twice.
  const shots = useRef(new Map<string, string>());
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const jobRef = useRef<Job | null>(null);
  const alive = useRef(true);
  const designTouched = useRef(false);
  /** When the story editor or the post screen was last opened from here: a tap while it slides in doesn't open a second. */
  const leftAt = useRef(0);
  // The card's fonts load in the background at start-up: the words are fitted (and saved) only once they are in.
  const [fontsLoaded, fontsError] = useFonts({ Lora_400Regular, Lora_700Bold, Nunito_700Bold, Poppins_400Regular, Poppins_600SemiBold });
  const fontsReady = fontsLoaded || !!fontsError;

  // The floating button stays out of the way while this screen is showing.
  const [focused, setFocused] = useState(true);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );
  useHideAssistiveButton(focused);

  useEffect(() => {
    alive.current = true;
    const list = timers.current;
    return () => {
      alive.current = false;
      list.forEach(clearTimeout);
      list.length = 0;
      const j = jobRef.current;
      jobRef.current = null;
      if (j) j.reject(new Error(t('verseCard.failed')));
    };
  }, []);

  // The look chosen last time (not the photo, which belongs to that card).
  useEffect(() => {
    AsyncStorage.getItem(DESIGN_KEY)
      .then((raw) => {
        const d: unknown = raw ? JSON.parse(raw) : null;
        if (!alive.current || designTouched.current || !isDesign(d)) return;
        setDesignState({ ...d, bg: d.bg === PHOTO_BG || !CARD_BACKGROUNDS.some((b) => b.id === d.bg) ? DEFAULT_DESIGN.bg : d.bg, font: fontOf(d.font).id });
      })
      .catch(() => {});
  }, []);

  const setDesign = (patch: Partial<CardDesign>) => {
    designTouched.current = true;
    setDesignState((cur) => {
      const next = { ...cur, ...patch };
      AsyncStorage.setItem(DESIGN_KEY, JSON.stringify({ ...next, bg: next.bg === PHOTO_BG ? DEFAULT_DESIGN.bg : next.bg })).catch(() => {});
      return next;
    });
  };

  const load = useCallback(async () => {
    setError('');
    try {
      const book = BOOKS.find((b) => b.name === bookName);
      if (!book || !(chapterNo >= 1 && chapterNo <= book.chapters)) throw new Error(t('verseCard.notFound'));
      const tr = TRANSLATIONS.find((x) => x.id === trParam)?.id ?? (await loadBibleSettings()).translation;
      const ch = peekChapter(book.name, chapterNo, tr) ?? (await fetchChapter(book.name, chapterNo, tr));
      const p = passageOf(ch, parseVerses(versesParam), TRANSLATIONS.find((x) => x.id === tr)?.short ?? tr.toUpperCase());
      if (!p) throw new Error(t('verseCard.notFound'));
      if (alive.current) setPassage(p);
    } catch (e) {
      if (alive.current) setError(errText(e));
    }
  }, [bookName, chapterNo, versesParam, trParam, t]);
  useEffect(() => {
    if (!passage) load();
    // Only on opening: the passage doesn't change while the screen is open.
  }, []);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/bible'));

  /* ----- making the picture ----- */

  const later = (ms: number, fn: () => void) => {
    timers.current.push(setTimeout(fn, ms));
  };

  /** Ends the current job, once. */
  const settle = (j: Job, out: string | Error) => {
    if (jobRef.current !== j) return;
    jobRef.current = null;
    setJob(null);
    if (out instanceof Error) j.reject(out);
    else j.resolve(out);
  };

  const onShotReady = (j: Job) => () => {
    later(SETTLE_MS, () => {
      if (jobRef.current !== j || !shotRef.current) return;
      // iOS: renderInContext draws a view parked off the screen, which the default snapshot can leave blank.
      captureRef(shotRef, { format: 'jpg', quality: 0.95, result: 'tmpfile', useRenderInContext: Platform.OS === 'ios' }).then(
        (uri) => settle(j, uri),
        () => settle(j, new Error(t('verseCard.failed'))),
      );
    });
  };

  /** The card as a 1080-wide JPEG on the phone, in the given shape. */
  function capture(shape: CardShape): Promise<string> {
    if (!passage) return Promise.reject(new Error(t('verseCard.failed')));
    const d: CardDesign = { ...design, shape };
    const p = d.bg === PHOTO_BG ? photo : '';
    const key = JSON.stringify([d, p, passage.text, passage.reference]);
    const kept = shots.current.get(key);
    if (kept) return Promise.resolve(kept);
    return new Promise<string>((resolve, reject) => {
      const j: Job = {
        seq: ++seq.current,
        design: d,
        photo: p,
        resolve: (uri) => {
          shots.current.set(key, uri);
          resolve(uri);
        },
        reject,
      };
      jobRef.current = j;
      setJob(j);
      later(GIVE_UP_MS, () => settle(j, new Error(t('verseCard.failed'))));
    });
  }

  async function act(kind: Action) {
    if (busyRef.current || !passage || !fontsReady || Date.now() - leftAt.current < 900) return;
    busyRef.current = true;
    setBusy(kind);
    tap('light');
    try {
      if (kind === 'save') {
        const perm = await MediaLibrary.requestPermissionsAsync(true);
        if (!perm.granted) {
          Alert.alert(t('verseCard.allowPhotos'), undefined, [
            { text: t('common.cancel'), style: 'cancel' },
            { text: t('createFlow.openSettings'), onPress: () => { Linking.openSettings().catch(() => {}); } },
          ]);
          return;
        }
      }
      // A story is always tall: a square card would be cropped. The preview turns tall too, so what is shared is what is seen.
      const shape: CardShape = kind === 'story' ? 'tall' : design.shape;
      if (shape !== design.shape) setDesign({ shape });
      const uri = await capture(shape);
      if (!alive.current) return;
      const w = OUT_W;
      const h = Math.round(OUT_W * cardRatio(shape));
      if (kind === 'story') {
        leftAt.current = Date.now();
        router.push({ pathname: '/story-editor', params: { kind: 'image', src: JSON.stringify([{ uri, type: 'image', w, h }]) } } as any);
      } else if (kind === 'post') {
        leftAt.current = Date.now();
        router.push({ pathname: '/create', params: { media: JSON.stringify([{ uri, width: w, height: h }]) } } as any);
      } else if (kind === 'save') {
        await MediaLibrary.saveToLibraryAsync(uri);
        tap('success');
        toast(t('verseCard.saved'));
      } else {
        await Share.share(Platform.OS === 'ios' ? { url: uri } : { message: `“${passage.text}” — ${passage.reference}` });
      }
    } catch (e) {
      if (alive.current) toast(errText(e));
    } finally {
      busyRef.current = false;
      if (alive.current) setBusy(null);
    }
  }

  async function choosePhoto() {
    if (picking.current) return;
    picking.current = true;
    try {
      const [a] = await pickFromLibrary();
      if (a && alive.current) {
        setPhoto(a.uri);
        setDesign({ bg: PHOTO_BG });
      }
    } catch (e) {
      if (alive.current) toast(errText(e));
    } finally {
      picking.current = false;
    }
  }

  /* ----- layout ----- */

  // The preview fills the room between the header and the tools, as large as its shape allows.
  const note = passage?.shortened ? 22 : 0;
  const ratio = cardRatio(design.shape);
  const cardW = area ? Math.floor(Math.max(120, Math.min(area.w - 40, (area.h - 12 - note) / ratio))) : 0;
  const shotW = OUT_W / PixelRatio.get();
  const font = fontOf(design.font);

  const tabs: { id: Tab; label: string }[] = [
    { id: 'bg', label: t('verseCard.background') },
    { id: 'font', label: t('verseCard.font') },
    { id: 'layout', label: t('verseCard.layout') },
  ];

  const strip = (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ paddingHorizontal: 16, gap: 10, alignItems: 'center', height: 74 }}>
      {tab === 'bg' ? (
        <>
          {CARD_BACKGROUNDS.map((b) => (
            <Swatch key={b.id} selected={design.bg === b.id} label={t(b.label)} onPress={() => { tap('select'); setDesign({ bg: b.id }); }}>
              <LinearGradient colors={b.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
              <Text style={{ color: b.ink, fontFamily: font.verse, fontSize: 17 }}>Aa</Text>
            </Swatch>
          ))}
          <Swatch
            selected={design.bg === PHOTO_BG}
            label={photo ? t('verseCard.photo') : t('verseCard.choosePhoto')}
            onPress={() => {
              tap('select');
              // A photo already chosen comes back with one tap; tapping it while it shows chooses another.
              if (photo && design.bg !== PHOTO_BG) setDesign({ bg: PHOTO_BG });
              else choosePhoto();
            }}>
            {photo ? (
              <>
                <View style={StyleSheet.absoluteFill}>
                  <ImageThumb uri={photo} />
                </View>
                <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.35)' }]} />
                <Icon name="image" size={20} color="#ffffff" />
              </>
            ) : (
              <>
                <Icon name="image" size={20} color={DARK.fg} />
                <Text style={{ color: DARK.fg2, fontSize: 10.5, fontWeight: '600', marginTop: 2 }}>{t('verseCard.photo')}</Text>
              </>
            )}
          </Swatch>
        </>
      ) : tab === 'font' ? (
        CARD_FONTS.map((f) => {
          const on = design.font === f.id;
          return (
            <ToolChip key={f.id} wide selected={on} label={f.name} onPress={() => { tap('select'); setDesign({ font: f.id }); }}>
              <Text style={{ color: on ? DARK.bg : DARK.fg, fontFamily: f.verse, fontSize: 20, lineHeight: 24 }}>Aa</Text>
              <Text numberOfLines={1} style={{ color: on ? DARK.bg : DARK.fg2, fontSize: 11, fontWeight: '600' }}>{f.name}</Text>
            </ToolChip>
          );
        })
      ) : (
        <>
          {(['left', 'center', 'right'] as CardAlign[]).map((a) => {
            const on = design.align === a;
            return (
              <ToolChip key={a} selected={on} label={t(a === 'left' ? 'verseCard.alignLeft' : a === 'right' ? 'verseCard.alignRight' : 'verseCard.alignCenter')} onPress={() => { tap('select'); setDesign({ align: a }); }}>
                <AlignGlyph align={a} color={on ? DARK.bg : DARK.fg} />
              </ToolChip>
            );
          })}
          <View style={{ width: StyleSheet.hairlineWidth, height: 32, backgroundColor: DARK.line, marginHorizontal: 4 }} />
          {(['square', 'tall'] as CardShape[]).map((s) => {
            const on = design.shape === s;
            const c = on ? DARK.bg : DARK.fg;
            return (
              <ToolChip key={s} wide selected={on} label={t(s === 'square' ? 'verseCard.square' : 'verseCard.tall')} onPress={() => { tap('select'); setDesign({ shape: s }); }}>
                <View style={{ width: s === 'square' ? 18 : 12, height: s === 'square' ? 18 : 21, borderRadius: 3, borderWidth: 1.8, borderColor: c }} />
                <Text numberOfLines={1} style={{ color: on ? DARK.bg : DARK.fg2, fontSize: 11, fontWeight: '600' }}>{t(s === 'square' ? 'verseCard.square' : 'verseCard.tall')}</Text>
              </ToolChip>
            );
          })}
        </>
      )}
    </ScrollView>
  );

  const locked = !!busy || !passage || !fontsReady;

  return (
    <View style={{ flex: 1, backgroundColor: '#000', paddingTop: insets.top }}>
      <DarkStatusBar />
      <View style={{ height: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12 }}>
        <RoundButton name="close" label={t('common.close')} onPress={close} size={40} iconSize={22} bg={DARK.round} color={DARK.fg} />
        <Text accessibilityRole="header" numberOfLines={1} style={{ flex: 1, textAlign: 'center', color: DARK.fg, fontSize: 17, fontWeight: '700' }}>
          {t('verseCard.title')}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      {/* the preview */}
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }} onLayout={(e) => setArea({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
        {!area ? null : passage && fontsReady ? (
          <>
            <VerseCardView width={cardW} design={design} text={passage.text} reference={passage.reference} photo={photo} radius={14} />
            {passage.shortened ? <Text style={{ color: DARK.fg3, fontSize: 12.5, marginTop: 8 }}>{t('verseCard.shortened')}</Text> : null}
          </>
        ) : error ? (
          // Dark colours whatever the theme: a ghost button would be a pale pill on black in White.
          <DarkEmpty title={error} action={<Button small kind="ghost" label={t('common.tryAgain')} onPress={load} style={{ marginTop: 8, backgroundColor: DARK.surface2 }} textColor={DARK.fg} />} />
        ) : (
          // Where the card will be: its shape, with pale lines for the words.
          <SkeletonFrame style={{ width: cardW, height: cardW * ratio, borderRadius: 14, backgroundColor: DARK.surface, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
            {[0.7, 0.78, 0.5].map((f, i) => (
              <Skeleton key={i} dark width={Math.round(cardW * f)} height={14} radius={7} />
            ))}
            <Skeleton dark width={Math.round(cardW * 0.3)} height={10} radius={5} style={{ marginTop: 10 }} />
          </SkeletonFrame>
        )}
      </View>

      {/* the tools */}
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 26, paddingTop: 12, paddingBottom: 4 }} accessibilityRole="tablist">
        {tabs.map((x) => (
          <Pressable key={x.id} onPress={() => { if (tab !== x.id) { tap('select'); setTab(x.id); } }} hitSlop={10} accessibilityRole="tab" accessibilityState={{ selected: tab === x.id }}>
            <Text style={{ color: tab === x.id ? DARK.fg : DARK.fg3, fontSize: 15, fontWeight: '700' }}>{x.label}</Text>
          </Pressable>
        ))}
      </View>
      {strip}

      {/* what to do with it */}
      <View style={{ flexDirection: 'row', paddingHorizontal: 8, paddingTop: 10, paddingBottom: Math.max(insets.bottom, 12) + 4 }}>
        <ActionButton icon="story" label={t('verseCard.toStory')} onPress={() => act('story')} busy={busy === 'story'} disabled={locked} />
        <ActionButton icon="pluscircle" label={t('verseCard.post')} onPress={() => act('post')} busy={busy === 'post'} disabled={locked} />
        <ActionButton icon="download" label={t('verseCard.save')} onPress={() => act('save')} busy={busy === 'save'} disabled={locked} />
        <ActionButton icon="share" label={t('common.share')} onPress={() => act('share')} busy={busy === 'share'} disabled={locked} />
      </View>

      {/* The full-size card, drawn off the screen only while a picture is being made. */}
      {job && passage ? (
        <View ref={shotRef} collapsable={false} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ position: 'absolute', left: -10000, top: 0, width: shotW, height: shotW * cardRatio(job.design.shape) }}>
          <VerseCardView key={job.seq} width={shotW} design={job.design} text={passage.text} reference={passage.reference} photo={job.photo} onReady={onShotReady(job)} />
        </View>
      ) : null}
    </View>
  );
}

/** The chosen photo, small, in its swatch. */
function ImageThumb({ uri }: { uri: string }) {
  return <ExpoImage source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" />;
}
