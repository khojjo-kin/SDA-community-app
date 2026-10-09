import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus, useAudioRecorder } from 'expo-audio';
import * as Clipboard from 'expo-clipboard';
import { File, Paths } from 'expo-file-system';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import * as MediaLibrary from 'expo-media-library';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { thumbOf } from '../../../src/components/Grid';
import { Icon, IconName } from '../../../src/components/Icon';
import { Avatar, Empty, ErrorNote, IconButton, Loading, RoundButton, Screen, Sheet, SheetRow, useToast } from '../../../src/components/ui';
import { askFaq, fetchFaqs, fetchMessages, fetchSavedReplies, fetchThread, getProfile, hideThread, markThreadRead, report, sendMessage, setBlock, setThreadMuted, uploadAudio, uploadImage } from '../../../src/lib/api';
import { pickFromLibrary, takePhoto } from '../../../src/lib/pick';
import { usePrefs } from '../../../src/lib/prefs';
import { useSession } from '../../../src/lib/session';
import { getPostNow } from '../../../src/lib/store';
import { supabase } from '../../../src/lib/supabase';
import { BUBBLE, C, chatStamp, clock, errText } from '../../../src/lib/theme';
import type { Faq, Message, SavedReply, Thread } from '../../../src/lib/types';

type Row =
  | { key: string; kind: 'stamp'; label: string }
  | { key: string; kind: 'text'; mine: boolean; m: Message; big: boolean }
  | { key: string; kind: 'post'; mine: boolean; m: Message }
  | { key: string; kind: 'photos'; mine: boolean; urls: string[]; at: number }
  | { key: string; kind: 'voice'; mine: boolean; m: Message };

const QUICK = ['❤️', '😂', '😮', '😢', '😡', '👍', '🔥', '🙏', '🎉', '👏'];
const VOICE_LIMIT_MS = 120000;

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

/** Turns messages (oldest first) into what the list draws: time stamps, bubbles, and photos gathered into stacks. */
function buildRows(messages: Message[], me: string): Row[] {
  const rows: Row[] = [];
  let prevAt = 0;
  for (const m of messages) {
    const at = new Date(m.created_at).getTime();
    const mine = m.sender_id === me;
    if (!prevAt || at - prevAt > 3600e3) rows.push({ key: 's' + m.id, kind: 'stamp', label: chatStamp(m.created_at) });
    prevAt = at;
    const words = m.text.trim();
    const plain = words && !(m.post_id && words === 'Sent a post');
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
  return rows;
}

function Bubble({ mine, children }: { mine: boolean; children: React.ReactNode }) {
  const shape = { borderRadius: 22, paddingHorizontal: 16, paddingVertical: 11 };
  if (!mine) return <View style={[shape, { backgroundColor: '#262a31' }]}>{children}</View>;
  return (
    <LinearGradient colors={[BUBBLE[0], BUBBLE[1]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={shape}>
      {children}
    </LinearGradient>
  );
}

function ForwardButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={8} accessibilityRole="button" accessibilityLabel="Forward" style={({ pressed }) => ({ width: 34, height: 34, borderRadius: 17, backgroundColor: '#25282e', alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
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
  return (
    <Bubble mine={mine}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, width: 190 }}>
        <Pressable onPress={onPress} hitSlop={8} accessibilityRole="button" accessibilityLabel={playing ? 'Pause voice message' : 'Play voice message'} style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center' }}>
          {busy ? <ActivityIndicator color="#fff" size="small" /> : <Icon name={playing ? 'pause' : 'play'} size={18} color="#fff" />}
        </Pressable>
        <View style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.3)', overflow: 'hidden' }}>
          <View style={{ width: `${Math.round(fraction * 100)}%`, height: 4, backgroundColor: '#fff' }} />
        </View>
        <Text style={{ color: '#fff', fontSize: 13, fontVariant: ['tabular-nums'] }}>{label}</Text>
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
  const { id } = useLocalSearchParams<{ id: string }>();
  const threadId = String(id);
  const { me } = useSession();
  const prefs = usePrefs();
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [thread, setThread] = useState<Thread | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error' | 'missing'>('loading');
  const [error, setError] = useState('');
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
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

  const recorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, numberOfChannels: 1, bitRate: 64000 });

  const load = useCallback(async () => {
    if (!ready.current) return;
    const mine = ++asked.current;
    try {
      const list = await fetchMessages(threadId, hidden.current);
      // A slow, older answer must not replace a newer one (a message you just sent would vanish for a moment).
      if (mine < shown.current) return;
      shown.current = mine;
      setMessages(list);
      setStatus((s) => (s === 'missing' ? s : 'ready'));
      // Mark as read when their newest message is one you have not been shown yet, and only while this chat is in front.
      const theirs = [...list].reverse().find((m) => m.sender_id !== me);
      if (front.current && theirs && theirs.id !== seen.current) {
        seen.current = theirs.id;
        markThreadRead(me, threadId);
      }
    } catch (e) {
      setError(errText(e));
      setStatus((s) => (s === 'ready' ? 'ready' : 'error'));
    }
  }, [threadId, me]);

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
        ready.current = true;
        load();
        markThreadRead(me, threadId);
        // Creators can offer ready-made questions at the top of the chat.
        getProfile(t.other_id)
          .then((p) => (p && p.faq_enabled ? fetchFaqs(p.id) : []))
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
    let channel: ReturnType<typeof supabase.channel> | null = null;
    supabase.realtime
      .setAuth()
      .catch(() => {})
      .then(() => {
        if (!live) return;
        channel = supabase
          .channel(`thread-${threadId}-${Date.now().toString(36)}`)
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'community_messages', filter: `thread_id=eq.${threadId}` }, () => { load(); })
          .subscribe();
      });
    return () => {
      live = false;
      clearInterval(timer);
      if (channel) supabase.removeChannel(channel);
    };
  }, [threadId, me, load, attempt]);

  // Coming back to the chat refreshes it; while another screen covers it, nothing is marked as read.
  useFocusEffect(
    useCallback(() => {
      front.current = true;
      load();
      return () => {
        front.current = false;
      };
    }, [load]),
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

  async function send(msg: { text?: string; media_url?: string }) {
    if (sending) return;
    setSending(true);
    try {
      await sendMessage(me, threadId, msg);
      // Clear the box only if it still holds what was sent: you may have typed more in the meantime.
      if (msg.text !== undefined) setText((cur) => (cur === msg.text ? '' : cur));
      await load();
    } catch (e) {
      toast(errText(e));
    } finally {
      setSending(false);
    }
  }

  async function sendPhotos(fromCamera: boolean) {
    if (sending) return;
    try {
      const picked = fromCamera ? await takePhoto({ front: prefs.frontCamera }) : await pickFromLibrary({ multiple: true, limit: 10 });
      if (!picked.length) return;
      setSending(true);
      for (const a of picked) {
        const m = await uploadImage(me, a.uri, a.width, 1280);
        await sendMessage(me, threadId, { media_url: m.url });
      }
      await load();
    } catch (e) {
      toast(errText(e));
    } finally {
      setSending(false);
    }
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
        await sendMessage(me, threadId, { audio_url: url, audio_seconds: Math.max(1, Math.round(ms / 1000)) });
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

  const rows = useMemo(() => buildRows(messages, me).reverse(), [messages, me]);
  const typing = text.trim().length > 0;
  const showFaqs = faqs.length > 0 && thread && thread.other_id !== me;

  return (
    <Screen>
      <View style={{ height: 60, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, gap: 12 }}>
        <RoundButton name="back" label="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/inbox'))} />
        {thread ? (
          <Pressable onPress={() => router.push(`/user/${thread.other_id}`)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }} accessibilityRole="button" accessibilityLabel={`Open ${thread.full_name}'s profile`}>
            <Avatar uri={thread.avatar_url} name={thread.full_name} size={40} />
            <View style={{ flex: 1 }}>
              <Text numberOfLines={1} style={{ color: C.fg, fontSize: 18, fontWeight: '700' }}>{thread.full_name}</Text>
              <Text numberOfLines={1} style={{ color: C.fg, fontSize: 13 }}>{thread.username}{thread.muted ? ' · muted' : ''}</Text>
            </View>
          </Pressable>
        ) : (
          <View style={{ flex: 1 }} />
        )}
        {thread ? <RoundButton name="info" label="Chat options" onPress={() => setSheet('options')} /> : null}
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {status === 'loading' ? (
          <View style={{ flex: 1 }}><Loading /></View>
        ) : status === 'error' ? (
          <View style={{ flex: 1 }}><ErrorNote message={error} onRetry={() => { setStatus('loading'); if (ready.current) load(); else setAttempt((n) => n + 1); }} /></View>
        ) : status === 'missing' ? (
          <View style={{ flex: 1 }}><Empty title="This chat isn't available" body="The other account may have been deleted." /></View>
        ) : (
          <FlatList
            data={rows}
            inverted
            keyExtractor={(r) => r.key}
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 12, gap: 4 }}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item: r }) => {
              if (r.kind === 'stamp') return <Text style={{ color: C.fg2, fontSize: 12.5, letterSpacing: 0.2, textAlign: 'center', paddingTop: 18, paddingBottom: 10 }}>{r.label}</Text>;
              const align = { alignSelf: r.mine ? ('flex-end' as const) : ('flex-start' as const), maxWidth: '82%' as const };
              if (r.kind === 'photos') {
                return (
                  <View style={[align, { maxWidth: '100%', paddingVertical: 4 }]}>
                    <PhotoStack urls={r.urls} mine={r.mine} onOpen={() => setViewer({ urls: r.urls, at: 0, note: '' })} onForward={() => forward(r.urls)} />
                  </View>
                );
              }
              if (r.kind === 'voice') return <View style={align}><VoiceBubble m={r.m} mine={r.mine} locked={recording} /></View>;
              if (r.kind === 'post') {
                const post = r.m.post_id ? getPostNow(r.m.post_id) : undefined;
                return (
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
                );
              }
              if (r.big) return <Text style={[align, { fontSize: 44, lineHeight: 54 }]}>{r.m.text.trim()}</Text>;
              return (
                <Pressable style={align} onLongPress={() => { Clipboard.setStringAsync(r.m.text).then(() => toast('Copied')); }} delayLongPress={350} accessibilityHint="Touch and hold to copy">
                  <Bubble mine={r.mine}>
                    <Text style={{ color: r.mine ? '#fff' : C.fg, fontSize: 17, lineHeight: 23 }}>{r.m.text}</Text>
                  </Bubble>
                </Pressable>
              );
            }}
            ListFooterComponent={
              showFaqs ? (
                <View style={{ alignItems: 'center', paddingVertical: 14, gap: 8 }}>
                  <Text style={{ color: C.fg2, fontSize: 13.5 }}>Frequently asked questions</Text>
                  {faqs.map((f) => (
                    <Pressable key={f.id} onPress={() => ask(f)} disabled={sending} accessibilityRole="button" accessibilityLabel={`Ask: ${f.question}`} style={({ pressed }) => ({ maxWidth: '88%', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, borderWidth: 1, borderColor: '#3a4048', backgroundColor: pressed ? C.surface : 'transparent' })}>
                      <Text style={{ color: C.fg, fontSize: 15.5, textAlign: 'center' }}>{f.question}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null
            }
            ListEmptyComponent={
              <View style={{ transform: [{ scaleY: -1 }] }}>
                <Empty title={thread ? thread.full_name : 'New chat'} body="Say hello to start the chat." />
              </View>
            }
          />
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
            {recording ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, paddingHorizontal: 6, borderRadius: 26, backgroundColor: C.inputBar }}>
                <Pressable onPress={() => stopRecording(false)} accessibilityRole="button" accessibilityLabel="Discard recording" style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#33363b', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="trash" size={20} />
                </Pressable>
                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: C.like }} />
                <Text style={{ flex: 1, color: C.fg, fontSize: 16, fontVariant: ['tabular-nums'] }} accessibilityLiveRegion="polite">Recording {clock(recordedMs / 1000)}</Text>
                <Pressable onPress={() => stopRecording(true)} accessibilityRole="button" accessibilityLabel="Send voice message" style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="send" size={20} color="#fff" />
                </Pressable>
              </View>
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', minHeight: 52, paddingLeft: 6, paddingRight: 8, borderRadius: 26, backgroundColor: C.inputBar }}>
                <Pressable onPress={() => sendPhotos(true)} disabled={sending} accessibilityRole="button" accessibilityLabel="Take a photo" style={({ pressed }) => ({ width: 40, height: 40, borderRadius: 20, backgroundColor: '#5454f0', alignItems: 'center', justifyContent: 'center', marginBottom: 6, opacity: pressed ? 0.7 : 1 })}>
                  {sending ? <ActivityIndicator color="#fff" size="small" /> : <Icon name="camerafill" size={23} color="#fff" ink="#5454f0" />}
                </Pressable>
                <TextInput value={text} onChangeText={setText} onFocus={() => setTray(false)} placeholder="Message…" placeholderTextColor={C.fg2} multiline maxLength={5000} keyboardAppearance="dark" style={{ flex: 1, color: C.fg, fontSize: 17, minHeight: 52, maxHeight: 130, paddingHorizontal: 12, paddingTop: 15, paddingBottom: 15 }} accessibilityLabel="Message" />
                {typing ? (
                  <Pressable onPress={() => send({ text })} disabled={sending} hitSlop={8} accessibilityRole="button" style={{ paddingHorizontal: 10, height: 52, justifyContent: 'center' }}>
                    <Text style={{ color: C.accent2, fontWeight: '700', fontSize: 16.5, opacity: sending ? 0.4 : 1 }}>Send</Text>
                  </Pressable>
                ) : (
                  <View style={{ flexDirection: 'row', alignItems: 'center', height: 52 }}>
                    <BarIcon name="mic" label="Record a voice message" onPress={startRecording} disabled={sending} />
                    <BarIcon name="image" label="Send photos" onPress={() => sendPhotos(false)} disabled={sending} />
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
              <Pressable key={r.id} onPress={() => { setText(r.body); setSheet(null); }} accessibilityRole="button" accessibilityLabel={`Use saved reply: ${r.body}`} style={({ pressed }) => ({ paddingHorizontal: 18, paddingVertical: 10, backgroundColor: pressed ? 'rgba(255,255,255,0.05)' : 'transparent' })}>
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
        <SheetRow icon="trash" label="Delete chat" danger onPress={after(removeChat)} />
        <SheetRow icon="block" label={`Block ${thread?.username ?? ''}`} danger onPress={after(block)} />
        <SheetRow icon="flag" label="Report" danger onPress={after(reportThem)} />
      </Sheet>

      {/* photos, full screen */}
      <Modal visible={!!viewer} animationType="fade" onRequestClose={() => setViewer(null)} statusBarTranslucent>
        <View style={{ flex: 1, backgroundColor: '#000' }}>
          {viewer ? (
            <>
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
    </Screen>
  );
}
