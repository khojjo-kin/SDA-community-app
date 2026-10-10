// One chat: the header (who, "Active now", streak, voice and video calls), the messages over the
// chosen wallpaper (Plus), and the message box with emoji, photos (sent normally or as view once),
// voice messages, saved replies and a heart. Used full size on /direct and small inside the corner
// inbox (compact). New messages, "Seen" and typing arrive live over Supabase Realtime, on the same
// channels as the iPhone app, with a refresh every few seconds in case the connection drops.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { askErhaInThread, askFaq, ERHA_ID, fetchFaqs, fetchMessages, fetchSavedReplies, fetchTheirLastRead, fetchThread, getProfile, hideThread, isOnline, markThreadRead, openViewOnce, report, sendMessage, setBlock, setThreadMuted, uploadImage } from 'shared/api';
import { usePrefs } from 'shared/prefs';
import { supabase } from 'shared/supabase';
import { useCalls } from 'shared/calls';
import { errText } from 'shared/theme';
import type { Faq, Message, SavedReply, Thread } from 'shared/types';
import { rememberSize } from '../shims/expo-file-system';
import { t } from '../lib/i18n';
import { useMe } from '../lib/me';
import { nav } from '../lib/router';
import { ForwardPhotos } from '../screens/messages-new';
import { Avatar, Empty, Icon, Link, Modal, Spinner, Verified, ask, toast, toastError } from './kit';
import { ActiveFace, STREAK_FROM, StreakBadge } from './chat-threads';
import { CallLog, EmojiPop, OnceMark, PhotoPile, PhotoViewer, RecordingBar, ScreenshotLine, SharedPost, SnapBubble, SnapViewer, TypingBubble, VOICE_LIMIT_MS, VOICE_MIN_MS, VoiceMessage, VoiceRecorder, activeWords, buildRows, firstName, micProblem, pauseVoice, takeDraft, timeOf, uploadVoice, type RecPhase, type Row, type VoiceClip } from './chat-bits';
import { WallpaperPicker, useChatWallpaper, wallName, wallpaperCss } from './chat-wallpaper';
import { NoteBubble } from './notes';

/** Ways to start a chat with Erha, offered while it is still nearly empty (sent in the app's language). */
const ERHA_OPENERS = ['d.messages.erhaOpener1', 'd.messages.erhaOpener2', 'd.messages.erhaOpener3'];
/** How often "typing" is sent while you keep typing, and how long their bubble stays after the last one. */
const TYPING_EVERY_MS = 2000;
const TYPING_LINGER_MS = 4000;
/** The chat is asked for again this often, as on the iPhone, in case a live update was missed. */
const REFRESH_MS = 6000;
/** Held this long, the microphone button records until you let go, then sends. A click records until Send. */
const HOLD_MS = 450;
/** Why you can report someone, as the iPhone asks. The reason goes to the admins in English; `key` is how it is shown. */
const REPORT_REASONS = [
  { reason: 'Spam', key: 'profile.reportSpam' },
  { reason: 'Harassment or hate', key: 'profile.reportHarassment' },
  { reason: 'Pretending to be someone else', key: 'profile.reportPretending' },
  { reason: 'Something else', key: 'profile.reportOther' },
];

type Pending = { photos: { url: string; size: number }[]; once: boolean };
type Rec = { phase: RecPhase; ms: number; levels: number[]; clip?: VoiceClip };

export function Chat({ threadId, openPost, onChanged, compact, onBack, onExpand, onClose }: { threadId: string; openPost?: (id: string) => void; onChanged?: () => void; compact?: boolean; onBack?: () => void; onExpand?: () => void; onClose?: () => void }) {
  const { me } = useMe();
  const prefs = usePrefs();
  const calls = useCalls();
  const wall = useChatWallpaper();
  const [thread, setThread] = useState<Thread | null | undefined>(undefined);
  const [msgs, setMsgs] = useState<Message[] | null>(null);
  const [theirRead, setTheirRead] = useState<string | null>(null);
  const [text, setText] = useState(() => takeDraft(threadId));
  const [sending, setSending] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [theirTyping, setTheirTyping] = useState(false);
  const [faqs, setFaqs] = useState<Faq[]>([]);
  const [replies, setReplies] = useState<SavedReply[] | null>(null);
  const [details, setDetails] = useState(false);
  const [viewing, setViewing] = useState<string[] | null>(null);
  const [forwarding, setForwarding] = useState<string[] | null>(null);
  const [snap, setSnap] = useState<{ id: string; url: string } | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [emoji, setEmoji] = useState(false);
  const [limit, setLimit] = useState('');
  const [rec, setRec] = useState<Rec | null>(null);
  const [picker, setPicker] = useState(false);
  const [reporting, setReporting] = useState(false);
  const log = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const threadRef = useRef<Thread | null>(null);
  threadRef.current = thread ?? null;
  // Whether the two of you follow each other (null while unknown), to explain a refused message.
  const mutual = useRef<boolean | null>(null);
  // View-once photos opened in this window, so they read "Opened" even before the server says so.
  const openedHere = useRef(new Map<string, string>());
  const openingSnap = useRef(false);
  const typingRoom = useRef<any>(null);
  const typingSentAt = useRef(0);
  const typingTold = useRef(false);
  const typingHide = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Each load is numbered, so a slow, older answer never replaces a newer one.
  const asked = useRef(0);
  const shown = useRef(0);
  const loadedOnce = useRef(false);
  // Their newest message that has been marked read.
  const markedId = useRef('');
  // The recording in progress, if any.
  const recorder = useRef<VoiceRecorder | null>(null);
  const isErha = thread?.other_id === ERHA_ID;
  // Plus: read without the other person seeing "Seen" (Settings → Read quietly). Nothing is marked read meanwhile.
  const quiet = !!me.plus && prefs.readQuietly;
  const quietRef = useRef(quiet);
  quietRef.current = quiet;
  const changed = () => onChanged?.();
  const showPost = openPost ?? ((id: string) => nav('/p/' + id));

  const load = useCallback(async () => {
    const mine = ++asked.current;
    try {
      const rows = await fetchMessages(threadId, threadRef.current?.hidden_before);
      if (mine < shown.current) return;
      shown.current = mine;
      loadedOnce.current = true;
      const opened = openedHere.current;
      setMsgs(rows.map((m) => (opened.has(m.id) ? { ...m, media_url: '', opened_at: m.opened_at ?? opened.get(m.id)! } : m)));
      // Their newest message is marked read once, while this window is in front and you aren't reading quietly.
      const theirs = [...rows].reverse().find((m) => m.sender_id !== me.id);
      if (theirs && theirs.id !== markedId.current && !quietRef.current && !document.hidden) {
        markedId.current = theirs.id;
        markThreadRead(me.id, threadId).catch(() => {
          markedId.current = '';
        });
      }
    } catch (e) {
      // The first load says why it failed; a refresh that fails quietly tries again shortly.
      if (!loadedOnce.current) {
        toastError(e);
        setMsgs((cur) => cur ?? []);
      }
    }
  }, [threadId, me.id]);

  // The chat's card, its messages, and live updates: new messages, opened photos, and their "Seen".
  useEffect(() => {
    let channel: any = null;
    let alive = true;
    fetchThread(threadId).then(
      (t) => {
        if (!alive) return;
        setThread(t);
        threadRef.current = t;
        if (!t) return;
        load();
        fetchTheirLastRead(threadId, t.other_id).then((r) => alive && setTheirRead(r), () => {});
        channel = supabase
          .channel(`thread-${threadId}-${Math.random().toString(36).slice(2)}`)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'community_messages', filter: `thread_id=eq.${threadId}` }, (payload: any) => {
            // Their message has arrived, so their typing bubble has done its job.
            if (payload?.new?.sender_id === t.other_id) setTheirTyping(false);
            load();
          })
          .on('postgres_changes', { event: '*', schema: 'public', table: 'community_thread_reads', filter: `thread_id=eq.${threadId}` }, (payload: any) => {
            // Their read marker only ever moves forward.
            if (payload?.new?.user_id === t.other_id) setTheirRead((cur) => (cur && cur >= payload.new.last_read_at ? cur : payload.new.last_read_at));
          })
          .subscribe();
      },
      (e) => {
        toastError(e);
        if (alive) setThread(null);
      },
    );
    return () => {
      alive = false;
      if (channel) supabase.removeChannel(channel);
    };
  }, [threadId]);

  // Asked for again every few seconds while the window is in front, and when it comes back to the front.
  useEffect(() => {
    if (!thread) return;
    const timer = setInterval(() => !document.hidden && load(), REFRESH_MS);
    const back = () => {
      if (document.hidden) return;
      load();
      fetchTheirLastRead(threadId, thread.other_id).then((r) => r && setTheirRead((cur) => (cur && cur >= r ? cur : r)), () => {});
    };
    document.addEventListener('visibilitychange', back);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', back);
    };
  }, [thread?.id, load]);

  // Turning "Read quietly" off marks the chat read then.
  useEffect(() => {
    if (!quiet && thread) load();
  }, [quiet]);

  // "Active now" and the streak go stale, so the card is asked for again every minute while open.
  useEffect(() => {
    const timer = setInterval(() => {
      fetchThread(threadId).then((t) => t && setThread((cur) => (cur ? { ...cur, active_at: t.active_at, streak: t.streak, other_plus: t.other_plus } : cur)), () => {});
    }, 60e3);
    return () => clearInterval(timer);
  }, [threadId]);

  // Typing, both ways, on the same broadcast channel the iPhone app uses for this chat.
  useEffect(() => {
    if (!thread) return;
    const room = supabase
      .channel(`typing:${threadId}`, { config: { broadcast: { self: false } } })
      .on('broadcast', { event: 'typing' }, ({ payload }: any) => {
        if (payload?.user !== thread.other_id) return;
        setTheirTyping(true);
        if (typingHide.current) clearTimeout(typingHide.current);
        typingHide.current = setTimeout(() => setTheirTyping(false), TYPING_LINGER_MS);
      })
      .on('broadcast', { event: 'stopped' }, ({ payload }: any) => {
        if (payload?.user === thread.other_id) setTheirTyping(false);
      })
      .subscribe();
    typingRoom.current = room;
    // Creators can answer common questions automatically; and whether you follow each other.
    if (thread.other_id !== ERHA_ID) {
      getProfile(thread.other_id)
        .then((p) => {
          mutual.current = p ? p.is_following && p.follows_me : null;
          return p?.faq_enabled ? fetchFaqs(p.id).then(setFaqs) : setFaqs([]);
        })
        .catch(() => setFaqs([]));
    }
    return () => {
      if (typingTold.current) room.send({ type: 'broadcast', event: 'stopped', payload: { user: me.id } }).catch(() => {});
      supabase.removeChannel(room);
      typingRoom.current = null;
      if (typingHide.current) clearTimeout(typingHide.current);
    };
  }, [thread?.id]);

  const tellTyping = () => {
    const now = Date.now();
    if (now - typingSentAt.current < TYPING_EVERY_MS) return;
    typingSentAt.current = now;
    typingTold.current = true;
    typingRoom.current?.send({ type: 'broadcast', event: 'typing', payload: { user: me.id } }).catch(() => {});
  };
  const tellStopped = () => {
    if (!typingTold.current) return;
    typingTold.current = false;
    typingSentAt.current = 0;
    typingRoom.current?.send({ type: 'broadcast', event: 'stopped', payload: { user: me.id } }).catch(() => {});
  };

  // Keep the newest message in view while you are at the bottom; reading further up, you stay put.
  const atBottom = useRef(true);
  const stick = useCallback(() => {
    const el = log.current;
    if (el && atBottom.current) el.scrollTop = el.scrollHeight;
  }, []);
  useEffect(stick, [msgs?.length, thinking, theirTyping, pending, limit, theirRead, rec?.phase]);

  // The message box grows with what you write, up to a few lines.
  useEffect(() => {
    const el = input.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  }, [text, rec]);

  /** Puts a refused send into words: the under-14 rule when that is the likely reason. */
  const explain = (e: unknown) => {
    const err = e as { code?: string; message?: string } | null;
    const refused = err?.code === '42501' || /row-level security/i.test(String(err?.message ?? ''));
    // Said when the database turns a message away under the under-14 rules (as on the iPhone).
    return refused && mutual.current === false && !me.suspended ? t('d.messages.minorRule') : errText(e);
  };

  const send = async (msg: { text?: string; media_url?: string; view_once?: boolean }) => {
    if (sending) return;
    setSending(true);
    atBottom.current = true;
    if (msg.text !== undefined) tellStopped();
    try {
      try {
        await sendMessage(me.id, threadId, msg);
      } catch (e) {
        throw new Error(explain(e));
      }
      if (msg.text !== undefined) setText((cur) => (cur === msg.text ? '' : cur));
      await load();
      changed();
      // Your message is on screen; now Erha reads it and answers in the chat.
      if (isErha && msg.text?.trim()) {
        setThinking(true);
        try {
          await askErhaInThread(threadId, msg.text.trim());
          setLimit('');
        } catch (e) {
          // Erha's own refusals (the daily allowance) stay above the message box; anything else is a toast.
          if ((e as Error)?.name === 'FriendlyError') setLimit(errText(e));
          else toastError(e);
        } finally {
          setThinking(false);
          load();
        }
      }
    } catch (e) {
      toastError(e);
    } finally {
      setSending(false);
    }
  };

  /* ----- photos: they wait above the message box, with the view-once choice, until Send ----- */

  const addPhotos = (files: File[]) => {
    const imgs = files.filter((f) => f.type.startsWith('image/')).slice(0, 10);
    if (!imgs.length) return toast(t('d.messages.choosePhoto'));
    const photos = imgs.map((f) => {
      const url = URL.createObjectURL(f);
      rememberSize(url, f.size);
      return { url, size: f.size };
    });
    // Choosing again replaces what was waiting, but keeps the view-once choice.
    setPending((cur) => ({ photos, once: cur?.once ?? false }));
  };

  const sendPending = async () => {
    if (!pending || sending) return;
    const { photos, once } = pending;
    setSending(true);
    atBottom.current = true;
    let sent = 0;
    try {
      for (const p of photos) {
        const img = new Image();
        img.src = p.url;
        await img.decode();
        const m = await uploadImage(me.id, p.url, img.naturalWidth, 1280);
        try {
          await sendMessage(me.id, threadId, { media_url: m.url, view_once: once });
        } catch (e) {
          throw new Error(explain(e));
        }
        sent++;
      }
      setPending(null);
      await load();
      changed();
    } catch (e) {
      // Whatever didn't go stays waiting, so Send can try again without sending any twice.
      setPending((cur) => (cur && cur.photos === photos ? { ...cur, photos: photos.slice(sent) } : cur));
      if (sent) load();
      toastError(e);
    } finally {
      setSending(false);
    }
  };

  /* ----- voice messages: click the microphone to record until Send, or hold it and let go to send ----- */

  const startRecording = async () => {
    if (sending || recorder.current || rec || isErha) return;
    pauseVoice();
    setEmoji(false);
    const r = new VoiceRecorder();
    recorder.current = r;
    setRec({ phase: 'starting', ms: 0, levels: [] });
    try {
      await r.start();
      // Discarded (or the chat closed) while the microphone was being asked for.
      if (recorder.current !== r) return r.cancel();
      atBottom.current = true;
      setRec({ phase: 'recording', ms: 0, levels: [] });
    } catch (e) {
      r.cancel();
      if (recorder.current === r) {
        recorder.current = null;
        setRec(null);
        toast(micProblem(e));
      }
    }
  };

  /** Uploads a recording and sends it. A failed send keeps it, to try again or discard. */
  const sendClip = async (clip: VoiceClip) => {
    setRec((cur) => ({ phase: 'sending', ms: clip.ms, levels: cur?.levels ?? [], clip }));
    setSending(true);
    atBottom.current = true;
    try {
      const url = await uploadVoice(me.id, clip);
      try {
        await sendMessage(me.id, threadId, { audio_url: url, audio_seconds: Math.max(1, Math.round(clip.ms / 1000)) });
      } catch (e) {
        throw new Error(explain(e));
      }
      setRec(null);
      await load();
      changed();
    } catch (e) {
      setRec((cur) => (cur ? { ...cur, phase: 'failed' } : cur));
      toastError(e);
    } finally {
      setSending(false);
    }
  };

  /** Stops recording: `keep` sends it (if it's long enough), otherwise it is thrown away. */
  const finishRecording = async (keep: boolean) => {
    const r = recorder.current;
    if (!r) {
      // A recording that didn't send: Send tries again, discard drops it.
      if (keep && rec?.phase === 'failed' && rec.clip) sendClip(rec.clip);
      else if (!keep && rec?.phase !== 'sending') setRec(null);
      return;
    }
    recorder.current = null;
    if (!keep) {
      r.cancel();
      setRec(null);
      return;
    }
    if (r.elapsed() < VOICE_MIN_MS) {
      r.cancel();
      setRec(null);
      toast(t('d.messages.tooShort'));
      return;
    }
    setRec((cur) => (cur ? { ...cur, phase: 'sending' } : cur));
    let clip: VoiceClip;
    try {
      clip = await r.stop();
    } catch (e) {
      setRec(null);
      toastError(e);
      return;
    }
    await sendClip(clip);
  };
  const finishRef = useRef(finishRecording);
  finishRef.current = finishRecording;

  // While recording: the time and the microphone's level, and it sends itself at two minutes.
  useEffect(() => {
    if (rec?.phase !== 'recording') return;
    const timer = setInterval(() => {
      const r = recorder.current;
      if (!r) return;
      const ms = r.elapsed();
      const level = r.level();
      setRec((cur) => (cur && cur.phase === 'recording' ? { ...cur, ms, levels: [...cur.levels, level].slice(-64) } : cur));
      if (ms >= VOICE_LIMIT_MS) finishRef.current(true);
    }, 100);
    return () => clearInterval(timer);
  }, [rec?.phase]);

  // Enter sends the recording and Escape discards it (unless a dialog is open over the chat).
  useEffect(() => {
    if (!rec || rec.phase === 'sending') return;
    const key = (e: KeyboardEvent) => {
      if (document.querySelector('.scrim')) return;
      // Enter on a focused button (Discard, say) is that button's own.
      if (e.key === 'Enter' && (e.target as HTMLElement | null)?.closest?.('button, a, input, textarea')) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        finishRef.current(false);
      } else if (e.key === 'Enter' && (rec.phase === 'recording' || rec.phase === 'failed')) {
        e.preventDefault();
        finishRef.current(true);
      }
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [rec?.phase]);

  // A recording never carries on after the chat closes: it is thrown away, as on the iPhone.
  useEffect(
    () => () => {
      recorder.current?.cancel();
      recorder.current = null;
    },
    [],
  );

  /** The microphone button: pressed and held, it sends when you let go; a quick click keeps recording. */
  const micDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const at = performance.now();
    window.addEventListener(
      'pointerup',
      () => {
        if (performance.now() - at >= HOLD_MS && recorder.current && recorder.current.elapsed() > 0) finishRef.current(true);
      },
      { once: true },
    );
    startRecording();
  };

  /* ----- view-once photos ----- */

  /** Opens a view-once photo sent to you. The server hands over its address only now, once. */
  const openSnap = async (m: Message) => {
    if (m.sender_id === me.id || m.opened_at || openedHere.current.has(m.id) || openingSnap.current) return;
    openingSnap.current = true;
    try {
      const url = await openViewOnce(m.id);
      openedHere.current.set(m.id, new Date().toISOString());
      if (url) setSnap({ id: m.id, url });
      else {
        toast(t('d.messages.alreadyOpened'));
        setMsgs((list) => (list ?? []).map((x) => (x.id === m.id ? { ...x, opened_at: x.opened_at ?? new Date().toISOString() } : x)));
      }
    } catch (e) {
      toastError(e);
    } finally {
      openingSnap.current = false;
    }
  };

  const closeSnap = () => {
    const s = snap;
    setSnap(null);
    if (s) {
      const at = openedHere.current.get(s.id) ?? new Date().toISOString();
      // Forget its address straight away and show "Opened".
      setMsgs((list) => (list ?? []).map((m) => (m.id === s.id ? { ...m, media_url: '', opened_at: m.opened_at ?? at } : m)));
    }
    load();
  };

  const rows = useMemo(() => buildRows(msgs ?? [], me.id, isErha ? null : theirRead), [msgs, me.id, theirRead, isErha]);

  if (thread === undefined) return <div className={'chat cv' + (compact ? ' compact' : '')}>{compact ? <CompactHead onBack={onBack} onExpand={onExpand} onClose={onClose} /> : null}<Spinner /></div>;
  if (thread === null) {
    return (
      <div className={'chat cv' + (compact ? ' compact' : '')}>
        {compact ? <CompactHead onBack={onBack} onExpand={onExpand} onClose={onClose} /> : null}
        <Empty icon="send" title={t('d.messages.chatUnavailable')} body={t('d.messages.chatUnavailableBody')} />
      </div>
    );
  }

  // In-app calls, the same as on the iPhone: the other person's phone or Mac rings. Not while recording.
  const callsOff = calls.inCall || !!rec;
  const call = (kind: 'voice' | 'video') => {
    if (callsOff) return;
    pauseVoice();
    calls.startCall(thread.other_id, kind, threadId).catch(toastError);
  };
  const name = thread.full_name || thread.username;
  const online = !isErha && isOnline(thread.active_at);
  const sub = thinking ? t('d.messages.thinking') : theirTyping ? t('d.messages.typingNow') : isErha ? t('d.messages.churchAssistant') : activeWords(thread.active_at) || thread.username;

  const toggleMute = () =>
    setThreadMuted(me.id, threadId, !thread.muted).then(() => {
      setThread({ ...thread, muted: !thread.muted });
      toast(t(thread.muted ? 'd.messages.unmuted' : 'd.messages.muted'));
      changed();
    }, toastError);
  const removeChat = async () => {
    if (!(await ask(t('inbox.deleteQuestion'), t('d.messages.deleteChatBody'), t('common.delete')))) return;
    try {
      await hideThread(threadId);
      toast(t('d.messages.chatDeleted'));
      changed();
      if (compact) onBack?.();
      else nav('/direct');
    } catch (e) {
      toastError(e);
    }
  };
  const blockThem = async () => {
    if (!(await ask(t('profile.blockQuestion', { username: thread.username }), t('d.messages.blockBody'), t('profile.block')))) return;
    try {
      await setBlock(me.id, thread.other_id, true);
      toast(t('profile.blocked', { username: thread.username }));
      changed();
      if (compact) onBack?.();
      else nav('/direct');
    } catch (e) {
      toastError(e);
    }
  };
  const reportThem = (reason: string) => {
    setReporting(false);
    report(me.id, { userId: thread.other_id }, reason).then(() => toast(t('profile.reportThanks')), toastError);
  };
  const copy = (words: string) => navigator.clipboard?.writeText(words).then(() => toast(t('bibleMarks.copied')), () => toast(t('d.messages.copyFailed')));

  const piece = (r: Row) => {
    const m = r.m;
    switch (r.kind) {
      case 'snap':
        return <SnapBubble mine={r.mine} opened={!!m.opened_at} onOpen={() => openSnap(m)} />;
      case 'call':
        return <CallLog m={m} mine={r.mine} onCall={isErha || callsOff ? undefined : () => call(m.call_kind === 'video' ? 'video' : 'voice')} />;
      case 'voice':
        return <VoiceMessage m={m} mine={r.mine} locked={!!rec} />;
      case 'post':
        return <SharedPost id={m.post_id!} onOpen={showPost} />;
      case 'photo':
        return <PhotoPile urls={r.urls ?? [m.media_url]} onOpen={() => setViewing(r.urls ?? [m.media_url])} onLoad={stick} />;
      default:
        return r.big ? <span className="emoji-only">{m.text}</span> : <span className={'bubble' + (r.mine ? ' mine' : '')}>{m.text}</span>;
    }
  };

  /** What you can do with a message from its side, on hover: copy words, forward photos. */
  const acts = (r: Row) => {
    if (r.kind === 'text' && !r.big) {
      return (
        <span className="cv-acts">
          <button type="button" className="icon-btn" aria-label={t('d.messages.copyMessage')} title={t('bibleMarks.copy')} onClick={() => copy(r.m.text)}>
            <Icon name="copy" size={16} />
          </button>
        </span>
      );
    }
    if (r.kind === 'photo' && !isErha) {
      return (
        <span className="cv-acts">
          <button type="button" className="icon-btn" aria-label={t('d.messages.forward')} title={t('d.messages.forward')} onClick={() => setForwarding(r.urls ?? [r.m.media_url])}>
            <Icon name="send" size={16} />
          </button>
        </span>
      );
    }
    return null;
  };

  const head = compact ? (
    <CompactHead onBack={onBack} onExpand={onExpand} onClose={onClose}>
      <button type="button" className="cv-who-btn" onClick={() => nav('/u/' + thread.username)}>
        <ActiveFace src={thread.avatar_url} name={thread.username} size={32} online={online} />
        <span className="chat-who">
          <b>
            {name}
            {thread.verified ? <Verified size={11} /> : null}
          </b>
          <span className={theirTyping || thinking ? 'cv-typing-word' : ''}>{sub}</span>
        </span>
      </button>
      <span className="grow" />
      {!isErha ? (
        <>
          <button className="icon-btn" aria-label={t('d.messages.voiceCall')} disabled={callsOff} onClick={() => call('voice')}>
            <Icon name="phone" size={20} />
          </button>
          <button className="icon-btn" aria-label={t('d.messages.videoCall')} disabled={callsOff} onClick={() => call('video')}>
            <Icon name="video" size={22} />
          </button>
        </>
      ) : null}
    </CompactHead>
  ) : (
    <header className="chat-head cv-head">
      <button type="button" className="avatar-btn" onClick={() => nav('/u/' + thread.username)} aria-label={t('notifications.openProfile', { username: name })}>
        <ActiveFace src={thread.avatar_url} name={thread.username} size={44} online={online} />
      </button>
      <Link to={'/u/' + thread.username} className="chat-who">
        <b>
          {name}
          {thread.verified ? <Verified size={12} /> : null}
          {!isErha && (thread.streak ?? 0) >= STREAK_FROM ? <StreakBadge days={thread.streak} /> : null}
        </b>
        <span className={theirTyping || thinking ? 'cv-typing-word' : ''}>
          {sub}
          {thread.muted ? ' · ' + t('d.messages.mutedMark') : ''}
        </span>
      </Link>
      <span className="grow" />
      {!isErha ? (
        <>
          <button className="icon-btn" aria-label={t('d.messages.voiceCall')} disabled={callsOff} onClick={() => call('voice')}>
            <Icon name="phone" size={24} />
          </button>
          <button className="icon-btn" aria-label={t('d.messages.videoCall')} disabled={callsOff} onClick={() => call('video')}>
            <Icon name="video" size={26} />
          </button>
        </>
      ) : null}
      <button className={'icon-btn' + (details ? ' cv-on' : '')} aria-label={t('d.messages.chatInfo')} aria-pressed={details} onClick={() => setDetails(!details)}>
        <Icon name="info" size={24} />
      </button>
    </header>
  );

  const empty = !text.trim();
  return (
    <div className={'chat cv' + (compact ? ' compact' : '') + (details && !compact ? ' with-details' : '')}>
      <div
        className="cv-main"
        onDragOver={(e) => {
          if (!isErha && e.dataTransfer.types.includes('Files')) e.preventDefault();
        }}
        onDrop={(e) => {
          if (isErha || !e.dataTransfer.files.length) return;
          e.preventDefault();
          addPhotos(Array.from(e.dataTransfer.files));
        }}
      >
        {head}
        {quiet && !isErha ? (
          <button type="button" className="cv-quiet" onClick={() => toast(t('d.messages.quietToast'))}>
            <Icon name="eye" size={13} stroke={2} />
            {t('d.messages.readingQuietly')}
          </button>
        ) : null}
        <div
          className={'chat-log' + (wall ? ' cv-walled' : '')}
          style={wall ? { backgroundImage: wallpaperCss(wall) } : undefined}
          data-wallpaper={wall?.id}
          ref={log}
          onScroll={(e) => {
            const el = e.currentTarget;
            atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
          }}
        >
          {isErha ? (
            <div className="chat-intro">
              <Avatar src={thread.avatar_url} name="Erha" size={compact ? 64 : 96} />
              <b>{t('d.messages.erhaHi')}</b>
              <span className="muted-text cv-intro-text">{t('d.messages.erhaIntro')}</span>
            </div>
          ) : (
            <div className="chat-intro">
              <span className="cv-intro-face">
                <Avatar src={thread.avatar_url} name={thread.username} size={compact ? 64 : 96} />
                {!compact ? <NoteBubble userId={thread.other_id} mine={false} /> : null}
              </span>
              <b>{name}</b>
              <span className="muted-text">{thread.username} · Community</span>
              <button className="btn quiet small" onClick={() => nav('/u/' + thread.username)}>
                {t('d.messages.viewProfile')}
              </button>
            </div>
          )}
          {msgs === null ? <Spinner /> : null}
          {rows.map((r) => {
            if (r.kind === 'stamp') return <div key={r.key} className="chat-stamp">{r.label}</div>;
            if (r.kind === 'notice') return <ScreenshotLine key={r.key} mine={r.mine} name={firstName(thread)} />;
            const a = acts(r);
            return (
              <React.Fragment key={r.key}>
                <div className={'msg' + (r.mine ? ' mine' : '') + (r.joinNext ? ' grouped join-next' : '') + (r.joinPrev ? ' join-prev' : '')} title={timeOf(r.m.created_at)}>
                  {!r.mine ? <span className="msg-avatar">{!r.joinNext ? <Avatar src={thread.avatar_url} name={thread.username} size={28} /> : null}</span> : null}
                  {r.mine ? a : null}
                  <span className="msg-stack">{piece(r)}</span>
                  {!r.mine ? a : null}
                </div>
                {r.seen ? <div className="seen">{t('d.messages.seen')}</div> : null}
              </React.Fragment>
            );
          })}
          {thinking || theirTyping ? (
            <div className="msg">
              <span className="msg-avatar">
                <Avatar src={thread.avatar_url} name={thread.username} size={28} />
              </span>
              <TypingBubble />
            </div>
          ) : null}
        </div>

        {isErha && msgs && msgs.length < 3 ? (
          <div className="chips">
            {ERHA_OPENERS.map((q) => (
              <button key={q} className="chip-btn" disabled={sending} onClick={() => send({ text: t(q) })}>
                {t(q)}
              </button>
            ))}
          </div>
        ) : faqs.length && !compact ? (
          <div className="chips cv-faqs" aria-label={t('d.messages.faqs')}>
            <span className="cv-faqs-h">{t('d.messages.faqs')}</span>
            {faqs.map((f) => (
              <button
                key={f.id}
                className="chip-btn"
                disabled={sending}
                onClick={async () => {
                  try {
                    await askFaq(f.id);
                    load();
                    changed();
                  } catch (e) {
                    toastError(e);
                  }
                }}
              >
                {f.question}
              </button>
            ))}
          </div>
        ) : null}

        {replies ? (
          <div className="saved-replies">
            <div className="sr-head">
              <b>{t('d.messages.savedReplies')}</b>
              <button className="icon-btn" aria-label={t('d.messages.closeSavedReplies')} onClick={() => setReplies(null)}>
                <Icon name="close" size={16} />
              </button>
            </div>
            {!replies.length ? <p className="muted-text pad">{t('d.messages.savedRepliesEmpty')}</p> : null}
            {replies.map((r) => (
              <button
                key={r.id}
                className="sr-row"
                onClick={() => {
                  setText(r.body);
                  setReplies(null);
                  input.current?.focus();
                }}
              >
                <b>/{r.shortcut}</b>
                <span>{r.body}</span>
              </button>
            ))}
          </div>
        ) : null}

        {limit ? (
          <div className="cv-limit" role="status">
            <Icon name="sparkle" size={18} />
            <span>{limit}</span>
            {!me.plus && /Plus/.test(limit) ? (
              <Link to="/plus" className="link-btn">
                {t('d.messages.getPlus')}
              </Link>
            ) : null}
            <button className="icon-btn tiny" aria-label={t('d.messages.dismiss')} onClick={() => setLimit('')}>
              <Icon name="close" size={14} />
            </button>
          </div>
        ) : null}

        {pending && !rec ? (
          <div className="cv-pending" aria-label={t('d.messages.photosToSend')}>
            <button type="button" className="cv-round quiet" aria-label={t('d.messages.dontSendPhotos')} disabled={sending} onClick={() => setPending(null)}>
              <Icon name="close" size={14} stroke={2.4} />
            </button>
            <span className="cv-pending-thumbs">
              {pending.photos.map((p, i) => (
                <img key={p.url} src={p.url} alt={t('d.messages.photoOf', { n: i + 1, total: pending.photos.length })} />
              ))}
            </span>
            <button type="button" role="switch" aria-checked={pending.once} aria-label={t('snap.viewOnce')} title={t('snap.viewOnceHint')} className={'cv-once-toggle' + (pending.once ? ' on' : '')} disabled={sending} onClick={() => setPending((p) => (p ? { ...p, once: !p.once } : p))}>
              <OnceMark size={18} on={pending.once} />
              <span>{t('snap.viewOnce')}</span>
            </button>
            <button type="button" className="cv-round accent" aria-label={pending.once ? t('d.messages.sendViewOnce') : pending.photos.length > 1 ? t('d.messages.sendPhotos', { count: pending.photos.length }) : t('d.messages.sendPhoto')} disabled={sending} onClick={sendPending}>
              {sending ? <span className="cv-mini-spin" /> : <Icon name="send" size={16} />}
            </button>
          </div>
        ) : null}

        {rec ? (
          <RecordingBar phase={rec.phase} ms={rec.ms} levels={rec.levels} onDiscard={() => finishRecording(false)} onSend={() => finishRecording(true)} />
        ) : (
          <form
            className="composer cv-composer"
            onSubmit={(e) => {
              e.preventDefault();
              if (text.trim()) send({ text });
            }}
            onPaste={(e) => {
              const files = Array.from(e.clipboardData.files);
              if (files.length && !isErha) {
                e.preventDefault();
                addPhotos(files);
              }
            }}
          >
            <span className="cv-emoji-wrap">
              <button type="button" className="icon-btn" aria-label={t('d.messages.emoji')} aria-expanded={emoji} onClick={() => setEmoji(!emoji)}>
                <Icon name="smile" size={24} />
              </button>
              {emoji ? (
                <EmojiPop
                  onClose={() => setEmoji(false)}
                  onPick={(e) => {
                    setText((t) => (t + e).slice(0, 5000));
                    input.current?.focus();
                  }}
                />
              ) : null}
            </span>
            <textarea
              ref={input}
              rows={1}
              placeholder={t(isErha ? 'd.messages.askErha' : 'd.messages.messagePlaceholder')}
              value={text}
              autoFocus={!!text}
              onChange={(e) => {
                const t = e.target.value;
                setText(t);
                if (t.trim()) tellTyping();
                else tellStopped();
                // Typing /shortcut fills in a saved reply, as on the iPhone.
                const m = /^\/(\w+)$/.exec(t.trim());
                if (m) fetchSavedReplies(me.id).then((rs) => { const hit = rs.find((r) => r.shortcut.toLowerCase() === m[1].toLowerCase()); if (hit) setText(hit.body); }, () => {});
              }}
              onKeyDown={(e) => {
                // Enter sends; Shift+Enter starts a new line.
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  if (text.trim()) send({ text });
                }
              }}
              onBlur={tellStopped}
              aria-label={t('d.messages.messageTo', { name: thread.username })}
              maxLength={5000}
            />
            {!empty ? (
              <button className="link-btn" disabled={sending}>
                {t('common.send')}
              </button>
            ) : (
              <>
                {!isErha ? (
                  <>
                    <button type="button" className="icon-btn" aria-label={t('d.messages.recordVoice')} title={t('d.messages.recordHint')} disabled={sending} onPointerDown={micDown} onClick={(e) => e.detail === 0 && startRecording()}>
                      <Icon name="mic" size={24} />
                    </button>
                    <button type="button" className="icon-btn" aria-label={t('d.messages.addPhoto')} onClick={() => file.current?.click()}>
                      <Icon name="image" size={24} />
                    </button>
                    {!compact ? (
                      <button type="button" className="icon-btn" aria-label={t('d.messages.savedReplies')} onClick={() => fetchSavedReplies(me.id).then(setReplies, toastError)}>
                        <Icon name="reply" size={22} />
                      </button>
                    ) : null}
                    <input ref={file} type="file" accept="image/*" multiple hidden onChange={(e) => { const f = Array.from(e.target.files ?? []); e.target.value = ''; if (f.length) addPhotos(f); }} />
                  </>
                ) : null}
                <button type="button" className="icon-btn" aria-label={t('live.sendHeart')} disabled={sending} onClick={() => send({ text: '❤️' })}>
                  <Icon name="heart" size={24} />
                </button>
              </>
            )}
          </form>
        )}
      </div>

      {details && !compact ? (
        <aside className="cv-details" aria-label={t('d.messages.details')}>
          <h3>{t('d.messages.details')}</h3>
          <div className="cv-detail-row">
            <Icon name="mute" size={22} />
            <span className="grow">{t('inbox.mute')}</span>
            <button role="switch" aria-checked={thread.muted} aria-label={t('inbox.mute')} className={'switch' + (thread.muted ? ' on' : '')} onClick={toggleMute}>
              <i />
            </button>
          </div>
          <button type="button" className="cv-detail-row cv-detail-link" onClick={() => setPicker(true)}>
            <Icon name="wallpaper" size={22} />
            <span className="grow">{t('d.messages.wallpaper')}</span>
            <span className="cv-detail-value">{me.plus ? (wall ? wallName(wall) : t('create.none')) : t('common.plus')}</span>
            <Icon name="right" size={16} stroke={2} />
          </button>
          <div className="cv-detail-sec">
            <b>{t('d.messages.members')}</b>
            <button type="button" className="row full hover" onClick={() => nav('/u/' + thread.username)}>
              <Avatar src={thread.avatar_url} name={thread.username} size={44} />
              <span className="row-text">
                <b>
                  {name}
                  {thread.verified ? <Verified size={12} /> : null}
                </b>
                <span>{thread.username}</span>
              </span>
            </button>
          </div>
          <div className="cv-detail-foot">
            {!isErha ? (
              <>
                <button type="button" onClick={() => setReporting(true)}>
                  {t('profile.report')}
                </button>
                <button type="button" onClick={blockThem}>
                  {t('profile.block')}
                </button>
              </>
            ) : null}
            <button type="button" onClick={removeChat}>
              {t('inbox.deleteChat')}
            </button>
          </div>
        </aside>
      ) : null}

      {viewing ? (
        <PhotoViewer
          urls={viewing}
          onClose={() => setViewing(null)}
          onForward={
            isErha
              ? undefined
              : () => {
                  setForwarding(viewing);
                  setViewing(null);
                }
          }
        />
      ) : null}
      {forwarding ? <ForwardPhotos media={forwarding} onClose={() => setForwarding(null)} onSent={changed} /> : null}
      {snap ? <SnapViewer url={snap.url} onClose={closeSnap} /> : null}
      {picker ? (
        <Modal title={t('settings.chatWallpaper')} onClose={() => setPicker(false)} className="mx-wall-modal">
          <WallpaperPicker onDone={() => setPicker(false)} />
        </Modal>
      ) : null}
      {reporting ? (
        <Modal onClose={() => setReporting(false)} className="choices confirm">
          <div className="confirm-text">
            <h3>{t('profile.reportTitle')}</h3>
            <p>{t('d.messages.reportWhy', { username: thread.username })}</p>
          </div>
          {REPORT_REASONS.map((r) => (
            <button key={r.reason} type="button" onClick={() => reportThem(r.reason)}>
              {t(r.key)}
            </button>
          ))}
          <button type="button" onClick={() => setReporting(false)}>
            {t('common.cancel')}
          </button>
        </Modal>
      ) : null}
    </div>
  );
}

/** The small inbox's chat header: back to the list, who, then expand and close. */
function CompactHead({ children, onBack, onExpand, onClose }: { children?: React.ReactNode; onBack?: () => void; onExpand?: () => void; onClose?: () => void }) {
  return (
    <header className="chat-head cv-head compact">
      <button className="icon-btn" aria-label={t('d.messages.backToMessages')} onClick={onBack}>
        <Icon name="back" size={20} />
      </button>
      {children ?? <span className="grow" />}
      <button className="icon-btn" aria-label={t('d.messages.openFullChat')} onClick={onExpand}>
        <Icon name="expand" size={18} />
      </button>
      <button className="icon-btn" aria-label={t('d.messages.closeMessages')} onClick={onClose}>
        <Icon name="close" size={18} />
      </button>
    </header>
  );
}
