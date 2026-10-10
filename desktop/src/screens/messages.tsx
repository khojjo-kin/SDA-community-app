// Messages, laid out like Instagram on the web: conversations on the left, the open chat on the
// right. New messages arrive live over Supabase Realtime, as on the iPhone.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ERHA_ID, askErhaInThread, fetchMessages, fetchTheirLastRead, fetchThread, fetchThreads, getProfile, hideThread, markThreadRead, openThread, peopleToMessage, searchProfiles, sendMessage, setThreadMuted, startCall, uploadImage } from 'shared/api';
import { getPostNow, listen } from 'shared/store';
import { supabase } from 'shared/supabase';
import { ago, chatStamp, clock } from 'shared/theme';
import type { Message, Profile, Thread } from 'shared/types';
import { rememberSize } from '../shims/expo-file-system';
import { profileByUsername } from '../lib/extra';
import { useMe } from '../lib/me';
import { nav, parts } from '../lib/router';
import { Avatar, ChoiceMenu, Empty, Icon, Link, Modal, Spinner, Verified, ask, toast, toastError } from '../ui/kit';

export function Messages({ path, openPost }: { path: string; openPost: (id: string) => void }) {
  const { me } = useMe();
  const seg = parts(path); // ["direct"], ["direct","t",id], ["direct","erha"], ["direct","u",username]
  const [threads, setThreads] = useState<Thread[] | null>(null);
  const [composing, setComposing] = useState(false);
  const threadId = seg[1] === 't' ? seg[2] : null;

  // Like the iPhone inbox: a chat shows once it has a message (or while it is open).
  const load = useCallback(() => fetchThreads().then((ts) => setThreads(ts.filter((t) => t.has_messages)), (e) => { toastError(e); setThreads([]); }), []);
  useEffect(() => {
    load();
    const off = listen('threads', load);
    // Any new message in any of my chats refreshes the list (the database only sends me my own).
    const ch = supabase.channel('inbox-' + Date.now().toString(36)).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'community_messages' }, () => load()).subscribe();
    return () => {
      off();
      supabase.removeChannel(ch);
    };
  }, [load]);

  // /direct/erha and /direct/u/<username> open (or start) the chat with that person.
  useEffect(() => {
    let target: Promise<string> | null = null;
    if (seg[1] === 'erha') target = openThread(ERHA_ID);
    if (seg[1] === 'u' && seg[2]) target = profileByUsername(seg[2]).then((p) => {
      if (!p) throw new Error('There is no account called ' + seg[2] + '.');
      return openThread(p.id);
    });
    target?.then((id) => nav('/direct/t/' + id, true), (e) => {
      toastError(e);
      nav('/direct', true);
    });
  }, [path]);

  return (
    <div className="direct">
      <section className="threads">
        <header className="threads-head">
          <h2>{me.username}</h2>
          <button className="icon-btn" aria-label="New message" onClick={() => setComposing(true)}>
            <Icon name="newchat" size={24} />
          </button>
        </header>
        <div className="threads-sub">
          <b>Messages</b>
        </div>
        <div className="threads-list">
          {threads === null ? <Spinner /> : null}
          {threads && !threads.length ? <p className="muted-text pad">No messages yet.</p> : null}
          {(threads ?? []).map((t) => (
            <a
              key={t.id}
              href={'#/direct/t/' + t.id}
              className={'thread-row' + (t.id === threadId ? ' active' : '') + (t.unread_count && !t.muted ? ' unread' : '')}
              onClick={(e) => {
                e.preventDefault();
                nav('/direct/t/' + t.id);
              }}
            >
              <Avatar src={t.avatar_url} name={t.username} size={56} />
              <span className="row-text">
                <b>
                  {t.full_name || t.username}
                  {t.verified ? <Verified size={12} /> : null}
                </b>
                <span>
                  {t.unread_count > 1 && !t.muted ? `${t.unread_count} new messages` : t.last_message} · {ago(t.last_message_at)}
                </span>
              </span>
              {t.muted ? <Icon name="mute" size={14} /> : t.unread_count ? <span className="unread-dot" /> : null}
            </a>
          ))}
        </div>
      </section>
      <section className="chat-pane">
        {threadId ? (
          <Chat key={threadId} threadId={threadId} openPost={openPost} onChanged={load} />
        ) : (
          <div className="chat-empty">
            <span className="empty-ring big">
              <Icon name="send" size={44} stroke={1.4} />
            </span>
            <h2>Your messages</h2>
            <p className="muted-text">Send a message to start a chat.</p>
            <button className="btn" onClick={() => setComposing(true)}>
              Send message
            </button>
          </div>
        )}
      </section>
      {composing ? <NewMessage onClose={() => setComposing(false)} /> : null}
    </div>
  );
}

function NewMessage({ onClose }: { onClose: () => void }) {
  const { me } = useMe();
  const [q, setQ] = useState('');
  const [people, setPeople] = useState<Profile[] | null>(null);
  const [picked, setPicked] = useState<Profile | null>(null);
  useEffect(() => {
    let alive = true;
    const t = setTimeout(async () => {
      try {
        const list = q.trim() ? await searchProfiles(q) : await peopleToMessage(me.id);
        if (!list.some((p) => p.id === ERHA_ID) && !q.trim()) {
          const erha = await getProfile(ERHA_ID).catch(() => null);
          if (erha) list.unshift(erha);
        }
        if (alive) setPeople(list.filter((p) => p.id !== me.id));
      } catch (e) {
        if (alive) toastError(e);
      }
    }, 200);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q]);
  return (
    <Modal title="New message" onClose={onClose} className="share">
      <div className="share-search">
        <span>To:</span>
        {picked ? (
          <span className="chip">
            {picked.username}
            <button aria-label="Remove" onClick={() => setPicked(null)}>
              <Icon name="close" size={10} stroke={3} />
            </button>
          </span>
        ) : null}
        <input autoFocus placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search people" />
      </div>
      <div className="share-list">
        {people === null ? <Spinner /> : null}
        {people && !people.length ? <p className="muted-text pad">No account found.</p> : null}
        {(people ?? []).map((p) => (
          <label key={p.id} className="row">
            <Avatar src={p.avatar_url} name={p.username} size={44} />
            <span className="row-text">
              <b>{p.full_name || p.username}</b>
              <span>{p.username}</span>
            </span>
            <input type="radio" name="to" className="round-check" checked={picked?.id === p.id} onChange={() => setPicked(p)} />
          </label>
        ))}
      </div>
      <div className="modal-foot">
        <button
          className="btn block"
          disabled={!picked}
          onClick={async () => {
            try {
              const id = await openThread(picked!.id);
              onClose();
              nav('/direct/t/' + id);
            } catch (e) {
              toastError(e);
            }
          }}
        >
          Chat
        </button>
      </div>
    </Modal>
  );
}

function Chat({ threadId, openPost, onChanged }: { threadId: string; openPost: (id: string) => void; onChanged: () => void }) {
  const { me } = useMe();
  const [thread, setThread] = useState<Thread | null | undefined>(undefined);
  const [msgs, setMsgs] = useState<Message[] | null>(null);
  const [theirRead, setTheirRead] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [info, setInfo] = useState(false);
  const [viewing, setViewing] = useState<string | null>(null);
  const log = useRef<HTMLDivElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const isErha = thread?.other_id === ERHA_ID;

  const load = useCallback(async (t?: Thread | null) => {
    const th = t === undefined ? thread : t;
    try {
      const rows = await fetchMessages(threadId, th?.hidden_before);
      setMsgs(rows);
      if (rows.some((m) => m.sender_id !== me.id)) markThreadRead(me.id, threadId).catch(() => {});
    } catch (e) {
      toastError(e);
      setMsgs([]);
    }
  }, [threadId, thread]);

  useEffect(() => {
    let channel: any = null;
    fetchThread(threadId).then(
      (t) => {
        setThread(t);
        if (!t) return;
        load(t);
        fetchTheirLastRead(threadId, t.other_id).then(setTheirRead, () => {});
        channel = supabase
          .channel(`thread-${threadId}-${Date.now().toString(36)}`)
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'community_messages', filter: `thread_id=eq.${threadId}` }, () => load(t))
          .on('postgres_changes', { event: '*', schema: 'public', table: 'community_thread_reads', filter: `thread_id=eq.${threadId}` }, (payload: any) => {
            if (payload?.new?.user_id === t.other_id) setTheirRead(payload.new.last_read_at);
          })
          .subscribe();
      },
      (e) => {
        toastError(e);
        setThread(null);
      },
    );
    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [threadId]);

  useEffect(() => {
    const el = log.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgs?.length, thinking]);

  const send = async (msg: { text?: string; media_url?: string }) => {
    if (sending) return;
    setSending(true);
    try {
      await sendMessage(me.id, threadId, msg);
      if (msg.text !== undefined) setText((cur) => (cur === msg.text ? '' : cur));
      await load();
      onChanged();
      if (isErha && msg.text) {
        setThinking(true);
        try {
          await askErhaInThread(threadId, msg.text);
        } catch (e) {
          toastError(e);
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

  const sendPhoto = async (f: File) => {
    if (!f.type.startsWith('image/')) return toast('Choose a photo.');
    const url = URL.createObjectURL(f);
    rememberSize(url, f.size);
    try {
      setSending(true);
      const img = new Image();
      img.src = url;
      await img.decode();
      const m = await uploadImage(me.id, url, img.naturalWidth);
      setSending(false);
      await send({ media_url: m.url });
    } catch (e) {
      setSending(false);
      toastError(e);
    }
  };

  if (thread === undefined) return <Spinner />;
  if (thread === null) return <Empty icon="send" title="Chat not found" body="It may have been deleted." />;

  const call = async (kind: 'voice' | 'video') => {
    try {
      const url = await startCall(me.id, threadId, kind);
      window.open(url, '_blank');
      load();
    } catch (e) {
      toastError(e);
    }
  };

  const mineLast = [...(msgs ?? [])].reverse().find((m) => m.sender_id === me.id);
  let lastStamp = 0;

  return (
    <div className="chat">
      <header className="chat-head">
        <Avatar src={thread.avatar_url} name={thread.username} size={44} onClick={() => nav('/u/' + thread.username)} />
        <Link to={'/u/' + thread.username} className="chat-who">
          <b>
            {thread.full_name || thread.username}
            {thread.verified ? <Verified size={12} /> : null}
          </b>
          <span>{thread.username}</span>
        </Link>
        <span className="grow" />
        {!isErha ? (
          <>
            <button className="icon-btn" aria-label="Voice call" onClick={() => call('voice')}>
              <Icon name="phone" size={24} />
            </button>
            <button className="icon-btn" aria-label="Video call" onClick={() => call('video')}>
              <Icon name="video" size={26} />
            </button>
          </>
        ) : null}
        <button className="icon-btn" aria-label="Conversation information" onClick={() => setInfo(true)}>
          <Icon name="info" size={24} />
        </button>
      </header>
      <div className="chat-log" ref={log}>
        <div className="chat-intro">
          <Avatar src={thread.avatar_url} name={thread.username} size={96} />
          <b>{thread.full_name || thread.username}</b>
          <span className="muted-text">{thread.username} · Community</span>
          <button className="btn quiet small" onClick={() => nav('/u/' + thread.username)}>
            View profile
          </button>
        </div>
        {msgs === null ? <Spinner /> : null}
        {(msgs ?? []).map((m, i) => {
          const t = new Date(m.created_at).getTime();
          const stamp = t - lastStamp > 30 * 60e3 ? chatStamp(m.created_at) : null;
          lastStamp = t;
          const mine = m.sender_id === me.id;
          const nextSame = msgs![i + 1]?.sender_id === m.sender_id;
          return (
            <React.Fragment key={m.id}>
              {stamp ? <div className="chat-stamp">{stamp}</div> : null}
              <div className={'msg' + (mine ? ' mine' : '') + (nextSame ? ' grouped' : '')}>
                {!mine ? <span className="msg-avatar">{!nextSame ? <Avatar src={thread.avatar_url} name={thread.username} size={28} /> : null}</span> : null}
                <MessageBody m={m} mine={mine} openPost={openPost} onPhoto={setViewing} />
              </div>
            </React.Fragment>
          );
        })}
        {thinking ? (
          <div className="msg">
            <span className="msg-avatar">
              <Avatar src={thread.avatar_url} name={thread.username} size={28} />
            </span>
            <span className="bubble typing">
              <i />
              <i />
              <i />
            </span>
          </div>
        ) : null}
        {mineLast && theirRead && theirRead >= mineLast.created_at && msgs?.[msgs.length - 1]?.id === mineLast.id ? <div className="seen">Seen</div> : null}
      </div>
      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) send({ text });
        }}
        onPaste={(e) => {
          const f = Array.from(e.clipboardData.files)[0];
          if (f && !isErha) {
            e.preventDefault();
            sendPhoto(f);
          }
        }}
      >
        <Icon name="smile" size={24} />
        <input placeholder="Message…" value={text} onChange={(e) => setText(e.target.value)} aria-label={'Message ' + thread.username} maxLength={5000} />
        {text.trim() ? (
          <button className="link-btn" disabled={sending}>
            Send
          </button>
        ) : (
          <>
            {!isErha ? (
              <>
                <button type="button" className="icon-btn" aria-label="Send a photo" onClick={() => file.current?.click()}>
                  <Icon name="image" size={24} />
                </button>
                <input ref={file} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) sendPhoto(f); }} />
              </>
            ) : null}
            <button type="button" className="icon-btn" aria-label="Send a heart" onClick={() => send({ text: '❤️' })}>
              <Icon name="heart" size={24} />
            </button>
          </>
        )}
      </form>
      {info ? (
        <ChoiceMenu
          onClose={() => setInfo(false)}
          items={[
            { label: 'View profile', onClick: () => nav('/u/' + thread.username) },
            { label: thread.muted ? 'Unmute messages' : 'Mute messages', onClick: () => setThreadMuted(me.id, threadId, !thread.muted).then(() => { setThread({ ...thread, muted: !thread.muted }); onChanged(); }, toastError) },
            {
              label: 'Delete chat',
              danger: true,
              bold: true,
              onClick: async () => {
                if (!(await ask('Delete chat?', 'This removes the chat for you only. ' + thread.username + ' keeps their copy.', 'Delete'))) return;
                try {
                  await hideThread(threadId);
                  onChanged();
                  nav('/direct');
                } catch (e) {
                  toastError(e);
                }
              },
            },
          ]}
        />
      ) : null}
      {viewing ? (
        <Modal onClose={() => setViewing(null)} bare className="photo-viewer">
          <img src={viewing} alt="" />
        </Modal>
      ) : null}
    </div>
  );
}

function MessageBody({ m, mine, openPost, onPhoto }: { m: Message; mine: boolean; openPost: (id: string) => void; onPhoto: (url: string) => void }) {
  if (m.call_kind) {
    const live = m.call_url.startsWith('https://');
    return (
      <span className={'bubble call' + (mine ? ' mine' : '')}>
        <Icon name={m.call_kind === 'video' ? 'video' : 'phone'} size={20} />
        <span>{m.text || (m.call_kind === 'video' ? 'Video call' : 'Voice call')}</span>
        {live ? (
          <a className="btn small" href={m.call_url} target="_blank" rel="noreferrer">
            Join
          </a>
        ) : null}
      </span>
    );
  }
  if (m.post_id) {
    const p = getPostNow(m.post_id);
    if (!p) return <span className={'bubble' + (mine ? ' mine' : '')}>Post unavailable</span>;
    const cover = p.media[0]?.type === 'video' ? p.media[0].poster : p.media[0]?.url;
    return (
      <button className="shared-post" onClick={() => openPost(p.id)}>
        <span className="sp-head">
          <Avatar src={p.avatar_url} name={p.username} size={24} />
          <b>{p.username}</b>
        </span>
        {cover ? <img src={cover} alt="" /> : null}
        {p.caption ? (
          <span className="sp-cap">
            <b>{p.username}</b> {p.caption}
          </span>
        ) : null}
      </button>
    );
  }
  return (
    <span className="msg-stack">
      {m.media_url ? (
        <button className="msg-photo" onClick={() => onPhoto(m.media_url)}>
          <img src={m.media_url} alt="Photo" />
        </button>
      ) : null}
      {m.audio_url ? (
        <span className={'bubble audio' + (mine ? ' mine' : '')}>
          <audio controls src={m.audio_url} preload="none" />
          {m.audio_seconds ? <span>{clock(m.audio_seconds)}</span> : null}
        </span>
      ) : null}
      {m.text && !(m.media_url && m.text === 'Sent a photo') ? (
        /^\p{Extended_Pictographic}{1,3}$/u.test(m.text.trim()) ? (
          <span className="emoji-only">{m.text}</span>
        ) : (
          <span className={'bubble' + (mine ? ' mine' : '')}>{m.text}</span>
        )
      ) : null}
    </span>
  );
}
