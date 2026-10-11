// What a post can carry besides its photos and caption (database v20), drawn the desktop way:
// a poll, a prompt others answer in the comments, the "AI info" label, tagged people, and the covers
// for posts kept for subscribers and posts marked sensitive. The iPhone's versions are in
// src/components/PostExtras.tsx; the wording and the rules are the same.
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { profilesInOrder, votePoll } from 'shared/api';
import { fmt } from 'shared/theme';
import type { Post, Profile } from 'shared/types';
import { t, tn } from '../lib/i18n';
import { useMe } from '../lib/me';
import { nav } from '../lib/router';
import { Avatar, Icon, Modal, Spinner, Verified, toastError } from './kit';

/* ---------- small drawings the icon set doesn't have ---------- */

export function PollIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
      <path d="M4 6h10M4 12h16M4 18h7" />
    </svg>
  );
}

export function EyeOffIcon({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 3l18 18" />
      <path d="M10.6 5.1A10.6 10.6 0 0 1 12 5c5 0 9 4.5 10 7-0.4 1-1.3 2.5-2.7 3.9M6.6 6.6C4.4 8 2.9 10 2 12c1 2.5 5 7 10 7 1.9 0 3.6-.6 5.1-1.5" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </svg>
  );
}

/** A filled person, as on the round "tagged" button on a photo. */
export function PersonIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="12" cy="7.5" r="4.5" />
      <path d="M3 21.5c0-4.6 4-7.5 9-7.5s9 2.9 9 7.5z" />
    </svg>
  );
}

/* ---------- a little box that opens beside a button ---------- */

/**
 * A popover drawn on top of everything (so a card's edges never cut it off), placed under the element
 * it belongs to. Closes on a click elsewhere, Escape, or scrolling.
 */
export function Pop({ anchor, onClose, children, className, align = 'left' }: { anchor: HTMLElement | null; onClose: () => void; children: React.ReactNode; className?: string; align?: 'left' | 'right' }) {
  const box = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState<{ top: number; left: number } | null>(null);
  useLayoutEffect(() => {
    if (!anchor) return;
    const r = anchor.getBoundingClientRect();
    const w = box.current?.offsetWidth ?? 280;
    const h = box.current?.offsetHeight ?? 120;
    let left = align === 'right' ? r.right - w : r.left;
    left = Math.max(8, Math.min(left, innerWidth - w - 8));
    // Under the button, or above it when there is no room below.
    const top = r.bottom + 6 + h > innerHeight - 8 ? Math.max(8, r.top - 6 - h) : r.bottom + 6;
    setAt({ top, left });
  }, [anchor]);
  useEffect(() => {
    const down = (e: MouseEvent) => {
      const t = e.target as Node;
      if (box.current?.contains(t) || anchor?.contains(t)) return;
      onClose();
    };
    // Escape closes this box only, not the dialog underneath: caught first, on the way down.
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      onClose();
    };
    const scroll = (e: Event) => !box.current?.contains(e.target as Node) && onClose();
    const t = setTimeout(() => document.addEventListener('mousedown', down), 0);
    window.addEventListener('keydown', key, true);
    window.addEventListener('scroll', scroll, true);
    return () => {
      clearTimeout(t);
      document.removeEventListener('mousedown', down);
      window.removeEventListener('keydown', key, true);
      window.removeEventListener('scroll', scroll, true);
    };
  }, [anchor, onClose]);
  return createPortal(
    <div ref={box} className={'pp-pop ' + (className ?? '')} style={at ? { top: at.top, left: at.left } : { visibility: 'hidden' }}>
      {children}
    </div>,
    document.body,
  );
}

/**
 * Escape closes only the dialog on top. The app's dialogs each listen for Escape, so a dialog opened
 * from the post view (the menu, Report, Promote, the tagged people) would otherwise close the post
 * view with it. `ref` is any element inside the dialog.
 */
export function useTopEscape(ref: React.RefObject<HTMLElement | null>, onClose: () => void) {
  const latest = useRef(onClose);
  latest.current = onClose;
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || document.querySelector('.pp-pop')) return;
      const mine = ref.current?.closest('.scrim');
      const all = document.querySelectorAll('.scrim');
      if (!mine || all[all.length - 1] !== mine) return;
      e.stopPropagation();
      latest.current();
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, []);
}

/* ---------- AI info ---------- */

/** "AI info": the author says it was made or changed with AI. Clicking it says what that means. */
export function AiInfo() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={ref} type="button" className="pp-ai" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Icon name="sparkle" size={12} stroke={2.2} />
        {t('postExtras.aiInfo')}
      </button>
      {open ? (
        <Pop anchor={ref.current} onClose={() => setOpen(false)} className="pp-ai-pop">
          <b>{t('d.posts.aiTitle')}</b>
          <p>{t('d.posts.aiBody')}</p>
        </Pop>
      ) : null}
    </>
  );
}

/* ---------- tagged people ---------- */

/** The round person button on a post's photo; clicking it lists who is tagged. */
export function TagsButton({ ids, top }: { ids: string[]; top?: boolean }) {
  const [open, setOpen] = useState(false);
  if (!ids.length) return null;
  return (
    <>
      <button type="button" className={'pp-tags-btn' + (top ? ' top' : '')} aria-label={t('postExtras.seeTagged')} title={t('d.posts.taggedPeople')} onClick={() => setOpen(true)}>
        <PersonIcon size={12} />
      </button>
      {open ? <TaggedDialog ids={ids} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

export function TaggedDialog({ ids, onClose }: { ids: string[]; onClose: () => void }) {
  const [list, setList] = useState<Profile[] | null>(null);
  const box = useRef<HTMLDivElement>(null);
  useTopEscape(box, onClose);
  useEffect(() => {
    profilesInOrder(ids).then(setList, (e) => {
      toastError(e);
      setList([]);
    });
  }, [ids.join(',')]);
  return (
    <Modal title={t('postExtras.inThisPost')} onClose={onClose} className="pp-tagged">
      <div className="pp-tagged-list" ref={box}>
        {list === null ? <Spinner /> : null}
        {list && !list.length ? <p className="muted-text pad center">{t('d.posts.noOneToShow')}</p> : null}
        {(list ?? []).map((p) => (
          <button
            key={p.id}
            className="row pp-row-btn"
            onClick={() => {
              onClose();
              nav('/u/' + p.username);
            }}
          >
            <Avatar src={p.avatar_url} name={p.username} size={44} />
            <span className="row-text">
              <b>
                {p.username}
                {p.verified ? <Verified size={12} /> : null}
              </b>
              {p.full_name ? <span>{p.full_name}</span> : null}
            </span>
            <Icon name="right" size={16} />
          </button>
        ))}
      </div>
    </Modal>
  );
}

/* ---------- prompt ---------- */

/**
 * The author's question, inviting answers in the comments, with Answer (which puts the cursor in the
 * comment box). Without Answer when commenting is off for me.
 */
export function PromptBanner({ post, onAnswer }: { post: Post; onAnswer?: () => void }) {
  const { me } = useMe();
  const text = (post.prompt ?? '').trim();
  if (!text) return null;
  const canAnswer = !post.comments_off || post.user_id === me.id;
  return (
    <div className="pp-prompt">
      <span className="pp-prompt-icon">
        <Icon name="chatdots" size={18} stroke={2} />
      </span>
      <div className="pp-prompt-text">
        <span className="pp-eyebrow">{t('createFlow.prompt')}</span>
        <b>{text}</b>
        <span className="pp-prompt-sub">{t(canAnswer ? 'd.posts.answerInComments' : 'd.posts.commentingOff')}</span>
      </div>
      {canAnswer && onAnswer ? (
        <button type="button" className="btn small" onClick={onAnswer}>
          {t('postExtras.answer')}
        </button>
      ) : null}
    </div>
  );
}

/* ---------- poll ---------- */

/**
 * The options as buttons. Before voting they are plain choices; after, each shows its share as a bar,
 * mine marked. Clicking another option moves my vote; clicking mine takes it back. The author sees
 * how it is going without voting.
 */
export function PollCard({ post }: { post: Post }) {
  const { me } = useMe();
  const poll = post.poll;
  if (!poll || !Array.isArray(poll.options) || poll.options.length < 2) return null;
  const counts = poll.options.map((_, i) => Math.max(0, post.poll_counts?.[i] ?? 0));
  const total = counts.reduce((a, b) => a + b, 0);
  const mine = typeof post.my_vote === 'number' ? post.my_vote : null;
  const results = mine !== null || post.user_id === me.id;
  const top = Math.max(...counts);
  const vote = (i: number) => votePoll(me.id, post, mine === i ? null : i).catch(toastError);
  return (
    <div className="pp-poll" role="radiogroup" aria-label={poll.question?.trim() || t('postExtras.poll')}>
      <div className="pp-poll-q">
        <span className="pp-poll-icon">
          <PollIcon size={15} />
        </span>
        <b>{poll.question?.trim() || t('postExtras.poll')}</b>
      </div>
      {poll.options.map((o, i) => {
        const share = total ? Math.round((counts[i] / total) * 100) : 0;
        const on = mine === i;
        return (
          <button
            key={i}
            type="button"
            role="radio"
            aria-checked={on}
            className={'pp-poll-opt' + (results ? ' result' : '') + (on ? ' on' : '') + (results && counts[i] === top && top > 0 ? ' lead' : '')}
            onClick={() => vote(i)}
          >
            {results ? <span className="pp-poll-bar" style={{ width: share + '%' }} /> : null}
            <span className="pp-poll-text">{o}</span>
            {on ? (
              <span className="pp-poll-check" aria-label={t('d.posts.yourVote')}>
                <Icon name="check" size={14} stroke={3} />
              </span>
            ) : null}
            {results ? <span className="pp-poll-pct">{share}%</span> : null}
          </button>
        );
      })}
      <div className="pp-poll-foot">{results ? tn('postExtras.votes', total, { count: fmt(total) }) : t('d.posts.voteToSee')}</div>
    </div>
  );
}

/* ---------- covers ---------- */

/** In place of the photos of a post kept for subscribers, for anyone who doesn't subscribe. */
export function LockedMedia({ post, ratio }: { post: Post; ratio: number }) {
  return (
    <div className="pp-locked" style={{ aspectRatio: String(ratio) }}>
      <span className="pp-locked-ring">
        <Icon name="lock" size={28} stroke={1.6} />
      </span>
      <b>{t('d.posts.forSubscribers')}</b>
      <p>{t('d.posts.subscribeToSee', { username: post.username })}</p>
      <button type="button" className="btn" onClick={() => nav('/u/' + post.username)}>
        {t('profile.subscribe')}
      </button>
    </div>
  );
}

// Sensitive posts someone chose to see stay uncovered while the app is open.
const revealed = new Set<string>();

/** Whether a sensitive post is still covered for me. */
export function useVeil(post: Post | undefined, me: string): [boolean, () => void] {
  const [shown, setShown] = useState(() => !!post && revealed.has(post.id));
  const covered = !!post && post.sensitive && post.user_id !== me && !shown;
  return [
    covered,
    () => {
      if (post) revealed.add(post.id);
      setShown(true);
    },
  ];
}

/** Over a sensitive post's blurred photos: what it is, and See post. */
export function Veil({ onReveal }: { onReveal: () => void }) {
  return (
    <div className="pp-veil">
      <EyeOffIcon size={36} />
      <b>{t('create.sensitive')}</b>
      <p>{t('d.posts.sensitiveBody')}</p>
      <button type="button" className="pp-veil-btn" onClick={onReveal}>
        {t('d.posts.seePost')}
      </button>
    </div>
  );
}

/* ---------- emoji ---------- */

const EMOJI = ['😂', '😮', '😍', '😢', '👏', '🔥', '🎉', '💯', '❤️', '🤣', '🥰', '😘', '😭', '😊', '🙏', '🙌', '✨', '🎶', '📖', '⛪', '🕊️', '🌅', '💚', '👍'];

/** A smiley that opens a few emoji; picking one adds it where the cursor is. */
export function EmojiButton({ onPick, size = 20 }: { onPick: (e: string) => void; size?: number }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={ref} type="button" className="icon-btn tiny pp-emoji-btn" aria-label={t('d.posts.emoji')} aria-expanded={open} onClick={() => setOpen(!open)}>
        <Icon name="smile" size={size} />
      </button>
      {open ? (
        <Pop anchor={ref.current} onClose={() => setOpen(false)} className="pp-emoji-pop">
          <div className="pp-emoji-grid" role="listbox" aria-label={t('d.posts.emoji')}>
            {EMOJI.map((e) => (
              <button key={e} type="button" role="option" aria-selected={false} onClick={() => onPick(e)}>
                {e}
              </button>
            ))}
          </div>
        </Pop>
      ) : null}
    </>
  );
}

/** Puts text into an input or text area at the cursor and keeps typing there. */
export function insertAt(el: HTMLInputElement | HTMLTextAreaElement | null, value: string, add: string, set: (v: string) => void, max = 2200) {
  const start = el?.selectionStart ?? value.length;
  const end = el?.selectionEnd ?? value.length;
  const next = (value.slice(0, start) + add + value.slice(end)).slice(0, max);
  set(next);
  requestAnimationFrame(() => {
    if (!el) return;
    el.focus();
    const at = Math.min(next.length, start + add.length);
    el.setSelectionRange(at, at);
  });
}
