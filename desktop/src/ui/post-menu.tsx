// The "…" menu on a post, and the dialogs it opens: Report (with the iPhone's reasons, copyright
// included), Promote (a paid ad, a day at a time), and Edit. The iPhone's menu is PostMenu in
// src/components/PostCard.tsx; promoting is app/(app)/promote/[id].tsx.
import React, { useEffect, useRef, useState } from 'react';
import { deletePost, fetchPost, promotePost, report, setBlock, setFlag, setFollow, setPostSensitive, settlePayment } from 'shared/api';
import { dayLabel, errText } from 'shared/theme';
import type { PaymentsConfig, Post } from 'shared/types';
import { dateLocale, languageCode, t, tn } from '../lib/i18n';
import { useMe } from '../lib/me';
import { confirmPay, money, paymentsConfig } from '../lib/pay';
import { nav } from '../lib/router';
import { Avatar, Icon, Modal, Spinner, ask, toast, toastError } from './kit';
import { type AltMedia, altOf, copyText, postLink, updatePost } from './post-data';
import { EmojiButton, insertAt, useTopEscape } from './post-extras';
import { MuteDialog } from './social';

/** The reason admins read for copyright reports: the same English words the iPhone sends (report.copyright). */
export const COPYRIGHT_REASON = 'Copyright or trademark';
/** The iPhone's reasons for reporting a post, in its order. These English words are what admins read. */
export const REPORT_REASONS = ['Spam', 'Nudity or sexual content', 'Harassment or hate', COPYRIGHT_REASON, 'Something else'];
/** How each reason is shown to the member: the iPhone's words for it, in the app's language. */
const REASON_WORDS: Record<string, string> = {
  Spam: 'report.spam',
  'Nudity or sexual content': 'report.nudity',
  'Harassment or hate': 'report.harassment',
  [COPYRIGHT_REASON]: 'report.copyright',
  'Something else': 'report.other',
};

/** "9 Sep": as the app has always written it in English, and the member's own way in other languages. */
const shortDay = (d: Date) => (languageCode() === 'en' ? dayLabel(d) : d.toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short' }));

type Item = { label: string; danger?: boolean; bold?: boolean; onClick: () => void };

export function PostMenu({ post, onClose, onDeleted }: { post: Post; onClose: () => void; onOpen?: () => void; onDeleted?: () => void }) {
  const { me } = useMe();
  // 'menu' shows the choices; the others replace it with their dialog; 'busy' hides it while a
  // confirmation (drawn by the app, on top) is open.
  const [view, setView] = useState<'menu' | 'report' | 'promote' | 'edit' | 'mute' | 'busy'>('menu');
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
  if (view === 'mute') return <MuteDialog userId={post.user_id} username={post.username} onClose={onClose} />;
  if (view === 'busy') return null;

  const copy = run(async () => {
    await copyText(postLink(post.id));
    toast(t('d.posts.linkCopied'));
  });
  const common: Item[] = [
    ...(location.hash === '#/p/' + post.id ? [] : [{ label: t('d.posts.goToPost'), onClick: () => { onClose(); nav('/p/' + post.id); } }]),
    { label: t('d.posts.copyLink'), onClick: copy },
    { label: t('profile.about'), onClick: () => { onClose(); nav('/u/' + post.username); } },
  ];
  const promotedUntil = post.boosted && post.boosted_until && new Date(post.boosted_until) > new Date() ? shortDay(new Date(post.boosted_until)) : '';

  const items: Item[] = mine
    ? [
        {
          label: t('common.delete'),
          danger: true,
          bold: true,
          onClick: run(async () => {
            if (!(await ask(t('d.posts.deleteQuestion'), t('d.posts.deleteBody'), t('common.delete')))) return;
            await deletePost(post.id);
            toast(t('ssPub.deleted'));
            onDeleted?.();
          }),
        },
        { label: t('ssPub.edit'), onClick: () => setView('edit') },
        // Ads are paid for, a day at a time: a promoted post leads For you and Explore, labelled Sponsored.
        { label: promotedUntil ? t('d.posts.promoteUntil', { date: promotedUntil }) : t('d.posts.promote'), onClick: () => setView('promote') },
        {
          label: t(post.hide_likes ? 'd.posts.showLikeCount' : 'createFlow.hideLikes'),
          onClick: run(async () => {
            await updatePost(post.id, { hide_likes: !post.hide_likes });
            toast(t(post.hide_likes ? 'd.posts.likeCountShown' : 'd.posts.likeCountHidden'));
          }),
        },
        {
          label: t(post.comments_off ? 'd.posts.turnOnCommenting' : 'createFlow.commentsOff'),
          onClick: run(async () => {
            await updatePost(post.id, { comments_off: !post.comments_off });
            toast(t(post.comments_off ? 'd.posts.commentingOn' : 'd.posts.commentingOff'));
          }),
        },
        {
          // Sensitive posts are never shown to members under 14.
          label: t(post.sensitive ? 'd.posts.unmarkSensitive' : 'd.posts.markSensitive'),
          onClick: run(async () => {
            await setPostSensitive(post.id, !post.sensitive);
            toast(t(post.sensitive ? 'd.posts.unmarkedToast' : 'd.posts.markedToast'));
          }),
        },
        ...common,
      ]
    : [
        { label: t('report.report'), danger: true, bold: true, onClick: () => setView('report') },
        post.following_author
          ? {
              label: t('d.posts.unfollow'),
              danger: true,
              bold: true,
              onClick: run(async () => {
                await setFollow(me.id, post.user_id, false);
                toast(t('d.posts.unfollowed', { username: post.username }));
              }),
            }
          : {
              label: t('common.follow'),
              bold: true,
              onClick: run(async () => {
                await setFollow(me.id, post.user_id, true);
                toast(t('d.posts.followingToast', { username: post.username }));
              }),
            },
        {
          label: t(post.saved ? 'd.posts.removeFromSaved' : 'ssPub.save'),
          onClick: run(async () => {
            await setFlag(me.id, post, 'saved', !post.saved);
            toast(t(post.saved ? 'd.posts.unsavedToast' : 'd.posts.savedToast'));
          }),
        },
        // Their posts and/or stories kept off your feeds and story tray; they aren't told.
        { label: t('d.social.mute'), onClick: () => setView('mute') },
        {
          label: t('profile.blockUser', { username: post.username }),
          danger: true,
          onClick: run(async () => {
            if (!(await ask(t('profile.blockQuestion', { username: post.username }), t('profile.blockBody'), t('profile.block')))) return;
            await setBlock(me.id, post.user_id, true);
            toast(t('profile.blocked', { username: post.username }));
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
      <button onClick={onClose}>{t('common.cancel')}</button>
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
    if (reason !== COPYRIGHT_REASON) return toast(t('d.posts.reportThanks'));
    // A report from the app isn't a legal notice, so say how to send a formal one (the iPhone's words).
    const read = await ask(t('report.copyrightTitle'), t('report.copyrightBody'), t('report.readPolicy'), false);
    if (read) nav('/legal/copyright');
  };
  return (
    <Modal title={t('report.report')} onClose={onClose} className="pp-report">
      <div className="pp-report-head" ref={box}>
        <b>{t('d.posts.reportWhy')}</b>
        <p className="muted-text">{t('d.posts.reportAnonymous')}</p>
      </div>
      {REPORT_REASONS.map((r) => (
        <button key={r} className="pp-report-row" disabled={!!busy} onClick={() => file(r)}>
          <span>{REASON_WORDS[r] ? t(REASON_WORDS[r]) : r}</span>
          {busy === r ? <Spinner size={16} /> : <Icon name="right" size={16} />}
        </button>
      ))}
    </Modal>
  );
}

/* ---------- promote ---------- */

/** The lengths most people pick; − and + cover anything else from 1 to 30. */
const DAY_CHOICES = [1, 3, 7, 14, 30];
/** "1 day", "7 days". */
const days = (n: number) => tn('d.posts.days', n);

export function PromoteDialog({ post, onClose }: { post: Post; onClose: () => void }) {
  const { me } = useMe();
  const [config, setConfig] = useState<PaymentsConfig | null>(null);
  const [error, setError] = useState('');
  const [count, setDays] = useState(7);
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useTopEscape(box, () => !busy && onClose());
  useEffect(() => {
    // Fresh: the price per day, and whether payments are on, can change without a new version.
    paymentsConfig(true).then(setConfig, (e) => setError(errText(e)));
  }, []);
  const first = post.media[0];
  const thumb = first ? (first.type === 'video' ? first.poster || '' : first.url) : '';
  const until = post.boosted && post.boosted_until && new Date(post.boosted_until) > new Date() ? shortDay(new Date(post.boosted_until)) : '';
  const total = config ? count * config.ad_day_pence : 0;
  const totalLabel = config ? money(total, config.currency) : '';

  const pay = async () => {
    if (!config) return;
    setBusy(true);
    try {
      const start = await promotePost(post.id, count);
      const amount = start.amount || total;
      const currency = start.currency || config.currency;
      const paid = await confirmPay({
        title: tn('d.posts.promoteFor', count),
        detail: t('d.posts.promoteDetail'),
        amountPence: amount,
        currency,
        clientSecret: start.client_secret,
        action: t('checkout.pay', { price: money(amount, currency) }),
      });
      if (!paid) {
        setBusy(false);
        return;
      }
      const r = await settlePayment(start.payment_intent_id);
      await fetchPost(post.id).catch(() => null);
      toast(t(r.settled ? 'd.posts.promoting' : 'd.posts.paymentReceived'));
      onClose();
    } catch (e) {
      toastError(e);
      setBusy(false);
    }
  };

  let body: React.ReactNode;
  if (error && !config) body = <p className="form-error pad">{error}</p>;
  else if (!config) body = <Spinner />;
  else if (!config.ready) body = <p className="muted-text pad center">{t('d.posts.paymentsOff')}</p>;
  else {
    body = (
      <div className="pp-promote">
        <div className="pp-promote-post">
          {thumb ? <img src={thumb} alt="" /> : <span className="pp-promote-thumb" />}
          <div>
            <p className={post.caption ? '' : 'muted-text'}>{post.caption || t('d.posts.noCaption')}</p>
            {until ? <span className="pp-accent">{t('d.posts.promotedUntil', { date: until })}</span> : null}
          </div>
        </div>
        <h3 className="pp-section">{t('d.posts.howLong')}</h3>
        <div className="pp-days" role="radiogroup" aria-label={t('d.posts.howLong')}>
          {DAY_CHOICES.map((n) => (
            <button key={n} type="button" role="radio" aria-checked={count === n} className={'pill-btn' + (count === n ? ' on' : '')} onClick={() => setDays(n)}>
              {days(n)}
            </button>
          ))}
        </div>
        <div className="pp-stepper">
          <button type="button" className="icon-btn" aria-label={t('d.posts.dayFewer')} disabled={count <= 1} onClick={() => setDays(Math.max(1, count - 1))}>
            <svg width="18" height="18" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M5 12h14" /></svg>
          </button>
          <b aria-live="polite">{days(count)}</b>
          <button type="button" className="icon-btn" aria-label={t('d.posts.dayMore')} disabled={count >= 30} onClick={() => setDays(Math.min(30, count + 1))}>
            <Icon name="plus" size={18} stroke={2.2} />
          </button>
        </div>
        <div className="pp-total">
          <div>
            <b>{t('pay.total')}</b>
            <span className="pp-total-sum">{totalLabel}</span>
          </div>
          <p className="muted-text">
            {tn('d.posts.perDay', count, { price: money(config.ad_day_pence, config.currency) })}
          </p>
        </div>
        <p className="muted-text pp-promote-note">
          <Icon name="ad" size={18} />
          <span>
            {t('d.posts.promoteNote')}
            {until ? ' ' + t('d.posts.promoteNoteAlready', { date: until }) : ''}
          </span>
        </p>
        {/* A private account's posts are only shown to its followers, so the server refuses to promote them. */}
        {me.is_private ? (
          <div className="pp-warn">
            <Icon name="lock" size={18} />
            <span>{t('d.posts.privateNoPromote')}</span>
            <button type="button" className="btn small quiet" onClick={() => { onClose(); nav('/accounts/privacy'); }}>
              {t('d.posts.privacySettings')}
            </button>
          </div>
        ) : (
          <button type="button" className="btn block big" disabled={busy} onClick={pay}>
            {busy ? t('d.posts.waitingPayment') : t('checkout.pay', { price: totalLabel })}
          </button>
        )}
        <p className="muted-text small center">{t('d.posts.oneOffPayment', { price: totalLabel })}</p>
      </div>
    );
  }
  return (
    <Modal title={t('d.posts.promotePost')} onClose={() => !busy && onClose()} className="pp-promote-dialog">
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
      toast(t('d.posts.postUpdated'));
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
          {t('common.cancel')}
        </button>
        <h2>{t('d.posts.editInfo')}</h2>
        <button type="button" className="link-btn" onClick={save} disabled={busy}>
          {busy ? t('d.posts.saving') : t('createFlow.done')}
        </button>
      </div>
      <div className="pp-edit-body">
        <div className="pp-edit-media">{first ? first.type === 'video' ? <video src={first.url} poster={first.poster} muted playsInline /> : <img src={first.url} alt={altOf(first)} /> : null}</div>
        <div className="pp-edit-side">
          <div className="pp-who">
            <Avatar src={me.avatar_url} name={me.username} size={28} />
            <b>{me.username}</b>
          </div>
          <textarea ref={area} className="pp-edit-caption" value={caption} maxLength={2200} onChange={(e) => setCaption(e.target.value)} aria-label={t('d.posts.editCaption')} placeholder={t('create.captionPlaceholder')} />
          <div className="pp-count-row">
            <EmojiButton onPick={(e) => insertAt(area.current, caption, e, setCaption)} />
            <span className="pp-count-text">{caption.length.toLocaleString(dateLocale())}/{(2200).toLocaleString(dateLocale())}</span>
          </div>
          <label className="pp-line-input">
            <input value={place} maxLength={120} onChange={(e) => setPlace(e.target.value)} placeholder={t('create.addLocation')} aria-label={t('d.posts.editPlace')} />
            <Icon name="location" size={18} />
          </label>
          {post.media.some((m) => m.type === 'image') ? (
            <div className="pp-alt-list">
              <b>{t('d.posts.altText')}</b>
              <p className="muted-text small">{t('d.posts.altTextHelp')}</p>
              {post.media.map((m, i) =>
                m.type === 'image' ? (
                  <label key={i} className="pp-alt-row">
                    <img src={m.url} alt="" />
                    <input value={alts[i] ?? ''} maxLength={300} placeholder={t('d.posts.writeAlt')} aria-label={t('d.posts.altFor', { n: i + 1 })} onChange={(e) => setAlts(alts.map((a, j) => (j === i ? e.target.value : a)))} />
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
