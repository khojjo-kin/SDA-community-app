import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { ActivityIndicator, Alert, FlatList, Keyboard, KeyboardAvoidingView, Linking, Modal, type NativeScrollEvent, type NativeSyntheticEvent, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, type TextStyle, useWindowDimensions, View } from 'react-native';
import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus, useAudioRecorder } from 'expo-audio';
import * as Clipboard from 'expo-clipboard';
import * as Crypto from 'expo-crypto';
import { File, Paths } from 'expo-file-system';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import * as MediaLibrary from 'expo-media-library';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import * as ScreenCapture from 'expo-screen-capture';
import { StatusBar } from 'expo-status-bar';
import * as WebBrowser from 'expo-web-browser';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ErhaAvatar } from '../../../src/components/ErhaAvatar';
import { thumbOf } from '../../../src/components/Grid';
import { Icon, IconName, VerifiedTick } from '../../../src/components/Icon';
import { OnceToggle, SnapBubble, SnapViewer } from '../../../src/components/SnapBubble';
import { AssistantThinking } from '../../../src/components/ThinkingOrb';
import { TypingDots } from '../../../src/components/TypingDots';
import { Avatar, Button, Empty, ErrorNote, IconButton, Loading, RoundButton, Screen, Sheet, SheetRow, useChoices, useToast } from '../../../src/components/ui';
import { acceptMessageRequest, activeLabel, askErhaInThread, askFaq, deleteMessageRequest, ERHA_ID, fetchFaqs, fetchMessages, fetchSavedReplies, fetchTheirLastRead, fetchThread, getProfile, hideThread, isOnline, markThreadRead, openViewOnce, report, sendMessage, sendScreenshotNotice, setBlock, setThreadMuted, uploadAudio, uploadImage, withTimeout } from '../../../src/lib/api';
import { useCalls } from '../../../src/lib/calls';
import { tap } from '../../../src/lib/haptics';
import { type Key, type Vars, useT } from '../../../src/lib/i18n';
import { pickFromLibrary, takePhoto, type Picked } from '../../../src/lib/pick';
import { useAppFont } from '../../../src/lib/fonts';
import { usePrefs } from '../../../src/lib/prefs';
import { useSession } from '../../../src/lib/session';
import { usePost } from '../../../src/lib/store';
import { supabase } from '../../../src/lib/supabase';
import { cacheKey, keepSame, peekCache } from '../../../src/lib/cache';
import { BUBBLE, C, chatStamp, clock, DARK, errText } from '../../../src/lib/theme';
import type { Faq, Message, Post, SavedReply, Thread } from '../../../src/lib/types';
import { wallpaperById } from '../../../src/lib/wallpapers';
import { markRecording } from '../../../src/lib/player';

/** Under your newest message: "Sent", then "Seen" once the other person has read it. */
type Status = 'sent' | 'seen';

/**
 * A text message of yours on its way. It shows in the chat the moment you press Send, and the
 * server's copy, which has the same id, takes its place when it lands, so it is never shown twice.
 */
type Outgoing = { id: string; text: string; created_at: string; state: 'sending' | 'sent' | 'failed' };

type Row =
  | { key: string; kind: 'stamp'; label: string }
  | { key: string; kind: 'text'; mine: boolean; m: Message; big: boolean; status?: Status }
  | { key: string; kind: 'post'; mine: boolean; m: Message; status?: Status }
  | { key: string; kind: 'photos'; mine: boolean; urls: string[]; at: number; status?: Status }
  | { key: string; kind: 'voice'; mine: boolean; m: Message; status?: Status }
  | { key: string; kind: 'call'; mine: boolean; m: Message; status?: Status }
  // A view-once photo: never drawn as a photo, only as a small bubble (src/components/SnapBubble.tsx).
  | { key: string; kind: 'snap'; mine: boolean; m: Message; status?: Status }
  // A line from the app in the middle of the chat, such as "took a screenshot". Never marked "Seen".
  | { key: string; kind: 'notice'; mine: boolean; m: Message; status?: Status }
  // Yours, still on its way or not sent. `last` is the newest of them, which says how it is getting on.
  | { key: string; kind: 'out'; mine: true; o: Outgoing; big: boolean; last: boolean; status?: Status };

type Channel = ReturnType<typeof supabase.channel>;

/** How many messages are fetched at a time: the newest on opening and on every refresh, and as many again on scrolling back. */
const PAGE = 40;

/*
 * Messages on their way, per chat. Kept outside the screen so leaving and opening the chat again
 * (or the same chat open twice) still shows them, and one that didn't send can be tried again.
 */
const NO_OUTGOING: Outgoing[] = [];
const outboxes = new Map<string, Outgoing[]>();
const outboxWatchers = new Set<() => void>();

function changeOutbox(key: string, fn: (list: Outgoing[]) => Outgoing[]) {
  const next = fn(outboxes.get(key) ?? NO_OUTGOING);
  if (next === (outboxes.get(key) ?? NO_OUTGOING)) return;
  if (next.length) outboxes.set(key, next);
  else outboxes.delete(key);
  outboxWatchers.forEach((w) => w());
}

/** Moves one message on its way to a new state; nothing changes if it has already landed. */
function markOutgoing(key: string, id: string, state: Outgoing['state']) {
  changeOutbox(key, (list) => (list.some((x) => x.id === id && x.state !== state) ? list.map((x) => (x.id === id ? { ...x, state } : x)) : list));
}

function watchOutbox(fn: () => void) {
  outboxWatchers.add(fn);
  return () => {
    outboxWatchers.delete(fn);
  };
}

function useOutbox(key: string): Outgoing[] {
  return useSyncExternalStore(watchOutbox, () => outboxes.get(key) ?? NO_OUTGOING);
}

/** Messages leave one after another, so they reach the other person in the order they were written. */
const sendLines = new Map<string, Promise<unknown>>();
function inLine<T>(key: string, work: () => Promise<T>): Promise<T> {
  const next = (sendLines.get(key) ?? Promise.resolve()).catch(() => {}).then(work);
  sendLines.set(key, next);
  next
    .finally(() => {
      if (sendLines.get(key) === next) sendLines.delete(key);
    })
    .catch(() => {});
  return next;
}

/*
 * The last messages of chats opened in this session, so opening one again shows it at once while it
 * refreshes. Only in memory, never written to the phone, and kept with the moment the chat was last
 * cleared, so a chat deleted since then never shows its old messages.
 */
const recentChats = new Map<string, { hidden: string | null; list: Message[] }>();
function rememberChat(key: string, hidden: string | null, list: Message[]) {
  recentChats.delete(key);
  recentChats.set(key, { hidden, list: list.slice(-PAGE) });
  if (recentChats.size > 24) {
    const oldest = recentChats.keys().next().value;
    if (oldest !== undefined) recentChats.delete(oldest);
  }
}

/** Web addresses in a message, made tappable. */
const LINK = /\b(?:https?:\/\/|www\.)[^\s<>"]+/gi;

/** A message's words in pieces, with each web address its own piece (a full stop after one belongs to the sentence). */
function splitLinks(text: string): { text: string; link: boolean }[] {
  const out: { text: string; link: boolean }[] = [];
  let last = 0;
  for (const match of text.matchAll(LINK)) {
    const start = match.index ?? 0;
    const url = match[0].replace(/[.,!?;:'")\]}]+$/, '');
    if (!url || start < last) continue;
    if (start > last) out.push({ text: text.slice(last, start), link: false });
    out.push({ text: url, link: true });
    last = start + url.length;
  }
  if (!out.length) return [{ text, link: false }];
  if (last < text.length) out.push({ text: text.slice(last), link: false });
  return out;
}

/** Opens a link from a message in the in-app browser, or whatever the phone opens it with. */
function openLink(raw: string) {
  const url = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  WebBrowser.openBrowserAsync(url).catch(() => Linking.openURL(url).catch(() => {}));
}

/** The words of a message, with any web addresses underlined and tappable. Holding a link copies the message, as holding the bubble does. */
function Words({ text, style, onLongPress }: { text: string; style: TextStyle; onLongPress?: () => void }) {
  const parts = useMemo(() => splitLinks(text), [text]);
  if (parts.length === 1 && !parts[0].link) return <Text style={style}>{text}</Text>;
  return (
    <Text style={style}>
      {parts.map((p, i) =>
        p.link ? (
          <Text key={i} style={{ textDecorationLine: 'underline' }} onPress={() => openLink(p.text)} onLongPress={onLongPress} accessibilityRole="link">
            {p.text}
          </Text>
        ) : (
          p.text
        ),
      )}
    </Text>
  );
}

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

/** A view-once photo opened on this phone stays opened, with its address dropped, even before the server has caught up. */
function keepOpened(m: Message, openedHere: Map<string, string>): Message {
  const at = openedHere.get(m.id);
  return at ? { ...m, media_url: '', opened_at: m.opened_at ?? at } : m;
}

/**
 * The newest page of a chat (oldest first) put together with what is on screen. Older messages loaded
 * by scrolling back stay as long as they join up with the page (otherwise there could be a gap, so the
 * list starts again from the page), and so does anything newer than the page that arrived over Realtime
 * while it was on its way. `whole`: the page is the entire chat. Nothing from before `hiddenBefore`
 * (when you last cleared the chat) is kept. `unconfirmed`: messages drawn straight from Realtime that no
 * page has brought yet. One of them arriving after a stretch the phone missed (asleep, offline) doesn't
 * show that the page joins up with the older messages, so only a message an earlier page brought counts.
 */
function mergeNewest(cur: Message[], page: Message[], whole: boolean, hiddenBefore: string | null, unconfirmed: ReadonlySet<string>): Message[] {
  const cut = hiddenBefore ? new Date(hiddenBefore).getTime() : -Infinity;
  if (!page.length) {
    // Nothing on the server as this page saw it (a new chat, or one just cleared): only what Realtime has
    // brought since stays, so a first message doesn't vanish because an older, empty answer came last.
    const fresh = cur.filter((m) => unconfirmed.has(m.id) && new Date(m.created_at).getTime() > cut);
    return fresh.length ? fresh : page;
  }
  if (!cur.length) return page;
  const ids = new Set(page.map((m) => m.id));
  const first = new Date(page[0].created_at).getTime();
  const last = new Date(page[page.length - 1].created_at).getTime();
  const joined = whole || cur.some((m) => ids.has(m.id) && !unconfirmed.has(m.id));
  const before = whole || !joined ? [] : cur.filter((m) => !ids.has(m.id) && new Date(m.created_at).getTime() <= first && new Date(m.created_at).getTime() > cut);
  const after = cur.filter((m) => !ids.has(m.id) && new Date(m.created_at).getTime() > last);
  return before.length || after.length ? [...before, ...page, ...after] : page;
}

/** A message that has just arrived, put in its place by time (once only). */
function withMessage(list: Message[], m: Message): Message[] {
  if (list.some((x) => x.id === m.id)) return list;
  const at = new Date(m.created_at).getTime();
  let i = list.length;
  while (i > 0 && new Date(list[i - 1].created_at).getTime() > at) i--;
  return [...list.slice(0, i), m, ...list.slice(i)];
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
 * Turns messages (oldest first) into what the list draws: time stamps, bubbles, and photos gathered into stacks,
 * then your messages still on their way. `theirRead` is when the other person last read the chat. When the newest
 * message is yours, "Sent" goes under it, and "Seen" once they have read it (`labels` off: neither, as with Erha).
 */
function buildRows(messages: Message[], outbox: Outgoing[], me: string, theirRead: string | null, labels: boolean): Row[] {
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
  // Yours on their way come after everything the server has, in the order written. Once the server's copy is in
  // `messages` (same id) the stand-in is left out, so a message is never drawn twice.
  let waiting = outbox;
  if (outbox.length) {
    const have = new Set(messages.map((m) => m.id));
    waiting = outbox.filter((o) => !have.has(o.id));
  }
  waiting.forEach((o, i) => {
    const at = new Date(o.created_at).getTime();
    if (!prevAt || at - prevAt > 3600e3) rows.push({ key: 's' + o.id, kind: 'stamp', label: chatStamp(o.created_at) });
    prevAt = Math.max(prevAt, at);
    rows.push({ key: o.id, kind: 'out', mine: true, o, big: emojiOnly(o.text), last: i === waiting.length - 1 });
  });
  // "Sent" or "Seen" sits under the newest message only when it is yours: a reply after it says more than either.
  // A view-once photo says Delivered or Opened itself, a call note isn't a message to read, and the app's own
  // notices don't count.
  if (labels && !waiting.length) {
    let newest: Message | undefined;
    for (let i = messages.length - 1; i >= 0 && !newest; i--) if (messages[i].system !== 'screenshot') newest = messages[i];
    if (newest && newest.sender_id === me && !newest.view_once && !newest.call_url) {
      const status: Status = theirRead && atOrAfter(theirRead, newest.created_at) ? 'seen' : 'sent';
      for (let i = rows.length - 1; i >= 0; i--) {
        const r = rows[i];
        if (r.kind === 'stamp' || r.kind === 'notice') continue;
        if (r.mine) r.status = status;
        break;
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

/** The small note under your newest message: "Sending…", "Sent", "Seen", or that it didn't send. `color` is light over a wallpaper. */
function StatusLabel({ words, color }: { words: string; color: string }) {
  return (
    <Text numberOfLines={1} accessibilityLiveRegion="polite" style={{ color, fontSize: 12, alignSelf: 'flex-end', paddingTop: 3, paddingRight: 6 }}>
      {words}
    </Text>
  );
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
  const photo = (uri: string, style: object, key: string) => <Image key={key} source={{ uri }} recyclingKey={uri} style={[{ position: 'absolute', width: w, height: h, borderRadius: 18, backgroundColor: C.bg2 }, style]} contentFit="cover" transition={120} cachePolicy="memory-disk" />;
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
    setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false, shouldPlayInBackground: true })
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

/**
 * What a row can do. Each call goes to the screen's latest handler, so this object never changes and
 * the rows needn't draw again because of it.
 */
type RowActions = {
  openSnap: (m: Message) => void;
  isOpened: (id: string) => boolean;
  viewPhotos: (urls: string[]) => void;
  forward: (urls: string[]) => void;
  call: (kind: 'voice' | 'video') => void;
  copy: (text: string) => void;
  openPost: (post: Post) => void;
  send: (text: string) => void;
  ask: (f: Faq) => void;
  /** A message of yours that didn't send: try again, or take it away. */
  unsent: (o: Outgoing) => void;
};

/**
 * True when two rows draw the same. The rows are built again whenever the messages change (a new one
 * arriving, "Seen" moving), but a message that hasn't changed keeps its object, so most rows match.
 */
function sameRow(a: Row, b: Row): boolean {
  if (a === b) return true;
  if (a.key !== b.key || a.kind !== b.kind) return false;
  if (a.kind === 'stamp') return b.kind === 'stamp' && a.label === b.label;
  if (b.kind === 'stamp') return false;
  if (a.mine !== b.mine || a.status !== b.status) return false;
  if (a.kind === 'photos') return b.kind === 'photos' && a.urls.length === b.urls.length && a.urls.every((u, i) => u === b.urls[i]);
  if (b.kind === 'photos') return false;
  if (a.kind === 'out') return b.kind === 'out' && a.o === b.o && a.last === b.last;
  if (b.kind === 'out') return false;
  if (a.m !== b.m) return false;
  return a.kind !== 'text' || (b.kind === 'text' && a.big === b.big);
}

/** A post sent in the chat. Follows the post itself, so it stays as the rest of the app shows it. */
function SharedPost({ id, onOpen }: { id: string; onOpen: (post: Post) => void }) {
  const post = usePost(id);
  if (!post) {
    return (
      <View style={{ borderRadius: 18, backgroundColor: C.surface, paddingHorizontal: 13, paddingVertical: 9 }}>
        <Text style={{ color: C.fg2 }}>This post is no longer available</Text>
      </View>
    );
  }
  return (
    <Pressable onPress={() => onOpen(post)} accessibilityRole="button" accessibilityLabel={`Post by ${post.username}`} style={{ width: 210, borderRadius: 18, overflow: 'hidden', backgroundColor: C.surface }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 9 }}>
        <Avatar uri={post.avatar_url} name={post.full_name} size={24} />
        <Text numberOfLines={1} style={{ color: C.fg, fontWeight: '600', fontSize: 13, flex: 1 }}>{post.username}</Text>
      </View>
      <Image source={{ uri: thumbOf(post) }} recyclingKey={post.id} style={{ width: 210, height: 262, backgroundColor: C.bg2 }} contentFit="cover" transition={120} cachePolicy="memory-disk" />
      {post.caption ? <Text numberOfLines={2} style={{ color: C.fg2, fontSize: 13, padding: 9 }}>{post.caption}</Text> : null}
    </Pressable>
  );
}

type ChatRowProps = { r: Row; fg2: string; fg3: string; name: string; locked: boolean; isErha: boolean; actions: RowActions; t: (key: Key, vars?: Vars) => string };

/** The red mark beside a message that didn't send. */
function NotSentMark() {
  return (
    <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: C.like, alignItems: 'center', justifyContent: 'center' }}>
      <Text allowFontScaling={false} style={{ color: '#ffffff', fontSize: 13, fontWeight: '800' }}>!</Text>
    </View>
  );
}

/**
 * One row of the chat. Memoised: the screen draws again on every key typed, every quarter second while
 * recording, and whenever their typing bubble comes and goes, and none of that changes the messages.
 * `fg2`/`fg3` are the colours for words drawn straight on the background (light over a wallpaper).
 */
const ChatRow = React.memo(
  function ChatRow({ r, fg2, fg3, name, locked, isErha, actions, t }: ChatRowProps) {
    if (r.kind === 'stamp') return <Text style={{ color: fg2, fontSize: 12.5, letterSpacing: 0.2, textAlign: 'center', paddingTop: 18, paddingBottom: 10 }}>{r.label}</Text>;
    if (r.kind === 'notice') return <ScreenshotLine mine={r.mine} name={name} fg2={fg2} fg3={fg3} />;
    const align = { alignSelf: r.mine ? ('flex-end' as const) : ('flex-start' as const), maxWidth: '82%' as const };
    const seen = r.status ? <StatusLabel words={t(r.status === 'seen' ? 'chat.seen' : 'chat.sent')} color={fg3} /> : null;
    if (r.kind === 'out') {
      // Yours, before the server has it: drawn as it will be, with "Sending…" under the newest, or a red mark to try again.
      const o = r.o;
      const failed = o.state === 'failed';
      // With Erha nothing is ever labelled "Sent" (see buildRows), so hers would flash it for a moment and go.
      const note = failed ? t('chat.notSent') : !r.last ? '' : o.state === 'sending' ? t('chat.sending') : isErha ? '' : t('chat.sent');
      return (
        <>
          <Pressable
            onPress={failed ? () => actions.unsent(o) : undefined}
            onLongPress={() => actions.copy(o.text)}
            delayLongPress={350}
            accessibilityRole={failed ? 'button' : undefined}
            accessibilityLabel={failed ? `${o.text}. ${t('chat.notSent')}` : undefined}
            style={[align, { flexDirection: 'row', alignItems: 'center', gap: 8 }]}>
            {failed ? <NotSentMark /> : null}
            <View style={{ flexShrink: 1 }}>
              {r.big ? (
                <Text style={{ fontSize: 44, lineHeight: 54 }}>{o.text}</Text>
              ) : (
                <Bubble mine>
                  <Words text={o.text} style={{ color: '#fff', fontSize: 17, lineHeight: 23 }} onLongPress={() => actions.copy(o.text)} />
                </Bubble>
              )}
            </View>
          </Pressable>
          {note ? <StatusLabel words={note} color={failed ? C.like : fg3} /> : null}
        </>
      );
    }
    if (r.kind === 'snap') {
      // The sender's own bubble says Delivered or Opened, so "Seen" would only repeat it.
      const opened = !!r.m.opened_at || actions.isOpened(r.m.id);
      return (
        <View style={[align, { paddingVertical: 2 }]}>
          <SnapBubble mine={r.mine} opened={opened} onOpen={() => actions.openSnap(r.m)} />
        </View>
      );
    }
    if (r.kind === 'photos') {
      return (
        <>
          <View style={[align, { maxWidth: '100%', paddingVertical: 4 }]}>
            <PhotoStack urls={r.urls} mine={r.mine} onOpen={() => actions.viewPhotos(r.urls)} onForward={() => actions.forward(r.urls)} />
          </View>
          {seen}
        </>
      );
    }
    if (r.kind === 'voice') {
      return (
        <>
          <View style={align}><VoiceBubble m={r.m} mine={r.mine} locked={locked} /></View>
          {seen}
        </>
      );
    }
    if (r.kind === 'call') {
      const kind = r.m.call_kind === 'video' ? 'video' : 'voice';
      return (
        <>
          <View style={align}><CallCard m={r.m} mine={r.mine} onCall={isErha ? undefined : () => actions.call(kind)} /></View>
          {seen}
        </>
      );
    }
    if (r.kind === 'post') {
      return (
        <>
          <View style={align}>
            <SharedPost id={r.m.post_id ?? ''} onOpen={actions.openPost} />
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
        <Pressable style={align} onLongPress={() => actions.copy(r.m.text)} delayLongPress={350} accessibilityHint="Touch and hold to copy">
          <Bubble mine={r.mine}>
            <Words text={r.m.text} style={{ color: r.mine ? '#fff' : C.fg, fontSize: 17, lineHeight: 23 }} onLongPress={() => actions.copy(r.m.text)} />
          </Bubble>
        </Pressable>
        {seen}
      </>
    );
  },
  (a, b) => sameRow(a.r, b.r) && a.fg2 === b.fg2 && a.fg3 === b.fg3 && a.name === b.name && a.locked === b.locked && a.isErha === b.isErha && a.actions === b.actions && a.t === b.t,
);

const keyOfRow = (r: Row) => r.key;
const LIST_STYLE = { flex: 1 };
const LIST_CONTENT = { paddingHorizontal: 12, paddingVertical: 12, gap: 4 };

/** How far back from the newest message (in points) the button to jump back down appears. */
const AWAY_PX = 360;

export default function Chat() {
  // `draft` starts the message box with some words, e.g. a quoted note when replying to one (src/components/NotesRow.tsx).
  const { id, draft } = useLocalSearchParams<{ id: string; draft?: string }>();
  const threadId = String(id);
  const { me, profile } = useSession();
  // What this phone keeps for the chat (messages on their way, the last ones shown) belongs to this account only.
  const outKey = `${me}:${threadId}`;
  const prefs = usePrefs();
  const calls = useCalls();
  const router = useRouter();
  const toast = useToast();
  // The reasons for a report: an alert on iPhone, a sheet on Android (whose alerts hold only three buttons).
  const choices = useChoices();
  const insets = useSafeAreaInsets();
  const font = useAppFont();
  const fontBold = useAppFont('bold');
  const t = useT();
  const { width, height } = useWindowDimensions();
  // A chat listed in Messages has its card already, and one opened before in this session its last
  // messages too: it shows at once and refreshes behind. Old messages only while the chat hasn't been
  // cleared since they were kept.
  const [seed] = useState(() => {
    const listed = peekCache<Thread[]>(cacheKey(me, 'threads'))?.find((x) => x.id === threadId) ?? null;
    const kept = recentChats.get(outKey);
    return { thread: listed, list: listed && kept && kept.hidden === listed.hidden_before ? kept.list : null };
  });
  const [thread, setThread] = useState<Thread | null>(seed.thread);
  const [messages, setMessages] = useState<Message[]>(() => seed.list ?? []);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error' | 'missing'>(() => (seed.list ? 'ready' : 'loading'));
  const [error, setError] = useState('');
  // Yours on their way (shared with any other copy of this chat that is open).
  const outbox = useOutbox(outKey);
  // Scrolling back: 'more' while there may be older messages, 'loading' while they come, 'done' at the start of the chat.
  const [olderState, setOlderState] = useState<'more' | 'loading' | 'done'>('more');
  const olderBusy = useRef(false);
  const olderDone = useRef(false);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  // Messages drawn straight from Realtime that no fetched page has brought yet (see mergeNewest).
  const unconfirmed = useRef(new Set<string>());
  // Scrolled back from the newest message: the button down shows, with a dot if they wrote meanwhile.
  const listRef = useRef<FlatList<Row>>(null);
  const [away, setAway] = useState(false);
  const awayRef = useRef(false);
  const [missed, setMissed] = useState(false);
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
  // Pod leaves the sound's setup alone while this screen records (src/lib/player.tsx markRecording).
  const podHeld = useRef(false);
  const holdPodAudio = useCallback((on: boolean) => {
    if (podHeld.current === on) return;
    podHeld.current = on;
    markRecording(on);
  }, []);
  useEffect(
    () => () => {
      if (podHeld.current) {
        podHeld.current = false;
        markRecording(false);
      }
    },
    [],
  );
  // The other person: when they last read the chat, and whether they are typing right now.
  const them = useRef('');
  const [theirRead, setTheirRead] = useState<string | null>(null);
  const [theirTyping, setTheirTyping] = useState(false);
  // Erha is answering (as many answers as are on their way): her orb shows until the reply lands in the chat.
  const [erhaWaiting, setErhaWaiting] = useState(0);
  const erhaThinking = erhaWaiting > 0;
  const typingRoom = useRef<Channel | null>(null);
  const typingHide = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingSentAt = useRef(0);
  const typingTold = useRef(false);
  const lastTheirs = useRef('');
  // You and they follow each other (null until their card has loaded), for explaining a refused message.
  const mutual = useRef<boolean | null>(null);
  // You have restricted them: your typing isn't sent to them (they can't see when you're active).
  const restrictedThem = useRef(false);
  // A message request being accepted, deleted or blocked: one answer at a time.
  const [answering, setAnswering] = useState(false);
  const acceptedHere = useRef(false);
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
    if (restrictedThem.current) return;
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

  function changeText(next: string) {
    setText(next);
    if (next.trim()) tellTyping();
    else tellStopped();
  }

  /**
   * Fetches the newest messages and puts them together with what is on screen: older ones loaded by
   * scrolling back stay, and so do any newer ones that arrived over Realtime while this was on its way.
   */
  const load = useCallback(async () => {
    if (!ready.current) return;
    const mine = ++asked.current;
    try {
      const page = (await fetchMessages(threadId, hidden.current, { limit: PAGE })).map((m) => keepOpened(m, openedHere.current));
      // A slow, older answer must not replace a newer one (a message you just sent would vanish for a moment).
      if (mine < shown.current) return;
      shown.current = mine;
      const whole = page.length < PAGE;
      const cut = hidden.current;
      // Judged by what was unconfirmed before this page; from now on the page vouches for its own messages.
      const pending = new Set(unconfirmed.current);
      for (const m of page) unconfirmed.current.delete(m.id);
      // Messages that haven't changed keep the objects already on screen (and an unchanged chat keeps
      // its list), so the refresh every few seconds only draws what is new.
      setMessages((cur) => keepSame(cur, mergeNewest(cur, page, whole, cut, pending)));
      // Fewer than a page: that is the whole chat. A page that doesn't join up with what was here starts it again.
      if (whole) olderDone.current = true;
      else {
        const ids = new Set(page.map((p) => p.id));
        if (!messagesRef.current.some((m) => ids.has(m.id) && !pending.has(m.id))) olderDone.current = false;
      }
      if (!olderBusy.current) setOlderState(olderDone.current ? 'done' : 'more');
      setStatus((s) => (s === 'missing' ? s : 'ready'));
      const theirs = [...page].reverse().find((m) => m.sender_id !== me);
      // Their message has arrived, so the typing bubble has done its job.
      if (theirs && theirs.id !== lastTheirs.current) {
        // Scrolled back while it came: a dot on the button down.
        if (lastTheirs.current && awayRef.current) setMissed(true);
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

  // A burst of live changes (a message, then its read marker) brings one refresh, not several.
  const soon = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadSoon = useCallback(() => {
    if (soon.current) return;
    soon.current = setTimeout(() => {
      soon.current = null;
      load();
    }, 300);
  }, [load]);
  useEffect(
    () => () => {
      if (soon.current) clearTimeout(soon.current);
      soon.current = null;
    },
    [],
  );

  /** Scrolling back to the start of the chat: the messages before the oldest one shown. */
  const loadOlder = useCallback(async () => {
    if (!ready.current || olderBusy.current || olderDone.current) return;
    const oldest = messagesRef.current[0];
    if (!oldest) return;
    olderBusy.current = true;
    setOlderState('loading');
    try {
      const page = (await fetchMessages(threadId, hidden.current, { before: oldest.created_at, limit: PAGE })).map((m) => keepOpened(m, openedHere.current));
      if (page.length < PAGE) olderDone.current = true;
      // Only onto the same oldest message: a refresh may have started the list again from the newest meanwhile.
      setMessages((cur) => {
        if (cur[0]?.id !== oldest.id) return cur;
        const have = new Set(cur.map((m) => m.id));
        const add = page.filter((m) => !have.has(m.id));
        return add.length ? [...add, ...cur] : cur;
      });
    } catch {
      // Tried again on the next scroll back.
    } finally {
      olderBusy.current = false;
      setOlderState(olderDone.current ? 'done' : 'more');
    }
  }, [threadId]);

  useEffect(() => {
    let live = true;
    ready.current = false;
    // Listed in Messages: the chat's card is already here, so its messages can load straight away.
    const listed = seed.thread && seed.thread.id === threadId ? seed.thread : null;
    if (listed) {
      hidden.current = listed.hidden_before;
      them.current = listed.other_id;
      ready.current = true;
      load();
    }
    (async () => {
      try {
        // With a deadline: nothing else asks for the chat's card again, so a request that never answers
        // would otherwise leave the chat loading for good. Running out offers Try again.
        const card = await withTimeout(fetchThread(threadId));
        if (!live) return;
        if (!card) {
          setStatus('missing');
          return;
        }
        setThread(card);
        // Cleared on another phone since the list was saved: what is shown is fetched again from then.
        const cleared = ready.current && hidden.current !== card.hidden_before;
        const first = !ready.current;
        hidden.current = card.hidden_before;
        them.current = card.other_id;
        ready.current = true;
        if (first || cleared) load();
        if (!quietRef.current) markThreadRead(me, threadId);
        refreshTheirRead();
        // Creators can offer ready-made questions at the top of the chat.
        getProfile(card.other_id)
          .then((p) => {
            mutual.current = p ? p.is_following && p.follows_me : null;
            // On someone else's card, `restricted` says whether I have restricted them.
            restrictedThem.current = p?.restricted === true;
            return p && p.faq_enabled ? fetchFaqs(p.id) : [];
          })
          .then((f) => { if (live) setFaqs(f); })
          .catch(() => {});
      } catch (e) {
        if (live) {
          setError(errText(e));
          // Already showing the chat (from the Messages list): keep it there and keep refreshing.
          setStatus((s) => (s === 'ready' ? s : 'error'));
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
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'community_messages', filter: `thread_id=eq.${threadId}` }, (payload) => {
            // Drawn at once, without waiting for a refresh; a shared post waits for its card, which the refresh brings.
            const m = payload.new as Message | undefined;
            if (live && m?.id && m.thread_id === threadId && !m.post_id) {
              // Not yet vouched for by a page: the refresh below confirms it (see mergeNewest).
              if (!messagesRef.current.some((x) => x.id === m.id)) unconfirmed.current.add(m.id);
              setMessages((cur) => withMessage(cur, m));
            }
            loadSoon();
          })
          // Changes to a message, above all a view-once photo being opened: the sender's "Delivered" turns to "Opened".
          .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'community_messages', filter: `thread_id=eq.${threadId}` }, () => { loadSoon(); })
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
  }, [threadId, me, load, loadSoon, attempt, refreshTheirRead, noteTheirRead, seed]);

  // What is on screen is kept for opening the chat again; a server copy of yours takes its stand-in's place.
  useEffect(() => {
    if (status === 'ready' && ready.current) rememberChat(outKey, hidden.current, messages);
  }, [messages, status, outKey]);
  useEffect(() => {
    if (!outbox.length || !messages.length) return;
    const have = new Set(messages.map((m) => m.id));
    if (outbox.some((o) => have.has(o.id))) changeOutbox(outKey, (list) => list.filter((o) => !have.has(o.id)));
  }, [messages, outbox, outKey]);

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
  const focusedBefore = useRef(false);
  useFocusEffect(
    useCallback(() => {
      front.current = true;
      // The first time, the chat is already loading.
      if (focusedBefore.current) load();
      focusedBefore.current = true;
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
        .then((card) => {
          // A request accepted here stays accepted, even if this answer was asked for just before.
          if (live && card) setThread((cur) => (cur ? { ...cur, active_at: card.active_at, other_plus: card.other_plus, streak: card.streak, request: acceptedHere.current ? false : card.request } : cur));
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
          const card = threadRef.current;
          if (!card || !card.other_plus || card.other_id === ERHA_ID || card.other_id === me) return;
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

  // The message box sits just above the keyboard, and above the home indicator without it. Android only says once it has moved.
  useEffect(() => {
    const up = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setKeyboardUp(true));
    const down = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboardUp(false));
    return () => {
      up.remove();
      down.remove();
    };
  }, []);

  /* ----- scrolling ----- */

  /** Back down to the newest message. */
  const jumpToNewest = useCallback(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, []);

  // The list is upside down: how far it has been scrolled is how far back from the newest message you are.
  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const far = e.nativeEvent.contentOffset.y > AWAY_PX;
    if (far === awayRef.current) return;
    awayRef.current = far;
    setAway(far);
    if (!far) setMissed(false);
  }, []);

  // Leave the microphone off when the screen closes.
  useEffect(
    () => () => {
      setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true, shouldPlayInBackground: true }).catch(() => {});
    },
    [],
  );

  /** This chat is with Erha, the church assistant: text and emoji only, and she answers in the thread. */
  const isErha = thread?.other_id === ERHA_ID;
  /** A message request: Accept, Delete and Block take the message box's place until it is answered. */
  const isRequest = !!thread?.request && !isErha;

  /**
   * Erha answers inside this chat: the function puts her reply in the thread as a normal message, so
   * Realtime (or the next refresh) shows it. Her orb stays up until it has landed.
   */
  async function askErha(words: string) {
    setErhaWaiting((n) => n + 1);
    try {
      await askErhaInThread(threadId, words);
    } catch (e) {
      toast(errText(e));
    } finally {
      setErhaWaiting((n) => Math.max(0, n - 1));
      load();
    }
  }

  /** Sends a text message that is already showing in the chat. Marked sent, or not sent with the reason in a toast. */
  function deliver(item: Outgoing) {
    const toErha = isErha;
    inLine(outKey, async () => {
      try {
        // A deadline, so one send that never answers can't hold the ones after it. If it lands late after all,
        // the server's copy (same id) simply takes the place of the one marked not sent.
        await withTimeout(sendMessage(me, threadId, { id: item.id, text: item.text }), 20000);
      } catch (e) {
        // Already there: an earlier try reached the server, and only its answer was lost on the way back.
        if ((e as { code?: string } | null)?.code !== '23505') throw new Error(sendFailure(e, mutual.current, suspended.current));
      }
    })
      .then(() => {
        markOutgoing(outKey, item.id, 'sent');
        load();
        // Your message is in the chat; now Erha reads it and answers.
        if (toErha) askErha(item.text);
      })
      .catch((e) => {
        markOutgoing(outKey, item.id, 'failed');
        toast(errText(e));
      });
  }

  /** A text message: in the chat the moment you press Send, and on its way behind. */
  function sendText(words: string) {
    const body = words.trim().slice(0, 5000);
    if (!body) return;
    tap();
    tellStopped();
    const item: Outgoing = { id: Crypto.randomUUID(), text: body, created_at: new Date().toISOString(), state: 'sending' };
    changeOutbox(outKey, (list) => [...list, item]);
    if (awayRef.current) jumpToNewest();
    deliver(item);
  }

  /*
   * Send gives way to the bar's icons as soon as the box is empty, so the second tap of a quick double tap
   * on Send would land on one of them (the More sheet, the microphone). For a moment after sending they
   * don't answer.
   */
  const sentAt = useRef(0);
  const notJustSent = (fn: () => void) => () => {
    if (Date.now() - sentAt.current < 450) return;
    fn();
  };

  /** A message that didn't send: try it again (same message, so it can't arrive twice), or take it away. */
  function unsent(o: Outgoing) {
    Alert.alert(t('chat.notSentTitle'), undefined, [
      {
        text: t('common.tryAgain'),
        onPress: () => {
          markOutgoing(outKey, o.id, 'sending');
          deliver(o);
        },
      },
      { text: t('common.delete'), style: 'destructive', onPress: () => changeOutbox(outKey, (list) => list.filter((x) => x.id !== o.id)) },
      { text: t('common.cancel'), style: 'cancel' },
    ]);
  }

  /* ----- calls ----- */

  /** Rings the other person in the app's own call screen; the call is noted in this chat afterwards. */
  function call(kind: 'voice' | 'video') {
    if (!thread || calls.inCall || recording) return;
    pauseVoice();
    // Their name and face are already here, so the call screen shows them from the first moment.
    const known = { id: thread.other_id, username: thread.username, full_name: thread.full_name, avatar_url: thread.avatar_url, verified: thread.verified };
    calls.startCall(thread.other_id, kind, threadId, known).catch((e) => toast(errText(e)));
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
    if (awayRef.current) jumpToNewest();
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
      holdPodAudio(true);
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true, shouldPlayInBackground: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      micOn.current = true;
      stopping.current = false;
      setRecordedMs(0);
      setTray(false);
      setRecording(true);
    } catch (e) {
      // Do not leave the phone in recording mode when the recording never started.
      setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true, shouldPlayInBackground: true }).catch(() => {});
      holdPodAudio(false);
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
        await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true, shouldPlayInBackground: true }).catch(() => {});
        holdPodAudio(false);
        const uri = recorder.uri;
        if (!keep) return;
        if (!uri || ms < 800) {
          toast('That was too short. Record a little longer.');
          return;
        }
        setSending(true);
        tap();
        if (awayRef.current) jumpToNewest();
        const url = await uploadAudio(me, uri);
        await explained(sendMessage(me, threadId, { audio_url: url, audio_seconds: Math.max(1, Math.round(ms / 1000)) }), mutual.current, suspended.current);
        await load();
      } catch (e) {
        holdPodAudio(false);
        if (keep) toast(errText(e));
      } finally {
        setSending(false);
      }
    },
    [recorder, me, threadId, load, toast, jumpToNewest],
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
    const tick = setInterval(() => {
      try {
        const ms = recorder.getStatus().durationMillis;
        setRecordedMs(ms);
        if (ms >= VOICE_LIMIT_MS) stopRecording(true);
      } catch {
        // the recorder was released
      }
    }, 250);
    return () => clearInterval(tick);
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

  /** Off this screen: back where you came from, or to Messages when there is nothing behind it. */
  const leave = () => (router.canGoBack() ? router.back() : router.replace('/inbox'));

  function removeChat() {
    Alert.alert(t('inbox.deleteQuestion'), t('inbox.deleteBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () => {
          hideThread(threadId)
            .then(() => {
              // Nothing of the old chat may show if it is opened again, not even a message still on its way.
              recentChats.delete(outKey);
              changeOutbox(outKey, () => NO_OUTGOING);
              toast(t('chat.deleted'));
              leave();
            })
            .catch((e) => toast(errText(e)));
        },
      },
    ]);
  }

  function block() {
    if (!thread) return;
    Alert.alert(`Block ${thread.username}?`, 'You will stop seeing their posts, stories and comments. They are not told.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Block', style: 'destructive', onPress: () => { setBlock(me, thread.other_id, true).then(() => { toast(`Blocked ${thread.username}`); leave(); }).catch((e) => toast(errText(e))); } },
    ]);
  }

  /** Accepts their message request: the chat moves into Messages, the message box appears, and they can see "Seen". */
  async function acceptRequest() {
    if (answering) return;
    setAnswering(true);
    tap('medium');
    try {
      await acceptMessageRequest(threadId);
      acceptedHere.current = true;
      setThread((cur) => (cur ? { ...cur, request: false } : cur));
      // Read now, so "Seen" is right for them from the start (unless reading quietly).
      if (!quietRef.current) markThreadRead(me, threadId);
    } catch (e) {
      toast(errText(e));
    } finally {
      setAnswering(false);
    }
  }

  /** Deletes their message request, for you only: a new message from them brings it back as a request. */
  function deleteRequest() {
    if (answering) return;
    Alert.alert(t('requests.deleteQuestion'), undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () => {
          setAnswering(true);
          deleteMessageRequest(threadId)
            .then(() => {
              // Nothing of it may show if the chat is opened again.
              recentChats.delete(outKey);
              changeOutbox(outKey, () => NO_OUTGOING);
              toast(t('requests.deleted'));
              leave();
            })
            .catch((e) => toast(errText(e)))
            .finally(() => setAnswering(false));
        },
      },
    ]);
  }

  function reportThem() {
    if (!thread) return;
    choices.ask({
      title: 'Report this account',
      message: 'Why are you reporting it?',
      icon: 'flag',
      choices: ['Spam', 'Harassment or hate', 'Pretending to be someone else', 'Something else'].map((r) => ({ label: r, onPress: () => { report(me, { userId: thread.other_id }, r).then(() => toast('Thanks. We will review this account.')).catch((e) => toast(errText(e))); } })),
    });
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

  // The rows reach the screen's handlers through this, so the list's rows never need new ones.
  const latest = useRef<RowActions>(null as unknown as RowActions);
  latest.current = {
    openSnap,
    isOpened: (mid) => openedHere.current.has(mid),
    viewPhotos: (urls) => setViewer({ urls, at: 0, note: '' }),
    forward,
    call,
    copy: (words) => { Clipboard.setStringAsync(words).then(() => { tap(); toast(t('chat.copied')); }).catch(() => {}); },
    openPost: (post) => router.push(post.kind === 'reel' ? `/watch/${post.id}` : `/post/${post.id}`),
    send: sendText,
    ask,
    unsent,
  };
  const actions = useMemo<RowActions>(
    () => ({
      openSnap: (m) => latest.current.openSnap(m),
      isOpened: (mid) => latest.current.isOpened(mid),
      viewPhotos: (urls) => latest.current.viewPhotos(urls),
      forward: (urls) => latest.current.forward(urls),
      call: (kind) => latest.current.call(kind),
      copy: (words) => latest.current.copy(words),
      openPost: (post) => latest.current.openPost(post),
      send: (words) => latest.current.send(words),
      ask: (f) => latest.current.ask(f),
      unsent: (o) => latest.current.unsent(o),
    }),
    [],
  );

  // Erha never reads a chat, so nothing of yours is ever marked "Sent" or "Seen" there.
  const rows = useMemo(() => buildRows(messages, outbox, me, theirRead, !isErha).reverse(), [messages, outbox, me, theirRead, isErha]);
  const typing = text.trim().length > 0;
  const showFaqs = faqs.length > 0 && !!thread && thread.other_id !== me && !isRequest;
  const showTyping = theirTyping || (isErha && erhaThinking);
  // Plus: the chosen look behind the messages. Bubbles stay as they are.
  const wallpaper = profile?.plus && prefs.chatWallpaper ? wallpaperById(prefs.chatWallpaper) : null;
  // The wallpapers are all dark, so words drawn straight on one (times, "Seen") stay light whatever the theme.
  const onWall = wallpaper ? DARK : C;
  const callsOff = calls.inCall || recording;

  /*
   * Everything the list is handed stays the same object until what it shows changes, so typing a
   * message, the recording clock and the typing bubble draw the screen again without drawing the list.
   */
  const wallFg2 = onWall.fg2;
  const wallFg3 = onWall.fg3;
  const theirName = thread?.full_name || thread?.username || 'They';
  const renderRow = useCallback(
    ({ item }: { item: Row }) => <ChatRow r={item} fg2={wallFg2} fg3={wallFg3} name={theirName} locked={item.kind === 'voice' && recording} isErha={isErha} actions={actions} t={t} />,
    [wallFg2, wallFg3, theirName, recording, isErha, actions, t],
  );
  const openProfile = useCallback(() => {
    if (thread) router.push(`/user/${thread.other_id}`);
  }, [thread, router]);
  const typingName = theirName;
  // The list is upside down, so its header sits at the bottom: their typing bubble goes under the newest message.
  const listHeader = useMemo(
    () =>
      isErha && erhaThinking ? (
        // Erha is working on her answer: her living orb as the last row of the chat.
        // Over a wallpaper it sits on a soft card, so the words stay readable on the dark picture.
        <View style={[{ alignSelf: 'flex-start', paddingTop: 6, paddingLeft: 4 }, wallpaper ? { paddingLeft: 12, paddingRight: 14, paddingTop: 4, paddingBottom: 4, marginTop: 4, borderRadius: 18, backgroundColor: C.surface2 } : null]} accessibilityLiveRegion="polite">
          <AssistantThinking name="Erha" />
        </View>
      ) : showTyping ? (
        <View style={{ alignSelf: 'flex-start', paddingTop: 4 }} accessibilityLabel={`${typingName} is typing`} accessibilityLiveRegion="polite">
          <Bubble mine={false}>
            <TypingDots />
          </Bubble>
        </View>
      ) : null,
    [isErha, erhaThinking, showTyping, wallpaper, typingName],
  );
  // The list is upside down, so its footer sits at the top: older messages on their way, then (at the very
  // start of the chat) the questions a creator offers.
  const listFooter = useMemo(
    () =>
      olderState === 'loading' ? (
        <View style={{ paddingVertical: 16 }}>
          <ActivityIndicator color={onWall.fg2} />
        </View>
      ) : showFaqs && olderState === 'done' ? (
        <View style={{ alignItems: 'center', paddingVertical: 14, gap: 8 }}>
          <Text style={{ color: onWall.fg2, fontSize: 13.5 }}>Frequently asked questions</Text>
          {faqs.map((f) => (
            <Pressable key={f.id} onPress={() => actions.ask(f)} disabled={sending} accessibilityRole="button" accessibilityLabel={`Ask: ${f.question}`} style={({ pressed }) => ({ maxWidth: '88%', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, borderWidth: 1, borderColor: onWall.surface2, backgroundColor: pressed ? onWall.surface : 'transparent' })}>
              <Text style={{ color: onWall.fg, fontSize: 15.5, textAlign: 'center' }}>{f.question}</Text>
            </Pressable>
          ))}
        </View>
      ) : null,
    [olderState, showFaqs, faqs, onWall, sending, actions],
  );
  const listEmpty = useMemo(
    () => (
      // The list is upside down, so the empty state is flipped back the right way up.
      <View style={{ transform: [{ scaleY: -1 }] }}>
        {isErha ? (
          <View style={{ alignItems: 'center', paddingHorizontal: 16, paddingVertical: 28, gap: 12 }}>
            {thread?.avatar_url ? <Avatar uri={thread.avatar_url} name="Erha" size={72} /> : <ErhaAvatar size={72} />}
            <Text style={{ color: onWall.fg, fontSize: 21, fontWeight: '800', fontFamily: fontBold }}>Hi, I'm Erha</Text>
            <View style={{ gap: 8, alignSelf: 'stretch', marginTop: 6 }}>
              {ERHA_OPENERS.map((o) => (
                <Pressable key={o} onPress={() => actions.send(o)} accessibilityRole="button" accessibilityLabel={`Ask: ${o}`} style={({ pressed }) => ({ paddingHorizontal: 14, paddingVertical: 12, borderRadius: 14, backgroundColor: pressed ? C.surface2 : C.surface })}>
                  <Text style={{ color: C.fg, fontSize: 15.5, fontFamily: font }}>{o}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : thread ? (
          // A new chat starts with who it is with, as on Instagram: their face, name and a way to their profile.
          // Over a wallpaper the words are light, to read on the dark picture.
          <View style={{ alignItems: 'center', paddingHorizontal: 24, paddingVertical: 32 }}>
            <Avatar uri={thread.avatar_url} name={thread.full_name || thread.username} size={88} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 12, maxWidth: '100%' }}>
              <Text numberOfLines={1} style={{ color: onWall.fg, fontSize: 19, fontWeight: '700', flexShrink: 1, fontFamily: fontBold }}>{thread.full_name || thread.username}</Text>
              {thread.verified ? <VerifiedTick size={16} /> : null}
            </View>
            <Text numberOfLines={1} style={{ color: onWall.fg2, fontSize: 14, marginTop: 2, fontFamily: font }}>{thread.username}</Text>
            <Button small kind="ghost" label={t('chat.viewProfile')} onPress={openProfile} style={{ marginTop: 14 }} />
          </View>
        ) : null}
      </View>
    ),
    [isErha, thread, onWall, font, fontBold, actions, openProfile, t],
  );

  return (
    <Screen>
      <View style={{ height: 60, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, gap: 8 }}>
        <RoundButton name="back" label="Back" onPress={leave} />
        {thread ? (
          <Pressable onPress={openProfile} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, opacity: pressed ? 0.7 : 1 })} accessibilityRole="button" accessibilityLabel={`Open ${thread.full_name || thread.username}'s profile`}>
            {isErha && !thread.avatar_url ? <ErhaAvatar size={40} /> : <Avatar uri={thread.avatar_url} name={thread.full_name || thread.username} size={40} online={!isErha && isOnline(thread.active_at)} />}
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <Text numberOfLines={1} style={{ color: C.fg, fontSize: 18, fontWeight: '700', flexShrink: 1 }}>{thread.full_name || thread.username}</Text>
                {thread.verified ? <VerifiedTick size={16} /> : null}
                {(thread.streak ?? 0) >= STREAK_FROM ? (
                  <Pressable onPress={() => toast(t('inbox.streakToast', { days: thread.streak }))} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('inbox.streak', { days: thread.streak })} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 2, opacity: pressed ? 0.6 : 1 })}>
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
        {thread && status === 'ready' && !isErha && !isRequest ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', opacity: callsOff ? 0.4 : 1 }} accessibilityState={{ disabled: callsOff }}>
            <IconButton name="phone" size={26} label="Voice call" onPress={() => call('voice')} />
            <IconButton name="video" size={26} label="Video call" onPress={() => call('video')} />
          </View>
        ) : null}
        {thread ? <RoundButton name="info" label="Chat options" onPress={() => setSheet('options')} /> : null}
      </View>
      {quiet && thread && !isErha ? (
        // A state, not a button: Read quietly is on (Settings), so nothing here marks the chat read.
        <View accessible accessibilityLabel="Reading quietly" style={{ alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 3, marginBottom: 4, borderRadius: 11, backgroundColor: C.surface }}>
          <Icon name="eye" size={13} color={C.fg2} weight={2} />
          <Text style={{ color: C.fg2, fontSize: 12, fontWeight: '600' }}>Reading quietly</Text>
        </View>
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
              ref={listRef}
              data={rows}
              inverted
              keyExtractor={keyOfRow}
              style={LIST_STYLE}
              contentContainerStyle={LIST_CONTENT}
              // A tap on the messages (not on a bubble) puts the keyboard away, and so does dragging them.
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              renderItem={renderRow}
              ListHeaderComponent={listHeader}
              ListFooterComponent={listFooter}
              ListEmptyComponent={listEmpty}
              onEndReached={loadOlder}
              onEndReachedThreshold={0.5}
              onScroll={onScroll}
              scrollEventThrottle={64}
              initialNumToRender={18}
              maxToRenderPerBatch={12}
              windowSize={15}
            />
            {away ? (
              <Pressable
                onPress={() => { tap('select'); jumpToNewest(); }}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel={t('chat.toNewest')}
                style={({ pressed }) => ({ position: 'absolute', right: 14, bottom: 10, width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: C.sheet, borderWidth: StyleSheet.hairlineWidth, borderColor: C.hairline, opacity: pressed ? 0.7 : 1, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 3 })}>
                <Icon name="down" size={22} weight={2.2} />
                {missed ? <View style={{ position: 'absolute', top: 1, right: 1, width: 11, height: 11, borderRadius: 6, backgroundColor: C.accent, borderWidth: 2, borderColor: C.sheet }} /> : null}
              </Pressable>
            ) : null}
          </View>
        )}

        {status === 'ready' && isRequest ? (
          // A message request, as on Instagram: Block, Delete and Accept where the message box would be.
          <View style={{ flexDirection: 'row', marginTop: 6, paddingBottom: Math.max(insets.bottom, 8), borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.line, opacity: answering ? 0.5 : 1 }}>
            {[
              { key: 'block', label: t('profile.block'), color: C.like, onPress: block },
              { key: 'delete', label: t('common.delete'), color: C.like, onPress: deleteRequest },
              { key: 'accept', label: t('common.accept'), color: C.accent2, onPress: acceptRequest },
            ].map((b, i) => (
              <Pressable
                key={b.key}
                onPress={b.onPress}
                disabled={answering}
                accessibilityRole="button"
                accessibilityLabel={b.label}
                accessibilityState={{ disabled: answering }}
                style={({ pressed }) => ({ flex: 1, height: 54, alignItems: 'center', justifyContent: 'center', borderLeftWidth: i ? StyleSheet.hairlineWidth : 0, borderLeftColor: C.line, opacity: pressed ? 0.55 : 1 })}>
                <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={{ color: b.color, fontSize: 16.5, fontWeight: b.key === 'accept' ? '700' : '600' }}>{b.label}</Text>
              </Pressable>
            ))}
          </View>
        ) : status === 'ready' ? (
          <View style={{ marginHorizontal: 10, marginTop: 6, marginBottom: keyboardUp ? 8 : Math.max(insets.bottom, 8) + 4 }}>
            {tray ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="always" contentContainerStyle={{ gap: 6, paddingHorizontal: 6, paddingBottom: 8 }}>
                {QUICK.map((e) => (
                  <Pressable key={e} onPress={() => sendText(e)} accessibilityRole="button" accessibilityLabel={`Send ${e}`} style={({ pressed }) => ({ width: 46, height: 46, borderRadius: 23, backgroundColor: C.inputBar, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1, transform: [{ scale: pressed ? 0.92 : 1 }] })}>
                    <Text style={{ fontSize: 26 }}>{e}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            ) : null}
            {pending && !recording ? (
              // Photos waiting to be sent: choose view once (the "1") or keep them in the chat, then Send.
              <View style={{ marginBottom: 6, padding: 8, borderRadius: 22, backgroundColor: C.inputBar }}>
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
                  // The message shows in the chat at once and goes behind, so the box is free for the next one straight away.
                  <Pressable
                    onPress={() => {
                      sentAt.current = Date.now();
                      sendText(text);
                      setText('');
                    }}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={t('common.send')}
                    style={({ pressed }) => ({ paddingHorizontal: 10, height: 52, justifyContent: 'center', opacity: pressed ? 0.5 : 1 })}>
                    <Text style={{ color: C.accent2, fontWeight: '700', fontSize: 16.5 }}>{t('common.send')}</Text>
                  </Pressable>
                ) : (
                  <View style={{ flexDirection: 'row', alignItems: 'center', height: 52 }}>
                    {isErha ? null : <BarIcon name="mic" label="Record a voice message" onPress={notJustSent(startRecording)} disabled={sending} />}
                    {isErha ? null : <BarIcon name="image" label="Send photos" onPress={notJustSent(() => pickPhotos(false))} disabled={sending} />}
                    <BarIcon name="chatdots" label={tray ? 'Hide quick reactions' : 'Quick reactions'} onPress={notJustSent(() => setTray(!tray))} />
                    <BarIcon name="pluscircle" label="More" onPress={notJustSent(openMore)} />
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
          <Text style={{ color: C.fg2, textAlign: 'center', paddingHorizontal: 28, paddingBottom: 14 }}>{t('chat.noSavedReplies')}</Text>
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
        <SheetRow first icon="user" label="View profile" onPress={after(openProfile)} />
        <SheetRow
          icon={thread?.muted ? 'sound' : 'mute'}
          label={thread?.muted ? t('inbox.unmute') : t('inbox.mute')}
          onPress={after(() => {
            if (!thread) return;
            const next = !thread.muted;
            // Shown at once; put back if the server says no.
            setThread((cur) => (cur ? { ...cur, muted: next } : cur));
            setThreadMuted(me, threadId, next)
              .then(() => toast(next ? 'Messages muted' : 'Messages unmuted'))
              .catch((e) => {
                setThread((cur) => (cur ? { ...cur, muted: !next } : cur));
                toast(errText(e));
              });
          })}
        />
        {/* Chat wallpapers are a Plus perk: the crown says so without words. */}
        <SheetRow icon="wallpaper" label="Chat wallpaper" onPress={after(() => router.push('/chat-wallpaper'))} right={profile?.plus ? <Icon name="right" size={18} color={C.fg2} weight={2} /> : <Icon name="crown" size={18} color={C.accent2} />} />
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
      {choices.element}
    </Screen>
  );
}
