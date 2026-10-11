// Mute, restrict, message requests and "Liked by" (database v24), as Instagram has them on a
// computer. The pieces here are used by the profile and post menus (Mute, Restrict), a request's chat
// (the Block / Delete / Accept bar in place of the message box), the post card and dialog ("Liked by",
// the restricted comment's label) and Settings. Everything saves through the shared api.ts, so the
// iPhone app sees the same mutes and restrictions. Neither muting nor restricting tells the person.
import React, { useEffect, useRef, useState } from 'react';
import { getProfile, setMute, setRestricted } from 'shared/api';
import { fmt } from 'shared/theme';
import type { Post } from 'shared/types';
import { t, tn } from '../lib/i18n';
import { useMe } from '../lib/me';
import { Avatar, Link, Modal, Spinner, ask, toast, toastError } from './kit';
import '../styles/social.css';

type MuteState = { posts: boolean; stories: boolean };

/* ---------- mute ---------- */

/**
 * Mute someone: a switch for their posts (kept off your feeds) and one for their stories (kept off
 * your story tray). Each change is saved straight away, one after another; both off unmutes.
 */
export function MuteDialog({ userId, username, onClose }: { userId: string; username: string; onClose: () => void }) {
  const { me } = useMe();
  const [mute, set] = useState<MuteState | null>(null);
  const [face, setFace] = useState<string | null>(null);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const load = () =>
    getProfile(userId).then(
      (p) => {
        set({ posts: !!p?.muted_posts, stories: !!p?.muted_stories });
        setFace(p?.avatar_url ?? null);
      },
      (e) => {
        toastError(e);
        onClose();
      },
    );
  useEffect(() => {
    load();
  }, [userId]);

  const flip = (key: keyof MuteState, on: boolean) => {
    if (!mute) return;
    const next = { ...mute, [key]: on };
    set(next);
    queue.current = queue.current
      .then(() => setMute(me.id, userId, next))
      .catch((e) => {
        toastError(e);
        // Show what the server really has rather than guessing which change failed.
        load();
      });
  };

  const row = (key: keyof MuteState, word: string) => (
    <label className="sc-mute-row">
      <span className="grow">{t(word)}</span>
      <input type="checkbox" role="switch" checked={!!mute?.[key]} onChange={(e) => flip(key, e.target.checked)} aria-label={t(word)} />
      <i className="switch" aria-hidden="true" />
    </label>
  );

  return (
    <Modal title={t('d.social.muteTitle', { username })} onClose={onClose} className="sc-mute">
      <div className="sc-mute-who">
        <Avatar src={face} name={username} size={56} />
        <b>{username}</b>
      </div>
      {mute ? (
        <div className="sc-mute-rows">
          {row('posts', 'profile.alertsPosts')}
          {row('stories', 'profile.alertsStories')}
        </div>
      ) : (
        <div className="sc-mute-wait">
          <Spinner size={22} />
        </div>
      )}
    </Modal>
  );
}

/* ---------- restrict ---------- */

/**
 * Restricts someone (asking first, as Instagram does) or lifts it straight away. Resolves true once
 * it has changed. They aren't told either way.
 */
export async function toggleRestrict(meId: string, person: { id: string; username: string }, on: boolean): Promise<boolean> {
  if (on && !(await ask(t('d.social.restrictQ', { username: person.username }), '', t('d.social.restrict'), false))) return false;
  try {
    await setRestricted(meId, person.id, on);
    toast(t(on ? 'd.social.restrictedToast' : 'd.social.unrestrictedToast', { username: person.username }));
    return true;
  } catch (e) {
    toastError(e);
    return false;
  }
}

/** The small label on a comment from someone the post's owner restricted (only the owner sees it). */
export function RestrictedTag() {
  return <span className="sc-restricted-tag">{t('d.social.restrictedLabel')}</span>;
}

/* ---------- message requests ---------- */

/**
 * In place of the message box while a chat is a request: whose it is, then Block, Delete and Accept.
 * Nothing you do here tells them you've read it until you accept.
 */
export function RequestBar({ username, busy, onAccept, onDelete, onBlock }: { username: string; busy: boolean; onAccept: () => void; onDelete: () => void; onBlock: () => void }) {
  return (
    <div className="sc-request" role="group" aria-label={t('d.social.messageRequest')}>
      <b className="sc-request-q">{t('d.social.acceptQ', { username })}</b>
      <div className="sc-request-btns">
        <button type="button" className="danger" disabled={busy} onClick={onBlock}>
          {t('profile.block')}
        </button>
        <button type="button" className="danger" disabled={busy} onClick={onDelete}>
          {t('common.delete')}
        </button>
        <button type="button" className="sc-accept" disabled={busy} onClick={onAccept}>
          {t('common.accept')}
        </button>
      </div>
    </div>
  );
}

/* ---------- Liked by ---------- */

/**
 * "Liked by grace_mensah and others" with grace_mensah's small picture, in place of the like count
 * when someone you follow liked the post. The words come whole from the dictionary, so each language
 * puts the name and "others" where it needs them; "others" shows the count on hover unless it's hidden.
 */
export function LikedBy({ post }: { post: Post }) {
  const name = post.liked_by_username ?? '';
  const many = post.like_count > 1;
  const pieces = t(many ? 'd.social.likedByOthers' : 'd.social.likedBy').split(/(\{name\}|\{others\})/);
  const counted = post.hide_likes ? undefined : tn('d.posts.likes', post.like_count, { count: fmt(post.like_count) });
  return (
    <div className="likes sc-likedby">
      <Avatar src={post.liked_by_avatar_url} name={name} size={20} />
      <span className="sc-likedby-text">
        {pieces.map((p, i) =>
          p === '{name}' ? (
            <Link key={i} to={'/u/' + name} className="sc-likedby-name">
              {name}
            </Link>
          ) : p === '{others}' ? (
            <b key={i} title={counted}>
              {t('d.social.others')}
            </b>
          ) : (
            <React.Fragment key={i}>{p}</React.Fragment>
          ),
        )}
      </span>
    </div>
  );
}
