// Help: the Help Centre (common questions, feedback, earlier requests, the policies) beside a live
// support chat (the assistant answers straight away; a person from the team can step in and answers
// under their own name), and Report a problem at /help/problem. All through the shared api.ts, so
// the team answers from the same admin screens whichever app a member writes from.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { fetchSupportMessages, findSupportChat, mySupportTickets, openSupportTicket, sendFeedback, sendSupportMessage, startSupportChat, uploadImage } from 'shared/api';
import { supabase } from 'shared/supabase';
import { ago, dayLabel, errText } from 'shared/theme';
import type { Feedback, SupportChat, SupportMessage } from 'shared/types';
import { dateLocale, languageCode, t, tn } from '../lib/i18n';
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

/** The common questions, as keys: the iPhone's own where the desktop asks and answers the same. */
const QA: [string, string][] = [
  ['help.qSupport', 'help.aSupport'],
  ['d.settings-more.qProfile', 'd.settings-more.aProfile'],
  ['help.qPrivate', 'd.settings-more.aPrivate'],
  ['help.qApps', 'd.settings-more.aApps'],
  ['d.settings-more.qPlus', 'd.settings-more.aPlus'],
  ['help.qTick', 'd.settings-more.aTick'],
  ['help.qAds', 'd.settings-more.aAds'],
  ['help.qErha', 'help.aErha'],
  ['help.qDelete', 'd.settings-more.aDelete'],
  ['help.qReport', 'd.settings-more.aReport'],
];

/** How long ago, for "Sent {when}": "3 days ago", "just now" (shared/theme's agoLong, in the app's language). */
const AGO: Record<string, string> = { m: 'd.settings-more.agoMinutes', h: 'd.settings-more.agoHours', d: 'd.settings-more.agoDays', w: 'd.settings-more.agoWeeks' };
function sentWhen(iso: string): string {
  const a = ago(iso);
  if (a === 'now') return t('d.settings-more.agoNow');
  return tn(AGO[a.slice(-1)], parseInt(a, 10));
}

const pad = (n: number) => String(n).padStart(2, '0');

/** The line between groups of chat messages: "TODAY AT 08:24", "21 MAR AT 06:14" (shared/theme's chatStamp, in the app's language). */
function stamp(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const time = pad(d.getHours()) + ':' + pad(d.getMinutes());
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOf(now) - startOf(d)) / 86400e3);
  if (days === 0) return t('d.settings-more.stampToday', { time });
  if (days === 1) return t('d.settings-more.stampYesterday', { time });
  const sameYear = d.getFullYear() === now.getFullYear();
  const day =
    languageCode() === 'en'
      ? dayLabel(d).toUpperCase() + (sameYear ? '' : ' ' + d.getFullYear())
      : d.toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short', year: sameYear ? undefined : 'numeric' }).toLocaleUpperCase(dateLocale());
  return t('d.settings-more.stampDay', { day, time });
}

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
      <h1 className="st-title">{t('d.settings-more.helpCentre')}</h1>
      <button className="st-help-hero" onClick={() => nav('/help/chat')}>
        <span className="st-help-hero-icon">
          <Icon name="lifebuoy" size={30} />
        </span>
        <span className="st-row-text">
          <b>{t('help.chat')}</b>
          <span>{t('d.settings-more.chatSub')}</span>
        </span>
        <Icon name="right" size={20} stroke={2.2} />
      </button>

      <Block title={t('help.commonQuestions')}>
        <div className="st-card st-faq">
          {QA.map(([q, a], i) => (
            <div key={q} className={'st-qa' + (open === i ? ' open' : '')}>
              <button aria-expanded={open === i} onClick={() => setOpen(open === i ? -1 : i)}>
                <span>{t(q)}</span>
                <Icon name={open === i ? 'down' : 'right'} size={16} stroke={2} />
              </button>
              {open === i ? <p>{t(a)}</p> : null}
            </div>
          ))}
        </div>
      </Block>

      <Block title={t('help.tellUs')}>
        <Card>
          <LinkRow icon="star" title={t('help.rateApp')} onClick={() => setSheet('review')} />
          <LinkRow icon="bulb" title={t('help.suggestIdea')} onClick={() => setSheet('idea')} />
          <LinkRow icon="flag" title={t('help.reportProblem')} to="/help/problem" />
        </Card>
      </Block>

      <Block
        title={t('d.settings-more.yourRequests')}
        action={
          <button className="btn quiet small" onClick={() => setWriting(true)}>
            {t('d.settings-more.messageSupport')}
          </button>
        }
      >
        {tickets.loading ? <Spinner /> : !tickets.data?.length ? <p className="st-empty-line">{t('d.settings-more.noRequests')}</p> : null}
        {(tickets.data ?? []).map((tk) => (
          <section key={tk.id} className="st-card ticket">
            <div className="ticket-head">
              <b>{tk.subject || t('help.noSubject')}</b>
              <span className={'pill status-' + tk.status}>{tk.status === 'open' ? t('help.statusOpen') : tk.status === 'answered' ? t('help.statusAnswered') : t('help.statusClosed')}</span>
            </div>
            <p className="pre">{tk.body}</p>
            <span className="st-note">{t('help.sent', { when: sentWhen(tk.created_at) })}</span>
            {tk.reply ? (
              <div className="ticket-reply">
                <b>{t('help.replyFromTeam')}</b>
                <p className="pre">{tk.reply}</p>
              </div>
            ) : null}
          </section>
        ))}
      </Block>

      <Block title={t('d.settings-more.policies')}>
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

const STAR_WORDS = ['d.settings-more.clickStar', 'feedback.poor', 'feedback.notGreat', 'feedback.okay', 'feedback.good', 'feedback.loveIt'];

export function StarPicker({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="st-stars">
      <div role="radiogroup" aria-label={t('feedback.rating')}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={t(n === 1 ? 'feedback.starOne' : 'feedback.stars', { count: n })} className={n <= value ? 'on' : ''} onClick={() => onChange(n)}>
            <Icon name="star" size={36} fill={n <= value ? 'currentColor' : 'none'} stroke={1.6} />
          </button>
        ))}
      </div>
      <span>{t(STAR_WORDS[value])}</span>
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
    <Modal title={review ? t('help.rateTitle') : t('help.suggestIdea')} onClose={onClose}>
      <form
        className="st-modal-body"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!canSend || busy) return;
          setBusy(true);
          try {
            await sendFeedback(me.id, { kind, rating: review ? stars : null, text: words, app_version: __VERSION__, platform: PLATFORM });
            onClose();
            toast(review ? (stars >= 4 ? t('d.settings-more.gladToast') : t('help.rateThanks')) : t('help.ideaThanks'));
          } catch (err) {
            toastError(err);
            setBusy(false);
          }
        }}
      >
        {review ? <StarPicker value={stars} onChange={setStars} /> : null}
        <textarea className="st-input" rows={4} maxLength={2000} value={words} onChange={(e) => setWords(e.target.value)} placeholder={review ? t('help.ratePlaceholder') : t('help.ideaPlaceholder')} aria-label={review ? t('d.settings-more.yourReview') : t('d.settings-more.yourIdea')} autoFocus={!review} />
        <button className="btn block big" disabled={!canSend || busy}>
          {busy ? t('d.settings-more.sending') : t('common.send')}
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
    <Modal title={t('d.settings-more.messageSupport')} onClose={() => onClose(false)} wide>
      <form
        className="form-pad"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!subject.trim()) return setErr(t('d.settings-more.needSubject'));
          if (body.trim().length < 10) return setErr(t('d.settings-more.tellMore'));
          setBusy(true);
          try {
            await openSupportTicket(me.id, subject, body);
            toast(t('d.settings-more.ticketSent'));
            onClose(true);
          } catch (e2) {
            setErr(errText(e2));
            setBusy(false);
          }
        }}
      >
        <p className="st-text">{t('d.settings-more.ticketIntro')}</p>
        <label className="form-row">
          <span>{t('d.settings-more.subject')}</span>
          <input value={subject} maxLength={140} onChange={(e) => setSubject(e.target.value)} placeholder={t('d.settings-more.subjectPlaceholder')} autoFocus />
        </label>
        <label className="form-row">
          <span>{t('d.settings-more.messageLabel')}</span>
          <textarea rows={5} maxLength={4000} value={body} onChange={(e) => setBody(e.target.value)} placeholder={t('d.settings-more.messagePlaceholder')} />
        </label>
        {err ? <p className="field-error">{err}</p> : null}
        <button className="btn block big" disabled={busy}>
          {busy ? t('d.settings-more.sending') : t('ssPub.send')}
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
          <h1 className="st-title">{t('report.copyrightTitle')}</h1>
          <p className="st-text">{t('d.settings-more.problemDone')}</p>
          <div className="st-actions">
            <Link to="/help" className="btn big quiet">
              {t('d.settings-more.backToHelp')}
            </Link>
            <button
              className="btn big"
              onClick={() => {
                setSent(false);
                setText('');
                setShot(null);
              }}
            >
              {t('d.settings-more.reportElse')}
            </button>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="st-page wide">
      <Link to="/help" className="st-back">
        <Icon name="back" size={18} /> {t('d.settings-more.helpCentre')}
      </Link>
      <h1 className="st-title">{t('help.reportProblem')}</h1>
      <p className="st-intro">{t('d.settings-more.problemIntro')}</p>
      <label className="form-row st-field">
        <span>{t('d.settings-more.whatHappenedQ')}</span>
        <textarea rows={6} maxLength={1700} value={text} onChange={(e) => setText(e.target.value)} placeholder={t('help.problemPlaceholder')} aria-label={t('d.settings-more.whatHappened')} autoFocus />
        <em className="count">{text.length} / 1700</em>
      </label>
      <div className="form-row st-field">
        <span>{t('d.settings-more.screenshotOptional')}</span>
        {shot ? (
          <div className="st-shot">
            <img src={shot.url} alt={t('d.settings-more.yourScreenshot')} />
            <button className="btn quiet small" onClick={() => setShot(null)}>
              {t('live.remove')}
            </button>
          </div>
        ) : (
          <label className="btn quiet st-attach">
            <Icon name="image" size={18} /> {t('d.settings-more.addScreenshot')}
            <input
              type="file"
              accept="image/*"
              hidden
              aria-label={t('d.settings-more.addScreenshot')}
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) setShot({ file: f, url: URL.createObjectURL(f) });
              }}
            />
          </label>
        )}
      </div>
      <p className="st-note">{t('d.settings-more.problemNote', { version: __VERSION__ })}</p>
      <div className="st-submit">
        <button className="btn big" disabled={busy || !text.trim()} onClick={send}>
          {busy ? t('d.settings-more.sending') : t('d.settings-more.sendReport')}
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
    const timer = setInterval(load, 10000);
    return () => clearInterval(timer);
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
      if (r.answered_by === 'none') setNote(t('d.settings-more.noAnswer'));
      if (r.answered_by === 'busy') setNote(t('d.settings-more.busy'));
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
    <section className="st-chat" aria-label={t('d.settings-more.supportChat')}>
      <header className="st-chat-head">
        <span className="st-chat-avatar">
          <Icon name="lifebuoy" size={22} />
        </span>
        <div>
          <b>{t('support.title')}</b>
          <span className={agent ? 'st-ok' : ''}>{agent ? t('support.agentHere', { name: chat?.agent_name || t('support.someone') }) : t('support.assistantReplies')}</span>
        </div>
      </header>
      <div className="st-chat-scroll" ref={scroller}>
        <div className="st-msg them greeting">
          <div className="bubble">{first ? t('support.greeting', { name: first }) : t('support.greetingNoName')}</div>
        </div>
        {chat === undefined ? <Spinner size={22} /> : null}
        {error ? <p className="st-note">{error}</p> : null}
        {msgs.map((m, i) => {
          const prev = msgs[i - 1];
          const newHour = !prev || Date.parse(m.created_at) - Date.parse(prev.created_at) > 3600e3;
          const label = m.role === 'ai' ? t('support.assistant') : m.role === 'agent' ? t('support.fromTeam', { name: m.agent_name || t('support.title') }) : '';
          const showLabel = label && !(prev && prev.role === m.role && prev.agent_name === m.agent_name);
          return (
            <React.Fragment key={m.id}>
              {newHour ? <div className="st-chat-stamp">{stamp(m.created_at)}</div> : null}
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
              <Icon name="sparkle" size={13} /> {t('support.assistant')}
            </span>
            <div className="bubble st-typing" aria-label={t('d.settings-more.thinking')}>
              <i />
              <i />
              <i />
            </div>
          </div>
        ) : null}
        {chat?.status === 'closed' ? <p className="st-chat-stamp">{t('support.closed')}</p> : null}
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
          placeholder={t('support.placeholder')}
          aria-label={t('d.settings-more.messageSupport')}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
        <button className="link-btn" disabled={!text.trim()}>
          {t('common.send')}
        </button>
      </form>
    </section>
  );
}
