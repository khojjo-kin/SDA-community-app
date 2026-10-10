// The floating Messages button in the bottom corner, and the small inbox it opens, as on Instagram
// on a computer. A chat opens inside the small inbox (no page change); expand goes to the full chat.
// Shown on every page except the full inbox (/direct) and live videos, which have their own messages.
// It is always there (even when hidden), so it also keeps a shared location fresh on every page.
import React, { useEffect, useState } from 'react';
import { t } from '../lib/i18n';
import { useMe } from '../lib/me';
import { nav, useRoute } from '../lib/router';
import { useLiveLocation } from '../screens/map';
import { Avatar, Icon, Spinner } from './kit';
import { Chat } from './chat-view';
import { ThreadRow, usePresence, useThreads } from './chat-threads';
import '../styles/messages.css';

export function MessagesDock() {
  const { me } = useMe();
  const route = useRoute();
  const hidden = route.startsWith('/direct') || route.startsWith('/live');
  const [open, setOpen] = useState(false);
  // The chat open inside the panel, or null for the list.
  const [chat, setChat] = useState<string | null>(null);
  const { threads, reload } = useThreads();
  // The app is open on this page, so friends see you as active.
  usePresence(!hidden);
  // While you share your location (the friends' map), it is sent again every couple of minutes, as on the iPhone.
  useLiveLocation(me.id, !me.restricted && !me.deleted_at);

  // The full inbox takes over: the small one starts closed again afterwards.
  useEffect(() => {
    if (hidden) {
      setOpen(false);
      setChat(null);
    }
  }, [hidden]);

  if (hidden) return null;
  const unread = (threads ?? []).filter((t) => t.unread_count > 0 && !t.muted).length;
  const faces = (threads ?? []).slice(0, 3);
  const close = () => {
    setOpen(false);
    setChat(null);
  };

  if (!open) {
    return (
      <button className="dock-pill" onClick={() => setOpen(true)} aria-label={unread ? t('d.frame.messagesUnread', { count: unread }) : t('tabs.messages')}>
        <span className="nav-icon">
          <Icon name="send" size={24} />
          {unread ? <span className="nav-badge">{unread > 9 ? '9+' : unread}</span> : null}
        </span>
        <b>{t('tabs.messages')}</b>
        <span className="dock-faces" aria-hidden="true">
          {faces.map((t) => (
            <Avatar key={t.id} src={t.avatar_url} name={t.username} size={26} />
          ))}
        </span>
      </button>
    );
  }

  if (chat) {
    return (
      <section className="dock-panel mx-dock-chat" aria-label={t('tabs.messages')}>
        <Chat key={chat} threadId={chat} compact onChanged={reload} onBack={() => setChat(null)} onExpand={() => nav('/direct/t/' + chat)} onClose={close} />
      </section>
    );
  }

  return (
    <section className="dock-panel" aria-label={t('tabs.messages')}>
      <header>
        <b>
          {t('tabs.messages')} {unread ? <span className="count-badge">{unread}</span> : null}
        </b>
        <button className="icon-btn" aria-label={t('d.frame.openInbox')} onClick={() => nav('/direct')}>
          <Icon name="expand" size={18} />
        </button>
        <button className="icon-btn" aria-label={t('d.frame.closeMessages')} onClick={close}>
          <Icon name="close" size={18} />
        </button>
      </header>
      <div className="dock-list">
        {threads === null ? <Spinner /> : null}
        {threads && !threads.length ? <p className="muted-text center pad">{t('d.frame.noMessages')}</p> : null}
        {(threads ?? []).map((t) => (
          <ThreadRow key={t.id} t={t} className="dock-row" size={52} onOpen={() => setChat(t.id)} />
        ))}
      </div>
      <button className="dock-compose" aria-label={t('inbox.newMessage')} onClick={() => nav('/direct/new')}>
        <Icon name="newchat" size={22} />
      </button>
    </section>
  );
}
