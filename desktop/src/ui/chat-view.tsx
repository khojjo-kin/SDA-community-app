// One chat: the header (who, "Active now", streak, voice and video calls), the messages, and the
// message box with emoji, photos (sent normally or as view once), saved replies and a heart.
// Used full size on /direct and small inside the corner inbox (compact). New messages, "Seen" and
// typing arrive live over Supabase Realtime, on the same channels as the iPhone app.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { activeLabel, askErhaInThread, askFaq, ERHA_ID, fetchFaqs, fetchMessages, fetchSavedReplies, fetchTheirLastRead, fetchThread, getProfile, hideThread, isOnline, markThreadRead, openViewOnce, report, sendMessage, setBlock, setThreadMuted, uploadImage } from 'shared/api';
import { supabase } from 'shared/supabase';
import { useCalls } from 'shared/calls';
import { errText } from 'shared/theme';
import type { Faq, Message, SavedReply, Thread } from 'shared/types';
import { rememberSize } from '../shims/expo-file-system';
import { useMe } from '../lib/me';
import { nav } from '../lib/router';
import { Avatar, Empty, Icon, Link, Modal, Spinner, Verified, ask, toast, toastError } from './kit';
import { ActiveFace, STREAK_FROM, StreakBadge } from './chat-threads';
import { CallLog, EmojiPop, OnceMark, ScreenshotLine, SharedPost, SnapBubble, SnapViewer, TypingBubble, VoiceMessage, buildRows, firstName, takeDraft, timeOf, type Row } from './chat-bits';
import { NoteBubble } from './notes';

/** Ways to start a chat with Erha, offered while it is still nearly empty. */
const ERHA_OPENERS = ["What is this week's Sabbath School lesson about?", 'Suggest a hymn for a baptism', 'Pray with me for a friend who is unwell'];
/** How often "typing" is sent while you keep typing, and how long their bubble stays after the last one. */
const TYPING_EVERY_MS = 2000;
const TYPING_LINGER_MS = 4000;
/** Said when the database turns a message away under the under-14 rules (as on the iPhone). */
const MINOR_RULE = 'Members under 14 can only message people they follow, and be messaged by people they follow.';

type Pending = { photos: { url: string; size: number }[]; once: boolean };

export function Chat({ threadId, openPost, onChanged, compact, onBack, onExpand, onClose }: { threadId: string; openPost?: (id: string) => void; onChanged?: () => void; compact?: boolean; onBack?: () => void; onExpand?: () => void; onClose?: () => void }) {
  const { me } = useMe();
  const calls = useCalls();
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
  const [viewing, setViewing] = useState<string | null>(null);
  const [snap, setSnap] = useState<{ id: string; url: string } | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [emoji, setEmoji] = useState(false);
  const [limit, setLimit] = useState('');
  const log = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
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
  const isErha = thread?.other_id === ERHA_ID;
  const changed = () => onChanged?.();
  const showPost = openPost ?? ((id: string) => nav('/p/' + id));

  const load = useCallback(async () => {
    try {
      const rows = await fetchMessages(threadId, threadRef.current?.hidden_before);
      const opened = openedHere.current;
      setMsgs(rows.map((m) => (opened.has(m.id) ? { ...m, media_url: '', opened_at: m.opened_at ?? opened.get(m.id)! } : m)));
      if (rows.some((m) => m.sender_id !== me.id)) markThreadRead(me.id, threadId).catch(() => {});
    } catch (e) {
      toastError(e);
      setMsgs((cur) => cur ?? []);
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
            if (payload?.new?.user_id === t.other_id) setTheirRead(payload.new.last_read_at);
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
  useEffect(stick, [msgs?.length, thinking, theirTyping, pending, limit, theirRead]);

  /** Puts a refused send into words: the under-14 rule when that is the likely reason. */
  const explain = (e: unknown) => {
    const err = e as { code?: string; message?: string } | null;
    const refused = err?.code === '42501' || /row-level security/i.test(String(err?.message ?? ''));
    return refused && mutual.current === false && !me.suspended ? MINOR_RULE : errText(e);
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
    if (!imgs.length) return toast('Choose a photo.');
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
        toast('This photo has already been opened.');
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
        <Empty icon="send" title="This chat isn't available" body="The other account may have been deleted." />
      </div>
    );
  }

  // In-app calls, the same as on the iPhone: the other person's phone or Mac rings.
  const call = (kind: 'voice' | 'video') => {
    if (calls.inCall) return;
    calls.startCall(thread.other_id, kind, threadId).catch(toastError);
  };
  const name = thread.full_name || thread.username;
  const online = !isErha && isOnline(thread.active_at);
  const sub = thinking ? 'Thinking…' : theirTyping ? 'Typing…' : isErha ? 'Church assistant' : activeLabel(thread.active_at) || thread.username;

  const toggleMute = () =>
    setThreadMuted(me.id, threadId, !thread.muted).then(() => {
      setThread({ ...thread, muted: !thread.muted });
      toast(thread.muted ? 'Messages unmuted' : 'Messages muted');
      changed();
    }, toastError);
  const removeChat = async () => {
    if (!(await ask('Delete this chat?', 'The messages are removed for you only. A new message starts the chat again.', 'Delete'))) return;
    try {
      await hideThread(threadId);
      changed();
      if (compact) onBack?.();
      else nav('/direct');
    } catch (e) {
      toastError(e);
    }
  };
  const blockThem = async () => {
    if (!(await ask(`Block ${thread.username}?`, "They won't be able to message you or find your profile. They won't be told.", 'Block'))) return;
    try {
      await setBlock(me.id, thread.other_id, true);
      toast(`${thread.username} is blocked`);
      changed();
      if (compact) onBack?.();
      else nav('/direct');
    } catch (e) {
      toastError(e);
    }
  };
  const reportThem = async () => {
    if (!(await ask(`Report ${thread.username}?`, "Community's team will look at this account. They won't know who reported it.", 'Report'))) return;
    report(me.id, { userId: thread.other_id }, 'Reported from a chat').then(() => toast('Thanks for letting us know'), toastError);
  };

  const piece = (r: Row) => {
    const m = r.m;
    switch (r.kind) {
      case 'snap':
        return <SnapBubble mine={r.mine} opened={!!m.opened_at} onOpen={() => openSnap(m)} />;
      case 'call':
        return <CallLog m={m} mine={r.mine} onCall={isErha ? undefined : () => call(m.call_kind === 'video' ? 'video' : 'voice')} />;
      case 'voice':
        return <VoiceMessage m={m} mine={r.mine} />;
      case 'post':
        return <SharedPost id={m.post_id!} onOpen={showPost} />;
      case 'photo':
        return (
          <button type="button" className="msg-photo" onClick={() => setViewing(m.media_url)} aria-label="Photo">
            <img src={m.media_url} alt="" onLoad={stick} />
          </button>
        );
      default:
        return r.big ? <span className="emoji-only">{m.text}</span> : <span className={'bubble' + (r.mine ? ' mine' : '')}>{m.text}</span>;
    }
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
          <button className="icon-btn" aria-label="Voice call" disabled={calls.inCall} onClick={() => call('voice')}>
            <Icon name="phone" size={20} />
          </button>
          <button className="icon-btn" aria-label="Video call" disabled={calls.inCall} onClick={() => call('video')}>
            <Icon name="video" size={22} />
          </button>
        </>
      ) : null}
    </CompactHead>
  ) : (
    <header className="chat-head cv-head">
      <button type="button" className="avatar-btn" onClick={() => nav('/u/' + thread.username)} aria-label={'Open ' + name + "'s profile"}>
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
          {thread.muted ? ' · muted' : ''}
        </span>
      </Link>
      <span className="grow" />
      {!isErha ? (
        <>
          <button className="icon-btn" aria-label="Voice call" disabled={calls.inCall} onClick={() => call('voice')}>
            <Icon name="phone" size={24} />
          </button>
          <button className="icon-btn" aria-label="Video call" disabled={calls.inCall} onClick={() => call('video')}>
            <Icon name="video" size={26} />
          </button>
        </>
      ) : null}
      <button className={'icon-btn' + (details ? ' cv-on' : '')} aria-label="Conversation information" aria-pressed={details} onClick={() => setDetails(!details)}>
        <Icon name="info" size={24} />
      </button>
    </header>
  );

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
        <div
          className="chat-log"
          ref={log}
          onScroll={(e) => {
            const el = e.currentTarget;
            atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
          }}
        >
          {isErha ? (
            <div className="chat-intro">
              <Avatar src={thread.avatar_url} name="Erha" size={compact ? 64 : 96} />
              <b>Hi, I'm Erha</b>
              <span className="muted-text cv-intro-text">I help with church life: the Bible, Sabbath School, hymns, prayer and planning activities. Ask me anything about it.</span>
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
                View profile
              </button>
            </div>
          )}
          {msgs === null ? <Spinner /> : null}
          {rows.map((r) => {
            if (r.kind === 'stamp') return <div key={r.key} className="chat-stamp">{r.label}</div>;
            if (r.kind === 'notice') return <ScreenshotLine key={r.key} mine={r.mine} name={firstName(thread)} />;
            return (
              <React.Fragment key={r.key}>
                <div className={'msg' + (r.mine ? ' mine' : '') + (r.joinNext ? ' grouped join-next' : '') + (r.joinPrev ? ' join-prev' : '')} title={timeOf(r.m.created_at)}>
                  {!r.mine ? <span className="msg-avatar">{!r.joinNext ? <Avatar src={thread.avatar_url} name={thread.username} size={28} /> : null}</span> : null}
                  <span className="msg-stack">{piece(r)}</span>
                </div>
                {r.seen ? <div className="seen">Seen</div> : null}
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
              <button key={q} className="chip-btn" disabled={sending} onClick={() => send({ text: q })}>
                {q}
              </button>
            ))}
          </div>
        ) : faqs.length && !compact ? (
          <div className="chips">
            {faqs.map((f) => (
              <button
                key={f.id}
                className="chip-btn"
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
              <b>Saved replies</b>
              <button className="icon-btn" aria-label="Close saved replies" onClick={() => setReplies(null)}>
                <Icon name="close" size={16} />
              </button>
            </div>
            {!replies.length ? <p className="muted-text pad">Save messages you send often, then drop them into any chat from here. Add them in Settings → Saved replies.</p> : null}
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
                Get Plus
              </Link>
            ) : null}
            <button className="icon-btn tiny" aria-label="Dismiss" onClick={() => setLimit('')}>
              <Icon name="close" size={14} />
            </button>
          </div>
        ) : null}

        {pending ? (
          <div className="cv-pending" aria-label="Photos to send">
            <button type="button" className="cv-round quiet" aria-label="Don't send these photos" disabled={sending} onClick={() => setPending(null)}>
              <Icon name="close" size={14} stroke={2.4} />
            </button>
            <span className="cv-pending-thumbs">
              {pending.photos.map((p, i) => (
                <img key={p.url} src={p.url} alt={`Photo ${i + 1} of ${pending.photos.length}`} />
              ))}
            </span>
            <button type="button" role="switch" aria-checked={pending.once} aria-label="View once" title="When on, they can open each photo one time" className={'cv-once-toggle' + (pending.once ? ' on' : '')} disabled={sending} onClick={() => setPending((p) => (p ? { ...p, once: !p.once } : p))}>
              <OnceMark size={18} on={pending.once} />
              <span>View once</span>
            </button>
            <button type="button" className="cv-round accent" aria-label={pending.once ? 'Send as view once' : pending.photos.length > 1 ? `Send ${pending.photos.length} photos` : 'Send photo'} disabled={sending} onClick={sendPending}>
              {sending ? <span className="cv-mini-spin" /> : <Icon name="send" size={16} />}
            </button>
          </div>
        ) : null}

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
            <button type="button" className="icon-btn" aria-label="Emoji" aria-expanded={emoji} onClick={() => setEmoji(!emoji)}>
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
          <input
            ref={input}
            placeholder={isErha ? 'Ask Erha…' : 'Message…'}
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
            onBlur={tellStopped}
            aria-label={'Message ' + thread.username}
            maxLength={5000}
          />
          {text.trim() ? (
            <button className="link-btn" disabled={sending}>
              Send
            </button>
          ) : (
            <>
              {!isErha ? (
                <>
                  {!compact ? (
                    <button type="button" className="icon-btn" aria-label="Saved replies" onClick={() => fetchSavedReplies(me.id).then(setReplies, toastError)}>
                      <Icon name="reply" size={22} />
                    </button>
                  ) : null}
                  <button type="button" className="icon-btn" aria-label="Add a photo" onClick={() => file.current?.click()}>
                    <Icon name="image" size={24} />
                  </button>
                  <input ref={file} type="file" accept="image/*" multiple hidden onChange={(e) => { const f = Array.from(e.target.files ?? []); e.target.value = ''; if (f.length) addPhotos(f); }} />
                </>
              ) : null}
              <button type="button" className="icon-btn" aria-label="Send a heart" disabled={sending} onClick={() => send({ text: '❤️' })}>
                <Icon name="heart" size={24} />
              </button>
            </>
          )}
        </form>
      </div>

      {details && !compact ? (
        <aside className="cv-details" aria-label="Details">
          <h3>Details</h3>
          <div className="cv-detail-row">
            <Icon name="mute" size={22} />
            <span className="grow">Mute messages</span>
            <button role="switch" aria-checked={thread.muted} aria-label="Mute messages" className={'switch' + (thread.muted ? ' on' : '')} onClick={toggleMute}>
              <i />
            </button>
          </div>
          <div className="cv-detail-sec">
            <b>Members</b>
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
                <button type="button" onClick={reportThem}>
                  Report
                </button>
                <button type="button" onClick={blockThem}>
                  Block
                </button>
              </>
            ) : null}
            <button type="button" onClick={removeChat}>
              Delete chat
            </button>
          </div>
        </aside>
      ) : null}

      {viewing ? (
        <Modal onClose={() => setViewing(null)} bare className="photo-viewer">
          <img src={viewing} alt="" />
        </Modal>
      ) : null}
      {snap ? <SnapViewer url={snap.url} onClose={closeSnap} /> : null}
    </div>
  );
}

/** The small inbox's chat header: back to the list, who, then expand and close. */
function CompactHead({ children, onBack, onExpand, onClose }: { children?: React.ReactNode; onBack?: () => void; onExpand?: () => void; onClose?: () => void }) {
  return (
    <header className="chat-head cv-head compact">
      <button className="icon-btn" aria-label="Back to messages" onClick={onBack}>
        <Icon name="back" size={20} />
      </button>
      {children ?? <span className="grow" />}
      <button className="icon-btn" aria-label="Open the full chat" onClick={onExpand}>
        <Icon name="expand" size={18} />
      </button>
      <button className="icon-btn" aria-label="Close messages" onClick={onClose}>
        <Icon name="close" size={18} />
      </button>
    </header>
  );
}
