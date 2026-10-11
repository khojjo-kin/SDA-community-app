// The share step of the story editor, as the iPhone's (app/(app)/story-editor.tsx, stage "share"):
// Your story (with who may reply) or Close friends (with how many), Message to send it to people
// too (app/(app)/send-to.tsx), and Add to highlight (src/components/HighlightPicker.tsx), then Share.
// The pickers open as the app's own dialogs, in the app's colours.
import React, { useEffect, useMemo, useState } from 'react';
import { fetchHighlights, listCloseFriends, listPeople, peopleToMessage, searchProfiles, setCloseFriend, updateProfile } from 'shared/api';
import type { Audience, Highlight, Profile, StoryReplies } from 'shared/types';
import { t, tn } from '../lib/i18n';
import { useMe } from '../lib/me';
import '../styles/stories.css';
import { Avatar, Icon, Modal, Spinner, toast, toastError } from './kit';

export type HighlightChoice = { id?: string; title: string };

// Keys, drawn with t(): who may reply, and why a close friends story can't go in a highlight.
const REPLY_LABEL: Record<StoryReplies, string> = { everyone: 'settings.repliesEveryone', following: 'settings.repliesFollowing', off: 'settings.repliesOff' };
export const CLOSE_FRIENDS_HIGHLIGHT = 'd.stories.closeFriendsHighlight';

function ShareRow({ icon, title, sub, onSub, right, onClick, label }: { icon: React.ReactNode; title: string; sub?: string; onSub?: () => void; right: React.ReactNode; onClick: () => void; label?: string }) {
  return (
    <div className="stc-share-row">
      <button className="stc-share-main" onClick={onClick} aria-label={label}>
        {icon}
        <span className="stc-share-text">
          <b>{title}</b>
        </span>
        {right}
      </button>
      {sub ? (
        <button className="stc-share-sub" onClick={onSub ?? onClick}>
          {sub}
          <Icon name="right" size={12} color="var(--fg2)" stroke={2.4} />
        </button>
      ) : null}
    </div>
  );
}

const Radio = ({ on }: { on: boolean }) => <span className={'stc-radio' + (on ? ' on' : '')} aria-hidden="true" />;
const Circle = ({ name }: { name: 'send' | 'highlight' }) => (
  <span className="stc-share-icon">
    <Icon name={name} size={22} />
  </span>
);

/**
 * The share panel beside the finished story. Everything chosen here lives in the editor, so going
 * back to change the story keeps it.
 */
export function SharePanel({
  audience, setAudience, friends, highlight, setHighlight, recipients, setRecipients, busy, onShare, onBack, onFriends,
}: {
  audience: Audience; setAudience: (a: Audience) => void; friends: number | null;
  highlight: HighlightChoice | null; setHighlight: (h: HighlightChoice | null) => void;
  recipients: Profile[]; setRecipients: (p: Profile[]) => void;
  busy: boolean; onShare: () => void; onBack: () => void; onFriends: () => void;
}) {
  const { me, refresh } = useMe();
  const [sheet, setSheet] = useState<null | 'replies' | 'people' | 'highlight'>(null);
  const replies = me.story_replies ?? 'everyone';
  const closeOnly = audience === 'close_friends';
  return (
    <div className="stc-panel stc-share" role="region" aria-label={t('common.share')}>
      <div className="stc-panel-head">
        <button className="icon-btn" aria-label={t('create.backToEditing')} onClick={onBack} disabled={busy}>
          <Icon name="back" size={20} />
        </button>
        <h3>{t('common.share')}</h3>
        <span />
      </div>
      <div className="stc-share-rows" role="radiogroup" aria-label={t('d.stories.whoSeesIt')}>
        <ShareRow
          icon={<Avatar src={me.avatar_url} name={me.username} size={44} />}
          title={t('d.stories.yourStory')}
          label={t('d.stories.yourStory')}
          sub={t('d.stories.repliesValue', { choice: t(REPLY_LABEL[replies]) })}
          onSub={() => setSheet('replies')}
          onClick={() => setAudience('everyone')}
          right={<Radio on={audience === 'everyone'} />}
        />
        <ShareRow
          icon={
            <span className="stc-share-icon close">
              <Icon name="star" size={20} color="#fff" fill="#fff" stroke={0} />
            </span>
          }
          title={t('settings.closeFriends')}
          label={t('settings.closeFriends')}
          sub={friends ? tn('d.stories.people', friends) : t('d.stories.addPeople')}
          onSub={onFriends}
          onClick={() => (friends === 0 ? onFriends() : setAudience('close_friends'))}
          right={<Radio on={audience === 'close_friends'} />}
        />
      </div>
      <div className="stc-share-rows">
        <ShareRow icon={<Circle name="send" />} title={t('profile.message')} label={t('profile.message')} sub={recipients.length ? recipients.map((p) => p.username).join(', ') : t('d.stories.sendToo')} onClick={() => setSheet('people')} right={<Icon name="right" size={16} color="var(--fg2)" stroke={2} />} />
        <ShareRow
          icon={<Circle name="highlight" />}
          title={t('d.stories.addToHighlight')}
          label={t('d.stories.addToHighlight')}
          sub={closeOnly ? t('d.stories.notForCloseFriends') : highlight ? highlight.title : t('d.stories.keepOnProfile')}
          onClick={() => (closeOnly ? toast(t(CLOSE_FRIENDS_HIGHLIGHT)) : setSheet('highlight'))}
          right={<Icon name="right" size={16} color="var(--fg2)" stroke={2} />}
        />
        {closeOnly ? <p className="stc-note pad">{t(CLOSE_FRIENDS_HIGHLIGHT)}</p> : null}
      </div>
      <div className="stc-share-foot">
        <button className="btn block big" disabled={busy} onClick={onShare}>
          {closeOnly ? t('noteNew.shareWithClose') : t('common.share')}
        </button>
      </div>

      {sheet === 'replies' ? (
        <RepliesSheet
          value={replies}
          onClose={() => setSheet(null)}
          onPick={async (r) => {
            setSheet(null);
            try {
              await updateProfile(me.id, { story_replies: r });
              await refresh();
            } catch (e) {
              toastError(e);
            }
          }}
        />
      ) : null}
      {sheet === 'people' ? <PeopleSheet picked={recipients} onDone={(p) => { setRecipients(p); setSheet(null); }} /> : null}
      {sheet === 'highlight' ? <HighlightSheet value={highlight} onClose={() => setSheet(null)} onPick={(h) => { setHighlight(h); setSheet(null); }} /> : null}
    </div>
  );
}

/** Who can reply to your stories (Story settings has the same choice). */
function RepliesSheet({ value, onPick, onClose }: { value: StoryReplies; onPick: (r: StoryReplies) => void; onClose: () => void }) {
  return (
    <Modal onClose={onClose} title={t('d.stories.whoCanReply')} className="sv-sheet">
      <div className="sv-settings" role="radiogroup" aria-label={t('d.stories.whoCanReplyShort')}>
        {(Object.keys(REPLY_LABEL) as StoryReplies[]).map((r) => (
          <label key={r} className="row full hover sv-radio">
            <span className="grow">{t(REPLY_LABEL[r])}</span>
            <input type="radio" name="stc-replies" className="round-check" checked={value === r} onChange={() => onPick(r)} />
          </label>
        ))}
      </div>
    </Modal>
  );
}

/** Choose up to 10 people to send the story to in their messages. */
function PeopleSheet({ picked: start, onDone }: { picked: Profile[]; onDone: (p: Profile[]) => void }) {
  const { me } = useMe();
  const [base, setBase] = useState<Profile[] | null>(null);
  const [found, setFound] = useState<Profile[] | null>(null);
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<Profile[]>(start);
  useEffect(() => {
    peopleToMessage(me.id).then((l) => setBase(l.filter((p) => p.id !== me.id)), () => setBase([]));
  }, []);
  useEffect(() => {
    if (!q.trim()) return setFound(null);
    let alive = true;
    const t = setTimeout(() => searchProfiles(q).then((r) => alive && setFound(r.filter((p) => p.id !== me.id && !p.is_blocked)), () => alive && setFound([])), 220);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q]);
  const people = found ?? base;
  const toggle = (p: Profile, on: boolean) => setPicked((cur) => (on ? (cur.length >= 10 ? cur : [...cur, p]) : cur.filter((x) => x.id !== p.id)));
  return (
    <Modal onClose={() => onDone(picked)} title={t('d.stories.sendTo')} className="share stc-people-sheet">
      <div className="share-search">
        <span>{t('d.stories.to')}</span>
        <input autoFocus placeholder={t('d.stories.searchHint')} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t('createFlow.searchPeople')} />
      </div>
      <div className="share-list">
        {people === null ? <Spinner /> : null}
        {people && !people.length && q.trim() ? <p className="muted-text pad">{t('createFlow.noPeople')}</p> : null}
        {(people ?? []).map((p) => (
          <label key={p.id} className="row">
            <Avatar src={p.avatar_url} name={p.username} size={44} />
            <span className="row-text">
              <b>{p.full_name || p.username}</b>
              <span>{p.username}</span>
            </span>
            <input type="checkbox" className="round-check" aria-label={p.username} checked={picked.some((x) => x.id === p.id)} onChange={(e) => toggle(p, e.target.checked)} />
          </label>
        ))}
      </div>
      <div className="modal-foot">
        <button className="btn block" onClick={() => onDone(picked)}>
          {picked.length ? t('d.stories.doneCount', { count: picked.length }) : t('createFlow.done')}
        </button>
      </div>
    </Modal>
  );
}

/** One of your highlights, or a new one by name. Nothing is saved until the story is shared. */
function HighlightSheet({ value, onPick, onClose }: { value: HighlightChoice | null; onPick: (h: HighlightChoice | null) => void; onClose: () => void }) {
  const { me } = useMe();
  const [list, setList] = useState<Highlight[] | null>(null);
  const [title, setTitle] = useState(value && !value.id ? value.title : '');
  useEffect(() => {
    fetchHighlights(me.id).then(setList, () => setList([]));
  }, []);
  return (
    <Modal onClose={onClose} title={t('d.stories.addToHighlight')} className="sv-sheet">
      <div className="sv-hl-grid">
        {list === null ? <Spinner /> : null}
        {(list ?? []).map((h) => (
          <button key={h.id} className={'sv-hl' + (value?.id === h.id ? ' stc-hl-on' : '')} aria-pressed={value?.id === h.id} onClick={() => onPick(value?.id === h.id ? null : { id: h.id, title: h.title })}>
            <span className="hl-ring">{h.cover_url ? <img src={h.cover_url} alt="" /> : <span className="hl-blank" />}</span>
            <span>{h.title}</span>
          </button>
        ))}
      </div>
      <form
        className="sv-hl-new"
        onSubmit={(e) => {
          e.preventDefault();
          if (title.trim()) onPick({ title: title.trim() });
        }}
      >
        <input value={title} maxLength={30} placeholder={t('d.stories.newHighlightName')} aria-label={t('d.stories.newHighlightName')} onChange={(e) => setTitle(e.target.value)} />
        <button className="btn small" disabled={!title.trim()}>
          {t('common.create')}
        </button>
      </form>
      {value ? (
        <button className="stc-hl-none" onClick={() => onPick(null)}>
          {t('d.stories.noHighlight')}
        </button>
      ) : null}
    </Modal>
  );
}

/**
 * Your close friends list, changed from the editor: the people you follow, ticked when they are on
 * it. Only they see stories you share with close friends; they aren't told when you add them.
 */
export function CloseFriendsSheet({ onClose }: { onClose: (count: number) => void }) {
  const { me } = useMe();
  const [people, setPeople] = useState<Profile[] | null>(null);
  const [on, setOn] = useState<Set<string>>(new Set());
  const [q, setQ] = useState('');
  useEffect(() => {
    Promise.all([listCloseFriends(me.id), listPeople(me.id, 'following')]).then(
      ([friends, following]) => {
        setOn(new Set(friends.map((p) => p.id)));
        setPeople([...friends, ...following.filter((p) => !friends.some((f) => f.id === p.id))].filter((p) => p.id !== me.id));
      },
      (e) => {
        toastError(e);
        setPeople([]);
      },
    );
  }, []);
  const shown = useMemo(() => (people ?? []).filter((p) => !q.trim() || p.username.includes(q.trim().toLowerCase()) || p.full_name.toLowerCase().includes(q.trim().toLowerCase())), [people, q]);
  const flip = async (p: Profile, next: boolean) => {
    setOn((cur) => {
      const s = new Set(cur);
      if (next) s.add(p.id);
      else s.delete(p.id);
      return s;
    });
    try {
      await setCloseFriend(me.id, p.id, next);
    } catch (e) {
      toastError(e);
      setOn((cur) => {
        const s = new Set(cur);
        if (next) s.delete(p.id);
        else s.add(p.id);
        return s;
      });
    }
  };
  return (
    <Modal onClose={() => onClose(on.size)} title={t('settings.closeFriends')} className="share stc-friends-sheet">
      <div className="share-search">
        <Icon name="search" size={16} color="var(--fg2)" />
        <input placeholder={t('common.search')} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t('d.stories.searchFollowing')} />
      </div>
      <div className="share-list">
        {people === null ? <Spinner /> : null}
        {people && !shown.length && q.trim() ? <p className="muted-text pad">{t('d.stories.noOneFound')}</p> : null}
        {shown.map((p) => (
          <label key={p.id} className="row">
            <Avatar src={p.avatar_url} name={p.username} size={44} />
            <span className="row-text">
              <b>{p.username}</b>
              <span>{p.full_name}</span>
            </span>
            <input type="checkbox" className="round-check close" aria-label={t(on.has(p.id) ? 'createFlow.untag' : 'd.stories.addUser', { username: p.username })} checked={on.has(p.id)} onChange={(e) => flip(p, e.target.checked)} />
          </label>
        ))}
      </div>
      <div className="modal-foot">
        <button className="btn block" onClick={() => onClose(on.size)}>
          {tn('d.stories.donePeople', on.size)}
        </button>
      </div>
    </Modal>
  );
}
