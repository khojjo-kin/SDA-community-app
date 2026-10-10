import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus, useAudioRecorder } from 'expo-audio';
import * as Clipboard from 'expo-clipboard';
import { File, Paths } from 'expo-file-system';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import * as MediaLibrary from 'expo-media-library';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import * as ScreenCapture from 'expo-screen-capture';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ErhaAvatar } from '../../../src/components/ErhaAvatar';
import { thumbOf } from '../../../src/components/Grid';
import { Icon, IconName, VerifiedTick } from '../../../src/components/Icon';
import { OnceToggle, SnapBubble, SnapViewer } from '../../../src/components/SnapBubble';
import { AssistantThinking } from '../../../src/components/ThinkingOrb';
import { TypingDots } from '../../../src/components/TypingDots';
import { Avatar, Empty, ErrorNote, IconButton, Loading, RoundButton, Screen, Sheet, SheetRow, useToast } from '../../../src/components/ui';
import { activeLabel, askErhaInThread, askFaq, ERHA_ID, fetchFaqs, fetchMessages, fetchSavedReplies, fetchTheirLastRead, fetchThread, getProfile, hideThread, isOnline, markThreadRead, openViewOnce, report, sendMessage, sendScreenshotNotice, setBlock, setThreadMuted, uploadAudio, uploadImage } from '../../../src/lib/api';
import { useCalls } from '../../../src/lib/calls';
import { tap } from '../../../src/lib/haptics';
import { pickFromLibrary, takePhoto, type Picked } from '../../../src/lib/pick';
import { useAppFont } from '../../../src/lib/fonts';
import { usePrefs } from '../../../src/lib/prefs';
import { useSession } from '../../../src/lib/session';
import { getPostNow } from '../../../src/lib/store';
import { supabase } from '../../../src/lib/supabase';
import { BUBBLE, C, chatStamp, clock, DARK, errText } from '../../../src/lib/theme';
import type { Faq, Message, SavedReply, Thread } from '../../../src/lib/types';
import { wallpaperById } from '../../../src/lib/wallpapers';

/** `seen` marks the last thing you sent once the other person has read it. */
type Row =
  | { key: string; kind: 'stamp'; label: string }
  | { key: string; kind: 'text'; mine: boolean; m: Message; big: boolean; seen?: boolean }
  | { key: string; kind: 'post'; mine: boolean; m: Message; seen?: boolean }
  | { key: string; kind: 'photos'; mine: boolean; urls: string[]; at: number; seen?: boolean }
  | { key: string; kind: 'voice'; mine: boolean; m: Message; seen?: boolean }
  | { key: string; kind: 'call'; mine: boolean; m: Message; seen?: boolean }
  // A view-once photo: never drawn as a photo, only as a small bubble (src/components/SnapBubble.tsx).
  | { key: string; kind: 'snap'; mine: boolean; m: Message; seen?: boolean }
  // A line from the app in the middle of the chat, such as "took a screenshot". Never marked "Seen".
  | { key: string; kind: 'notice'; mine: boolean; m: Message; seen?: boolean };

type Channel = ReturnType<typeof supabase.channel>;

const QUICK = ['❤️', '😂', '😮', '😢', '😡', '👍', '🔥', '🙏', '🎉', '👏'];
/** Ways to start a chat with Erha, offered while it is still empty. */
const ERHA_OPENERS = ["What is this week's Sabbath School lesson about?", 'Suggest a hymn for a baptism', 'Pray with me for a friend who is unwell'];
const VOICE_LIMIT_MS = 120000;
/** How often "typing" is sent while you keep typing, and how long their bubble stays after the last one. */
const TYPING_EVERY_MS = 2000;
const TYPING_LINGER_MS = 4000;

/** A chat streak shows from three days in a row, as a small orange flame next to the name. */
const STREAK_FROM = 3;
const FLAME = '#ff8a3d';

/**
 * At most one screenshot notice per chat every 30 seconds: a burst of screenshots says the same thing once.
 * Kept outside the screen so a second copy of the same chat (opened from a profile) shares the limit.
 */
const SHOT_GAP_MS = 30000;
const lastShotAt = new Map<string, number>();

/** How often the header's "Active now" is refreshed while the chat is open. */
const ACTIVE_EVERY_MS = 60000;

/** Said when the database turns a message away under the under-14 rules. */
const MINOR_RULE = 'Members under 14 can only message people they follow, and be messaged by people they follow.';

/**
 * What to say when a message didn't send. The database refuses one (row-level security, code 42501)
 * when the other person is under 14 and doesn't follow the sender, or the sender is under 14 and
 * doesn't follow them. It also refuses a suspended account and messages across a block, so the
 * under-14 reason is only given when you aren't suspended and the two of you are known not to follow
 * each other; when that isn't known (`mutual` null) the usual text is shown.
 */
function sendFailure(e: unknown, mutual: boolean | null, suspended: boolean): string {
  const err = e as { code?: string; message?: string } | null;
  const refused = err?.code === '42501' || /row-level security/i.test(String(err?.message ?? ''));
  return refused && !suspended && mutual === false ? MINOR_RULE : errText(e);
}

/**
 * Waits for a sendMessage call and puts a refusal into words (sendFailure). Only the send itself
 * goes through this: an upload turned away by Storage's own access rules would otherwise be
 * explained as the under-14 rule.
 */
async function explained<T>(sending: Promise<T>, mutual: boolean | null, suspended: boolean): Promise<T> {
  try {
    return await sending;
  } catch (e) {
    throw new Error(sendFailure(e, mutual, suspended));
  }
}

/** True when the moment `a` is at or after `b` (both ISO times from the database). */
function atOrAfter(a: string, b: string): boolean {
  return new Date(a).getTime() >= new Date(b).getTime();
}

/** "08:24" */
function timeOf(iso: string): string {
  const d = new Date(iso);
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

/*
 * One typing channel per chat. The Realtime client hands back the same channel object for the same name, so when
 * the same chat is open twice (chat, profile, Message) the screens share it, and the last one to leave closes it.
 * A screen opened while the previous one is still leaving waits for that, or it would be handed the closing channel.
 */
const typingRooms = new Map<string, { channel: Channel; users: number; closing: Promise<unknown> | null }>();

/** `fresh` is true for the first screen on the channel, which is the one that subscribes it. */
async function joinTypingRoom(threadId: string): Promise<{ channel: Channel; fresh: boolean }> {
  let room = typingRooms.get(threadId);
  if (room?.closing) {
    await room.closing;
    room = typingRooms.get(threadId);
  }
  if (room) {
    room.users++;
    return { channel: room.channel, fresh: false };
  }
  room = { channel: supabase.channel(`typing:${threadId}`, { config: { broadcast: { self: false } } }), users: 1, closing: null };
  typingRooms.set(threadId, room);
  return { channel: room.channel, fresh: true };
}

function leaveTypingRoom(threadId: string) {
  const room = typingRooms.get(threadId);
  if (!room || room.closing) return;
  room.users--;
  if (room.users > 0) return;
  const gone = room;
  gone.closing = supabase
    .removeChannel(gone.channel)
    .catch(() => {})
    .finally(() => {
      if (typingRooms.get(threadId) === gone) typingRooms.delete(threadId);
    });
}

/** True for a message that is nothing but a few emoji, which is shown large and without a bubble. */
function emojiOnly(text: string): boolean {
  const t = text.trim();
  if (!t || t.length > 12) return false;
  for (const ch of t) {
    const cp = ch.codePointAt(0) ?? 0;
    const ok = (cp >= 0x1f000 && cp <= 0x1faff) || (cp >= 0x2600 && cp <= 0x27bf) || (cp >= 0x2b00 && cp <= 0x2bff) || cp === 0x200d || cp === 0xfe0f || cp === 0x2764;
    if (!ok) return false;
  }
  return true;
}

/**
 * Turns messages (oldest first) into what the list draws: time stamps, bubbles, and photos gathered into stacks.
 * `theirRead` is when the other person last read the chat: "Seen" goes under the last message you sent, once it is covered.
 */
function buildRows(messages: Message[], me: string, theirRead: string | null): Row[] {
  const rows: Row[] = [];
  let prevAt = 0;
  for (const m of messages) {
    const at = new Date(m.created_at).getTime();
    const mine = m.sender_id === me;
    if (!prevAt || at - prevAt > 3600e3) rows.push({ key: 's' + m.id, kind: 'stamp', label: chatStamp(m.created_at) });
    prevAt = at;
    // Notices and view-once photos come first: neither is ever shown as text or as a photo.
    if (m.system === 'screenshot') {
      rows.push({ key: m.id, kind: 'notice', mine, m });
      continue;
    }
    if (m.view_once) {
      rows.push({ key: m.id, kind: 'snap', mine, m });
      continue;
    }
    const words = m.text.trim();
    const plain = words && !(m.post_id && words === 'Sent a post');
    if (m.call_url) {
      rows.push({ key: m.id, kind: 'call', mine, m });
      continue;
    }
    if (m.audio_url) {
      rows.push({ key: m.id, kind: 'voice', mine, m });
      continue;
    }
    if (m.post_id) rows.push({ key: 'p' + m.id, kind: 'post', mine, m });
    if (m.media_url) {
      const last = rows[rows.length - 1];
      // Photos sent one after another, with nothing in between, become one stack.
      if (!plain && !m.post_id && last && last.kind === 'photos' && last.mine === mine && at - last.at < 180e3 && last.urls.length < 10) {
        last.urls.push(m.media_url);
        last.at = at;
      } else rows.push({ key: 'i' + m.id, kind: 'photos', mine, urls: [m.media_url], at });
    }
    if (plain) rows.push({ key: m.id, kind: 'text', mine, m, big: emojiOnly(words) });
  }
  // "Seen" only ever sits under the last message you sent: the last row of yours is that message's last piece.
  if (theirRead) {
    const last = [...messages].reverse().find((m) => m.sender_id === me && m.system !== 'screenshot');
    if (last && atOrAfter(theirRead, last.created_at)) {
      for (let i = rows.length - 1; i >= 0; i--) {
        const r = rows[i];
        if (r.kind !== 'stamp' && r.kind !== 'notice' && r.mine) {
          r.seen = true;
          break;
        }
      }
    }
  }
  return rows;
}

function Bubble({ mine, children }: { mine: boolean; children: React.ReactNode }) {
  const shape = { borderRadius: 22, paddingHorizontal: 16, paddingVertical: 11 };
  if (!mine) return <View style={[shape, { backgroundColor: C.surface2 }]}>{children}</View>;
  return (
    <LinearGradient colors={[BUBBLE[0], BUBBLE[1]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={shape}>
      {children}
    </LinearGradient>
  );
}

/** The small note under the last message you sent, once the other person has read it. `color` is light over a wallpaper. */
function SeenLabel({ color }: { color: string }) {
  return <Text style={{ color, fontSize: 12, alignSelf: 'flex-end', paddingTop: 3, paddingRight: 6 }}>Seen</Text>;
}

/** "Grace took a screenshot of the chat": a quiet line across the middle, not a bubble. Colours follow the wallpaper. */
function ScreenshotLine({ mine, name, fg2, fg3 }: { mine: boolean; name: string; fg2: string; fg3: string }) {
  const words = mine ? 'You took a screenshot of the chat' : `${name} took a screenshot of the chat`;
  return (
    <View accessible accessibilityLabel={words} style={{ alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: '90%', paddingVertical: 8 }}>
      <Icon name="camera" size={14} color={fg3} weight={2} />
      <Text numberOfLines={2} style={{ color: fg2, fontSize: 13, textAlign: 'center', flexShrink: 1 }}>{words}</Text>
    </View>
  );
}

/**
 * A call noted in the chat: "Video call · 3 min", "Missed voice call", or an older message with a room link.
 * Tapping it starts a fresh call of the same kind.
 */
function CallCard({ m, mine, onCall }: { m: Message; mine: boolean; onCall?: () => void }) {
  const video = m.call_kind === 'video';
  const title = m.text.trim() || (video ? 'Video call' : 'Voice call');
  const missed = !mine && /\/(missed|declined)$/.test(m.call_url);
  const ink = mine ? '#fff' : missed ? C.like : C.fg;
  const sub = `${timeOf(m.created_at)}${onCall ? ' · Tap to call' : ''}`;
  return (
    <Pressable onPress={onCall} disabled={!onCall} accessibilityRole="button" accessibilityLabel={`${title} at ${timeOf(m.created_at)}${onCall ? `. Tap to start a ${video ? 'video' : 'voice'} call` : ''}`} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
      <Bubble mine={mine}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, width: 196, paddingVertical: 2 }}>
          <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: mine ? 'rgba(255,255,255,0.22)' : C.hairline, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name={video ? 'video' : 'phone'} size={22} color={ink} />
          </View>
          <View style={{ flex: 1 }}>
            <Text numberOfLines={2} style={{ color: mine ? '#fff' : C.fg, fontSize: 16, fontWeight: '700' }}>{title}</Text>
            <Text style={{ color: mine ? 'rgba(255,255,255,0.82)' : C.fg2, fontSize: 13, marginTop: 1 }}>{sub}</Text>
          </View>
        </View>
      </Bubble>
    </Pressable>
  );
}

function ForwardButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={8} accessibilityRole="button" accessibilityLabel="Forward" style={({ pressed }) => ({ width: 34, height: 34, borderRadius: 17, backgroundColor: C.round, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
      <Icon name="send" size={17} />
    </Pressable>
  );
}

/** One photo, or several fanned out like a small pile of prints. */
function PhotoStack({ urls, mine, onOpen, onForward }: { urls: string[]; mine: boolean; onOpen: () => void; onForward: () => void }) {
  const one = urls.length === 1;
  const w = one ? 210 : 168;
  const h = one ? 276 : 222;
  const photo = (uri: string, style: object, key: string) => <Image key={key} source={{ uri }} style={[{ position: 'absolute', width: w, height: h, borderRadius: 18, backgroundColor: C.bg2 }, style]} contentFit="cover" transition={120} />;
  const stack = (
    <Pressable onPress={onOpen} accessibilityRole="button" accessibilityLabel={one ? 'Photo. Open' : `${urls.length} photos. Open`} style={{ width: one ? w : 232, height: one ? h : 322 }}>
      {one ? (
        photo(urls[0], { left: 0, top: 0 }, 'a')
      ) : (
        <>
          {photo(urls[0], { left: 2, top: 4, transform: [{ rotate: '-4deg' }] }, 'a')}
          {photo(urls[1], { left: 60, top: 94, transform: [{ rotate: '3deg' }] }, 'b')}
          {urls.length > 2 ? (
            <View style={{ position: 'absolute', right: 10, bottom: 12, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 12, backgroundColor: 'rgba(10,12,14,0.78)' }}>
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>+{urls.length - 2}</Text>
            </View>
          ) : null}
        </>
      )}
    </Pressable>
  );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      {mine ? <ForwardButton onPress={onForward} /> : null}
      {stack}
      {mine ? null : <ForwardButton onPress={onForward} />}
    </View>
  );
}

function VoiceShape({ mine, playing, fraction, label, onPress, busy }: { mine: boolean; playing: boolean; fraction: number; label: string; onPress: () => void; busy?: boolean }) {
  // Yours sits on the green, so it is drawn in white; theirs follows the theme.
  const ink = mine ? '#fff' : C.fg;
  return (
    <Bubble mine={mine}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, width: 190 }}>
        <Pressable onPress={onPress} hitSlop={8} accessibilityRole="button" accessibilityLabel={playing ? 'Pause voice message' : 'Play voice message'} style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: mine ? 'rgba(255,255,255,0.22)' : C.hairline, alignItems: 'center', justifyContent: 'center' }}>
          {busy ? <ActivityIndicator color={ink} size="small" /> : <Icon name={playing ? 'pause' : 'play'} size={18} color={ink} />}
        </Pressable>
        <View style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: mine ? 'rgba(255,255,255,0.3)' : C.fg3, overflow: 'hidden' }}>
          <View style={{ width: `${Math.round(fraction * 100)}%`, height: 4, backgroundColor: ink }} />
        </View>
        <Text style={{ color: ink, fontSize: 13, fontVariant: ['tabular-nums'] }}>{label}</Text>
      </View>
    </Bubble>
  );
}

// Only one voice message plays at a time.
let nowPlaying: { pause: () => void } | null = null;
function pauseVoice() {
  try {
    nowPlaying?.pause();
  } catch {
    // the player was released
  }
  nowPlaying = null;
}

/** Mounted only once someone presses play, so a long chat does not open a player for every voice message. */
function VoicePlaying({ url, seconds, mine, locked }: { url: string; seconds: number; mine: boolean; locked: boolean }) {
  const player = useAudioPlayer(url, { updateInterval: 200 });
  const status = useAudioPlayerStatus(player);
  const total = status.duration > 0 ? status.duration : seconds || 1;

  const begin = useCallback(() => {
    if (nowPlaying !== player) pauseVoice();
    nowPlaying = player;
    player.play();
  }, [player]);

  useEffect(() => {
    // Voice messages should be heard even when the phone's ring switch is off.
    setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false })
      .catch(() => {})
      .finally(() => {
        try {
          begin();
        } catch {
          // the player was released
        }
      });
    return () => {
      if (nowPlaying === player) nowPlaying = null;
    };
  }, [player, begin]);

  function toggle() {
    try {
      if (status.playing) player.pause();
      else if (!locked) {
        if (status.currentTime >= total - 0.1) player.seekTo(0);
        begin();
      }
    } catch {
      // the player was released
    }
  }

  const done = status.didJustFinish || status.currentTime >= total - 0.05;
  return <VoiceShape mine={mine} playing={status.playing} busy={!status.isLoaded} fraction={done && !status.playing ? 0 : Math.min(1, status.currentTime / total)} label={clock(status.playing ? status.currentTime : total)} onPress={toggle} />;
}

/** `locked` is true while you are recording: playing a message then would cut the recording short. */
function VoiceBubble({ m, mine, locked }: { m: Message; mine: boolean; locked: boolean }) {
  const [on, setOn] = useState(false);
  if (on) return <VoicePlaying url={m.audio_url} seconds={m.audio_seconds} mine={mine} locked={locked} />;
  return <VoiceShape mine={mine} playing={false} fraction={0} label={clock(m.audio_seconds)} onPress={() => { if (!locked) setOn(true); }} />;
}

function BarIcon({ name, label, onPress, disabled }: { name: IconName; label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} hitSlop={6} accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => ({ width: 38, height: 44, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.4 : pressed ? 0.6 : 1 })}>
      <Icon name={name} size={26} />
    </Pressable>
  );
}

export default function Chat() {
  // `draft` starts the message box with some words, e.g. a quoted note when replying to one (src/components/NotesRow.tsx).
  const { id, draft } = useLocalSearchParams<{ id: string; draft?: string }>();
  const threadId = String(id);
  const { me, profile } = useSession();
  const prefs = usePrefs();
  const calls = useCalls();
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const font = useAppFont();
  const fontBold = useAppFont('bold');
  const { width, height } = useWindowDimensions();
  const [thread, setThread] = useState<Thread | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error' | 'missing'>('loading');
  const [error, setError] = useState('');
  const [text, setText] = useState(() => (typeof draft === 'string' ? draft : ''));
  const [sending, setSending] = useState(false);
  // Photos chosen and waiting for Send, with the view-once choice. Nothing is uploaded until Send.
  const [pending, setPending] = useState<{ assets: Picked[]; once: boolean } | null>(null);
  // The view-once photo open in the viewer. Its address is held here only while the viewer is open.
  const [snap, setSnap] = useState<{ id: string; url: string } | null>(null);
  // View-once photos opened on this phone, with when: they stay "Opened" even if a refresh races the server.
  const openedHere = useRef(new Map<string, string>());
  const [tray, setTray] = useState(false);
  const [sheet, setSheet] = useState<'more' | 'options' | null>(null);
  const [replies, setReplies] = useState<SavedReply[] | null>(null);
  const [faqs, setFaqs] = useState<Faq[]>([]);
  const [viewer, setViewer] = useState<{ urls: string[]; at: number; note: string } | null>(null);
  const [recording, setRecording] = useState(false);
  const [recordedMs, setRecordedMs] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [keyboardUp, setKeyboardUp] = useState(false);
  const seen = useRef('');
  const front = useRef(true);
  const asked = useRef(0);
  const shown = useRef(0);
  const hidden = useRef<string | null>(null);
  const ready = useRef(false);
  const stopping = useRef(false);
  const micOn = useRef(false);
  // The other person: when they last read the chat, and whether they are typing right now.
  const them = useRef('');
  const [theirRead, setTheirRead] = useState<string | null>(null);
  const [theirTyping, setTheirTyping] = useState(false);
  // Erha is answering: her typing bubble shows until the reply lands in the chat.
  const [erhaThinking, setErhaThinking] = useState(false);
  const typingRoom = useRef<Channel | null>(null);
  const typingHide = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingSentAt = useRef(0);
  const typingTold = useRef(false);
  const lastTheirs = useRef('');
  // You and they follow each other (null until their card has loaded), for explaining a refused message.
  const mutual = useRef<boolean | null>(null);
  // Likewise read when a message is refused (a ref, so the voice recorder's callback always sees it).
  const suspended = useRef(false);
  suspended.current = !!profile?.suspended;
  // Plus: read without the other person seeing "Seen" (Settings → Read quietly). Nothing marks the chat read
  // while this is on. A ref as well, so load() always sees the latest choice.
  const quiet = !!profile?.plus && prefs.readQuietly;
  const quietRef = useRef(quiet);
  quietRef.current = quiet;
  // The chat's card, for the screenshot listener, which is set up once per visit rather than on every draw.
  const threadRef = useRef<Thread | null>(null);
  threadRef.current = thread;

  const recorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, numberOfChannels: 1, bitRate: 64000 });

  /* ----- seen and typing ----- */

  // Their read marker only ever moves forward, whichever of the first load, Realtime or a refresh answers last.
  const noteTheirRead = useCallback((at: string | null) => {
    if (!at) return;
    setTheirRead((cur) => (cur && atOrAfter(cur, at) ? cur : at));
  }, []);

  const refreshTheirRead = useCallback(() => {
    if (!them.current) return;
    fetchTheirLastRead(threadId, them.current).then(noteTheirRead).catch(() => {});
  }, [threadId, noteTheirRead]);

  const showTheirTyping = useCallback(() => {
    setTheirTyping(true);
    if (typingHide.current) clearTimeout(typingHide.current);
    typingHide.current = setTimeout(() => {
      typingHide.current = null;
      setTheirTyping(false);
    }, TYPING_LINGER_MS);
  }, []);

  const hideTheirTyping = useCallback(() => {
    if (typingHide.current) clearTimeout(typingHide.current);
    typingHide.current = null;
    setTheirTyping(false);
  }, []);

  /** Tells the other person you are typing, at most once every couple of seconds while the text keeps changing. */
  function tellTyping() {
    const now = Date.now();
    if (now - typingSentAt.current < TYPING_EVERY_MS) return;
    typingSentAt.current = now;
    typingTold.current = true;
    typingRoom.current?.send({ type: 'broadcast', event: 'typing', payload: { user: me } }).catch(() => {});
  }

  /** Takes the typing bubble off their screen: on send, on clearing the box, on leaving it. */
  function tellStopped() {
    if (!typingTold.current) return;
    typingTold.current = false;
    typingSentAt.current = 0;
    typingRoom.current?.send({ type: 'broadcast', event: 'stopped', payload: { user: me } }).catch(() => {});
  }

  function changeText(t: string) {
    setText(t);
    if (t.trim()) tellTyping();
    else tellStopped();
  }

  const load = useCallback(async () => {
    if (!ready.current) return;
    const mine = ++asked.current;
    try {
      // A view-once photo opened here stays opened, and its address is dropped, even if the server hasn't caught up yet.
      const list = (await fetchMessages(threadId, hidden.current)).map((m) => {
        const at = openedHere.current.get(m.id);
        return at ? { ...m, media_url: '', opened_at: m.opened_at ?? at } : m;
      });
      // A slow, older answer must not replace a newer one (a message you just sent would vanish for a moment).
      if (mine < shown.current) return;
      shown.current = mine;
      setMessages(list);
      setStatus((s) => (s === 'missing' ? s : 'ready'));
      const theirs = [...list].reverse().find((m) => m.sender_id !== me);
      // Their message has arrived, so the typing bubble has done its job.
      if (theirs && theirs.id !== lastTheirs.current) {
        lastTheirs.current = theirs.id;
        hideTheirTyping();
      }
      // Mark as read when their newest message is one you have not been shown yet, and only while this chat is in front.
      // Reading quietly, nothing is marked, and `seen` isn't moved on: turning it off later marks the chat then.
      if (front.current && !quietRef.current && theirs && theirs.id !== seen.current) {
        seen.current = theirs.id;
        markThreadRead(me, threadId);
      }
    } catch (e) {
      setError(errText(e));
      setStatus((s) => (s === 'ready' ? 'ready' : 'error'));
    }
  }, [threadId, me, hideTheirTyping]);

  useEffect(() => {
    let live = true;
    ready.current = false;
    (async () => {
      try {
        const t = await fetchThread(threadId);
        if (!live) return;
        if (!t) {
          setStatus('missing');
          return;
        }
        setThread(t);
        hidden.current = t.hidden_before;
        them.current = t.other_id;
        ready.current = true;
        load();
        if (!quietRef.current) markThreadRead(me, threadId);
        refreshTheirRead();
        // Creators can offer ready-made questions at the top of the chat.
        getProfile(t.other_id)
          .then((p) => {
            mutual.current = p ? p.is_following && p.follows_me : null;
            return p && p.faq_enabled ? fetchFaqs(p.id) : [];
          })
          .then((f) => { if (live) setFaqs(f); })
          .catch(() => {});
      } catch (e) {
        if (live) {
          setError(errText(e));
          setStatus('error');
        }
      }
    })();
    const timer = setInterval(load, 6000);
    // Live updates. The sign-in token is handed over first, so the server knows whose messages these are.
    // Each screen gets its own channel: the same chat can be open twice (chat, profile, Message).
    let channel: Channel | null = null;
    supabase.realtime
      .setAuth()
      .catch(() => {})
      .then(() => {
        if (!live) return;
        channel = supabase
          .channel(`thread-${threadId}-${Date.now().toString(36)}`)
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'community_messages', filter: `thread_id=eq.${threadId}` }, () => { load(); })
          // Changes to a message, above all a view-once photo being opened: the sender's "Delivered" turns to "Opened".
          .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'community_messages', filter: `thread_id=eq.${threadId}` }, () => { load(); })
          // The other person's read marker, for "Seen". Both markers for the chat arrive here; only theirs matters.
          .on('postgres_changes', { event: '*', schema: 'public', table: 'community_thread_reads', filter: `thread_id=eq.${threadId}` }, (payload) => {
            const row = payload.new as { user_id?: string; last_read_at?: string };
            if (row.user_id && row.user_id === them.current && row.last_read_at) noteTheirRead(row.last_read_at);
          })
          .subscribe();
      });
    return () => {
      live = false;
      clearInterval(timer);
      if (channel) supabase.removeChannel(channel);
    };
  }, [threadId, me, load, attempt, refreshTheirRead, noteTheirRead]);

  // Typing, both ways, over a broadcast channel the two phones share for this chat.
  useEffect(() => {
    let live = true;
    let room: Channel | null = null;
    (async () => {
      // The sign-in token first, as for messages, so the socket is the same one and already signed in.
      await supabase.realtime.setAuth().catch(() => {});
      if (!live) return;
      const joined = await joinTypingRoom(threadId);
      if (!live) {
        leaveTypingRoom(threadId);
        return;
      }
      room = joined.channel;
      joined.channel
        .on('broadcast', { event: 'typing' }, ({ payload }) => {
          if (live && payload?.user !== me) showTheirTyping();
        })
        .on('broadcast', { event: 'stopped' }, ({ payload }) => {
          if (live && payload?.user !== me) hideTheirTyping();
        });
      if (joined.fresh) joined.channel.subscribe();
      typingRoom.current = joined.channel;
    })().catch(() => {});
    return () => {
      live = false;
      // Leaving mid-sentence: take the bubble off their screen before the channel goes.
      if (room && typingTold.current) room.send({ type: 'broadcast', event: 'stopped', payload: { user: me } }).catch(() => {});
      typingTold.current = false;
      typingSentAt.current = 0;
      typingRoom.current = null;
      if (room) leaveTypingRoom(threadId);
      if (typingHide.current) clearTimeout(typingHide.current);
      typingHide.current = null;
      setTheirTyping(false);
    };
  }, [threadId, me, showTheirTyping, hideTheirTyping]);

  // Coming back to the chat refreshes it; while another screen covers it, nothing is marked as read.
  useFocusEffect(
    useCallback(() => {
      front.current = true;
      load();
      // A read marker that changed while another screen was in front (or the connection was down) is picked up here.
      refreshTheirRead();
      return () => {
        front.current = false;
      };
    }, [load, refreshTheirRead]),
  );

  // "Active now" in the header goes stale, so the chat's card is asked for again every minute while it's open.
  // Only what changes with time is taken from it: muting and the rest stay as this screen has them.
  useEffect(() => {
    let live = true;
    const timer = setInterval(() => {
      fetchThread(threadId)
        .then((t) => {
          if (live && t) setThread((cur) => (cur ? { ...cur, active_at: t.active_at, other_plus: t.other_plus, streak: t.streak } : cur));
        })
        .catch(() => {});
    }, ACTIVE_EVERY_MS);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [threadId]);

  // A screenshot while this chat is in front tells the other person, if they have Plus. Only the screen in
  // front listens, so the same chat open twice sends one notice, and at most one every 30 seconds.
  useFocusEffect(
    useCallback(() => {
      let sub: { remove(): void } | null = null;
      try {
        sub = ScreenCapture.addScreenshotListener(() => {
          const t = threadRef.current;
          if (!t || !t.other_plus || t.other_id === ERHA_ID || t.other_id === me) return;
          const now = Date.now();
          if (now - (lastShotAt.get(threadId) ?? 0) < SHOT_GAP_MS) return;
          lastShotAt.set(threadId, now);
          sendScreenshotNotice(me, threadId)
            .then(() => load())
            .catch(() => {
              // Not sent, so the next screenshot may try again.
              lastShotAt.delete(threadId);
            });
        });
      } catch {
        // Screenshot detection isn't available on this phone: nothing to announce.
      }
      return () => {
        sub?.remove();
      };
    }, [me, threadId, load]),
  );

  useEffect(() => {
    const up = Keyboard.addListener('keyboardWillShow', () => setKeyboardUp(true));
    const down = Keyboard.addListener('keyboardWillHide', () => setKeyboardUp(false));
    return () => {
      up.remove();
      down.remove();
    };
  }, []);

  // Leave the microphone off when the screen closes.
  useEffect(
    () => () => {
      setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
    },
    [],
  );

  /** This chat is with Erha, the church assistant: text and emoji only, and she answers in the thread. */
  const isErha = thread?.other_id === ERHA_ID;

  /**
   * Erha answers inside this chat: the function puts her reply in the thread as a normal message, so
   * Realtime (or the next refresh) shows it. The typing bubble stays up until it has landed.
   */
  async function askErha(text: string) {
    setErhaThinking(true);
    try {
      await askErhaInThread(threadId, text);
    } catch (e) {
      toast(errText(e));
    } finally {
      setErhaThinking(false);
      load();
    }
  }

  async function send(msg: { text?: string; media_url?: string }) {
    if (sending) return;
    setSending(true);
    tap();
    if (msg.text !== undefined) tellStopped();
    try {
      await explained(sendMessage(me, threadId, msg), mutual.current, suspended.current);
      // Clear the box only if it still holds what was sent: you may have typed more in the meantime.
      if (msg.text !== undefined) setText((cur) => (cur === msg.text ? '' : cur));
      await load();
      // Your message is on screen; now Erha reads it and answers.
      if (isErha && msg.text?.trim()) await askErha(msg.text.trim());
    } catch (e) {
      toast(errText(e));
    } finally {
      setSending(false);
    }
  }

  /* ----- calls ----- */

  /** Rings the other person in the app's own call screen; the call is noted in this chat afterwards. */
  function call(kind: 'voice' | 'video') {
    if (!thread || calls.inCall || recording) return;
    pauseVoice();
    calls.startCall(thread.other_id, kind, threadId).catch((e) => toast(errText(e)));
  }

  /**
   * Takes or chooses photos. They wait above the message box with the view-once choice until you
   * press Send, so you decide before anything is uploaded.
   */
  async function pickPhotos(fromCamera: boolean) {
    if (sending) return;
    try {
      const picked = fromCamera ? await takePhoto({ front: prefs.frontCamera }) : await pickFromLibrary({ multiple: true, limit: 10 });
      if (!picked.length) return;
      setTray(false);
      // Choosing again replaces what was waiting, but keeps the view-once choice.
      setPending((cur) => ({ assets: picked, once: cur?.once ?? false }));
    } catch (e) {
      toast(errText(e));
    }
  }

  async function sendPending() {
    if (!pending || sending) return;
    const { assets, once } = pending;
    setSending(true);
    tap();
    let sent = 0;
    try {
      for (const a of assets) {
        const m = await uploadImage(me, a.uri, a.width, 1280);
        await explained(sendMessage(me, threadId, { media_url: m.url, view_once: once }), mutual.current, suspended.current);
        sent++;
      }
      setPending(null);
      await load();
    } catch (e) {
      // Whatever didn't go stays waiting, so Send can try again without sending any twice.
      setPending((cur) => (cur && cur.assets === assets ? { ...cur, assets: assets.slice(sent) } : cur));
      if (sent) load();
      toast(errText(e));
    } finally {
      setSending(false);
    }
  }

  /* ----- view-once photos ----- */

  const openingSnap = useRef(false);

  /**
   * Opens a view-once photo sent to you. Yours, and ones already opened, can't be opened. The server
   * hands over the photo's address only now, and from this moment it counts as opened.
   */
  async function openSnap(m: Message) {
    if (m.sender_id === me || m.opened_at || openedHere.current.has(m.id) || openingSnap.current) return;
    openingSnap.current = true;
    tap('medium');
    pauseVoice();
    try {
      const url = await openViewOnce(m.id);
      openedHere.current.set(m.id, new Date().toISOString());
      if (url) setSnap({ id: m.id, url });
      else {
        toast('This photo has already been opened.');
        setMessages((list) => list.map((x) => (x.id === m.id ? { ...x, opened_at: x.opened_at ?? new Date().toISOString() } : x)));
      }
    } catch (e) {
      toast(errText(e));
    } finally {
      openingSnap.current = false;
    }
  }

  function closeSnap() {
    const s = snap;
    setSnap(null);
    if (!s) return;
    const at = openedHere.current.get(s.id);
    // Opened: forget its address straight away and show "Opened". Not loaded: it stays waiting to be tapped.
    if (at) setMessages((list) => list.map((m) => (m.id === s.id ? { ...m, media_url: '', opened_at: m.opened_at ?? at } : m)));
    load();
  }

  /* ----- voice messages ----- */

  async function startRecording() {
    if (sending || recording) return;
    try {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) {
        toast('Microphone access is off. Turn it on for Community in the Settings app.');
        return;
      }
      pauseVoice();
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      micOn.current = true;
      stopping.current = false;
      setRecordedMs(0);
      setTray(false);
      setRecording(true);
    } catch (e) {
      // Do not leave the phone in recording mode when the recording never started.
      setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
      toast(errText(e));
    }
  }

  const stopRecording = useCallback(
    async (keep: boolean) => {
      if (stopping.current) return;
      stopping.current = true;
      micOn.current = false;
      let ms = 0;
      try {
        ms = recorder.getStatus().durationMillis;
      } catch {
        ms = 0;
      }
      setRecording(false);
      try {
        await recorder.stop();
        await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
        const uri = recorder.uri;
        if (!keep) return;
        if (!uri || ms < 800) {
          toast('That was too short. Record a little longer.');
          return;
        }
        setSending(true);
        const url = await uploadAudio(me, uri);
        await explained(sendMessage(me, threadId, { audio_url: url, audio_seconds: Math.max(1, Math.round(ms / 1000)) }), mutual.current, suspended.current);
        await load();
      } catch (e) {
        if (keep) toast(errText(e));
      } finally {
        setSending(false);
      }
    },
    [recorder, me, threadId, load, toast],
  );

  // A recording never carries on behind another screen: opening a profile or a post, or leaving, discards it.
  useFocusEffect(
    useCallback(
      () => () => {
        if (micOn.current) stopRecording(false);
      },
      [stopRecording],
    ),
  );

  // Show the running time, and stop by itself at the limit.
  useEffect(() => {
    if (!recording) return;
    const t = setInterval(() => {
      try {
        const ms = recorder.getStatus().durationMillis;
        setRecordedMs(ms);
        if (ms >= VOICE_LIMIT_MS) stopRecording(true);
      } catch {
        // the recorder was released
      }
    }, 250);
    return () => clearInterval(t);
  }, [recording, recorder, stopRecording]);

  /* ----- sheets ----- */

  function openMore() {
    setSheet('more');
    setTray(false);
    fetchSavedReplies(me).then(setReplies).catch(() => setReplies([]));
  }

  const after = (fn: () => void) => () => {
    setSheet(null);
    setTimeout(fn, 380);
  };

  function removeChat() {
    Alert.alert('Delete this chat?', 'The messages are removed for you only. The other person keeps their copy, and a new message starts the chat again.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => { hideThread(threadId).then(() => { toast('Chat deleted'); router.back(); }).catch((e) => toast(errText(e))); } },
    ]);
  }

  function block() {
    if (!thread) return;
    Alert.alert(`Block ${thread.username}?`, 'You will stop seeing their posts, stories and comments. They are not told.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Block', style: 'destructive', onPress: () => { setBlock(me, thread.other_id, true).then(() => { toast(`Blocked ${thread.username}`); router.back(); }).catch((e) => toast(errText(e))); } },
    ]);
  }

  function reportThem() {
    if (!thread) return;
    Alert.alert('Report this account', 'Why are you reporting it?', [
      ...['Spam', 'Harassment or hate', 'Pretending to be someone else', 'Something else'].map((r) => ({ text: r, onPress: () => { report(me, { userId: thread.other_id }, r).then(() => toast('Thanks. We will review this account.')).catch((e) => toast(errText(e))); } })),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  }

  async function ask(f: Faq) {
    if (sending) return;
    setSending(true);
    try {
      await askFaq(f.id);
      await load();
    } catch (e) {
      toast(errText(e));
    } finally {
      setSending(false);
    }
  }

  const forward = (urls: string[]) => router.push({ pathname: '/send-to', params: { media: JSON.stringify(urls) } });

  async function savePhoto(url: string) {
    if (!viewer) return;
    // The viewer may have been closed or swiped on by the time the download ends, so only ever add the note.
    const say = (note: string) => setViewer((v) => (v ? { ...v, note } : v));
    try {
      const perm = await MediaLibrary.requestPermissionsAsync(true);
      if (!perm.granted) {
        say('Allow Community to add photos in the Settings app, then try again.');
        return;
      }
      const file = await File.downloadFileAsync(url, new File(Paths.cache, `community-${Date.now()}.jpg`));
      await MediaLibrary.saveToLibraryAsync(file.uri);
      say('Saved to Photos');
    } catch (e) {
      say(errText(e));
    }
  }

  // Erha never reads a chat, so nothing of yours is ever marked "Seen" there.
  const rows = useMemo(() => buildRows(messages, me, isErha ? null : theirRead).reverse(), [messages, me, theirRead, isErha]);
  const typing = text.trim().length > 0;
  const showFaqs = faqs.length > 0 && thread && thread.other_id !== me;
  const showTyping = theirTyping || (isErha && erhaThinking);
  // Plus: the chosen look behind the messages. Bubbles stay as they are.
  const wallpaper = profile?.plus && prefs.chatWallpaper ? wallpaperById(prefs.chatWallpaper) : null;
  // The wallpapers are all dark, so words drawn straight on one (times, "Seen") stay light whatever the theme.
  const onWall = wallpaper ? DARK : C;
  const callsOff = calls.inCall || recording;

  return (
    <Screen>
      <View style={{ height: 60, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, gap: 8 }}>
        <RoundButton name="back" label="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/inbox'))} />
        {thread ? (
          <Pressable onPress={() => router.push(`/user/${thread.other_id}`)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }} accessibilityRole="button" accessibilityLabel={`Open ${thread.full_name}'s profile`}>
            {isErha && !thread.avatar_url ? <ErhaAvatar size={40} /> : <Avatar uri={thread.avatar_url} name={thread.full_name} size={40} online={!isErha && isOnline(thread.active_at)} />}
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <Text numberOfLines={1} style={{ color: C.fg, fontSize: 18, fontWeight: '700', flexShrink: 1 }}>{thread.full_name}</Text>
                {thread.verified ? <VerifiedTick size={16} /> : null}
                {(thread.streak ?? 0) >= STREAK_FROM ? (
                  <Pressable onPress={() => toast(`${thread.streak}-day streak: you've both written every day`)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`${thread.streak}-day streak`} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 2, opacity: pressed ? 0.6 : 1 })}>
                    <Icon name="flame" size={16} color={FLAME} />
                    <Text style={{ color: C.fg2, fontSize: 14, fontWeight: '600', fontVariant: ['tabular-nums'] }}>{thread.streak}</Text>
                  </Pressable>
                ) : null}
              </View>
              {showTyping ? (
                <Text numberOfLines={1} style={{ color: C.accent2, fontSize: 13 }} accessibilityLiveRegion="polite">{isErha && erhaThinking ? 'Thinking…' : 'Typing…'}</Text>
              ) : isErha ? (
                <Text numberOfLines={1} style={{ color: C.fg, fontSize: 13 }}>Church assistant{thread.muted ? ' · muted' : ''}</Text>
              ) : activeLabel(thread.active_at) ? (
                // When they were last here, if both of you share activity status; otherwise their username, as before.
                <Text numberOfLines={1} style={{ color: C.fg2, fontSize: 13 }}>{activeLabel(thread.active_at)}{thread.muted ? ' · muted' : ''}</Text>
              ) : (
                <Text numberOfLines={1} style={{ color: C.fg, fontSize: 13 }}>{thread.username}{thread.muted ? ' · muted' : ''}</Text>
              )}
            </View>
          </Pressable>
        ) : (
          <View style={{ flex: 1 }} />
        )}
        {thread && status === 'ready' && !isErha ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', opacity: callsOff ? 0.4 : 1 }} accessibilityState={{ disabled: callsOff }}>
            <IconButton name="phone" size={26} label="Voice call" onPress={() => call('voice')} />
            <IconButton name="video" size={26} label="Video call" onPress={() => call('video')} />
          </View>
        ) : null}
        {thread ? <RoundButton name="info" label="Chat options" onPress={() => setSheet('options')} /> : null}
      </View>
      {quiet && thread && !isErha ? (
        <Pressable onPress={() => toast("They won't see “Seen” while you read. Change it in Settings.")} accessibilityRole="button" accessibilityLabel="Reading quietly. They won't see Seen while you read" style={({ pressed }) => ({ alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 3, marginBottom: 4, borderRadius: 11, backgroundColor: C.surface, opacity: pressed ? 0.7 : 1 })}>
          <Icon name="eye" size={13} color={C.fg2} weight={2} />
          <Text style={{ color: C.fg2, fontSize: 12, fontWeight: '600' }}>Reading quietly</Text>
        </Pressable>
      ) : null}

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {status === 'loading' ? (
          <View style={{ flex: 1 }}><Loading /></View>
        ) : status === 'error' ? (
          <View style={{ flex: 1 }}><ErrorNote message={error} onRetry={() => { setStatus('loading'); if (ready.current) load(); else setAttempt((n) => n + 1); }} /></View>
        ) : status === 'missing' ? (
          <View style={{ flex: 1 }}><Empty title="This chat isn't available" body="The other account may have been deleted." /></View>
        ) : (
          <View style={{ flex: 1 }}>
            {wallpaper ? <LinearGradient pointerEvents="none" colors={wallpaper.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} /> : null}
            <FlatList
              data={rows}
              inverted
              keyExtractor={(r) => r.key}
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 12, gap: 4 }}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item: r }) => {
                if (r.kind === 'stamp') return <Text style={{ color: onWall.fg2, fontSize: 12.5, letterSpacing: 0.2, textAlign: 'center', paddingTop: 18, paddingBottom: 10 }}>{r.label}</Text>;
                if (r.kind === 'notice') return <ScreenshotLine mine={r.mine} name={thread?.full_name || thread?.username || 'They'} fg2={onWall.fg2} fg3={onWall.fg3} />;
                const align = { alignSelf: r.mine ? ('flex-end' as const) : ('flex-start' as const), maxWidth: '82%' as const };
                const seen = r.seen ? <SeenLabel color={onWall.fg3} /> : null;
                if (r.kind === 'snap') {
                  // The sender's own bubble says Delivered or Opened, so "Seen" would only repeat it.
                  const opened = !!r.m.opened_at || openedHere.current.has(r.m.id);
                  return (
                    <View style={[align, { paddingVertical: 2 }]}>
                      <SnapBubble mine={r.mine} opened={opened} onOpen={() => openSnap(r.m)} />
                    </View>
                  );
                }
                if (r.kind === 'photos') {
                  return (
                    <>
                      <View style={[align, { maxWidth: '100%', paddingVertical: 4 }]}>
                        <PhotoStack urls={r.urls} mine={r.mine} onOpen={() => setViewer({ urls: r.urls, at: 0, note: '' })} onForward={() => forward(r.urls)} />
                      </View>
                      {seen}
                    </>
                  );
                }
                if (r.kind === 'voice') {
                  return (
                    <>
                      <View style={align}><VoiceBubble m={r.m} mine={r.mine} locked={recording} /></View>
                      {seen}
                    </>
                  );
                }
                if (r.kind === 'call') {
                  const kind = r.m.call_kind === 'video' ? 'video' : 'voice';
                  return (
                    <>
                      <View style={align}><CallCard m={r.m} mine={r.mine} onCall={isErha ? undefined : () => call(kind)} /></View>
                      {seen}
                    </>
                  );
                }
                if (r.kind === 'post') {
                  const post = r.m.post_id ? getPostNow(r.m.post_id) : undefined;
                  return (
                    <>
                      <View style={align}>
                        {post ? (
                          <Pressable onPress={() => router.push(post.kind === 'reel' ? `/watch/${post.id}` : `/post/${post.id}`)} accessibilityRole="button" accessibilityLabel={`Post by ${post.username}`} style={{ width: 210, borderRadius: 18, overflow: 'hidden', backgroundColor: C.surface }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 9 }}>
                              <Avatar uri={post.avatar_url} name={post.full_name} size={24} />
                              <Text numberOfLines={1} style={{ color: C.fg, fontWeight: '600', fontSize: 13, flex: 1 }}>{post.username}</Text>
                            </View>
                            <Image source={{ uri: thumbOf(post) }} style={{ width: 210, height: 262, backgroundColor: C.bg2 }} contentFit="cover" />
                            {post.caption ? <Text numberOfLines={2} style={{ color: C.fg2, fontSize: 13, padding: 9 }}>{post.caption}</Text> : null}
                          </Pressable>
                        ) : (
                          <View style={{ borderRadius: 18, backgroundColor: C.surface, paddingHorizontal: 13, paddingVertical: 9 }}>
                            <Text style={{ color: C.fg2 }}>This post is no longer available</Text>
                          </View>
                        )}
                      </View>
                      {seen}
                    </>
                  );
                }
                if (r.big) {
                  return (
                    <>
                      <Text style={[align, { fontSize: 44, lineHeight: 54 }]}>{r.m.text.trim()}</Text>
                      {seen}
                    </>
                  );
                }
                return (
                  <>
                    <Pressable style={align} onLongPress={() => { Clipboard.setStringAsync(r.m.text).then(() => toast('Copied')); }} delayLongPress={350} accessibilityHint="Touch and hold to copy">
                      <Bubble mine={r.mine}>
                        <Text style={{ color: r.mine ? '#fff' : C.fg, fontSize: 17, lineHeight: 23 }}>{r.m.text}</Text>
                      </Bubble>
                    </Pressable>
                    {seen}
                  </>
                );
              }}
              // The list is upside down, so its header sits at the bottom: their typing bubble goes under the newest message.
              ListHeaderComponent={
                isErha && erhaThinking ? (
                  // Erha is working on her answer: her living orb as the last row of the chat.
                  // Over a wallpaper it sits on a soft card, so the words stay readable on the dark picture.
                  <View style={[{ alignSelf: 'flex-start', paddingTop: 6, paddingLeft: 4 }, wallpaper ? { paddingLeft: 12, paddingRight: 14, paddingTop: 4, paddingBottom: 4, marginTop: 4, borderRadius: 18, backgroundColor: C.surface2 } : null]} accessibilityLiveRegion="polite">
                    <AssistantThinking name="Erha" />
                  </View>
                ) : showTyping ? (
                  <View style={{ alignSelf: 'flex-start', paddingTop: 4 }} accessibilityLabel={`${thread?.full_name ?? 'They'} is typing`} accessibilityLiveRegion="polite">
                    <Bubble mine={false}>
                      <TypingDots />
                    </Bubble>
                  </View>
                ) : null
              }
              ListFooterComponent={
                showFaqs ? (
                  <View style={{ alignItems: 'center', paddingVertical: 14, gap: 8 }}>
                    <Text style={{ color: onWall.fg2, fontSize: 13.5 }}>Frequently asked questions</Text>
                    {faqs.map((f) => (
                      <Pressable key={f.id} onPress={() => ask(f)} disabled={sending} accessibilityRole="button" accessibilityLabel={`Ask: ${f.question}`} style={({ pressed }) => ({ maxWidth: '88%', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, borderWidth: 1, borderColor: onWall.surface2, backgroundColor: pressed ? onWall.surface : 'transparent' })}>
                        <Text style={{ color: onWall.fg, fontSize: 15.5, textAlign: 'center' }}>{f.question}</Text>
                      </Pressable>
                    ))}
                  </View>
                ) : null
              }
              ListEmptyComponent={
                // The list is upside down, so the empty state is flipped back the right way up.
                <View style={{ transform: [{ scaleY: -1 }] }}>
                  {isErha ? (
                    <View style={{ alignItems: 'center', paddingHorizontal: 16, paddingVertical: 28, gap: 12 }}>
                      {thread?.avatar_url ? <Avatar uri={thread.avatar_url} name="Erha" size={72} /> : <ErhaAvatar size={72} />}
                      <Text style={{ color: onWall.fg, fontSize: 21, fontWeight: '800' }}>Hi, I'm Erha</Text>
                      <Text style={{ color: onWall.fg2, textAlign: 'center', lineHeight: 21 }}>I help with church life: the Bible, Sabbath School, hymns, prayer and planning activities. Ask me anything about it.</Text>
                      <View style={{ gap: 8, alignSelf: 'stretch', marginTop: 6 }}>
                        {ERHA_OPENERS.map((o) => (
                          <Pressable key={o} onPress={() => send({ text: o })} disabled={sending} accessibilityRole="button" accessibilityLabel={`Ask: ${o}`} style={({ pressed }) => ({ paddingHorizontal: 14, paddingVertical: 12, borderRadius: 14, backgroundColor: pressed ? C.surface2 : C.surface, opacity: sending ? 0.5 : 1 })}>
                            <Text style={{ color: C.fg, fontSize: 15.5 }}>{o}</Text>
                          </Pressable>
                        ))}
                      </View>
                    </View>
                  ) : wallpaper ? (
                    // Empty, drawn in light words that read on the dark wallpaper.
                    <View style={{ padding: 36, alignItems: 'center', gap: 8 }}>
                      <Text style={{ color: onWall.fg, fontSize: 17, fontWeight: '700', textAlign: 'center', fontFamily: fontBold }}>{thread ? thread.full_name : 'New chat'}</Text>
                      <Text style={{ color: onWall.fg2, textAlign: 'center', lineHeight: 20, fontFamily: font }}>Say hello to start the chat.</Text>
                    </View>
                  ) : (
                    <Empty title={thread ? thread.full_name : 'New chat'} body="Say hello to start the chat." />
                  )}
                </View>
              }
            />
          </View>
        )}

        {status === 'ready' ? (
          <View style={{ marginHorizontal: 10, marginTop: 6, marginBottom: keyboardUp ? 8 : Math.max(insets.bottom, 8) + 4 }}>
            {tray ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="always" contentContainerStyle={{ gap: 6, paddingHorizontal: 6, paddingBottom: 8 }}>
                {QUICK.map((e) => (
                  <Pressable key={e} onPress={() => send({ text: e })} disabled={sending} accessibilityRole="button" accessibilityLabel={`Send ${e}`} style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: C.inputBar, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 26 }}>{e}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            ) : null}
            {pending && !recording ? (
              // Photos waiting to be sent: choose view once (the "1") or keep them in the chat, then Send.
              <View style={{ marginBottom: 6, padding: 8, borderRadius: 22, backgroundColor: C.inputBar, gap: 6 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Pressable onPress={() => setPending(null)} disabled={sending} hitSlop={6} accessibilityRole="button" accessibilityLabel="Don't send these photos" style={({ pressed }) => ({ width: 32, height: 32, borderRadius: 16, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center', opacity: sending ? 0.4 : pressed ? 0.6 : 1 })}>
                    <Icon name="close" size={16} weight={2.4} />
                  </Pressable>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={{ gap: 6 }} keyboardShouldPersistTaps="always">
                    {pending.assets.map((a, i) => (
                      <Image key={`${i}-${a.uri}`} source={{ uri: a.uri }} style={{ width: 50, height: 50, borderRadius: 12, backgroundColor: C.surface2 }} contentFit="cover" accessibilityLabel={`Photo ${i + 1} of ${pending.assets.length}`} />
                    ))}
                  </ScrollView>
                  <OnceToggle on={pending.once} disabled={sending} onPress={() => { tap('select'); setPending((p) => (p ? { ...p, once: !p.once } : p)); }} />
                  <Pressable onPress={sendPending} disabled={sending} accessibilityRole="button" accessibilityLabel={pending.once ? `Send ${pending.assets.length === 1 ? 'photo' : `${pending.assets.length} photos`} as view once` : `Send ${pending.assets.length === 1 ? 'photo' : `${pending.assets.length} photos`}`} style={({ pressed }) => ({ width: 40, height: 40, borderRadius: 20, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}>
                    {sending ? <ActivityIndicator color={C.onAccent} size="small" /> : <Icon name="send" size={19} color={C.onAccent} />}
                  </Pressable>
                </View>
                <Text style={{ color: pending.once ? C.accent2 : C.fg3, fontSize: 12.5, paddingHorizontal: 4 }}>
                  {pending.once ? 'View once: they can open each photo one time, then it’s gone.' : 'Tap 1 to send as view once.'}
                </Text>
              </View>
            ) : null}
            {recording ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, paddingHorizontal: 6, borderRadius: 26, backgroundColor: C.inputBar }}>
                <Pressable onPress={() => stopRecording(false)} accessibilityRole="button" accessibilityLabel="Discard recording" style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="trash" size={20} />
                </Pressable>
                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: C.like }} />
                <Text style={{ flex: 1, color: C.fg, fontSize: 16, fontVariant: ['tabular-nums'] }} accessibilityLiveRegion="polite">Recording {clock(recordedMs / 1000)}</Text>
                <Pressable onPress={() => stopRecording(true)} accessibilityRole="button" accessibilityLabel="Send voice message" style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="send" size={20} color={C.onAccent} />
                </Pressable>
              </View>
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', minHeight: 52, paddingLeft: isErha ? 8 : 6, paddingRight: 8, borderRadius: 26, backgroundColor: C.inputBar }}>
                {isErha ? null : (
                  <Pressable onPress={() => pickPhotos(true)} disabled={sending} accessibilityRole="button" accessibilityLabel="Take a photo" style={({ pressed }) => ({ width: 40, height: 40, borderRadius: 20, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center', marginBottom: 6, opacity: pressed ? 0.7 : 1 })}>
                    {sending ? <ActivityIndicator color={C.onAccent} size="small" /> : <Icon name="camerafill" size={23} color={C.onAccent} ink={C.accent} />}
                  </Pressable>
                )}
                <TextInput value={text} onChangeText={changeText} onFocus={() => setTray(false)} onBlur={tellStopped} placeholder={isErha ? 'Ask Erha…' : 'Message…'} placeholderTextColor={C.fg2} autoFocus={!!draft} multiline maxLength={5000} keyboardAppearance={C.blurTint} style={{ flex: 1, color: C.fg, fontSize: 17, minHeight: 52, maxHeight: 130, paddingHorizontal: 12, paddingTop: 15, paddingBottom: 15 }} accessibilityLabel={isErha ? 'Message to Erha' : 'Message'} />
                {typing ? (
                  <Pressable onPress={() => send({ text })} disabled={sending} hitSlop={8} accessibilityRole="button" accessibilityLabel="Send" accessibilityState={{ disabled: sending }} style={{ paddingHorizontal: 10, height: 52, justifyContent: 'center' }}>
                    {isErha && sending ? <ActivityIndicator color={C.accent2} size="small" /> : <Text style={{ color: C.accent2, fontWeight: '700', fontSize: 16.5, opacity: sending ? 0.4 : 1 }}>Send</Text>}
                  </Pressable>
                ) : (
                  <View style={{ flexDirection: 'row', alignItems: 'center', height: 52 }}>
                    {isErha ? null : <BarIcon name="mic" label="Record a voice message" onPress={startRecording} disabled={sending} />}
                    {isErha ? null : <BarIcon name="image" label="Send photos" onPress={() => pickPhotos(false)} disabled={sending} />}
                    <BarIcon name="chatdots" label={tray ? 'Hide quick reactions' : 'Quick reactions'} onPress={() => setTray(!tray)} />
                    <BarIcon name="pluscircle" label="More" onPress={openMore} />
                  </View>
                )}
              </View>
            )}
          </View>
        ) : null}
      </KeyboardAvoidingView>

      {/* saved replies */}
      <Sheet visible={sheet === 'more'} onClose={() => setSheet(null)} title="Saved replies">
        {replies === null ? (
          <Loading />
        ) : replies.length === 0 ? (
          <Text style={{ color: C.fg2, textAlign: 'center', paddingHorizontal: 28, paddingBottom: 14, lineHeight: 20 }}>Save messages you send often, then drop them into any chat from here.</Text>
        ) : (
          <ScrollView style={{ maxHeight: 280 }}>
            {replies.map((r) => (
              <Pressable key={r.id} onPress={() => { setText(r.body); setSheet(null); }} accessibilityRole="button" accessibilityLabel={`Use saved reply: ${r.body}`} style={({ pressed }) => ({ paddingHorizontal: 18, paddingVertical: 10, backgroundColor: pressed ? C.press : 'transparent' })}>
                {r.shortcut ? <Text style={{ color: C.accent2, fontWeight: '700', fontSize: 13.5 }}>{r.shortcut}</Text> : null}
                <Text numberOfLines={2} style={{ color: C.fg, fontSize: 16, lineHeight: 21 }}>{r.body}</Text>
              </Pressable>
            ))}
          </ScrollView>
        )}
        <SheetRow icon="reply" label="Manage saved replies" onPress={after(() => router.push('/saved-replies'))} right={<Icon name="right" size={18} color={C.fg2} weight={2} />} />
      </Sheet>

      {/* chat options */}
      <Sheet visible={sheet === 'options'} onClose={() => setSheet(null)}>
        <SheetRow first icon="user" label="View profile" onPress={after(() => { if (thread) router.push(`/user/${thread.other_id}`); })} />
        <SheetRow
          icon={thread?.muted ? 'sound' : 'mute'}
          label={thread?.muted ? 'Unmute messages' : 'Mute messages'}
          sub={thread?.muted ? undefined : 'No unread dot on the Messages tab for this chat'}
          onPress={after(() => {
            if (!thread) return;
            const next = !thread.muted;
            setThreadMuted(me, threadId, next)
              .then(() => {
                setThread({ ...thread, muted: next });
                toast(next ? 'Messages muted' : 'Messages unmuted');
              })
              .catch((e) => toast(errText(e)));
          })}
        />
        <SheetRow icon="wallpaper" label="Chat wallpaper" sub={profile?.plus ? 'The look behind every chat' : 'A Community Plus perk'} onPress={after(() => router.push('/chat-wallpaper'))} right={<Icon name="right" size={18} color={C.fg2} weight={2} />} />
        <SheetRow icon="trash" label="Delete chat" danger onPress={after(removeChat)} />
        <SheetRow icon="block" label={`Block ${thread?.username ?? ''}`} danger onPress={after(block)} />
        <SheetRow icon="flag" label="Report" danger onPress={after(reportThem)} />
      </Sheet>

      {/* photos, full screen */}
      <Modal visible={!!viewer} animationType="fade" onRequestClose={() => setViewer(null)} statusBarTranslucent>
        <View style={{ flex: 1, backgroundColor: '#000' }}>
          {viewer ? (
            <>
              {/* Light clock and battery over the black, even on the White theme; gone again with the viewer. */}
              <StatusBar style="light" />
              <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} onMomentumScrollEnd={(e) => { const at = Math.round(e.nativeEvent.contentOffset.x / width); setViewer((v) => (v ? { ...v, at, note: '' } : v)); }}>
                {viewer.urls.map((u, i) => (
                  <Image key={`${i}-${u}`} source={{ uri: u }} style={{ width, height }} contentFit="contain" accessibilityLabel="Photo" />
                ))}
              </ScrollView>
              <View style={{ position: 'absolute', top: insets.top + 4, left: 8, right: 8, flexDirection: 'row', alignItems: 'center' }}>
                <IconButton name="close" size={28} color="#fff" label="Close" onPress={() => setViewer(null)} />
                <Text style={{ flex: 1, color: '#fff', textAlign: 'center', fontWeight: '600' }}>{viewer.urls.length > 1 ? `${viewer.at + 1} of ${viewer.urls.length}` : ''}</Text>
                <IconButton name="download" color="#fff" label="Save to Photos" onPress={() => savePhoto(viewer.urls[viewer.at])} />
              </View>
              {viewer.note ? (
                <View style={{ position: 'absolute', left: 24, right: 24, bottom: insets.bottom + 40, alignItems: 'center' }} accessibilityLiveRegion="polite">
                  <View style={{ backgroundColor: '#f3f5f7', paddingHorizontal: 18, paddingVertical: 11, borderRadius: 14 }}>
                    <Text style={{ color: '#0b1014', fontWeight: '600', textAlign: 'center' }}>{viewer.note}</Text>
                  </View>
                </View>
              ) : null}
            </>
          ) : null}
        </View>
      </Modal>

      {/* a view-once photo, full screen: no forwarding and no saving */}
      <SnapViewer url={snap?.url ?? null} onClose={closeSnap} />
    </Screen>
  );
}
