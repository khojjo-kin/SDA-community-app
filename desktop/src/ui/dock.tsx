// The floating Messages button in the bottom corner, and the small inbox it opens, as on Instagram on
// a computer. The full inbox is at /direct.
import React, { useCallback, useEffect, useState } from 'react';
import { fetchThreads } from 'shared/api';
import { listen } from 'shared/store';
import { ago } from 'shared/theme';
import type { Thread } from 'shared/types';
import { nav, useRoute } from '../lib/router';
import { Avatar, Icon, Spinner, Verified } from './kit';

export function MessagesDock() {
  const route = useRoute();
  const [open, setOpen] = useState(false);
  const [threads, setThreads] = useState<Thread[] | null>(null);
  const load = useCallback(() => {
    fetchThreads().then((t) => setThreads(t.filter((x) => x.has_messages)), () => setThreads([]));
  }, []);
  useEffect(() => {
    load();
    const off = listen('threads', load);
    const t = setInterval(() => !document.hidden && load(), 30000);
    return () => {
      off();
      clearInterval(t);
    };
  }, [load]);
  useEffect(() => setOpen(false), [route]);
  // The full inbox and live videos have their own messages.
  if (route.startsWith('/direct') || route.startsWith('/live')) return null;
  const unread = (threads ?? []).filter((t) => t.unread_count > 0 && !t.muted).length;
  const faces = (threads ?? []).slice(0, 3);

  if (!open) {
    return (
      <button className="dock-pill" onClick={() => setOpen(true)} aria-label={'Messages' + (unread ? `, ${unread} unread` : '')}>
        <span className="nav-icon">
          <Icon name="send" size={24} />
          {unread ? <span className="nav-badge">{unread > 9 ? '9+' : unread}</span> : null}
        </span>
        <b>Messages</b>
        <span className="dock-faces" aria-hidden="true">
          {faces.map((t) => (
            <Avatar key={t.id} src={t.avatar_url} name={t.username} size={26} />
          ))}
        </span>
      </button>
    );
  }
  return (
    <section className="dock-panel" aria-label="Messages">
      <header>
        <b>
          Messages {unread ? <span className="count-badge">{unread}</span> : null}
        </b>
        <button className="icon-btn" aria-label="Open the full inbox" onClick={() => nav('/direct')}>
          <Icon name="expand" size={18} />
        </button>
        <button className="icon-btn" aria-label="Close messages" onClick={() => setOpen(false)}>
          <Icon name="close" size={18} />
        </button>
      </header>
      <div className="dock-list">
        {threads === null ? <Spinner /> : null}
        {threads && !threads.length ? <p className="muted-text center pad">No messages yet.</p> : null}
        {(threads ?? []).map((t) => (
          <button key={t.id} className={'dock-row' + (t.unread_count && !t.muted ? ' unread' : '')} onClick={() => nav('/direct/t/' + t.id)}>
            <Avatar src={t.avatar_url} name={t.username} size={52} />
            <span className="row-text">
              <b>
                {t.full_name || t.username}
                {t.verified ? <Verified size={12} /> : null}
              </b>
              <span>
                {t.last_message || 'Say hello'} · {ago(t.last_message_at)}
              </span>
            </span>
            {t.muted ? <Icon name="mute" size={14} /> : null}
            {t.unread_count && !t.muted ? <span className="unread-dot" /> : null}
          </button>
        ))}
      </div>
      <button className="dock-compose" aria-label="New message" onClick={() => nav('/direct/new')}>
        <Icon name="newchat" size={22} />
      </button>
    </section>
  );
}
