// The pieces a chat is drawn from: how messages become rows (time stamps, groups, "Seen"), and each
// kind of bubble: text, photos, shared posts, voice messages, call logs, view-once photos and
// screenshot notices. The same rules as the iPhone's chat (app/(app)/chat/[id].tsx).
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { getPostNow } from 'shared/store';
import { chatStamp, clock } from 'shared/theme';
import type { Message } from 'shared/types';
import { Avatar, Icon, Spinner } from './kit';

// The shared errText (src/lib/theme.ts) reads React Native's __DEV__, which the desktop build doesn't
// define, so showing any error would throw. Until build.mjs defines it, give it a value here.
if (typeof (globalThis as any).__DEV__ === 'undefined') (globalThis as any).__DEV__ = false;

/* ---------- drafts: words waiting in a chat's message box (a reply to a note, say) ---------- */

const drafts = new Map<string, string>();
export function setDraft(threadId: string, text: string) {
  drafts.set(threadId, text);
}
export function takeDraft(threadId: string): string {
  const d = drafts.get(threadId) ?? '';
  drafts.delete(threadId);
  return d;
}

/* ---------- rows ---------- */

export type RowKind = 'stamp' | 'text' | 'post' | 'photo' | 'voice' | 'call' | 'snap' | 'notice';
export type Row = {
  key: string;
  kind: RowKind;
  mine: boolean;
  m: Message;
  label?: string;
  big?: boolean;
  /** Joined to the row above / below from the same person (no stamp in between): rounder corners outside only. */
  joinPrev?: boolean;
  joinNext?: boolean;
  seen?: boolean;
};

export const emojiOnly = (s: string) => /^\p{Extended_Pictographic}(\u{FE0F}|\u{200D}\p{Extended_Pictographic})*(\s*\p{Extended_Pictographic}(\u{FE0F}|\u{200D}\p{Extended_Pictographic})*){0,2}$/u.test(s.trim());

const sameDay = (a: number, b: number) => new Date(a).toDateString() === new Date(b).toDateString();

/**
 * Messages (oldest first) as rows: a stamp when the day changes or after an hour's quiet, then the
 * message's pieces. "Seen" goes under the last thing you sent, once the other person has read it
 * (never under a view-once photo, whose own "Opened" says it).
 */
export function buildRows(messages: Message[], me: string, theirRead: string | null): Row[] {
  const rows: Row[] = [];
  let prevAt = 0;
  for (const m of messages) {
    const at = new Date(m.created_at).getTime();
    const mine = m.sender_id === me;
    if (!prevAt || at - prevAt > 3600e3 || !sameDay(at, prevAt)) rows.push({ key: 's' + m.id, kind: 'stamp', mine, m, label: chatStamp(m.created_at) });
    prevAt = at;
    if (m.system === 'screenshot') {
      rows.push({ key: m.id, kind: 'notice', mine, m });
      continue;
    }
    if (m.view_once) {
      rows.push({ key: m.id, kind: 'snap', mine, m });
      continue;
    }
    if (m.call_kind || m.call_url) {
      rows.push({ key: m.id, kind: 'call', mine, m });
      continue;
    }
    if (m.audio_url) {
      rows.push({ key: m.id, kind: 'voice', mine, m });
      continue;
    }
    const words = m.text.trim();
    const plain = words && !(m.post_id && words === 'Sent a post') && !(m.media_url && words === 'Sent a photo');
    if (m.post_id) rows.push({ key: 'p' + m.id, kind: 'post', mine, m });
    if (m.media_url) rows.push({ key: 'i' + m.id, kind: 'photo', mine, m });
    if (plain) rows.push({ key: m.id, kind: 'text', mine, m, big: emojiOnly(words) });
  }
  // Groups: consecutive bubbles from the same person share their inner corners.
  const groupable = (r?: Row) => !!r && r.kind !== 'stamp' && r.kind !== 'notice';
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (!groupable(r)) continue;
    const a = rows[i - 1];
    const b = rows[i + 1];
    r.joinPrev = groupable(a) && a.mine === r.mine;
    r.joinNext = groupable(b) && b.mine === r.mine;
  }
  if (theirRead) {
    const last = [...messages].reverse().find((m) => m.sender_id === me && m.system !== 'screenshot');
    if (last && !last.view_once && new Date(theirRead).getTime() >= new Date(last.created_at).getTime()) {
      const r = [...rows].reverse().find((x) => x.kind !== 'stamp' && x.kind !== 'notice');
      if (r && r.mine) r.seen = true;
    }
  }
  return rows;
}

/** "08:24" */
export function timeOf(iso: string): string {
  const d = new Date(iso);
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

/** "Grace" from "Grace Mensah"; the username when there is no name. */
export function firstName(p: { full_name?: string | null; username: string }): string {
  return (p.full_name || '').trim().split(/\s+/)[0] || p.username;
}

/* ---------- small bubbles ---------- */

/** Three dots in a grey bubble: the other person is typing (or Erha is thinking). */
export function TypingBubble() {
  return (
    <span className="bubble typing" aria-label="Typing">
      <i />
      <i />
      <i />
    </span>
  );
}

/** "Grace took a screenshot of the chat": a quiet line across the middle, not a bubble. */
export function ScreenshotLine({ mine, name }: { mine: boolean; name: string }) {
  const words = mine ? 'You took a screenshot of the chat' : `${name} took a screenshot of the chat`;
  return (
    <div className="cv-notice" role="note">
      <Icon name="camera" size={14} stroke={2} />
      <span>{words}</span>
    </div>
  );
}

/** A call noted in the chat ("Video call · 3 min", "Missed voice call"); Call back starts a new one. */
export function CallLog({ m, mine, onCall }: { m: Message; mine: boolean; onCall?: () => void }) {
  const video = m.call_kind === 'video';
  const title = m.text.trim() || (video ? 'Video call' : 'Voice call');
  const missed = !mine && /\/(missed|declined)$/.test(m.call_url);
  // Older calls were a meeting room link both people opened.
  const room = m.call_url.startsWith('https://');
  return (
    <span className={'bubble call' + (mine ? ' mine' : '') + (missed ? ' missed' : '')}>
      <span className="cv-call-icon">
        <Icon name={video ? 'video' : 'phone'} size={20} />
      </span>
      <span className="cv-call-text">
        <b>{title}</b>
        <span>{timeOf(m.created_at)}</span>
      </span>
      {room ? (
        <a className="cv-call-btn" href={m.call_url} target="_blank" rel="noreferrer">
          Join
        </a>
      ) : onCall ? (
        <button type="button" className="cv-call-btn" onClick={onCall}>
          Call back
        </button>
      ) : null}
    </span>
  );
}

/** A post shared into the chat. */
export function SharedPost({ id, onOpen }: { id: string; onOpen: (id: string) => void }) {
  const p = getPostNow(id);
  if (!p) return <span className="bubble">Post unavailable</span>;
  const cover = p.media[0]?.type === 'video' ? p.media[0].poster : p.media[0]?.url;
  return (
    <button className="shared-post" onClick={() => onOpen(p.id)}>
      <span className="sp-head">
        <Avatar src={p.avatar_url} name={p.username} size={24} />
        <b>{p.username}</b>
      </span>
      {cover ? <img src={cover} alt="" /> : null}
      {p.caption ? (
        <span className="sp-cap">
          <b>{p.username}</b> {p.caption}
        </span>
      ) : null}
    </button>
  );
}

/* ---------- voice messages ---------- */

// Only one voice message plays at a time.
let playingVoice: HTMLAudioElement | null = null;

/** A fixed, made-up waveform for a message, so each voice message has its own shape. */
function bars(id: string, n = 28): number[] {
  let h = 2166136261;
  for (const ch of id) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    out.push(0.25 + (((h >>> 0) % 1000) / 1000) * 0.75);
  }
  return out;
}

export function VoiceMessage({ m, mine }: { m: Message; mine: boolean }) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState({ t: 0, d: m.audio_seconds || 0 });
  useEffect(
    () => () => {
      audio.current?.pause();
      if (playingVoice === audio.current) playingVoice = null;
    },
    [],
  );
  const toggle = () => {
    let a = audio.current;
    if (!a) {
      a = new Audio(m.audio_url);
      a.preload = 'auto';
      a.addEventListener('timeupdate', () => setPos((p) => ({ t: a!.currentTime, d: isFinite(a!.duration) && a!.duration > 0 ? a!.duration : p.d })));
      a.addEventListener('play', () => setPlaying(true));
      a.addEventListener('pause', () => setPlaying(false));
      a.addEventListener('ended', () => {
        setPlaying(false);
        setPos((p) => ({ ...p, t: 0 }));
      });
      audio.current = a;
    }
    if (a.paused) {
      if (playingVoice && playingVoice !== a) playingVoice.pause();
      playingVoice = a;
      a.play().catch(() => setPlaying(false));
    } else a.pause();
  };
  const shape = bars(m.id);
  const done = pos.d ? pos.t / pos.d : 0;
  return (
    <span className={'bubble voice' + (mine ? ' mine' : '')}>
      <button type="button" className="cv-voice-play" onClick={toggle} aria-label={playing ? 'Pause voice message' : 'Play voice message'}>
        <Icon name={playing ? 'pause' : 'play'} size={16} />
      </button>
      <span className="cv-wave" aria-hidden="true">
        {shape.map((v, i) => (
          <i key={i} className={i / shape.length < done ? 'on' : ''} style={{ height: Math.round(v * 22) }} />
        ))}
      </span>
      <span className="cv-voice-time">{clock(playing || pos.t ? Math.max(0, pos.d - pos.t) : pos.d)}</span>
    </span>
  );
}

/* ---------- view-once photos ---------- */

/** The view-once mark, our own: a "1" in a ring. */
export function OnceMark({ size = 20, on }: { size?: number; on?: boolean }) {
  return (
    <span className={'cv-once' + (on ? ' on' : '')} style={{ width: size, height: size, fontSize: size * 0.56 }} aria-hidden="true">
      1
    </span>
  );
}

/**
 * A view-once photo in the chat. It is never drawn as a photo here.
 * Sent to you and waiting: a filled square, "Photo", "View once". Opened: "Opened".
 * Sent by you: "Delivered" until they open it, then "Opened". You can't open your own.
 */
export function SnapBubble({ mine, opened, onOpen }: { mine: boolean; opened: boolean; onOpen?: () => void }) {
  const waiting = !mine && !opened;
  const status = waiting ? 'View once' : opened ? 'Opened' : 'Delivered';
  return (
    <button type="button" className={'cv-snap' + (mine ? ' mine' : '') + (waiting ? ' waiting' : '')} onClick={waiting ? onOpen : undefined} disabled={!waiting} aria-label={'View-once photo. ' + (waiting ? 'Click to view' : status)}>
      <span className={'cv-snap-square' + (waiting ? ' filled' : '')}>{waiting ? '1' : null}</span>
      <span className="cv-snap-text">
        <b>Photo</b>
        <span>{waiting ? 'View once · Click to view' : status}</span>
      </span>
    </button>
  );
}

/**
 * The view-once photo, full window. Always black, whatever the theme. It counts as opened from the
 * moment the server handed over its address; nothing offers to save or forward it.
 */
export function SnapViewer({ url, onClose }: { url: string; onClose: () => void }) {
  const [state, setState] = useState<'loading' | 'shown' | 'failed'>('loading');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [onClose]);
  return createPortal(
    <div className="cv-snapview" role="dialog" aria-modal="true" aria-label="View-once photo" onContextMenu={(e) => e.preventDefault()}>
      <div className="cv-snapview-top">
        <span className="cv-snapview-bar">
          <i style={{ width: state === 'shown' ? '100%' : '0%' }} />
        </span>
        <span className="cv-snapview-row">
          <OnceMark size={22} />
          <b>View once</b>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
            <Icon name="close" size={26} color="#fff" />
          </button>
        </span>
      </div>
      <img key={attempt} src={url} alt="View-once photo" draggable={false} onLoad={() => setState('shown')} onError={() => setState('failed')} />
      {state === 'loading' ? <Spinner /> : null}
      {state === 'failed' ? (
        <div className="cv-snapview-failed">
          <b>This photo didn't load</b>
          <span>Keep this open and try again. Once you close it, it's gone.</span>
          <button
            type="button"
            className="btn quiet"
            onClick={() => {
              setState('loading');
              setAttempt((n) => n + 1);
            }}
          >
            Try again
          </button>
        </div>
      ) : null}
    </div>,
    document.body,
  );
}

/* ---------- emoji ---------- */

/** Quick reactions first (the iPhone's tray), then a few more. */
export const EMOJI = ['❤️', '😂', '😮', '😢', '😡', '👍', '🔥', '🙏', '🎉', '👏', '😊', '😍', '🥰', '😅', '🤗', '🙌', '💯', '✨', '🎶', '📖', '⛪', '🌅', '🕊️', '💚'];

export function EmojiPop({ onPick, onClose }: { onPick: (e: string) => void; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const down = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) onClose();
    };
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    const t = setTimeout(() => document.addEventListener('mousedown', down), 0);
    document.addEventListener('keydown', key);
    return () => {
      clearTimeout(t);
      document.removeEventListener('mousedown', down);
      document.removeEventListener('keydown', key);
    };
  }, [onClose]);
  return (
    <div className="cv-emoji" ref={box} role="menu" aria-label="Emoji">
      {EMOJI.map((e) => (
        <button key={e} type="button" role="menuitem" onClick={() => onPick(e)}>
          {e}
        </button>
      ))}
    </div>
  );
}
