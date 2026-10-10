// Support and feedback in the admin console, as on the iPhone console (admin-support, its [id]
// screen and admin-feedback): the queue of live support chats with the open conversation beside it,
// where an admin answers under their own name and closes the chat; the help requests (tickets) sent
// from Help; and the ratings, ideas and problems members send.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { answerSupportTicket, closeSupportChat, closeSupportTicket, fetchFeedback, fetchSupportChats, fetchSupportMessages, fetchSupportTickets, getProfile, sendAgentReply } from 'shared/api';
import { supabase } from 'shared/supabase';
import { ago, agoLong, chatStamp } from 'shared/theme';
import type { Feedback as FeedbackRow, Profile, SupportChat, SupportMessage, SupportTicket } from 'shared/types';
import { PLATFORM_LABEL, fetchSupportChat, refreshAdminCounts, useAdminCounts } from '../lib/admin';
import { useMe } from '../lib/me';
import { nav, parts } from '../lib/router';
import { Avatar, Empty, Failed, Icon, Modal, Spinner, ask, toast, toastError, useLoad } from '../ui/kit';

/** Tell the member "typing" at most this often while the admin types. */
const TYPING_EVERY_MS = 2000;
/** A safety net under Realtime: the conversation and the queue are fetched again this often. */
const POLL_MS = 10000;
/** Messages further apart than this get a date and time between them. */
const STAMP_GAP_MS = 60 * 60e3;

/** True while someone from the team has taken the chat over and the assistant is keeping quiet. */
const agentActive = (chat: Pick<SupportChat, 'ai_paused_until'> | null | undefined) => !!chat?.ai_paused_until && Date.parse(chat.ai_paused_until) > Date.now();

const isLocal = (m: SupportMessage) => m.id.startsWith('local-');
/** Is this server message the one a local message stood in for? Same sender, same words. */
const sameAs = (local: SupportMessage, real: SupportMessage) => real.role === local.role && real.sender_id === local.sender_id && real.text.trim() === local.text.trim();

/** One message from Realtime: replaces the local copy it stands for, or is added at the end. */
function mergeMessage(prev: SupportMessage[] | null, m: SupportMessage): SupportMessage[] {
  const list = prev ?? [];
  if (list.some((x) => x.id === m.id)) return list;
  const i = list.findIndex((x) => isLocal(x) && sameAs(x, m));
  if (i >= 0) return [...list.slice(0, i), m, ...list.slice(i + 1)];
  return [...list, m];
}

/** The server's list, plus any local messages it doesn't have yet (still on their way). */
function reconcile(server: SupportMessage[], prev: SupportMessage[] | null): SupportMessage[] {
  const known = new Set((prev ?? []).filter((m) => !isLocal(m)).map((m) => m.id));
  const claimed = new Set<string>();
  const waiting = (prev ?? []).filter(isLocal).filter((local) => {
    const real = server.find((r) => !known.has(r.id) && !claimed.has(r.id) && sameAs(local, r));
    if (!real) return true;
    claimed.add(real.id);
    return false;
  });
  return [...server, ...waiting];
}

/** The assistant's small mark: the accent colours in a dot. */
function AssistantMark({ size = 16 }: { size?: number }) {
  return <span className="adm-ai-mark" style={{ width: size, height: size }} aria-hidden="true" />;
}

/** Who is looking after a chat: the assistant, or the last person from the team who answered. */
function WhoPill({ chat }: { chat: SupportChat }) {
  const person = !!chat.agent_name;
  return (
    <span className={'adm-who-pill' + (person ? ' person' : '')}>
      {person ? null : <AssistantMark size={12} />}
      <span>{person ? `Answered by ${chat.agent_name}` : 'With assistant'}</span>
    </span>
  );
}

/* ------------------------------------------------------------------ the page */

/** Support: live chats (the default) and the help requests sent from Help. */
export function Support({ path }: { path: string }) {
  const sub = parts(path)[2] ?? '';
  const counts = useAdminCounts();
  const tickets = sub === 'requests';
  return (
    <div className="admin-wide xl adm-support-page">
      <div className="dash-head">
        <div>
          <h1 className="page-title">Support</h1>
          <p className="muted-text small">{tickets ? 'Help requests members send from Help, to answer by message.' : 'Members asking for help: the assistant answers first, and you can step in.'}</p>
        </div>
      </div>
      <div className="seg left tabs-line adm-tabs" role="tablist">
        <button role="tab" aria-selected={!tickets} className={!tickets ? 'on' : ''} onClick={() => nav('/admin/support')}>
          Live chats{counts.chats ? <span className="adm-count">{counts.chats}</span> : null}
        </button>
        <button role="tab" aria-selected={tickets} className={tickets ? 'on' : ''} onClick={() => nav('/admin/support/requests')}>
          Help requests{counts.tickets ? <span className="adm-count">{counts.tickets}</span> : null}
        </button>
      </div>
      {tickets ? <Tickets /> : <Chats openId={sub || null} />}
    </div>
  );
}

/* ------------------------------------------------------------------ live chats */

function Chats({ openId }: { openId: string | null }) {
  const [which, setWhich] = useState<'open' | 'all'>('open');
  const [chats, setChats] = useState<SupportChat[] | null>(null);
  const [error, setError] = useState<unknown>(null);

  // Only the latest ask may fill the list, so a slow answer for the other filter can't land on this one.
  const asked = useRef(0);
  const load = useCallback(() => {
    const n = ++asked.current;
    return fetchSupportChats(which).then(
      (list) => {
        if (n !== asked.current) return;
        setChats(list);
        setError(null);
      },
      (e) => n === asked.current && setError(e),
    );
  }, [which]);

  useEffect(() => {
    setChats(null);
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  // A new chat, a new message or an answer elsewhere moves a chat up the list: reload when one changes.
  const loadRef = useRef(load);
  loadRef.current = load;
  useEffect(() => {
    let alive = true;
    let channel: any = null;
    let soon: ReturnType<typeof setTimeout> | null = null;
    Promise.resolve(supabase.realtime.setAuth())
      .catch(() => {})
      .then(() => {
        if (!alive) return;
        channel = supabase
          .channel(`admin-support-chats-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`)
          .on('postgres_changes' as any, { event: '*', schema: 'public', table: 'community_support_chats' }, () => {
            // Several changes arrive together (a message updates its chat): one reload for the lot.
            if (soon) clearTimeout(soon);
            soon = setTimeout(() => {
              soon = null;
              if (alive) {
                loadRef.current();
                refreshAdminCounts();
              }
            }, 400);
          })
          .subscribe();
      });
    return () => {
      alive = false;
      if (soon) clearTimeout(soon);
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  const changed = () => {
    load();
    refreshAdminCounts();
  };

  return (
    <div className="adm-support">
      <aside className="adm-chat-list" aria-label="Support chats">
        <div className="seg left tight adm-chat-filter">
          {(['open', 'all'] as const).map((w) => (
            <button key={w} className={which === w ? 'on' : ''} onClick={() => setWhich(w)} aria-pressed={which === w}>
              {w === 'open' ? 'Open' : 'All'}
            </button>
          ))}
        </div>
        {chats === null ? (
          error ? <Failed error={error} retry={load} /> : <Spinner />
        ) : !chats.length ? (
          <p className="adm-list-empty muted-text">{which === 'open' ? 'Nothing open. When a member starts a support chat, it appears here.' : 'Support chats with members appear here.'}</p>
        ) : (
          chats.map((c) => {
            const name = c.profile?.full_name || c.profile?.username || 'Member';
            const closed = c.status === 'closed';
            return (
              <button key={c.id} className={'adm-chat-row' + (c.id === openId ? ' on' : '') + (closed ? ' closed' : '')} onClick={() => nav('/admin/support/' + c.id)} data-chat={c.id}>
                <Avatar src={c.profile?.avatar_url} name={name} size={44} />
                <span className="adm-chat-row-text">
                  <b>{name}</b>
                  <em>
                    {c.profile?.username ? '@' + c.profile.username + ' · ' : ''}
                    {ago(c.updated_at)}
                    {closed ? ' · Closed' : agentActive(c) ? ' · Team answering' : ''}
                  </em>
                  <WhoPill chat={c} />
                </span>
              </button>
            );
          })
        )}
      </aside>
      {openId ? (
        <ChatPane key={openId} id={openId} onChange={changed} />
      ) : (
        <div className="adm-chat-pane adm-chat-none">
          <Empty icon="lifebuoy" title="Choose a chat" body="Open a chat to read it and answer under your own name. Your reply takes over from the assistant for half an hour." />
        </div>
      )}
    </div>
  );
}

/**
 * The typing room both sides join by the same name, support:<chat id>. Returns a function that tells
 * the member "typing", as the iPhone console does.
 */
function useTyping(chatId: string | undefined): (name: string) => void {
  const room = useRef<any>(null);
  useEffect(() => {
    if (!chatId) return;
    let alive = true;
    let channel: any = null;
    Promise.resolve(supabase.realtime.setAuth())
      .catch(() => {})
      .then(() => {
        if (!alive) return;
        channel = (supabase as any).channel(`support:${chatId}`, { config: { broadcast: { self: false } } });
        channel.subscribe();
        room.current = channel;
      });
    return () => {
      alive = false;
      room.current = null;
      if (channel) supabase.removeChannel(channel);
    };
  }, [chatId]);
  return useCallback((name: string) => {
    Promise.resolve(room.current?.send({ type: 'broadcast', event: 'typing', payload: { name: name.slice(0, 80) } })).catch(() => {});
  }, []);
}

/** One support chat, from the team's side. Answering puts your name on the reply and pauses the assistant. */
function ChatPane({ id, onChange }: { id: string; onChange: () => void }) {
  const { me } = useMe();
  // The same name the database puts on our replies (full name, or the username when there isn't one).
  const myName = (me.full_name || '').trim() || me.username || 'Support';
  const [chat, setChat] = useState<SupportChat | null>(null);
  const [member, setMember] = useState<Profile | null>(null);
  const [messages, setMessages] = useState<SupportMessage[] | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading');
  const [error, setError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);
  const [text, setText] = useState('');
  const [closing, setClosing] = useState(false);
  const lastTyping = useRef(0);
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    let live = true;
    setStatus('loading');
    (async () => {
      try {
        const c = await fetchSupportChat(id);
        if (!live) return;
        if (!c) return setStatus('missing');
        setChat(c);
        getProfile(c.user_id).then((p) => live && setMember(p), () => {});
        const list = await fetchSupportMessages(id);
        if (!live) return;
        setMessages((prev) => reconcile(list, prev));
        setStatus('ready');
      } catch (e) {
        if (!live) return;
        setError(e);
        setStatus('error');
      }
    })();
    return () => {
      live = false;
    };
  }, [id, attempt]);

  const refetch = useCallback(() => {
    fetchSupportMessages(id).then((list) => alive.current && setMessages((prev) => reconcile(list, prev)), () => {});
  }, [id]);

  useEffect(() => {
    if (status !== 'ready') return;
    const poll = setInterval(refetch, POLL_MS);
    return () => clearInterval(poll);
  }, [status, refetch]);

  // New messages in this chat, and changes to the chat itself (someone else stepping in, it closing).
  useEffect(() => {
    if (status !== 'ready') return;
    let on = true;
    let channel: any = null;
    Promise.resolve(supabase.realtime.setAuth())
      .catch(() => {})
      .then(() => {
        if (!on) return;
        channel = supabase
          .channel(`admin-support-chat-${id}-${Date.now().toString(36)}`)
          .on('postgres_changes' as any, { event: 'INSERT', schema: 'public', table: 'community_support_messages', filter: `chat_id=eq.${id}` }, (payload: any) => {
            if (on) setMessages((prev) => mergeMessage(prev, payload.new as SupportMessage));
          })
          .on('postgres_changes' as any, { event: 'UPDATE', schema: 'public', table: 'community_support_chats', filter: `id=eq.${id}` }, (payload: any) => {
            if (on) setChat((prev) => (prev ? { ...prev, ...(payload.new as SupportChat) } : (payload.new as SupportChat)));
          })
          .subscribe();
      });
    return () => {
      on = false;
      if (channel) supabase.removeChannel(channel);
    };
  }, [status, id]);

  const sendTyping = useTyping(status === 'ready' ? id : undefined);

  // The newest message stays in view.
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [messages?.length]);

  function change(t: string) {
    setText(t);
    // Enough to keep the member's "typing" showing (it lasts 4 seconds), without a message per key.
    if (t.trim() && Date.now() - lastTyping.current >= TYPING_EVERY_MS) {
      lastTyping.current = Date.now();
      sendTyping(myName);
    }
  }

  async function send() {
    const body = text.trim();
    if (!body || !chat) return;
    const local: SupportMessage = { id: 'local-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), chat_id: chat.id, sender_id: me.id, role: 'agent', agent_name: myName, text: body, created_at: new Date().toISOString() };
    setText('');
    // The next words typed count as a new burst of typing, told at once.
    lastTyping.current = 0;
    setMessages((prev) => [...(prev ?? []), local]);
    try {
      await sendAgentReply(me.id, chat.id, body);
      // The database hands the chat to us for half an hour; show it now rather than when the update lands.
      setChat((c) => (c ? { ...c, agent_id: me.id, agent_name: myName, status: 'open', ai_paused_until: new Date(Date.now() + 30 * 60e3).toISOString() } : c));
      refetch();
      onChange();
    } catch (e) {
      if (!alive.current) return;
      setMessages((prev) => (prev ?? []).filter((x) => x.id !== local.id));
      setText((t) => (t.trim() ? t : body));
      toastError(e);
    }
    input.current?.focus();
  }

  async function close() {
    if (!chat || closing) return;
    if (!(await ask('Close this chat?', 'The member can still read it. If they need more help, they can write again and it comes back to this list.', 'Close chat'))) return;
    setClosing(true);
    try {
      await closeSupportChat(chat.id);
      toast('Chat closed');
      if (alive.current) setChat((c) => (c ? { ...c, status: 'closed' } : c));
      onChange();
    } catch (e) {
      toastError(e);
    } finally {
      if (alive.current) setClosing(false);
    }
  }

  if (status === 'loading') return <div className="adm-chat-pane"><Spinner /></div>;
  if (status === 'error') return <div className="adm-chat-pane"><Failed error={error} retry={() => setAttempt((n) => n + 1)} /></div>;
  if (status === 'missing' || !chat) {
    return (
      <div className="adm-chat-pane adm-chat-none">
        <Empty icon="lifebuoy" title="This chat isn't available" body="It may have been deleted along with the member's account." />
      </div>
    );
  }

  const memberName = member?.full_name || member?.username || 'Member';
  const team = agentActive(chat);
  const list = messages ?? [];
  // Messages from the same sender in a row share one label; a long gap gets a date between.
  const key = (m: SupportMessage) => m.role + ':' + (m.role === 'agent' ? m.sender_id ?? m.agent_name : '');

  return (
    <section className="adm-chat-pane" aria-label={'Support chat with ' + memberName}>
      <header className="adm-chat-head">
        <button className="adm-chat-member" onClick={() => nav('/admin/people/' + chat.user_id)} aria-label={memberName + ', open in People'}>
          <Avatar src={member?.avatar_url} name={memberName} size={40} />
          <span className="adm-chat-member-text">
            <b>{memberName}</b>
            <em>
              {team
                ? `${chat.agent_name === myName ? 'You are' : `${chat.agent_name || 'The team'} is`} answering. The assistant is paused for now.`
                : 'The assistant is answering. Your reply takes over for half an hour.'}
            </em>
          </span>
        </button>
        {chat.status === 'open' ? (
          <button className="btn quiet small" disabled={closing} onClick={close}>
            {closing ? 'Closing…' : 'Close chat'}
          </button>
        ) : (
          <span className="pill">Closed</span>
        )}
      </header>
      <div className="adm-chat-scroll" ref={scroller}>
        {!list.length ? <p className="muted-text adm-list-empty">No messages yet.</p> : null}
        {list.map((m, i) => {
          const before = list[i - 1];
          const stamp = !before || Date.parse(m.created_at) - Date.parse(before.created_at) > STAMP_GAP_MS;
          const first = !before || stamp || key(before) !== key(m);
          // The member on the left; the support side (the assistant and the team) on the right.
          const side = m.role === 'member' ? 'them' : 'us';
          return (
            <React.Fragment key={m.id}>
              {stamp ? <div className="adm-stamp">{chatStamp(m.created_at)}</div> : null}
              <div className={'adm-msg ' + side + ' ' + m.role + (isLocal(m) ? ' sending' : '') + (first ? ' first' : '')} data-role={m.role}>
                {first ? (
                  <span className="adm-msg-who">
                    {m.role === 'ai' ? (
                      <>
                        <AssistantMark /> Community assistant
                      </>
                    ) : m.role === 'agent' ? (
                      <>
                        {m.sender_id === me.id ? 'You' : m.agent_name || 'Support'} · Support team <span className="adm-team">Team</span>
                      </>
                    ) : (
                      memberName
                    )}
                  </span>
                ) : null}
                <div className="adm-bubble">{m.text}</div>
              </div>
            </React.Fragment>
          );
        })}
      </div>
      <form
        className="adm-composer"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <textarea
          ref={input}
          rows={1}
          value={text}
          maxLength={4000}
          placeholder={`Reply as ${myName}…`}
          aria-label={`Reply as ${myName}`}
          onChange={(e) => change(e.target.value)}
          onKeyDown={(e) => {
            // Return sends; Shift and Return starts a new line.
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send();
            }
          }}
        />
        <button className="btn" disabled={!text.trim()}>
          Send
        </button>
      </form>
    </section>
  );
}

/* ------------------------------------------------------------------ help requests (tickets) */

/** Requests sent from Help: read, reply by message, or close. */
function Tickets() {
  const [all, setAll] = useState(false);
  const list = useLoad(() => fetchSupportTickets(all), [all]);
  const [open, setOpen] = useState<SupportTicket | null>(null);
  const [reply, setReply] = useState('');
  const done = () => {
    setOpen(null);
    list.reload();
    refreshAdminCounts();
  };
  return (
    <div>
      <div className="seg left tight adm-chat-filter">
        <button className={!all ? 'on' : ''} onClick={() => setAll(false)}>Open</button>
        <button className={all ? 'on' : ''} onClick={() => setAll(true)}>All</button>
      </div>
      {list.loading ? <Spinner /> : list.error ? <Failed error={list.error} retry={list.reload} /> : !list.data?.length ? <Empty icon="lifebuoy" title="No open requests" body="Requests members send from Help appear here." /> : null}
      {(list.data ?? []).map((t) => (
        <section key={t.id} className="dash-card ticket adm-ticket" onClick={() => { setOpen(t); setReply(t.reply); }}>
          <div className="ticket-head">
            <b>{t.subject || 'No subject'}</b>
            <span className={'pill status-' + t.status}>{t.status}</span>
          </div>
          <p className="muted-text">
            @{t.username} · {agoLong(t.created_at)}
          </p>
          <p className="pre clamp2">{t.body}</p>
          {t.reply ? <p className="ticket-reply pre clamp2">{t.reply}</p> : null}
        </section>
      ))}
      {open ? (
        <Modal title={open.subject || 'Help request'} onClose={() => setOpen(null)} wide>
          <div className="form-pad">
            <p className="muted-text">
              From <button className="link-btn" onClick={() => nav('/admin/people/' + open.user_id)}>@{open.username}</button> · {agoLong(open.created_at)}
            </p>
            <p className="pre">{open.body}</p>
            <label className="form-row">
              <span>Reply</span>
              <textarea rows={5} value={reply} maxLength={4000} onChange={(e) => setReply(e.target.value)} />
            </label>
            <div className="btn-row left">
              <button className="btn" disabled={!reply.trim()} onClick={() => answerSupportTicket(open.id, reply).then(() => { done(); toast('Reply sent'); }, toastError)}>Send reply</button>
              {open.status !== 'closed' ? <button className="btn quiet" onClick={() => closeSupportTicket(open.id).then(done, toastError)}>Close request</button> : null}
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ feedback */

type Filter = 'all' | FeedbackRow['kind'];
const FEEDBACK_FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'review', label: 'Reviews' },
  { key: 'idea', label: 'Ideas' },
  { key: 'problem', label: 'Problems' },
];

/** The label on each one: a review with its stars, an idea or a problem. */
function KindPill({ f }: { f: FeedbackRow }) {
  const label = f.kind === 'review' ? (f.rating ? `Review ★${f.rating}` : 'Review') : f.kind === 'idea' ? 'Idea' : 'Problem';
  return <span className={'adm-kind-pill ' + f.kind}>{label}</span>;
}

/** Five stars, the first `n` filled. */
function Stars({ n, size = 16 }: { n: number; size?: number }) {
  return (
    <span className="adm-stars" aria-hidden="true" style={{ fontSize: size }}>
      {'★★★★★'.slice(0, n)}
      <i>{'★★★★★'.slice(n)}</i>
    </span>
  );
}

/** What members have told us: ratings from "Enjoying Community?" and Help, ideas and problems. */
export function Feedback() {
  const list = useLoad(() => fetchFeedback(), []);
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const items = list.data ?? [];
  const needle = q.trim().toLowerCase();
  const shown = items.filter((f) => (filter === 'all' || f.kind === filter) && (!needle || [f.text, f.full_name, f.username].some((v) => String(v ?? '').toLowerCase().includes(needle))));
  const rated = items.filter((f) => f.kind === 'review' && f.rating);
  const average = rated.length ? rated.reduce((n, f) => n + (f.rating ?? 0), 0) / rated.length : 0;
  const count = (k: Filter) => (k === 'all' ? items.length : items.filter((f) => f.kind === k).length);
  const platform = (p: string) => (p === 'ios' ? 'iPhone' : PLATFORM_LABEL[p] ?? p);

  return (
    <div className="admin-wide adm-feedback">
      <div className="dash-head">
        <div>
          <h1 className="page-title">Feedback and reviews</h1>
          <p className="muted-text small">Ratings, ideas and problems members send.</p>
        </div>
        <button className="btn quiet small" onClick={list.reload}>Refresh</button>
      </div>
      <div className="adm-toolbar">
        <div className="chips" role="tablist">
          {FEEDBACK_FILTERS.map((f) => (
            <button key={f.key} role="tab" aria-selected={filter === f.key} className={'pill-btn' + (filter === f.key ? ' on' : '')} onClick={() => setFilter(f.key)}>
              {f.label}
              {list.data ? <span className="adm-chip-n">{count(f.key)}</span> : null}
            </button>
          ))}
        </div>
        <label className="adm-search">
          <Icon name="search" size={16} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search feedback" aria-label="Search feedback" />
        </label>
      </div>
      {list.loading && !list.data ? (
        <Spinner />
      ) : list.error ? (
        <Failed error={list.error} retry={list.reload} />
      ) : (
        <>
          {rated.length && (filter === 'all' || filter === 'review') ? (
            <section className="dash-card adm-average" aria-label={`${average.toFixed(1)} stars on average`}>
              <b>{average.toFixed(1)}</b>
              <span>
                <Stars n={Math.round(average)} size={18} />
                <em>
                  Average from {rated.length} rating{rated.length === 1 ? '' : 's'}
                </em>
              </span>
            </section>
          ) : null}
          {!shown.length ? (
            <Empty icon="star" title={needle ? 'Nothing matches' : 'Nothing here yet'} body={needle ? 'Try other words.' : filter === 'all' ? 'Reviews, ideas and problems members send appear here.' : 'Nothing of this kind has been sent yet.'} />
          ) : (
            shown.map((f) => {
              const name = f.full_name || f.username || 'A former member';
              return (
                <section key={f.id} className={'dash-card adm-fb ' + f.kind} data-feedback={f.id}>
                  <div className="adm-fb-head">
                    <button className="adm-who" disabled={!f.user_id} onClick={() => f.user_id && nav('/admin/people/' + f.user_id)} aria-label={f.user_id ? name + ', open in People' : name}>
                      <Avatar src={f.avatar_url} name={name} size={32} />
                      <span className="adm-who-text">
                        <b>{name}</b>
                        <em>
                          {agoLong(f.created_at)}
                          {f.platform ? ' · ' + platform(f.platform) : ''}
                          {f.app_version ? ' · ' + f.app_version : ''}
                        </em>
                      </span>
                    </button>
                    <KindPill f={f} />
                  </div>
                  {f.text ? <p className="pre">{f.text}</p> : f.kind === 'review' ? <p className="muted-text"><i>No words, just the stars.</i></p> : null}
                </section>
              );
            })
          )}
        </>
      )}
    </div>
  );
}
