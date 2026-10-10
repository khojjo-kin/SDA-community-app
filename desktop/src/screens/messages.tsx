// Messages, laid out like Instagram's 2026 desktop inbox: your username, notes and the chats on the
// left, the open chat on the right. New messages arrive live over Supabase Realtime, as on the iPhone.
// Routes: /direct, /direct/t/<id>, /direct/u/<username>, /direct/erha, /direct/new (the people picker).
import React, { useEffect, useMemo, useState } from 'react';
import { ERHA_ID, getProfile, openThread } from 'shared/api';
import type { Profile } from 'shared/types';
import { profileByUsername } from '../lib/extra';
import { useMe } from '../lib/me';
import { nav, parts } from '../lib/router';
import { Avatar, Icon, Spinner, Verified, toastError } from '../ui/kit';
import { Chat } from '../ui/chat-view';
import { ThreadRow, usePresence, useThreads } from '../ui/chat-threads';
import { NotesRow } from '../ui/notes';
import { NewMessage } from './messages-new';
import '../styles/messages.css';

export function Messages({ path, openPost }: { path: string; openPost: (id: string) => void }) {
  const { me } = useMe();
  const seg = parts(path);
  const threadId = seg[1] === 't' ? seg[2] : null;
  const picking = seg[1] === 'new';
  const { threads, reload } = useThreads();
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
        if (!p) throw new Error('There is no account called ' + seg[2] + '.');
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

  return (
    <div className="direct mx">
      <section className="threads">
        <header className="threads-head">
          <h2>{me.username}</h2>
          <button className="icon-btn" aria-label="New message" onClick={() => nav('/direct/new')}>
            <Icon name="newchat" size={24} />
          </button>
        </header>
        <label className="mx-search">
          <Icon name="search" size={16} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" aria-label="Search messages" />
          {q ? (
            <button type="button" className="icon-btn tiny" aria-label="Clear search" onClick={() => setQ('')}>
              <Icon name="close" size={12} stroke={2.6} />
            </button>
          ) : null}
        </label>
        <div className="threads-list">
          {/* Notes sit above the chats and scroll with them; they step aside while you search. */}
          {!needle ? <NotesRow /> : null}
          <div className="threads-sub">
            <b>Messages</b>
          </div>
          {threads === null ? <Spinner /> : null}
          {threads && !shown.length && !(offerErha && !needle) ? <p className="muted-text pad">{needle ? 'No chats found' : 'No messages yet.'}</p> : null}
          {shown.map((t) => (
            <ThreadRow key={t.id} t={t} className="thread-row" active={t.id === threadId} href={'#/direct/t/' + t.id} onOpen={() => nav('/direct/t/' + t.id)} />
          ))}
          {offerErha && (!needle || 'erha'.includes(needle)) ? (
            <button type="button" className="thread-row" onClick={() => nav('/direct/erha')} aria-label="Chat with Erha, your church assistant">
              <Avatar src={erha?.avatar_url} name="Erha" size={56} />
              <span className="row-text">
                <b>
                  Erha <Verified size={12} />
                </b>
                <span>Your church assistant · say hello</span>
              </span>
            </button>
          ) : null}
        </div>
      </section>
      <section className="chat-pane">
        {threadId ? (
          <Chat key={threadId} threadId={threadId} openPost={openPost} onChanged={reload} />
        ) : (
          <div className="chat-empty">
            <span className="empty-ring big">
              <Icon name="send" size={44} stroke={1.4} />
            </span>
            <h2>Your messages</h2>
            <p className="muted-text">Send a message to start a chat.</p>
            <button className="btn" onClick={() => nav('/direct/new')}>
              Send message
            </button>
          </div>
        )}
      </section>
      {picking ? <NewMessage onClose={() => nav('/direct')} /> : null}
    </div>
  );
}
