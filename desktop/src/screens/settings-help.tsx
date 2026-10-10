// Help: the Help Centre (common questions, feedback, earlier requests, the policies) beside a live
// support chat (the assistant answers straight away; a person from the team can step in and answers
// under their own name), and Report a problem at /help/problem. All through the shared api.ts, so
// the team answers from the same admin screens whichever app a member writes from.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { fetchSupportMessages, findSupportChat, mySupportTickets, openSupportTicket, sendFeedback, sendSupportMessage, startSupportChat, uploadImage } from 'shared/api';
import { supabase } from 'shared/supabase';
import { agoLong, chatStamp, errText } from 'shared/theme';
import type { Feedback, SupportChat, SupportMessage } from 'shared/types';
import { useMe } from '../lib/me';
import { nav, parts, useRoute } from '../lib/router';
import { rememberSize } from '../shims/expo-file-system';
import { Icon, Link, Modal, Spinner, toast, toastError, useLoad } from '../ui/kit';
import { LEGAL_DOCS } from './legal';
import { Block, Card, LinkRow } from './settings-ui';

declare const __VERSION__: string;

/** What the feedback is sent with, to help match a problem to a release. */
const PLATFORM = /Electron/i.test(navigator.userAgent) ? (/Mac/.test(navigator.platform) ? 'mac' : 'desktop') : 'web';

/* ---------- the Help Centre ---------- */

const QA: [string, string][] = [
  ['Who answers when I chat with support?', "Our assistant answers straight away, at any time of day. If it can't help, someone from our team joins the same chat, and you'll see their name on their replies. Everything stays in one conversation, so you never have to explain twice."],
  ['How do I change my profile, or add another account?', 'Your name, username, photo and bio are in Settings → Edit profile. To add a second account, open More → Switch accounts and log in to it. You can keep up to five accounts on one computer and switch without logging out.'],
  ['What does a private account do?', 'Only the people who follow you see your posts and stories. Anyone else who clicks Follow sends you a request, which you accept or decline from Notifications. Turn it on or off in Settings → Account privacy.'],
  ['Where are the Bible, Hymnal and Pod?', 'Open Church apps in the bar on the left: the Bible, Sabbath School, the Hymnal, Pod, Churches, Communities and Erha are all there.'],
  ['What is Community Plus?', 'Plus is £4.99 a month. It gives you Erha without limits, profile viewers, read receipts off, your own ring colour and profile theme and more. Subscribe from More → Get Community Plus; you can cancel at any time.'],
  ['How do I get the blue tick?', 'The blue tick shows an account is who it says it is. It is free and cannot be bought: request it from the Community Plus page with a photo of an ID document and a selfie. An admin checks them, and the photos are deleted once your request is decided.'],
  ['How do ads and fundraisers work?', 'Any post of yours can be promoted from its menu or from the Professional dashboard: choose how many days and pay by card, and it shows as Sponsored at the top of For you and Explore. Fundraisers go on your profile, and gifts go straight to your own payout account.'],
  ['What is Erha?', "Erha is the church assistant built into the app. Ask it about a Bible passage, a hymn, this week's lesson or anything about church life. Everyone gets 15 messages a day; Plus members have no limit."],
  ['How do I delete my account, and what are the 30 days?', 'In Settings → Accounts Centre, choose Deactivate account. Your profile, posts and messages are hidden straight away. For 30 days you can log back in and restore everything exactly as it was. After that it is all deleted for good.'],
  ['How do I report something?', 'Click the three dots on a post, comment or profile and choose Report, then say what is wrong. An admin looks at every report. You can also block an account from its profile.'],
];

export function Help() {
  const route = useRoute();
  const sub = parts(route)[1];
  return (
    <div className="st-help">
      <div className="st-help-main">{sub === 'problem' ? <ReportProblem /> : <HelpCentre />}</div>
      <aside className="st-help-chat">
        <SupportChatPanel focus={sub === 'chat'} />
      </aside>
    </div>
  );
}

function HelpCentre() {
  const { me } = useMe();
  const tickets = useLoad(() => mySupportTickets(me.id), []);
  const [open, setOpen] = useState(-1);
  const [sheet, setSheet] = useState<Feedback['kind'] | null>(null);
  const [writing, setWriting] = useState(false);
  return (
    <div className="st-page wide">
      <h1 className="st-title">Help Centre</h1>
      <button className="st-help-hero" onClick={() => nav('/help/chat')}>
        <span className="st-help-hero-icon">
          <Icon name="lifebuoy" size={30} />
        </span>
        <span className="st-row-text">
          <b>Chat with support</b>
          <span>Our assistant replies straight away. If it can't help, someone from our team joins the same chat.</span>
        </span>
        <Icon name="right" size={20} stroke={2.2} />
      </button>

      <Block title="Common questions">
        <div className="st-card st-faq">
          {QA.map(([q, a], i) => (
            <div key={q} className={'st-qa' + (open === i ? ' open' : '')}>
              <button aria-expanded={open === i} onClick={() => setOpen(open === i ? -1 : i)}>
                <span>{q}</span>
                <Icon name={open === i ? 'down' : 'right'} size={16} stroke={2} />
              </button>
              {open === i ? <p>{a}</p> : null}
            </div>
          ))}
        </div>
      </Block>

      <Block title="Tell us what you think">
        <Card>
          <LinkRow icon="star" title="Rate the app" onClick={() => setSheet('review')} />
          <LinkRow icon="bulb" title="Suggest an idea" onClick={() => setSheet('idea')} />
          <LinkRow icon="flag" title="Report a problem" to="/help/problem" />
        </Card>
      </Block>

      <Block
        title="Your requests"
        action={
          <button className="btn quiet small" onClick={() => setWriting(true)}>
            Message support
          </button>
        }
      >
        {tickets.loading ? <Spinner /> : !tickets.data?.length ? <p className="st-empty-line">You haven't sent a request yet. For most things, the chat is quickest.</p> : null}
        {(tickets.data ?? []).map((t) => (
          <section key={t.id} className="st-card ticket">
            <div className="ticket-head">
              <b>{t.subject || 'No subject'}</b>
              <span className={'pill status-' + t.status}>{t.status === 'open' ? 'Open' : t.status === 'answered' ? 'Answered' : 'Closed'}</span>
            </div>
            <p className="pre">{t.body}</p>
            <span className="st-note">Sent {agoLong(t.created_at).toLowerCase()}</span>
            {t.reply ? (
              <div className="ticket-reply">
                <b>Reply from our team</b>
                <p className="pre">{t.reply}</p>
              </div>
            ) : null}
          </section>
        ))}
      </Block>

      <Block title="Policies">
        <Card>
          {LEGAL_DOCS.map((d) => (
            <LinkRow key={d.id} icon={d.icon} title={d.label} to={'/legal/' + d.id} />
          ))}
        </Card>
      </Block>

      {sheet ? <FeedbackDialog kind={sheet} onClose={() => setSheet(null)} /> : null}
      {writing ? (
        <TicketDialog
          onClose={(sent) => {
            setWriting(false);
            if (sent) tickets.reload();
          }}
        />
      ) : null}
    </div>
  );
}

/* ---------- feedback: a review with stars, or an idea ---------- */

const STAR_WORDS = ['Click a star', 'Poor', 'Not great', 'Okay', 'Good', 'Love it'];

export function StarPicker({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="st-stars">
      <div role="radiogroup" aria-label="Rating">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={n === 1 ? '1 star' : n + ' stars'} className={n <= value ? 'on' : ''} onClick={() => onChange(n)}>
            <Icon name="star" size={36} fill={n <= value ? 'currentColor' : 'none'} stroke={1.6} />
          </button>
        ))}
      </div>
      <span>{STAR_WORDS[value]}</span>
    </div>
  );
}

function FeedbackDialog({ kind, onClose }: { kind: Feedback['kind']; onClose: () => void }) {
  const { me } = useMe();
  const [stars, setStars] = useState(0);
  const [words, setWords] = useState('');
  const [busy, setBusy] = useState(false);
  const review = kind === 'review';
  const canSend = review ? stars > 0 : !!words.trim();
  return (
    <Modal title={review ? 'Rate Community' : 'Suggest an idea'} onClose={onClose}>
      <form
        className="st-modal-body"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!canSend || busy) return;
          setBusy(true);
          try {
            await sendFeedback(me.id, { kind, rating: review ? stars : null, text: words, app_version: __VERSION__, platform: PLATFORM });
            onClose();
            toast(review ? (stars >= 4 ? "Thank you! We're so glad you're enjoying Community." : 'Thank you for your review') : 'Thank you. The team reads every idea.');
          } catch (err) {
            toastError(err);
            setBusy(false);
          }
        }}
      >
        {review ? <StarPicker value={stars} onChange={setStars} /> : null}
        <textarea className="st-input" rows={4} maxLength={2000} value={words} onChange={(e) => setWords(e.target.value)} placeholder={review ? 'What do you like, and what could be better? (optional)' : 'What would make Community better for you?'} aria-label={review ? 'Your review' : 'Your idea'} autoFocus={!review} />
        <button className="btn block big" disabled={!canSend || busy}>
          {busy ? 'Sending…' : 'Send'}
        </button>
      </form>
    </Modal>
  );
}

/** A written request to the team, answered under Your requests (as before live chat). */
function TicketDialog({ onClose }: { onClose: (sent: boolean) => void }) {
  const { me } = useMe();
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  return (
    <Modal title="Message support" onClose={() => onClose(false)} wide>
      <form
        className="form-pad"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!subject.trim()) return setErr('Give it a subject.');
          if (body.trim().length < 10) return setErr('Tell us a little more.');
          setBusy(true);
          try {
            await openSupportTicket(me.id, subject, body);
            toast('Sent. An admin will reply here.');
            onClose(true);
          } catch (e2) {
            setErr(errText(e2));
            setBusy(false);
          }
        }}
      >
        <p className="st-text">Tell the team what is wrong or what you need. They reply here, under Your requests, and in the iPhone app.</p>
        <label className="form-row">
          <span>Subject</span>
          <input value={subject} maxLength={140} onChange={(e) => setSubject(e.target.value)} placeholder="What is it about?" autoFocus />
        </label>
        <label className="form-row">
          <span>Message</span>
          <textarea rows={5} maxLength={4000} value={body} onChange={(e) => setBody(e.target.value)} placeholder="What happened, and what you expected" />
        </label>
        {err ? <p className="field-error">{err}</p> : null}
        <button className="btn block big" disabled={busy}>
          {busy ? 'Sending…' : 'Send request'}
        </button>
      </form>
    </Modal>
  );
}

/* ---------- Report a problem ---------- */

function ReportProblem() {
  const { me } = useMe();
  const [text, setText] = useState('');
  const [shot, setShot] = useState<{ file: File; url: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  // The picture's temporary address is let go once it is replaced or the page closes.
  useEffect(
    () => () => {
      if (shot) URL.revokeObjectURL(shot.url);
    },
    [shot],
  );

  async function send() {
    if (busy || !text.trim()) return;
    setBusy(true);
    try {
      let link = '';
      if (shot) {
        // The picture is stored like a photo in a chat, and its address goes with the report for the team.
        rememberSize(shot.url, shot.file.size);
        const img = new Image();
        img.src = shot.url;
        await img.decode();
        link = (await uploadImage(me.id, shot.url, img.naturalWidth, 1600)).url;
      }
      await sendFeedback(me.id, { kind: 'problem', text: text.trim().slice(0, 1700) + (link ? '\n\nScreenshot: ' + link : ''), app_version: __VERSION__, platform: PLATFORM });
      setSent(true);
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="st-page wide">
        <div className="st-done">
          <span className="st-status-icon">
            <Icon name="check" size={28} stroke={2.4} />
          </span>
          <h1 className="st-title">Thanks for telling us</h1>
          <p className="st-text">We'll look into it. If we need to know more, we'll ask in your support chat.</p>
          <div className="st-actions">
            <Link to="/help" className="btn big quiet">
              Back to Help
            </Link>
            <button
              className="btn big"
              onClick={() => {
                setSent(false);
                setText('');
                setShot(null);
              }}
            >
              Report something else
            </button>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="st-page wide">
      <Link to="/help" className="st-back">
        <Icon name="back" size={18} /> Help Centre
      </Link>
      <h1 className="st-title">Report a problem</h1>
      <p className="st-intro">Tell us what went wrong. To report a post, comment or account instead, use Report in its menu.</p>
      <label className="form-row st-field">
        <span>What happened?</span>
        <textarea rows={6} maxLength={1700} value={text} onChange={(e) => setText(e.target.value)} placeholder="What happened, and what were you trying to do?" aria-label="What happened" autoFocus />
        <em className="count">{text.length} / 1700</em>
      </label>
      <div className="form-row st-field">
        <span>Screenshot (optional)</span>
        {shot ? (
          <div className="st-shot">
            <img src={shot.url} alt="Your screenshot" />
            <button className="btn quiet small" onClick={() => setShot(null)}>
              Remove
            </button>
          </div>
        ) : (
          <label className="btn quiet st-attach">
            <Icon name="image" size={18} /> Add a screenshot
            <input
              type="file"
              accept="image/*"
              hidden
              aria-label="Add a screenshot"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) setShot({ file: f, url: URL.createObjectURL(f) });
              }}
            />
          </label>
        )}
      </div>
      <p className="st-note">Your app version ({__VERSION__}) and the kind of computer are sent with it, to help us find the cause.</p>
      <div className="st-submit">
        <button className="btn big" disabled={busy || !text.trim()} onClick={send}>
          {busy ? 'Sending…' : 'Send report'}
        </button>
      </div>
    </div>
  );
}

/* ---------- live support chat ---------- */

/** True while someone from the team has taken the chat over and the assistant keeps quiet. */
const agentActive = (chat: SupportChat | null | undefined) => !!chat?.ai_paused_until && Date.parse(chat.ai_paused_until) > Date.now();

const isLocal = (m: SupportMessage) => m.id.startsWith('local-');
const sameAs = (local: SupportMessage, real: SupportMessage) => real.role === local.role && real.sender_id === local.sender_id && real.text.trim() === local.text.trim();

/** A message from Realtime replaces the copy shown while it was on its way, or is added at the end. */
function merge(list: SupportMessage[], m: SupportMessage): SupportMessage[] {
  if (list.some((x) => x.id === m.id)) return list;
  const i = list.findIndex((x) => isLocal(x) && sameAs(x, m));
  return i >= 0 ? [...list.slice(0, i), m, ...list.slice(i + 1)] : [...list, m];
}

/** The server's list, plus any messages still on their way. */
function reconcile(server: SupportMessage[], prev: SupportMessage[]): SupportMessage[] {
  const known = new Set(prev.filter((m) => !isLocal(m)).map((m) => m.id));
  const claimed = new Set<string>();
  const waiting = prev.filter(isLocal).filter((local) => {
    const real = server.find((r) => !known.has(r.id) && !claimed.has(r.id) && sameAs(local, r));
    if (!real) return true;
    claimed.add(real.id);
    return false;
  });
  return [...server, ...waiting];
}

function SupportChatPanel({ focus }: { focus: boolean }) {
  const { me } = useMe();
  const [chat, setChat] = useState<SupportChat | null | undefined>(undefined);
  const [msgs, setMsgs] = useState<SupportMessage[]>([]);
  const [text, setText] = useState('');
  const [thinking, setThinking] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const input = useRef<HTMLTextAreaElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const chatId = chat?.id;

  const load = useCallback(async () => {
    try {
      const c = await findSupportChat(me.id);
      setChat(c);
      if (c) {
        const server = await fetchSupportMessages(c.id);
        setMsgs((prev) => reconcile(server, prev));
      }
      setError('');
    } catch (e) {
      setError(errText(e));
      setChat((c) => (c === undefined ? null : c));
    }
  }, [me.id]);

  useEffect(() => {
    load();
    // In case a live update is missed, the conversation is fetched again now and then.
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, [load]);

  // New messages arrive live (the team's replies, and the assistant's).
  useEffect(() => {
    if (!chatId) return;
    let alive = true;
    let channel: any = null;
    Promise.resolve(supabase.realtime.setAuth())
      .catch(() => {})
      .then(() => {
        if (!alive) return;
        channel = supabase
          .channel(`support-chat-${chatId}-${Date.now().toString(36)}`)
          .on('postgres_changes' as any, { event: 'INSERT', schema: 'public', table: 'community_support_messages', filter: `chat_id=eq.${chatId}` }, (payload: any) => {
            if (!alive) return;
            const m = payload.new as SupportMessage;
            setMsgs((prev) => merge(prev, m));
            // A person from the team stepping in changes the chat too (their name, the assistant pausing).
            if (m.role === 'agent') findSupportChat(me.id).then((c) => alive && c && setChat(c), () => {});
          })
          .subscribe();
      });
    return () => {
      alive = false;
      if (channel) supabase.removeChannel(channel);
    };
  }, [chatId]);

  useEffect(() => {
    if (focus) input.current?.focus();
  }, [focus]);
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [msgs.length, thinking]);

  async function send() {
    const words = text.trim();
    if (!words) return;
    setText('');
    setNote('');
    const local: SupportMessage = { id: 'local-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), chat_id: chatId ?? '', sender_id: me.id, role: 'member', agent_name: '', text: words, created_at: new Date().toISOString() };
    setMsgs((prev) => [...prev, local]);
    // Only a person from the team is answering: the assistant stays quiet.
    setThinking(!agentActive(chat));
    try {
      const c = chat ?? (await startSupportChat(me.id));
      if (!chat) setChat(c);
      const r = await sendSupportMessage(me.id, c.id, words);
      if (r.answered_by === 'none') setNote("The assistant couldn't answer just now. Someone from our team will reply here.");
      if (r.answered_by === 'busy') setNote('Lots of people are asking right now. Someone from our team will reply here.');
      const server = await fetchSupportMessages(c.id);
      setMsgs((prev) => reconcile(server, prev));
      findSupportChat(me.id).then((x) => x && setChat(x), () => {});
    } catch (e) {
      setMsgs((prev) => prev.filter((m) => m.id !== local.id));
      setText(words);
      toastError(e);
    } finally {
      setThinking(false);
    }
  }

  const first = (me.full_name || '').split(' ')[0];
  const agent = agentActive(chat);
  return (
    <section className="st-chat" aria-label="Support chat">
      <header className="st-chat-head">
        <span className="st-chat-avatar">
          <Icon name="lifebuoy" size={22} />
        </span>
        <div>
          <b>Support</b>
          <span className={agent ? 'st-ok' : ''}>{agent ? `${chat?.agent_name || 'Someone'} from the support team is here` : 'Our assistant replies straight away'}</span>
        </div>
      </header>
      <div className="st-chat-scroll" ref={scroller}>
        <div className="st-msg them greeting">
          <div className="bubble">{first ? `Hi ${first}! ` : 'Hi! '}Ask anything about using Community. If our assistant can't help, someone from our team will reply here.</div>
        </div>
        {chat === undefined ? <Spinner size={22} /> : null}
        {error ? <p className="st-note">{error}</p> : null}
        {msgs.map((m, i) => {
          const prev = msgs[i - 1];
          const stamp = !prev || Date.parse(m.created_at) - Date.parse(prev.created_at) > 3600e3;
          const label = m.role === 'ai' ? 'Community assistant' : m.role === 'agent' ? `${m.agent_name || 'Support'} · Support team` : '';
          const showLabel = label && !(prev && prev.role === m.role && prev.agent_name === m.agent_name);
          return (
            <React.Fragment key={m.id}>
              {stamp ? <div className="st-chat-stamp">{chatStamp(m.created_at)}</div> : null}
              <div className={'st-msg ' + (m.role === 'member' ? 'mine' : 'them ' + m.role) + (isLocal(m) ? ' sending' : '')} data-role={m.role}>
                {showLabel ? (
                  <span className="st-msg-who">
                    {m.role === 'ai' ? <Icon name="sparkle" size={13} /> : <Icon name="user" size={13} />} {label}
                  </span>
                ) : null}
                <div className="bubble">{m.text}</div>
              </div>
            </React.Fragment>
          );
        })}
        {thinking ? (
          <div className="st-msg them ai">
            <span className="st-msg-who">
              <Icon name="sparkle" size={13} /> Community assistant
            </span>
            <div className="bubble st-typing" aria-label="The assistant is thinking">
              <i />
              <i />
              <i />
            </div>
          </div>
        ) : null}
        {chat?.status === 'closed' ? <p className="st-chat-stamp">Our team closed this chat. Send a message if you need more help.</p> : null}
        {note ? <p className="st-chat-stamp">{note}</p> : null}
      </div>
      <form
        className="st-chat-input"
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
          placeholder="Message support…"
          aria-label="Message support"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
        <button className="link-btn" disabled={!text.trim()}>
          Send
        </button>
      </form>
    </section>
  );
}
