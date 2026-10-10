// The list of chats, shared by the full inbox (/direct) and the small inbox in the corner: loading
// it (kept live over Realtime, as on the iPhone), presence, and one row of the list.
import React, { useCallback, useEffect, useState } from 'react';
import { activeLabel, fetchThreads, isOnline, touchPresence } from 'shared/api';
import { listen } from 'shared/store';
import { supabase } from 'shared/supabase';
import { ago } from 'shared/theme';
import type { Thread } from 'shared/types';
import { Avatar, Icon, Verified } from './kit';
import '../styles/messages.css';

/** Streaks only show from three days, so a couple of quick replies don't light a flame. */
export const STREAK_FROM = 3;

/** The chats with at least one message, newest first, refreshed when anything changes. */
export function useThreads(): { threads: Thread[] | null; reload: () => void } {
  const [threads, setThreads] = useState<Thread[] | null>(null);
  const reload = useCallback(() => {
    fetchThreads().then(
      (ts) => setThreads(ts.filter((t) => t.has_messages)),
      () => setThreads((cur) => cur ?? []),
    );
  }, []);
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
  return { threads, reload };
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
      {online ? <i className="mx-online" role="img" style={{ width: Math.max(10, size * 0.24), height: Math.max(10, size * 0.24) }} aria-label="Active now" /> : null}
    </span>
  );
}

/** 🔥 and the number of days in a row you have both written; hovering says what it means. */
export function StreakBadge({ days }: { days: number }) {
  return (
    <span className="mx-streak" title={`${days}-day streak: you've both written every day`} aria-label={`${days}-day streak`}>
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
export function ThreadRow({ t, className, active, onOpen, href, size = 56 }: { t: Thread; className: string; active?: boolean; onOpen: () => void; href?: string; size?: number }) {
  const unread = t.unread_count > 0 && !t.muted;
  const presence = t.unread_count ? '' : activeLabel(t.active_at);
  const preview = t.unread_count > 1 && !t.muted ? `${t.unread_count} new messages` : t.last_message || 'Say hello';
  const body = (
    <>
      <ActiveFace src={t.avatar_url} name={t.username} size={size} online={isOnline(t.active_at)} />
      <span className="row-text">
        <b>
          <span className="mx-name">{t.full_name || t.username}</span>
          {t.verified ? <Verified size={12} /> : null}
          {(t.streak ?? 0) >= STREAK_FROM ? <StreakBadge days={t.streak} /> : null}
        </b>
        <span className="mx-preview">
          <span className="mx-last">{preview}</span>
          <span className="mx-when"> · {presence || ago(t.last_message_at)}</span>
        </span>
      </span>
      {t.muted ? <Icon name="mute" size={14} className="mx-muted" /> : null}
      {unread ? <span className="mx-dot" aria-label="Unread" /> : null}
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
