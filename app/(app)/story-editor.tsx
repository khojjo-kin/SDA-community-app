import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, PanResponder, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FilterStrip, useFilterExport } from '../../src/components/FilterStrip';
import { HighlightPicker } from '../../src/components/HighlightPicker';
import { Icon, IconName } from '../../src/components/Icon';
import { DarkEmpty, DarkStatusBar } from '../../src/components/OnDark';
import { DRAW_H, DRAW_W, fitFrame, overlayBox, OverlayLabel, STORY_BACKGROUNDS, STORY_COLORS, StoryCanvas } from '../../src/components/StoryCanvas';
import { Avatar, Button, Empty, Loading, Radio, RoundButton, SearchField, Sheet, useToast } from '../../src/components/ui';
import { addStory, addToHighlight, countCloseFriends, coverOf, createHighlight, peopleToMessage, searchProfiles, sendToPeople, updateProfile, uploadImage, uploadVideo } from '../../src/lib/api';
import { isNormal, NORMAL_FILTER } from '../../src/lib/filters';
import { usePrefs } from '../../src/lib/prefs';
import { useSession } from '../../src/lib/session';
import { C, DARK, errText } from '../../src/lib/theme';
import type { Audience, Overlay, Profile, StoryItem, StoryReplies, Stroke } from '../../src/lib/types';
import type { StorySource } from './add-story';

type Kind = 'image' | 'video' | 'text' | 'collage' | 'batch';
type Tool = null | 'text' | 'draw' | 'sticker' | 'mention' | 'caption' | 'filter';
type Frame = { w: number; h: number };

const KINDS: Kind[] = ['image', 'video', 'text', 'collage', 'batch'];
const EMOJI = ['😀', '😂', '🥹', '😍', '😎', '🥳', '😭', '😡', '🤯', '🫶', '❤️', '🔥', '✨', '💯', '👏', '🙌', '👍', '🙏', '💪', '🎉', '🎂', '🌹', '🌈', '☀️', '🌙', '⭐', '⚡', '☕', '🍕', '🍔', '🍩', '🍉', '⚽', '🏀', '🎧', '🎬', '📍', '✈️', '🏝️', '🏠', '🐶', '🐱', '🦋', '🌸', '💤', '👀', '💬', '✅'];
const REPLY_LABEL: Record<StoryReplies, string> = { everyone: 'Everyone', following: 'People you follow', off: 'Off' };
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

/** A height for something new that is not on top of text or a sticker already in the middle of the frame. */
function freeY(taken: Overlay[], want: number): number {
  const clear = (y: number) => taken.every((o) => Math.abs(o.x - 0.5) > 0.22 || Math.abs(o.y - y) > 0.085);
  for (let i = 0; i < 8; i++) {
    for (const y of [want + i * 0.1, want - i * 0.1]) if (y >= 0.16 && y <= 0.82 && clear(y)) return y;
  }
  return want;
}

function toPath(points: { x: number; y: number }[]): string {
  if (!points.length) return '';
  const r = (n: number) => Math.round(n * 10) / 10;
  if (points.length === 1) return `M${r(points[0].x)} ${r(points[0].y)}L${r(points[0].x + 0.5)} ${r(points[0].y)}`;
  return points.map((p, i) => `${i ? 'L' : 'M'}${r(p.x)} ${r(p.y)}`).join('');
}

/** A piece of text, an emoji or a mention that can be dragged around the frame. Tap to select it. */
function EditableOverlay({ o, frame, selected, onTap, onMove }: { o: Overlay; frame: Frame; selected: boolean; onTap: () => void; onMove: (x: number, y: number) => void }) {
  const latest = useRef({ o, frame, onTap, onMove });
  latest.current = { o, frame, onTap, onMove };
  const start = useRef({ x: 0, y: 0, moved: false });
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        start.current = { x: latest.current.o.x, y: latest.current.o.y, moved: false };
      },
      onPanResponderMove: (_e, g) => {
        if (Math.abs(g.dx) + Math.abs(g.dy) > 5) start.current.moved = true;
        if (!start.current.moved) return;
        const f = latest.current.frame;
        latest.current.onMove(clamp(start.current.x + g.dx / f.w, 0.04, 0.96), clamp(start.current.y + g.dy / f.h, 0.05, 0.95));
      },
      onPanResponderRelease: () => {
        if (!start.current.moved) latest.current.onTap();
      },
    }),
  ).current;
  return (
    <View pointerEvents="box-none" style={overlayBox(o, frame.w, frame.h)}>
      <View {...pan.panHandlers} accessible accessibilityRole="button" accessibilityLabel={`${o.kind === 'mention' ? 'Mention' : o.kind === 'emoji' ? 'Sticker' : 'Text'}: ${o.text}. Drag to move, tap for options.`} style={{ padding: 4, borderRadius: 10, borderWidth: 1.5, borderStyle: 'dashed', borderColor: selected ? 'rgba(255,255,255,0.9)' : 'transparent' }}>
        <OverlayLabel o={o} frameW={frame.w} />
      </View>
    </View>
  );
}

function ToolButton({ icon, text, label, onPress, active }: { icon?: IconName; text?: string; label: string; onPress: () => void; active?: boolean }) {
  return (
    <Pressable onPress={onPress} hitSlop={4} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: !!active }} style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, backgroundColor: active ? '#ffffff' : 'rgba(38,38,40,0.72)', alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}>
      {icon ? <Icon name={icon} size={24} color={active ? '#000' : '#fff'} /> : <Text style={{ color: active ? '#000' : '#fff', fontSize: 19, fontWeight: '600' }}>{text}</Text>}
    </Pressable>
  );
}

function Swatches({ value, onPick }: { value: string; onPick: (c: string) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="always" style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 12, paddingHorizontal: 16, paddingVertical: 10, alignItems: 'center' }}>
      {STORY_COLORS.map((c) => (
        <Pressable key={c} onPress={() => onPick(c)} hitSlop={4} accessibilityRole="button" accessibilityLabel={`Colour ${c}`} accessibilityState={{ selected: value === c }} style={{ width: value === c ? 32 : 26, height: value === c ? 32 : 26, borderRadius: 16, backgroundColor: c, borderWidth: 2, borderColor: '#fff' }} />
      ))}
    </ScrollView>
  );
}

function ShareRow({ left, title, sub, onSub, right, onPress }: { left: React.ReactNode; title: string; sub?: string; onSub?: () => void; right: React.ReactNode; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={sub ? `${title}, ${sub}` : title} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, minHeight: 60, backgroundColor: pressed ? C.press : 'transparent' })}>
      {left}
      <View style={{ flex: 1 }}>
        <Text style={{ color: C.fg, fontSize: 17.5, fontWeight: '700' }}>{title}</Text>
        {sub ? (
          <Pressable onPress={onSub ?? onPress} hitSlop={6} accessibilityRole="button" accessibilityLabel={sub} style={{ flexDirection: 'row', alignItems: 'center', gap: 2, alignSelf: 'flex-start' }}>
            <Text numberOfLines={1} style={{ color: C.fg2, fontSize: 16, flexShrink: 1 }}>{sub}</Text>
            <Icon name="right" size={14} color={C.fg2} weight={2.2} />
          </Pressable>
        ) : null}
      </View>
      {right}
    </Pressable>
  );
}

function CircleIcon({ name }: { name: IconName }) {
  return (
    <View style={{ width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: C.surface2, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={name} size={24} />
    </View>
  );
}

export default function StoryEditor() {
  const params = useLocalSearchParams<{ kind?: string; src?: string }>();
  const kind: Kind = KINDS.includes(params.kind as Kind) ? (params.kind as Kind) : 'image';
  const sources = useMemo<StorySource[]>(() => {
    try {
      const list = JSON.parse(String(params.src ?? '[]'));
      return Array.isArray(list) ? list.filter((s) => s && typeof s.uri === 'string') : [];
    } catch {
      return [];
    }
  }, [params.src]);

  const { me, profile } = useSession();
  const prefs = usePrefs();
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();

  const [overlays, setOverlays] = useState<Overlay[]>([]);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [caption, setCaption] = useState('');
  const [fit, setFit] = useState<'cover' | 'contain'>('cover');
  // Photo stories only: the look chosen from the filter strip. Baked into the upload, not stored.
  const [filter, setFilter] = useState<string>(NORMAL_FILTER);
  const { exportFiltered, exporter } = useFilterExport();
  const [bg, setBg] = useState(0);
  const [tool, setTool] = useState<Tool>(kind === 'text' ? 'text' : null);
  const [selected, setSelected] = useState<string | null>(null);
  const [stage, setStage] = useState<'edit' | 'share'>('edit');
  const [poster, setPoster] = useState(sources[0]?.poster ?? '');
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState('');

  // The text being typed with the Aa tool.
  const [draft, setDraft] = useState<{ id?: string; text: string; color: string; bg: boolean }>({ text: '', color: '#ffffff', bg: false });
  // Drawing.
  const [drawColor, setDrawColor] = useState('#ffffff');
  const [livePath, setLivePath] = useState('');
  const points = useRef<{ x: number; y: number }[]>([]);
  // Mentions.
  const [q, setQ] = useState('');
  const [people, setPeople] = useState<Profile[] | null>(null);
  // Share sheet.
  const [audience, setAudience] = useState<Audience>('everyone');
  const [friends, setFriends] = useState<number | null>(null);
  const [highlight, setHighlight] = useState<{ id?: string; title: string } | null>(null);
  const [recipients, setRecipients] = useState<Profile[]>([]);
  const [picker, setPicker] = useState<'highlight' | 'people' | null>(null);
  const [contacts, setContacts] = useState<Profile[] | null>(null);

  const frame = fitFrame(width, height - insets.top - Math.max(insets.bottom, 12) - 72);
  const frameRef = useRef(frame);
  frameRef.current = frame;
  const colorRef = useRef(drawColor);
  colorRef.current = drawColor;
  const strokesRef = useRef(strokes);
  strokesRef.current = strokes;
  const batch = kind === 'batch';
  const edited = overlays.length > 0 || strokes.length > 0 || caption.trim().length > 0 || !isNormal(filter);

  useFocusEffect(
    useCallback(() => {
      countCloseFriends(me).then(setFriends).catch(() => setFriends(null));
    }, [me]),
  );

  useEffect(() => {
    if (kind !== 'video' || poster || !sources[0]) return;
    let live = true;
    VideoThumbnails.getThumbnailAsync(sources[0].uri, { time: 300, quality: 0.6 })
      .then((t) => { if (live) setPoster(t.uri); })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [kind, poster, sources]);

  useEffect(() => {
    if (tool !== 'mention') return;
    let live = true;
    const t = setTimeout(() => {
      searchProfiles(q)
        .then((r) => { if (live) setPeople(r.filter((p) => p.id !== me && !p.is_blocked)); })
        .catch(() => { if (live) setPeople([]); });
    }, 220);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [tool, q, me]);

  const drawPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        const f = frameRef.current;
        points.current = [{ x: (e.nativeEvent.locationX / f.w) * DRAW_W, y: (e.nativeEvent.locationY / f.h) * DRAW_H }];
        setLivePath(toPath(points.current));
      },
      onPanResponderMove: (e) => {
        const f = frameRef.current;
        const p = { x: clamp((e.nativeEvent.locationX / f.w) * DRAW_W, 0, DRAW_W), y: clamp((e.nativeEvent.locationY / f.h) * DRAW_H, 0, DRAW_H) };
        const last = points.current[points.current.length - 1];
        // Skip points that are almost on top of the previous one, to keep the drawing small.
        if (last && Math.abs(last.x - p.x) + Math.abs(last.y - p.y) < 7) return;
        if (points.current.length >= 600) {
          // A very long line is saved in pieces, so it keeps following the finger.
          finishStroke();
          points.current = last ? [last] : [];
        }
        points.current.push(p);
        setLivePath(toPath(points.current));
      },
      onPanResponderRelease: () => finishStroke(),
      onPanResponderTerminate: () => finishStroke(),
    }),
  ).current;

  function finishStroke() {
    const d = toPath(points.current);
    points.current = [];
    setLivePath('');
    if (!d) return;
    const used = strokesRef.current.reduce((n, s) => n + s.d.length, 0);
    if (strokesRef.current.length >= 80 || used + d.length > 90000) {
      toast('That is as much drawing as one story can hold. Undo a line to draw more.');
      return;
    }
    setStrokes((cur) => [...cur, { color: colorRef.current, width: 14, d }]);
  }

  function close() {
    if (stage === 'share') return setStage('edit');
    const leave = () => (router.canGoBack() ? router.back() : router.replace('/'));
    if (!edited) return leave();
    Alert.alert('Discard this story?', 'Your text and drawing will be lost.', [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: leave },
    ]);
  }

  /* ----- text ----- */

  function startText(existing?: Overlay) {
    setSelected(null);
    setDraft(existing ? { id: existing.id, text: existing.text, color: existing.color, bg: !!existing.bg } : { text: '', color: draft.color, bg: draft.bg });
    setTool('text');
  }

  function commitText() {
    const text = draft.text.trim();
    setTool(null);
    if (!text) {
      if (draft.id) setOverlays((cur) => cur.filter((o) => o.id !== draft.id));
      return;
    }
    if (draft.id) setOverlays((cur) => cur.map((o) => (o.id === draft.id ? { ...o, text, color: draft.color, bg: draft.bg } : o)));
    else setOverlays((cur) => [...cur, { id: newId(), kind: 'text', text, x: 0.5, y: freeY(cur, 0.42), size: text.length > 60 ? 22 : text.length > 24 ? 28 : 34, color: draft.color, bg: draft.bg }]);
  }

  const patch = (id: string, change: Partial<Overlay>) => setOverlays((cur) => cur.map((o) => (o.id === id ? { ...o, ...change } : o)));
  const chosen = overlays.find((o) => o.id === selected) ?? null;

  /* ----- sharing ----- */

  async function buildItems(): Promise<StoryItem[]> {
    const extras: Partial<StoryItem> = {};
    if (caption.trim()) extras.caption = caption.trim().slice(0, 200);
    if (overlays.length) extras.overlays = overlays;
    if (strokes.length) extras.strokes = strokes;
    if (kind === 'text') return [{ url: '', type: 'text', bg, ...extras }];
    if (kind === 'batch') {
      const out: StoryItem[] = [];
      for (let i = 0; i < sources.length; i++) {
        setBusy(`Uploading ${i + 1} of ${sources.length}…`);
        const m = await uploadImage(me, sources[i].uri, sources[i].w);
        out.push({ url: m.url, type: 'image', w: m.w, h: m.h });
      }
      return out;
    }
    if (kind === 'collage') {
      const urls: string[] = [];
      for (let i = 0; i < sources.length; i++) {
        setBusy(`Uploading ${i + 1} of ${sources.length}…`);
        urls.push((await uploadImage(me, sources[i].uri, sources[i].w, 1080)).url);
      }
      return [{ url: '', type: 'collage', urls, ...extras }];
    }
    const s = sources[0];
    if (kind === 'video') {
      setBusy('Uploading video…');
      const m = await uploadVideo(me, s.uri, s.w, s.h);
      return [{ url: m.url, type: 'video', w: m.w, h: m.h, poster: m.poster, duration: s.duration, ...extras }];
    }
    // A chosen filter is drawn into the photo first, so viewers get a plain picture with the look baked in.
    let uri = s.uri;
    if (!isNormal(filter)) {
      setBusy('Applying the filter…');
      uri = await exportFiltered(s.uri, filter, s.w, s.h);
    }
    setBusy('Uploading…');
    const m = await uploadImage(me, uri, s.w);
    return [{ url: m.url, type: 'image', w: m.w, h: m.h, ...(fit === 'contain' ? { fit } : {}), ...extras }];
  }

  async function share(to: Audience, withExtras: boolean) {
    if (busy) return;
    if (kind === 'text' && !overlays.length && !strokes.length) {
      toast('Write or draw something first.');
      return;
    }
    if (to === 'close_friends' && friends === 0) {
      Alert.alert('Your close friends list is empty', 'Add people to it first. Only they will see stories you share with close friends.', [
        { text: 'Not now', style: 'cancel' },
        { text: 'Add people', onPress: () => router.push('/close-friends') },
      ]);
      return;
    }
    setBusy('Uploading…');
    const done = () => (router.canDismiss() ? router.dismissAll() : router.replace('/'));
    let posted = 0;
    try {
      const items = await buildItems();
      setBusy('Sharing…');
      for (const item of items) {
        await addStory(me, item, to);
        posted++;
      }
      // The story is live from here on. If the highlight or the message fails, say so, but never
      // report the whole thing as failed: sharing again would post it twice.
      let extrasFailed = false;
      if (withExtras) {
        try {
          if (highlight && to !== 'close_friends') {
            if (highlight.id) for (const item of items) await addToHighlight(me, highlight.id, item);
            else await createHighlight(me, highlight.title, items);
          }
          if (recipients.length) {
            const words = kind === 'text' ? overlays.filter((o) => o.kind === 'text').map((o) => o.text).join('\n') : caption;
            await sendToPeople(me, recipients.map((p) => p.id), { media: items.map(coverOf).filter(Boolean), text: words });
          }
        } catch {
          extrasFailed = true;
        }
      }
      toast(extrasFailed ? 'Added to your story. The highlight or message did not go through.' : to === 'close_friends' ? 'Shared with your close friends' : items.length > 1 ? `${items.length} stories added` : 'Added to your story');
      done();
    } catch (e) {
      if (posted > 0) {
        toast(`${posted} of ${sources.length} were added to your story. The rest did not upload.`);
        done();
        return;
      }
      setBusy('');
      Alert.alert('That did not share', errText(e));
    }
  }

  function chooseReplies() {
    const set = (v: StoryReplies) => () => {
      updateProfile(me, { story_replies: v }).catch((e) => toast(errText(e)));
    };
    Alert.alert('Who can reply to your stories', undefined, [
      { text: 'Everyone', onPress: set('everyone') },
      { text: 'People you follow', onPress: set('following') },
      { text: 'Off', onPress: set('off') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  function openPeople() {
    setPicker('people');
    if (!contacts) peopleToMessage(me).then(setContacts).catch(() => setContacts([]));
  }

  /* ----- what the frame shows ----- */

  if (kind !== 'text' && !sources.length) {
    return (
      <View style={{ flex: 1, backgroundColor: '#000', justifyContent: 'center' }}>
        <DarkStatusBar />
        <DarkEmpty title="Nothing to share" body="Go back and choose a photo or video." action={<Button small label="Go back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} style={{ marginTop: 8 }} />} />
      </View>
    );
  }

  const current = sources[Math.min(page, Math.max(0, sources.length - 1))];
  const shown: Stroke[] = livePath ? [...strokes, { color: drawColor, width: 14, d: livePath }] : strokes;
  const base: StoryItem =
    kind === 'text'
      ? { url: '', type: 'text', bg }
      : kind === 'collage'
        ? { url: '', type: 'collage', urls: sources.map((s) => s.uri) }
        : kind === 'video'
          ? { url: '', type: 'video', poster }
          : { url: current.uri, type: 'image', fit };
  const item: StoryItem = { ...base, strokes: shown };
  const left = Math.round((width - frame.w) / 2);
  const side = prefs.toolsSide === 'left' ? { left: 12 } : { right: 12 };
  const closeSide = prefs.toolsSide === 'left' ? { right: 12 } : { left: 12 };
  const replies = profile?.story_replies ?? 'everyone';

  if (stage === 'share') {
    const thumb = fitFrame(width, Math.max(150, height * 0.25));
    return (
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <View style={{ paddingTop: insets.top + 8, paddingBottom: 14, alignItems: 'center' }}>
          <StoryCanvas item={{ ...item, overlays, caption: caption.trim() || undefined }} width={thumb.w} height={thumb.h} radius={12} filter={filter} />
          <View style={{ position: 'absolute', left: 16, top: insets.top + 6 }}>
            <RoundButton name="back" label="Back to editing" onPress={() => setStage('edit')} />
          </View>
        </View>
        {exporter}
        <View style={{ flex: 1, backgroundColor: C.sheet, borderTopLeftRadius: 30, borderTopRightRadius: 30 }}>
          <View style={{ alignItems: 'center', paddingTop: 12 }}>
            <View style={{ width: 34, height: 3, borderRadius: 2, backgroundColor: C.fg2 }} />
          </View>
          <Text accessibilityRole="header" style={{ color: C.fg, fontSize: 20, fontWeight: '700', textAlign: 'center', paddingTop: 20, paddingBottom: 18 }}>Share</Text>
          <ScrollView contentContainerStyle={{ paddingBottom: 12 }}>
            <ShareRow left={<Avatar uri={profile?.avatar_url} name={profile?.full_name} size={44} />} title="Your story" sub={`Replies: ${REPLY_LABEL[replies]}`} onSub={chooseReplies} onPress={() => setAudience('everyone')} right={<Radio on={audience === 'everyone'} />} />
            <ShareRow
              left={
                <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: C.close, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="star" size={22} color="#fff" fill />
                </View>
              }
              title="Close Friends"
              sub={friends ? (friends === 1 ? '1 person' : `${friends} people`) : 'Add people'}
              onSub={() => router.push('/close-friends')}
              onPress={() => (friends === 0 ? router.push('/close-friends') : setAudience('close_friends'))}
              right={<Radio on={audience === 'close_friends'} />}
            />
            <ShareRow left={<CircleIcon name="send" />} title="Message" sub={recipients.length ? recipients.map((p) => p.username).join(', ') : undefined} onPress={openPeople} right={<Icon name="right" size={18} color={C.fg2} weight={2} />} />
            <ShareRow
              left={<CircleIcon name="highlight" />}
              title="Add to highlight"
              sub={audience === 'close_friends' ? 'Not for close friends stories' : highlight ? highlight.title : undefined}
              onSub={audience === 'close_friends' ? () => toast('Highlights are for everyone, so close friends stories stay out of them.') : undefined}
              onPress={() => (audience === 'close_friends' ? toast('Highlights are for everyone, so close friends stories stay out of them.') : setPicker('highlight'))}
              right={<Icon name="right" size={18} color={C.fg2} weight={2} />}
            />
          </ScrollView>
          <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.line, paddingHorizontal: 16, paddingTop: 14, paddingBottom: Math.max(insets.bottom, 12) + 6 }}>
            <Button label={busy || 'Share'} busy={!!busy} onPress={() => share(audience, true)} />
            {busy ? <Text style={{ color: C.fg2, textAlign: 'center', marginTop: 8, fontSize: 13 }}>{busy}</Text> : null}
          </View>
        </View>

        <HighlightPicker visible={picker === 'highlight'} onClose={() => setPicker(null)} onPick={(c) => { setHighlight(c); setPicker(null); }} />
        <Sheet visible={picker === 'people'} onClose={() => setPicker(null)} title="Send as a message" tall footer={<View style={{ paddingHorizontal: 16, paddingTop: 10 }}><Button label={recipients.length ? `Done (${recipients.length})` : 'Done'} onPress={() => setPicker(null)} /></View>}>
          {contacts === null ? (
            <Loading />
          ) : contacts.length === 0 ? (
            <Empty title="No one to send to yet" body="Follow people or start a chat, and they will appear here." />
          ) : (
            <ScrollView style={{ flex: 1 }}>
              {contacts.map((p) => {
                const on = recipients.some((r) => r.id === p.id);
                return (
                  <Pressable key={p.id} onPress={() => setRecipients((cur) => (on ? cur.filter((r) => r.id !== p.id) : cur.length >= 10 ? cur : [...cur, p]))} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={`${p.full_name}, ${p.username}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 8 }}>
                    <Avatar uri={p.avatar_url} name={p.full_name} size={46} />
                    <View style={{ flex: 1 }}>
                      <Text numberOfLines={1} style={{ color: C.fg, fontWeight: '600' }}>{p.username}</Text>
                      <Text numberOfLines={1} style={{ color: C.fg2, fontSize: 13.5 }}>{p.full_name}</Text>
                    </View>
                    <View style={{ width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: on ? C.accent : '#7d848e', backgroundColor: on ? C.accent : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                      {on ? <Icon name="check" size={14} color={C.onAccent} weight={3} /> : null}
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
        </Sheet>
      </View>
    );
  }

  const drawing = tool === 'draw';

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <DarkStatusBar />
      <View style={{ position: 'absolute', top: insets.top, left, width: frame.w, height: frame.h }}>
        <StoryCanvas item={tool === 'draw' ? { ...item, overlays } : item} width={frame.w} height={frame.h} radius={18} hideOverlays={tool !== 'draw'} hideCaption filter={filter} />

        {kind === 'text' && !overlays.length && !strokes.length && tool === null ? (
          <Pressable onPress={() => startText()} style={{ position: 'absolute', left: 0, right: 0, top: frame.h * 0.4, alignItems: 'center' }} accessibilityRole="button">
            <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 26, fontWeight: '800' }}>Tap to type</Text>
          </Pressable>
        ) : null}

        {drawing ? (
          <View {...drawPan.panHandlers} pointerEvents="box-only" accessibilityLabel="Drawing area. Drag a finger to draw." style={{ position: 'absolute', left: 0, top: 0, width: frame.w, height: frame.h }} />
        ) : batch ? null : (
          overlays.map((o) => <EditableOverlay key={o.id} o={o} frame={frame} selected={selected === o.id} onTap={() => setSelected(selected === o.id ? null : o.id)} onMove={(x, y) => patch(o.id, { x, y })} />)
        )}

        {/* close, and the tool column */}
        {drawing ? (
          <View style={{ position: 'absolute', top: 12, left: 12, right: 12, flexDirection: 'row', justifyContent: 'space-between' }}>
            <ToolButton icon="undo" label="Undo the last line" onPress={() => setStrokes((cur) => cur.slice(0, -1))} />
            <Pressable onPress={() => setTool(null)} accessibilityRole="button" style={{ height: 44, paddingHorizontal: 18, borderRadius: 22, backgroundColor: '#fff', justifyContent: 'center' }}>
              <Text style={{ color: '#000', fontWeight: '700', fontSize: 16 }}>Done</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <View style={[{ position: 'absolute', top: 12 }, closeSide]}>
              <ToolButton icon="close" label="Close" onPress={close} />
            </View>
            {batch ? null : (
              <View style={[{ position: 'absolute', top: 12, gap: 12 }, side]}>
                <ToolButton text="Aa" label="Add text" onPress={() => startText()} />
                <ToolButton icon="sticker" label="Add a sticker" onPress={() => { setSelected(null); setTool('sticker'); }} />
                <ToolButton icon="at" label="Mention someone" onPress={() => { setSelected(null); setQ(''); setPeople(null); setTool('mention'); }} />
                <ToolButton icon="draw" label="Draw" onPress={() => { setSelected(null); setTool('draw'); }} />
                {kind === 'image' ? <ToolButton icon="sparkle" label={tool === 'filter' ? 'Hide filters' : 'Filters'} active={tool === 'filter'} onPress={() => { setSelected(null); setTool(tool === 'filter' ? null : 'filter'); }} /> : null}
                {kind === 'image' ? <ToolButton icon="expand" label={fit === 'cover' ? 'Show the whole photo' : 'Fill the frame'} active={fit === 'contain'} onPress={() => setFit(fit === 'cover' ? 'contain' : 'cover')} /> : null}
                {kind === 'text' ? <Pressable onPress={() => setBg((bg + 1) % STORY_BACKGROUNDS.length)} accessibilityRole="button" accessibilityLabel="Change background" style={{ width: 44, height: 44, borderRadius: 22, borderWidth: 3, borderColor: '#fff', backgroundColor: STORY_BACKGROUNDS[(bg + 1) % STORY_BACKGROUNDS.length][0] }} /> : null}
              </View>
            )}
          </>
        )}

        {drawing ? (
          <View style={{ position: 'absolute', left: 0, right: 0, bottom: 8 }}>
            <Swatches value={drawColor} onPick={setDrawColor} />
          </View>
        ) : chosen ? (
          <View style={{ position: 'absolute', left: 0, right: 0, bottom: 14, alignItems: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, padding: 5, borderRadius: 27, backgroundColor: 'rgba(20,20,22,0.86)' }}>
              <ToolButton text="A−" label="Smaller" onPress={() => patch(chosen.id, { size: clamp(Math.round(chosen.size / 1.18), 12, 140) })} />
              <ToolButton text="A+" label="Bigger" onPress={() => patch(chosen.id, { size: clamp(Math.round(chosen.size * 1.18), 12, 140) })} />
              {chosen.kind === 'text' ? <ToolButton icon="compose" label="Edit text" onPress={() => startText(chosen)} /> : null}
              <ToolButton icon="trash" label="Remove" onPress={() => { setOverlays((cur) => cur.filter((o) => o.id !== chosen.id)); setSelected(null); }} />
              <ToolButton icon="check" label="Done" onPress={() => setSelected(null)} />
            </View>
          </View>
        ) : tool === 'filter' && kind === 'image' ? (
          <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, borderBottomLeftRadius: 18, borderBottomRightRadius: 18, overflow: 'hidden' }}>
            <FilterStrip uri={current.uri} value={filter} onChange={setFilter} style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} />
          </View>
        ) : batch ? (
          <View style={{ position: 'absolute', left: 0, right: 0, bottom: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
            <ToolButton icon="back" label="Previous photo" onPress={() => setPage(Math.max(0, page - 1))} />
            <Text style={{ color: '#fff', fontWeight: '700', textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 4, textShadowOffset: { width: 0, height: 1 } }}>{page + 1} of {sources.length}</Text>
            <ToolButton icon="right" label="Next photo" onPress={() => setPage(Math.min(sources.length - 1, page + 1))} />
          </View>
        ) : (
          <Pressable onPress={() => { setSelected(null); setTool('caption'); }} accessibilityRole="button" accessibilityLabel={caption ? `Caption: ${caption}. Edit` : 'Add a caption'} style={{ position: 'absolute', left: 16, right: 16, bottom: 16 }}>
            <Text numberOfLines={3} style={{ color: '#fff', fontSize: 17, fontWeight: '600', lineHeight: 22, opacity: caption ? 1 : 0.92, textShadowColor: 'rgba(0,0,0,0.55)', textShadowRadius: 5, textShadowOffset: { width: 0, height: 1 } }}>{caption || 'Add a caption…'}</Text>
          </Pressable>
        )}
      </View>

      {/* Your story, Close Friends, and the arrow to more sharing choices */}
      {drawing ? null : (
        <View style={{ position: 'absolute', left: 12, right: 12, bottom: Math.max(insets.bottom, 12), height: 56, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Pressable onPress={() => share('everyone', false)} disabled={!!busy} accessibilityRole="button" accessibilityLabel="Share to your story" style={({ pressed }) => ({ flex: 1, height: 46, borderRadius: 23, backgroundColor: '#2e2f2f', flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 9, paddingRight: 12, opacity: pressed ? 0.7 : 1 })}>
            <Avatar uri={profile?.avatar_url} name={profile?.full_name} size={28} />
            <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={{ flex: 1, color: '#fff', fontWeight: '600', fontSize: 15, textAlign: 'center' }}>Your story</Text>
          </Pressable>
          <Pressable onPress={() => share('close_friends', false)} disabled={!!busy} accessibilityRole="button" accessibilityLabel="Share with close friends" style={({ pressed }) => ({ flex: 1, height: 46, borderRadius: 23, backgroundColor: '#2e2f2f', flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 9, paddingRight: 12, opacity: pressed ? 0.7 : 1 })}>
            <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: DARK.close, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="star" size={15} color="#fff" fill />
            </View>
            <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={{ flex: 1, color: '#fff', fontWeight: '600', fontSize: 15, textAlign: 'center' }}>Close Friends</Text>
          </Pressable>
          <Pressable onPress={() => { setSelected(null); setStage('share'); }} disabled={!!busy} accessibilityRole="button" accessibilityLabel="More ways to share" style={({ pressed }) => ({ width: 52, height: 52, borderRadius: 26, backgroundColor: DARK.accent, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.75 : 1 })}>
            <Icon name="arrow" size={26} color="#fff" weight={2.4} />
          </Pressable>
        </View>
      )}

      {/* typing text */}
      {tool === 'text' ? (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.62)', paddingTop: insets.top + 8 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14 }}>
            <Pressable onPress={() => setDraft({ ...draft, bg: !draft.bg })} accessibilityRole="button" accessibilityLabel={draft.bg ? 'Remove the label behind the text' : 'Put a label behind the text'} accessibilityState={{ selected: draft.bg }} style={{ width: 44, height: 44, borderRadius: 12, borderWidth: 2, borderColor: '#fff', backgroundColor: draft.bg ? '#fff' : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: draft.bg ? '#000' : '#fff', fontWeight: '800', fontSize: 20 }}>A</Text>
            </Pressable>
            <Pressable onPress={commitText} hitSlop={8} accessibilityRole="button" style={{ height: 44, paddingHorizontal: 18, borderRadius: 22, backgroundColor: '#fff', justifyContent: 'center' }}>
              <Text style={{ color: '#000', fontWeight: '700', fontSize: 16 }}>Done</Text>
            </Pressable>
          </View>
          <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 24 }}>
            <TextInput value={draft.text} onChangeText={(text) => setDraft({ ...draft, text })} autoFocus multiline maxLength={160} placeholder="Type something" placeholderTextColor="rgba(255,255,255,0.5)" keyboardAppearance="dark" selectionColor="#fff" style={{ color: draft.color, fontSize: 30, fontWeight: '800', textAlign: 'center', maxHeight: 220 }} accessibilityLabel="Story text" />
          </View>
          <Swatches value={draft.color} onPick={(color) => setDraft({ ...draft, color })} />
        </KeyboardAvoidingView>
      ) : null}

      {/* typing the caption */}
      {tool === 'caption' ? (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.62)', justifyContent: 'flex-end' }]}>
          <Pressable style={{ flex: 1 }} onPress={() => setTool(null)} accessibilityLabel="Finish caption" />
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10, padding: 12 }}>
            <TextInput value={caption} onChangeText={setCaption} autoFocus multiline maxLength={200} placeholder="Add a caption…" placeholderTextColor={DARK.fg3} keyboardAppearance="dark" style={{ flex: 1, minHeight: 46, maxHeight: 120, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, borderRadius: 23, backgroundColor: DARK.inputBar, color: '#fff', fontSize: 16 }} accessibilityLabel="Caption" />
            <Pressable onPress={() => setTool(null)} accessibilityRole="button" style={{ height: 46, paddingHorizontal: 18, borderRadius: 23, backgroundColor: '#fff', justifyContent: 'center' }}>
              <Text style={{ color: '#000', fontWeight: '700', fontSize: 16 }}>Done</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      ) : null}

      {busy ? (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', gap: 12 }]} accessibilityLiveRegion="polite">
          <ActivityIndicator color="#fff" />
          <Text style={{ color: '#fff', fontWeight: '600' }}>{busy}</Text>
        </View>
      ) : null}

      <Sheet visible={tool === 'sticker'} onClose={() => setTool(null)} title="Stickers">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 10 }}>
          {EMOJI.map((e) => (
            <Pressable key={e} onPress={() => { setOverlays((cur) => [...cur, { id: newId(), kind: 'emoji', text: e, x: 0.5, y: freeY(cur, 0.3), size: 72, color: '#ffffff' }]); setTool(null); }} accessibilityRole="button" accessibilityLabel={`Sticker ${e}`} style={{ width: '12.5%', height: 46, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 30 }}>{e}</Text>
            </Pressable>
          ))}
        </View>
      </Sheet>

      <Sheet visible={tool === 'mention'} onClose={() => setTool(null)} title="Mention someone" tall>
        <SearchField value={q} onChangeText={setQ} placeholder="Search people" />
        {people === null ? (
          <Loading />
        ) : people.length === 0 ? (
          <Empty title="No one found" body="Try another name." />
        ) : (
          <ScrollView style={{ flex: 1, marginTop: 8 }} keyboardShouldPersistTaps="handled">
            {people.map((p) => (
              <Pressable key={p.id} onPress={() => { setOverlays((cur) => [...cur, { id: newId(), kind: 'mention', text: p.username, userId: p.id, x: 0.5, y: freeY(cur, 0.62), size: 22, color: '#ffffff' }]); setTool(null); }} accessibilityRole="button" accessibilityLabel={`Mention ${p.username}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 8 }}>
                <Avatar uri={p.avatar_url} name={p.full_name} size={44} />
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={{ color: C.fg, fontWeight: '600' }}>{p.username}</Text>
                  <Text numberOfLines={1} style={{ color: C.fg2, fontSize: 13.5 }}>{p.full_name}</Text>
                </View>
              </Pressable>
            ))}
          </ScrollView>
        )}
      </Sheet>

      {/* Draws the filtered photo offscreen at share time. Takes no space. */}
      {exporter}
    </View>
  );
}
