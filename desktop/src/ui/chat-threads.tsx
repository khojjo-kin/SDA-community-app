// The list of chats, shared by the full inbox (/direct) and the small inbox in the corner: loading
// it (kept live over Realtime, as on the iPhone), presence, and one row of the list.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchThreads, isOnline, touchPresence } from 'shared/api';
import { listen } from 'shared/store';
import { supabase } from 'shared/supabase';
import type { Thread } from 'shared/types';
import { t } from '../lib/i18n';
import { activeWords, shortAgo } from './chat-bits';
import { Avatar, Icon, Verified } from './kit';
import '../styles/messages.css';

/** Streaks only show from three days, so a couple of quick replies don't light a flame. */
export const STREAK_FROM = 3;

/**
 * The chats with at least one message, newest first, refreshed when anything changes: `threads` is
 * the inbox, `requests` the message requests (chats someone else started that you haven't answered
 * or accepted, from people you don't follow or have restricted), which live in their own folder.
 */
export function useThreads(): { threads: Thread[] | null; requests: Thread[] | null; reload: () => void } {
  const [all, setAll] = useState<Thread[] | null>(null);
  const reload = useCallback(() => {
    fetchThreads().then(
      (ts) => setAll(ts.filter((t) => t.has_messages)),
      () => setAll((cur) => cur ?? []),
    );
  }, []);
  const threads = useMemo(() => all && all.filter((t) => !t.request), [all]);
  const requests = useMemo(() => all && all.filter((t) => !!t.request), [all]);
  useEffect(() => {
    reload();
    const off = listen('threads', reload);
    // Any new message in any of my chats refreshes the list (the database only sends me my own).
    const ch = supabase
      .channel('threads-' + Math.random().toString(36).slice(2))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'community_messages' }, () => reload())
      .subscribe();
    // "Active now" and the times go stale, so the list is asked for again every half minute.
    const timer = setInterval(() => !document.hidden && reload(), 30000);
    return () => {
      off();
      supabase.removeChannel(ch);
      clearInterval(timer);
    };
  }, [reload]);
  return { threads, requests, reload };
}

/** Tells the server I'm here, at once and every minute while the window is in front, so friends see "Active now". */
export function usePresence(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const touch = () => !document.hidden && touchPresence();
    touch();
    const timer = setInterval(touch, 60e3);
    document.addEventListener('visibilitychange', touch);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', touch);
    };
  }, [enabled]);
}

/** A round picture with the green dot when the person is in the app right now. */
export function ActiveFace({ src, name, size, online }: { src?: string | null; name: string; size: number; online: boolean }) {
  return (
    <span className="mx-face" style={{ width: size, height: size }}>
      <Avatar src={src} name={name} size={size} />
      {online ? <i className="mx-online" role="img" style={{ width: Math.max(10, size * 0.24), height: Math.max(10, size * 0.24) }} aria-label={t('common.activeNow')} /> : null}
    </span>
  );
}

/** 🔥 and the number of days in a row you have both written; hovering says what it means. */
export function StreakBadge({ days }: { days: number }) {
  return (
    <span className="mx-streak" title={t('inbox.streakToast', { days })} aria-label={t('inbox.streak', { days })}>
      <span aria-hidden="true">🔥</span>
      {days}
    </span>
  );
}

/**
 * One chat in a list: picture (with the active dot), name, streak, the last message and when, bold
 * with a blue dot while unread, and the muted mark. As on the iPhone, a chat you've read shows when
 * the person was last active instead of the time.
 */
export function ThreadRow({ t: th, className, active, onOpen, href, size = 56 }: { t: Thread; className: string; active?: boolean; onOpen: () => void; href?: string; size?: number }) {
  const unread = th.unread_count > 0 && !th.muted;
  const presence = th.unread_count ? '' : activeWords(th.active_at);
  const preview = th.unread_count > 1 && !th.muted ? t('inbox.newMessages', { count: th.unread_count }) : th.last_message || t('d.messages.sayHello');
  const body = (
    <>
      <ActiveFace src={th.avatar_url} name={th.username} size={size} online={isOnline(th.active_at)} />
      <span className="row-text">
        <b>
          <span className="mx-name">{th.full_name || th.username}</span>
          {th.verified ? <Verified size={12} /> : null}
          {(th.streak ?? 0) >= STREAK_FROM ? <StreakBadge days={th.streak} /> : null}
        </b>
        <span className="mx-preview">
          <span className="mx-last">{preview}</span>
          <span className="mx-when"> · {presence || shortAgo(th.last_message_at)}</span>
        </span>
      </span>
      {th.muted ? <Icon name="mute" size={14} className="mx-muted" /> : null}
      {unread ? <span className="mx-dot" aria-label={t('d.messages.unread')} /> : null}
    </>
  );
  const cls = className + (active ? ' active' : '') + (unread ? ' unread' : '');
  if (href) {
    return (
      <a
        href={href}
        className={cls}
        onClick={(e) => {
          if (e.metaKey || e.ctrlKey) return;
          e.preventDefault();
          onOpen();
        }}
      >
        {body}
      </a>
    );
  }
  return (
    <button type="button" className={cls} onClick={onOpen}>
      {body}
    </button>
  );
}
