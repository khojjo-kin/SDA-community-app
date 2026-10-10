// The pieces drawn over a live broadcast, on both the broadcaster's and a viewer's screen, ported
// from the iPhone app (src/components/LiveOverlay.tsx): who is live and how many are watching, the
// last few comments (rows in the database), floating hearts and the comment box. Also two small
// helpers for the shared signalling code (src/lib/rtc.ts).
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { fetchLive, fetchLiveComments, profilesInOrder } from 'shared/api';
import { supabase } from 'shared/supabase';
import { errText, fmt } from 'shared/theme';
import type { LiveComment } from 'shared/types';
import '../styles/stories.css';
import { Avatar, Icon, Verified, ask } from '../ui/kit';

/** The red of everything live: rings, pills, the Go live and End buttons. */
export const LIVE_RED = '#ff2d55';

/* ---------- signalling helpers ---------- */

/**
 * A viewer's secret token for one visit (128 random bits as hex), the same shape as rtc.ts's
 * newNonce, made with the browser's own random source.
 */
export function makeNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Live channels are private: rtc.ts hands Realtime the sign-in token first and won't try without
 * one. The demo's stand-in database has no tokens, so it is given a placeholder; with the real
 * database this does nothing.
 */
export function readyRealtime() {
  const rt = (supabase as any).realtime;
  if ((globalThis as any).__sbClient && rt && !rt.accessTokenValue) rt.accessTokenValue = 'stand-in';
}

/**
 * The height from an element's top to the bottom of the window, kept up to date as the window
 * changes size or something above it (an announcement) comes or goes.
 */
export function useFillHeight(ref: React.RefObject<HTMLElement | null>, deps: unknown[] = []): number {
  const [h, setH] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => setH(Math.max(420, window.innerHeight - Math.max(0, el.getBoundingClientRect().top + window.scrollY)));
    fit();
    window.addEventListener('resize', fit);
    // The page around it changing size moves its top: anything appearing above it does that.
    const ro = new ResizeObserver(fit);
    if (el.parentElement) ro.observe(el.parentElement);
    for (let s = el.previousElementSibling; s; s = s.previousElementSibling) ro.observe(s);
    return () => {
      window.removeEventListener('resize', fit);
      ro.disconnect();
    };
  }, deps);
  return h;
}

/* ---------- comments ---------- */

export type ChatLine = { id: string; userId: string; username: string; text: string; at: string };

/**
 * The last few comments on a live. They are rows (community_live_comments), so the database decides
 * who wrote each one: the latest load when the screen opens, new ones arrive as database changes on
 * the live's channel (`listen`, before it subscribes), and each name comes from the commenter's
 * profile, never from a message.
 */
export function useLiveComments(liveId: string | null, max = 6) {
  const [lines, setLines] = useState<ChatLine[]>([]);
  const names = useRef(new Map<string, string>());
  const removed = useRef(new Set<string>());
  const shown = useRef(new Set<string>());
  useEffect(() => {
    shown.current = new Set(lines.map((l) => l.id));
  }, [lines]);

  const add = useCallback(
    async (rows: LiveComment[]) => {
      const fresh = rows.filter((r) => r?.id && r.user_id && String(r.text ?? '').trim() && !removed.current.has(r.id));
      if (!fresh.length) return;
      const unknown = [...new Set(fresh.map((r) => r.user_id))].filter((id) => !names.current.has(id));
      if (unknown.length) {
        try {
          for (const p of await profilesInOrder(unknown)) names.current.set(p.id, p.username);
          for (const id of unknown) if (!names.current.has(id)) names.current.set(id, '');
        } catch {
          // Shown as "someone" this time; asked again with their next comment.
        }
      }
      setLines((cur) => {
        const byId = new Map(cur.map((l) => [l.id, l]));
        for (const r of fresh) {
          if (removed.current.has(r.id)) continue;
          byId.set(r.id, { id: r.id, userId: r.user_id, username: names.current.get(r.user_id) ?? '', text: String(r.text).trim(), at: String(r.created_at ?? '') });
        }
        const when = (l: ChatLine) => Date.parse(l.at) || 0;
        return [...byId.values()].sort((a, b) => when(a) - when(b)).slice(-max);
      });
    },
    [max],
  );

  const drop = useCallback((id: string) => {
    if (!id) return;
    removed.current.add(id);
    setLines((cur) => cur.filter((l) => l.id !== id));
  }, []);

  const has = useCallback((id: string) => shown.current.has(id), []);

  /** Registers the listener for new comments on a channel; call it before the channel subscribes. */
  const listen = useCallback(
    (channel: RealtimeChannel, id: string) => {
      channel.on('postgres_changes' as any, { event: 'INSERT', schema: 'public', table: 'community_live_comments', filter: `live_id=eq.${id}` }, (payload: any) => {
        add([payload.new as LiveComment]);
      });
    },
    [add],
  );

  useEffect(() => {
    if (!liveId) return;
    let alive = true;
    fetchLiveComments(liveId, max).then(
      (rows) => alive && add(rows),
      () => {},
    );
    return () => {
      alive = false;
    };
  }, [liveId, max, add]);

  return { lines, add, drop, has, listen };
}

/** The last comments, bottom-left, the oldest fading. A comment `canRemove` allows has a Remove button. */
export function ChatLines({ lines, canRemove, onRemove }: { lines: ChatLine[]; canRemove?: (line: ChatLine) => boolean; onRemove?: (line: ChatLine) => void }) {
  return (
    <div className="lv-lines" aria-label="Comments" role="log">
      {lines.map((l, i) => (
        <div key={l.id} className="lv-line" style={{ opacity: 0.45 + (0.55 * (i + 1)) / Math.max(1, lines.length) }}>
          <span>
            <b>{l.username || 'someone'}</b> {l.text}
          </span>
          {onRemove && canRemove?.(l) ? (
            <button
              className="lv-remove"
              aria-label="Remove comment"
              onClick={async () => {
                if (await ask('Remove this comment?', '', 'Remove')) onRemove(l);
              }}
            >
              <Icon name="close" size={12} color="#fff" stroke={2.4} />
            </button>
          ) : null}
        </div>
      ))}
    </div>
  );
}

/** Why a comment wasn't posted, in plain words; an ended live says so (`ended`). */
export async function commentRefusal(e: unknown, liveId: string): Promise<{ ended: boolean; text: string }> {
  const code = String((e as any)?.code ?? '');
  if (code === '42501' || code === '23503') {
    try {
      const card = await fetchLive(liveId);
      if (!card || card.ended_at) return { ended: true, text: 'This live has ended.' };
    } catch {
      // not known: the general reason below
    }
  }
  return { ended: false, text: errText(e) };
}

/** A heart on a coin, for giving (fundraisers). */
export function HeartCoin({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9.5" />
      <path d="M12 16.5s-4-2.4-4-5.1A2.2 2.2 0 0 1 12 10a2.2 2.2 0 0 1 4 1.4c0 2.7-4 5.1-4 5.1z" fill="currentColor" stroke="none" />
    </svg>
  );
}

/* ---------- hearts ---------- */

type HeartItem = { id: number; x: number };

export function useHearts() {
  const [hearts, setHearts] = useState<HeartItem[]>([]);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const add = useCallback(() => {
    const id = Date.now() + Math.random();
    setHearts((h) => [...h.slice(-24), { id, x: Math.random() }]);
    const t = setTimeout(() => {
      timers.current.delete(t);
      setHearts((h) => h.filter((x) => x.id !== id));
    }, 2400);
    timers.current.add(t);
  }, []);
  useEffect(() => {
    const set = timers.current;
    return () => {
      set.forEach(clearTimeout);
      set.clear();
    };
  }, []);
  return { hearts, add };
}

export function Hearts({ hearts }: { hearts: HeartItem[] }) {
  return (
    <div className="lv-hearts" aria-hidden="true">
      {hearts.map((h) => (
        <span key={h.id} style={{ right: 10 + h.x * 30, ['--drift' as any]: `${(h.x - 0.5) * 70}px` }}>
          <Icon name="heart" size={30} color={LIVE_RED} fill={LIVE_RED} stroke={0} />
        </span>
      ))}
    </div>
  );
}

/* ---------- header and comment box ---------- */

/** Who is live, the red pill and the number watching. */
export function LiveHeader({ avatar, username, verified, viewers, title, onProfile, right }: { avatar?: string | null; username?: string; verified?: boolean; viewers: number; title?: string; onProfile?: () => void; right?: React.ReactNode }) {
  return (
    <div className="lv-head">
      <button className="lv-who" onClick={onProfile} disabled={!onProfile} aria-label={username ? `${username}'s profile` : 'Live'}>
        <Avatar src={avatar} name={username || '?'} size={36} />
        <span className="lv-names">
          <b>
            {username || 'Live'}
            {verified ? <Verified size={12} /> : null}
          </b>
          {title ? <span>{title}</span> : null}
        </span>
      </button>
      <span className="lv-pill" aria-label="Live">
        LIVE
      </span>
      <span className="lv-count" aria-label={`${fmt(viewers)} watching`}>
        <Icon name="eye" size={14} color="#fff" stroke={2.2} /> {fmt(viewers)}
      </span>
      {right}
    </div>
  );
}

const MAX_COMMENT = 200;

/**
 * The comment box and the heart. `onSend` resolves true once posted; on false (the screen has said
 * why) the words go back in the box, so nothing typed is lost.
 */
export function LiveComposer({ onSend, onHeart, placeholder = 'Comment…' }: { onSend: (text: string) => Promise<boolean>; onHeart: () => void; placeholder?: string }) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const busy = useRef(false);
  const submit = async () => {
    const words = text.trim();
    if (!words || busy.current) return;
    busy.current = true;
    setSending(true);
    setText('');
    let sent = false;
    try {
      sent = await onSend(words);
    } catch {
      sent = false;
    } finally {
      busy.current = false;
      setSending(false);
    }
    if (!sent) setText((now) => (now.trim() ? `${words} ${now}` : words).slice(0, MAX_COMMENT));
  };
  return (
    <form
      className="lv-compose"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <span className="lv-field">
        <input value={text} maxLength={MAX_COMMENT} placeholder={placeholder} aria-label="Comment" onChange={(e) => setText(e.target.value)} />
        {sending ? <span className="spinner lv-spin" /> : text.trim() ? (
          <button className="lv-send" aria-label="Send comment">
            <Icon name="send" size={16} color="#fff" stroke={2.2} />
          </button>
        ) : null}
      </span>
      <button type="button" className="icon-btn" aria-label="Send a heart" onClick={onHeart}>
        <Icon name="heart" size={26} color="#fff" stroke={2} />
      </button>
    </form>
  );
}
