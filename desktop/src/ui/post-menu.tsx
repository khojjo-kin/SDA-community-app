// The "…" menu on a post, and the dialogs it opens: Report (with the iPhone's reasons, copyright
// included), Promote (a paid ad, a day at a time), and Edit. The iPhone's menu is PostMenu in
// src/components/PostCard.tsx; promoting is app/(app)/promote/[id].tsx.
import React, { useEffect, useRef, useState } from 'react';
import { deletePost, fetchPost, promotePost, report, setBlock, setFlag, setFollow, setPostSensitive, settlePayment } from 'shared/api';
import { dayLabel, errText } from 'shared/theme';
import type { PaymentsConfig, Post } from 'shared/types';
import { useMe } from '../lib/me';
import { confirmPay, money, paymentsConfig } from '../lib/pay';
import { nav } from '../lib/router';
import { Avatar, Icon, Modal, Spinner, ask, toast, toastError } from './kit';
import { type AltMedia, altOf, copyText, postLink, updatePost } from './post-data';
import { EmojiButton, insertAt, useTopEscape } from './post-extras';

/** The reason admins read for copyright reports: the same English words the iPhone sends (report.copyright). */
export const COPYRIGHT_REASON = 'Copyright or trademark';
/** The iPhone's reasons for reporting a post, in its order. */
export const REPORT_REASONS = ['Spam', 'Nudity or sexual content', 'Harassment or hate', COPYRIGHT_REASON, 'Something else'];

type Item = { label: string; danger?: boolean; bold?: boolean; onClick: () => void };

export function PostMenu({ post, onClose, onDeleted }: { post: Post; onClose: () => void; onOpen?: () => void; onDeleted?: () => void }) {
  const { me } = useMe();
  // 'menu' shows the choices; the others replace it with their dialog; 'busy' hides it while a
  // confirmation (drawn by the app, on top) is open.
  const [view, setView] = useState<'menu' | 'report' | 'promote' | 'edit' | 'busy'>('menu');
  const mine = post.user_id === me.id;
  const first = useRef<HTMLButtonElement>(null);
  useTopEscape(first, onClose);

  /** Closes the menu, does the thing, and reports a failure. */
  const run = (fn: () => Promise<unknown> | unknown) => async () => {
    setView('busy');
    try {
      await fn();
    } catch (e) {
      toastError(e);
    }
    onClose();
  };

  if (view === 'report') return <ReportDialog post={post} onClose={onClose} />;
  if (view === 'promote') return <PromoteDialog post={post} onClose={onClose} />;
  if (view === 'edit') return <EditDialog post={post} onClose={onClose} />;
  if (view === 'busy') return null;

  const copy = run(async () => {
    await copyText(postLink(post.id));
    toast('Link copied');
  });
  const common: Item[] = [
    ...(location.hash === '#/p/' + post.id ? [] : [{ label: 'Go to post', onClick: () => { onClose(); nav('/p/' + post.id); } }]),
    { label: 'Copy link', onClick: copy },
    { label: 'About this account', onClick: () => { onClose(); nav('/u/' + post.username); } },
  ];
  const promotedUntil = post.boosted && post.boosted_until && new Date(post.boosted_until) > new Date() ? dayLabel(new Date(post.boosted_until)) : '';

  const items: Item[] = mine
    ? [
        {
          label: 'Delete',
          danger: true,
          bold: true,
          onClick: run(async () => {
            if (!(await ask('Delete post?', "It will be removed from your profile and from everyone's feed.", 'Delete'))) return;
            await deletePost(post.id);
            toast('Post deleted');
            onDeleted?.();
          }),
        },
        { label: 'Edit', onClick: () => setView('edit') },
        // Ads are paid for, a day at a time: a promoted post leads For you and Explore, labelled Sponsored.
        { label: promotedUntil ? `Promote (until ${promotedUntil})` : 'Promote', onClick: () => setView('promote') },
        {
          label: post.hide_likes ? 'Show like count' : 'Hide like count',
          onClick: run(async () => {
            await updatePost(post.id, { hide_likes: !post.hide_likes });
            toast(post.hide_likes ? 'Everyone can see the like count again' : 'Only you can see the like count now');
          }),
        },
        {
          label: post.comments_off ? 'Turn on commenting' : 'Turn off commenting',
          onClick: run(async () => {
            await updatePost(post.id, { comments_off: !post.comments_off });
            toast(post.comments_off ? 'Commenting is on' : 'Commenting is turned off');
          }),
        },
        {
          // Sensitive posts are never shown to members under 14.
          label: post.sensitive ? 'Unmark sensitive' : 'Mark as sensitive',
          onClick: run(async () => {
            await setPostSensitive(post.id, !post.sensitive);
            toast(post.sensitive ? 'No longer marked sensitive' : 'Marked as sensitive. Hidden from members under 14.');
          }),
        },
        ...common,
      ]
    : [
        { label: 'Report', danger: true, bold: true, onClick: () => setView('report') },
        post.following_author
          ? {
              label: 'Unfollow',
              danger: true,
              bold: true,
              onClick: run(async () => {
                await setFollow(me.id, post.user_id, false);
                toast('Unfollowed ' + post.username);
              }),
            }
          : {
              label: 'Follow',
              bold: true,
              onClick: run(async () => {
                await setFollow(me.id, post.user_id, true);
                toast('Following ' + post.username);
              }),
            },
        {
          label: post.saved ? 'Remove from saved' : 'Save',
          onClick: run(async () => {
            await setFlag(me.id, post, 'saved', !post.saved);
            toast(post.saved ? 'Removed from saved' : 'Saved to your collection');
          }),
        },
        {
          label: `Block ${post.username}`,
          danger: true,
          onClick: run(async () => {
            if (!(await ask(`Block ${post.username}?`, 'You will stop seeing their posts, stories and comments. They are not told.', 'Block'))) return;
            await setBlock(me.id, post.user_id, true);
            toast(`Blocked ${post.username}`);
            onDeleted?.();
          }),
        },
        ...common,
      ];

  return (
    <Modal onClose={onClose} className="choices pp-menu">
      {items.map((it, i) => (
        <button key={it.label} ref={i ? undefined : first} className={(it.danger ? 'danger ' : '') + (it.bold ? 'bold' : '')} onClick={it.onClick}>
          {it.label}
        </button>
      ))}
      <button onClick={onClose}>Cancel</button>
    </Modal>
  );
}

/* ---------- report ---------- */

function ReportDialog({ post, onClose }: { post: Post; onClose: () => void }) {
  const { me } = useMe();
  const [busy, setBusy] = useState('');
  const box = useRef<HTMLDivElement>(null);
  useTopEscape(box, onClose);
  const file = async (reason: string) => {
    setBusy(reason);
    try {
      await report(me.id, { postId: post.id, userId: post.user_id }, reason);
    } catch (e) {
      toastError(e);
      setBusy('');
      return;
    }
    onClose();
    if (reason !== COPYRIGHT_REASON) return toast('Thanks. We will review this post.');
    // A report from the app isn't a legal notice, so say how to send a formal one (the iPhone's words).
    const read = await ask(
      'Thanks for telling us',
      "We'll review your report. If you own the copyright or trademark, or act for the owner, you can also send us a formal notice so we can act on it under the law. Our Copyright policy explains what to include and where to send it.",
      'Read the Copyright policy',
      false,
    );
    if (read) nav('/legal/copyright');
  };
  return (
    <Modal title="Report" onClose={onClose} className="pp-report">
      <div className="pp-report-head" ref={box}>
        <b>Why are you reporting this post?</b>
        <p className="muted-text">Your report is anonymous. An admin will review it.</p>
      </div>
      {REPORT_REASONS.map((r) => (
        <button key={r} className="pp-report-row" disabled={!!busy} onClick={() => file(r)}>
          <span>{r}</span>
          {busy === r ? <Spinner size={16} /> : <Icon name="right" size={16} />}
        </button>
      ))}
    </Modal>
  );
}

/* ---------- promote ---------- */

/** The lengths most people pick; − and + cover anything else from 1 to 30. */
const DAY_CHOICES = [1, 3, 7, 14, 30];
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function PromoteDialog({ post, onClose }: { post: Post; onClose: () => void }) {
  const { me } = useMe();
  const [config, setConfig] = useState<PaymentsConfig | null>(null);
  const [error, setError] = useState('');
  const [days, setDays] = useState(7);
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useTopEscape(box, () => !busy && onClose());
  useEffect(() => {
    // Fresh: the price per day, and whether payments are on, can change without a new version.
    paymentsConfig(true).then(setConfig, (e) => setError(errText(e)));
  }, []);
  const first = post.media[0];
  const thumb = first ? (first.type === 'video' ? first.poster || '' : first.url) : '';
  const until = post.boosted && post.boosted_until && new Date(post.boosted_until) > new Date() ? dayLabel(new Date(post.boosted_until)) : '';
  const total = config ? days * config.ad_day_pence : 0;
  const totalLabel = config ? money(total, config.currency) : '';

  const pay = async () => {
    if (!config) return;
    setBusy(true);
    try {
      const start = await promotePost(post.id, days);
      const amount = start.amount || total;
      const currency = start.currency || config.currency;
      const paid = await confirmPay({
        title: `Promote your post for ${plural(days, 'day')}`,
        detail: 'A one-off payment. Your post is shown at the top of For you and Explore, labelled Sponsored.',
        amountPence: amount,
        currency,
        clientSecret: start.client_secret,
        action: 'Pay ' + money(amount, currency),
      });
      if (!paid) {
        setBusy(false);
        return;
      }
      const r = await settlePayment(start.payment_intent_id);
      await fetchPost(post.id).catch(() => null);
      toast(r.settled ? 'Your post is being promoted' : 'Payment received. It may take a minute to show.');
      onClose();
    } catch (e) {
      toastError(e);
      setBusy(false);
    }
  };

  let body: React.ReactNode;
  if (error && !config) body = <p className="form-error pad">{error}</p>;
  else if (!config) body = <Spinner />;
  else if (!config.ready) body = <p className="muted-text pad center">Payments aren't switched on yet.</p>;
  else {
    body = (
      <div className="pp-promote">
        <div className="pp-promote-post">
          {thumb ? <img src={thumb} alt="" /> : <span className="pp-promote-thumb" />}
          <div>
            <p className={post.caption ? '' : 'muted-text'}>{post.caption || 'No caption'}</p>
            {until ? <span className="pp-accent">Promoted until {until}</span> : null}
          </div>
        </div>
        <h3 className="pp-section">How long</h3>
        <div className="pp-days" role="radiogroup" aria-label="How long">
          {DAY_CHOICES.map((n) => (
            <button key={n} type="button" role="radio" aria-checked={days === n} className={'pill-btn' + (days === n ? ' on' : '')} onClick={() => setDays(n)}>
              {plural(n, 'day')}
            </button>
          ))}
        </div>
        <div className="pp-stepper">
          <button type="button" className="icon-btn" aria-label="One day fewer" disabled={days <= 1} onClick={() => setDays(Math.max(1, days - 1))}>
            <svg width="18" height="18" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M5 12h14" /></svg>
          </button>
          <b aria-live="polite">{plural(days, 'day')}</b>
          <button type="button" className="icon-btn" aria-label="One day more" disabled={days >= 30} onClick={() => setDays(Math.min(30, days + 1))}>
            <Icon name="plus" size={18} stroke={2.2} />
          </button>
        </div>
        <div className="pp-total">
          <div>
            <b>Total</b>
            <span className="pp-total-sum">{totalLabel}</span>
          </div>
          <p className="muted-text">
            {plural(days, 'day')} × {money(config.ad_day_pence, config.currency)} a day
          </p>
        </div>
        <p className="muted-text pp-promote-note">
          <Icon name="ad" size={18} />
          <span>
            Your post is shown at the top of For you and Explore, labelled Sponsored, until the days run out. It starts straight after paying.
            {until ? ` It's already promoted until ${until}, so these days are added on after that.` : ''}
          </span>
        </p>
        {/* A private account's posts are only shown to its followers, so the server refuses to promote them. */}
        {me.is_private ? (
          <div className="pp-warn">
            <Icon name="lock" size={18} />
            <span>Your account is private, so new people can't see your posts. Make it public to promote this post.</span>
            <button type="button" className="btn small quiet" onClick={() => { onClose(); nav('/accounts/privacy'); }}>
              Privacy settings
            </button>
          </div>
        ) : (
          <button type="button" className="btn block big" disabled={busy} onClick={pay}>
            {busy ? 'Waiting for payment…' : 'Pay ' + totalLabel}
          </button>
        )}
        <p className="muted-text small center">A one-off payment of {totalLabel}. Nothing renews.</p>
      </div>
    );
  }
  return (
    <Modal title="Promote post" onClose={() => !busy && onClose()} className="pp-promote-dialog">
      <div ref={box} hidden />
      {body}
    </Modal>
  );
}

/* ---------- edit ---------- */

/** Instagram's "Edit info": the caption, the place and each photo's alt text. */
function EditDialog({ post, onClose }: { post: Post; onClose: () => void }) {
  const { me } = useMe();
  const [caption, setCaption] = useState(post.caption);
  const [place, setPlace] = useState(post.location ?? '');
  const [alts, setAlts] = useState<string[]>(() => post.media.map((m) => altOf(m)));
  const [busy, setBusy] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  useTopEscape(area, () => !busy && onClose());
  const first = post.media[0];
  const save = async () => {
    setBusy(true);
    try {
      const media: AltMedia[] = post.media.map((m, i) => {
        const out: AltMedia = { ...m };
        const alt = (alts[i] ?? '').trim().slice(0, 300);
        if (alt) out.alt = alt;
        else delete out.alt;
        return out;
      });
      await updatePost(post.id, { caption, location: place, media });
      toast('Post updated');
      onClose();
    } catch (e) {
      toastError(e);
      setBusy(false);
    }
  };
  return (
    <Modal onClose={() => !busy && onClose()} bare className="pp-edit">
      <div className="modal-head pp-edit-head">
        <button type="button" className="link-btn muted" onClick={onClose} disabled={busy}>
          Cancel
        </button>
        <h2>Edit info</h2>
        <button type="button" className="link-btn" onClick={save} disabled={busy}>
          {busy ? 'Saving…' : 'Done'}
        </button>
      </div>
      <div className="pp-edit-body">
        <div className="pp-edit-media">{first ? first.type === 'video' ? <video src={first.url} poster={first.poster} muted playsInline /> : <img src={first.url} alt={altOf(first)} /> : null}</div>
        <div className="pp-edit-side">
          <div className="pp-who">
            <Avatar src={me.avatar_url} name={me.username} size={28} />
            <b>{me.username}</b>
          </div>
          <textarea ref={area} className="pp-edit-caption" value={caption} maxLength={2200} onChange={(e) => setCaption(e.target.value)} aria-label="Edit caption" placeholder="Write a caption…" />
          <div className="pp-count-row">
            <EmojiButton onPick={(e) => insertAt(area.current, caption, e, setCaption)} />
            <span className="pp-count-text">{caption.length.toLocaleString()}/2,200</span>
          </div>
          <label className="pp-line-input">
            <input value={place} maxLength={120} onChange={(e) => setPlace(e.target.value)} placeholder="Add location" aria-label="Edit place" />
            <Icon name="location" size={18} />
          </label>
          {post.media.some((m) => m.type === 'image') ? (
            <div className="pp-alt-list">
              <b>Alt text</b>
              <p className="muted-text small">Describe your photos for people with visual impairments.</p>
              {post.media.map((m, i) =>
                m.type === 'image' ? (
                  <label key={i} className="pp-alt-row">
                    <img src={m.url} alt="" />
                    <input value={alts[i] ?? ''} maxLength={300} placeholder="Write alt text…" aria-label={`Alt text for photo ${i + 1}`} onChange={(e) => setAlts(alts.map((a, j) => (j === i ? e.target.value : a)))} />
                  </label>
                ) : null,
              )}
            </div>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}
