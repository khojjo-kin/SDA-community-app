// Messages, laid out like Instagram's 2026 desktop inbox: your username, notes and the chats on the
// left, the open chat on the right. New messages arrive live over Supabase Realtime, as on the iPhone.
// Message requests (chats from people you don't follow, or have restricted, that you haven't answered)
// stay out of the chats: "Requests" beside the "Messages" heading opens their own column.
// Routes: /direct, /direct/t/<id>, /direct/u/<username>, /direct/erha, /direct/new (the people picker),
// /direct/requests and /direct/requests/t/<id> (a request open beside the Requests column).
import React, { useEffect, useMemo, useState } from 'react';
import { ERHA_ID, deleteMessageRequest, getProfile, openThread } from 'shared/api';
import type { Profile, Thread } from 'shared/types';
import { profileByUsername } from '../lib/extra';
import { t } from '../lib/i18n';
import { useMe } from '../lib/me';
import { nav, parts } from '../lib/router';
import { Avatar, Icon, Link, Spinner, Verified, ask, toast, toastError } from '../ui/kit';
import { Chat } from '../ui/chat-view';
import { ThreadRow, usePresence, useThreads } from '../ui/chat-threads';
import { NotesRow } from '../ui/notes';
import { NewMessage } from './messages-new';
import '../styles/messages.css';
import '../styles/social.css';

export function Messages({ path, openPost }: { path: string; openPost: (id: string) => void }) {
  const { me } = useMe();
  const seg = parts(path);
  const inRequests = seg[1] === 'requests';
  const threadId = seg[1] === 't' ? seg[2] : inRequests && seg[2] === 't' ? seg[3] : null;
  const picking = seg[1] === 'new';
  const { threads, requests, reload } = useThreads();
  const [q, setQ] = useState('');
  // Erha's card, for the starter row offered until you first write to her.
  const [erha, setErha] = useState<Profile | null>(null);
  // While Messages is open, friends see you as active.
  usePresence(true);

  // /direct/erha and /direct/u/<username> open (or start) the chat with that person.
  useEffect(() => {
    let target: Promise<string> | null = null;
    if (seg[1] === 'erha') target = openThread(ERHA_ID);
    if (seg[1] === 'u' && seg[2]) {
      target = profileByUsername(seg[2]).then((p) => {
        if (!p) throw new Error(t('d.messages.noAccount', { username: seg[2] }));
        return openThread(p.id);
      });
    }
    target?.then(
      (id) => nav('/direct/t/' + id, true),
      (e) => {
        toastError(e);
        nav('/direct', true);
      },
    );
  }, [path]);

  const offerErha = !!threads && me.id !== ERHA_ID && !threads.some((t) => t.other_id === ERHA_ID);
  useEffect(() => {
    if (offerErha && !erha) getProfile(ERHA_ID).then(setErha, () => {});
  }, [offerErha]);

  const needle = q.trim().toLowerCase();
  const shown = useMemo(() => (needle ? (threads ?? []).filter((t) => t.username.includes(needle) || (t.full_name || '').toLowerCase().includes(needle)) : threads ?? []), [threads, needle]);
  const waiting = requests?.length ?? 0;

  const inbox = (
    <>
      <header className="threads-head">
        <h2>{me.username}</h2>
        <span className="mx-head-btns">
          {/* The friends' map: where friends who share their location are (as on the iPhone's inbox). */}
          <button className="icon-btn" aria-label={t('churchApps.map')} title={t('inbox.map')} onClick={() => nav('/map')}>
            <Icon name="location" size={24} />
          </button>
          <button className="icon-btn" aria-label={t('inbox.newMessage')} onClick={() => nav('/direct/new')}>
            <Icon name="newchat" size={24} />
          </button>
        </span>
      </header>
      <label className="mx-search">
        <Icon name="search" size={16} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('common.search')} aria-label={t('inbox.search')} />
        {q ? (
          <button type="button" className="icon-btn tiny" aria-label={t('d.messages.clearSearch')} onClick={() => setQ('')}>
            <Icon name="close" size={12} stroke={2.6} />
          </button>
        ) : null}
      </label>
      <div className="threads-list">
        {/* Notes sit above the chats and scroll with them; they step aside while you search. */}
        {!needle ? <NotesRow /> : null}
        <div className="sc-subrow">
          <div className="threads-sub">
            <b>{t('tabs.messages')}</b>
          </div>
          {/* As on Instagram: the message requests' own folder, with how many are waiting. */}
          <Link to="/direct/requests" className={'sc-req-link' + (waiting ? ' has' : '')}>
            {waiting ? t('d.social.requestsCount', { count: waiting }) : t('d.social.requests')}
          </Link>
        </div>
        {threads === null ? <Spinner /> : null}
        {threads && !shown.length && !(offerErha && !needle) ? <p className="muted-text pad">{needle ? t('inbox.noneFound') : t('d.messages.noMessages')}</p> : null}
        {shown.map((th) => (
          <ThreadRow key={th.id} t={th} className="thread-row" active={th.id === threadId} href={'#/direct/t/' + th.id} onOpen={() => nav('/direct/t/' + th.id)} />
        ))}
        {offerErha && (!needle || 'erha'.includes(needle)) ? (
          <button type="button" className="thread-row" onClick={() => nav('/direct/erha')} aria-label={t('inbox.erhaLabel')}>
            <Avatar src={erha?.avatar_url} name="Erha" size={56} />
            <span className="row-text">
              <b>
                Erha <Verified size={12} />
              </b>
              <span>{t('inbox.erhaSub')}</span>
            </span>
          </button>
        ) : null}
      </div>
    </>
  );

  return (
    <div className="direct mx">
      <section className="threads">{inRequests ? <RequestsColumn requests={requests} active={threadId} reload={reload} /> : inbox}</section>
      <section className="chat-pane">
        {/* A request accepted beside the Requests column moves into the inbox, and the column with it. */}
        {threadId ? (
          <Chat
            key={threadId}
            threadId={threadId}
            openPost={openPost}
            onChanged={reload}
            leaveTo={inRequests ? '/direct/requests' : '/direct'}
            onAccepted={inRequests ? () => nav('/direct/t/' + threadId, true) : undefined}
          />
        ) : (
          <div className="chat-empty">
            <span className="empty-ring big">
              <Icon name="send" size={44} stroke={1.4} />
            </span>
            <h2>{t('inbox.emptyTitle')}</h2>
            <p className="muted-text">{t('d.messages.startChat')}</p>
            <button className="btn" onClick={() => nav('/direct/new')}>
              {t('inbox.sendMessage')}
            </button>
          </div>
        )}
      </section>
      {picking ? <NewMessage onClose={() => nav('/direct')} /> : null}
    </div>
  );
}

/**
 * The Requests column: back to the chats, then each request (opened beside it with Block, Delete and
 * Accept in place of the message box), and Delete all at the bottom.
 */
function RequestsColumn({ requests, active, reload }: { requests: Thread[] | null; active: string | null; reload: () => void }) {
  const deleteAll = async () => {
    const list = requests ?? [];
    if (!list.length || !(await ask(t('d.social.deleteAllQ'), '', t('d.social.deleteAll')))) return;
    try {
      for (const r of list) await deleteMessageRequest(r.id);
      toast(t('d.social.requestsDeleted'));
      if (active) nav('/direct/requests', true);
    } catch (e) {
      toastError(e);
    }
    reload();
  };
  return (
    <>
      <header className="threads-head sc-req-head">
        <button className="icon-btn" aria-label={t('d.messages.backToMessages')} onClick={() => nav('/direct')}>
          <Icon name="back" size={24} />
        </button>
        <h2>{t('d.social.messageRequests')}</h2>
      </header>
      <div className="threads-list sc-req-list">
        {requests === null ? <Spinner /> : null}
        {requests && !requests.length ? <p className="sc-req-none">{t('d.social.noRequests')}</p> : null}
        {(requests ?? []).map((th) => (
          <ThreadRow key={th.id} t={th} className="thread-row" active={th.id === active} href={'#/direct/requests/t/' + th.id} onOpen={() => nav('/direct/requests/t/' + th.id)} />
        ))}
      </div>
      {requests?.length ? (
        <button type="button" className="sc-req-deleteall" onClick={deleteAll}>
          {t('d.social.deleteAll')}
        </button>
      ) : null}
    </>
  );
}
