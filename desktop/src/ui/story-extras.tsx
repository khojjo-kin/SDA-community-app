// The pieces around the story viewer: ring colours for Plus members, the device's muted list, and
// the sheets that open from a story (Viewers, the "…" menu, Report, About this account, Add to
// highlight, Story settings, Send to). The same steps as the iPhone app's story screen
// (app/(app)/story/[id].tsx, StoryChrome.tsx and story-alerts.tsx).
import React, { useEffect, useMemo, useState } from 'react';
import { addToHighlight, coverOf, createHighlight, fetchFollowAlerts, fetchHighlights, fetchStoryViewersDetailed, fetchStoryWatchList, getProfile, peopleToMessage, profilesInOrder, report, sendToPeople, setFollowAlerts, setStoryWatch, updateProfile } from 'shared/api';
import { ringColors } from 'shared/styling';
import { ago, dayLabel, fmt, monthName } from 'shared/theme';
import type { FollowAlerts, Highlight, Profile, Story, StoryItem, StoryReplies, StoryViewer as Viewer } from 'shared/types';
import { dateLocale, languageCode, t, tn } from '../lib/i18n';
import { useMe } from '../lib/me';
import { nav } from '../lib/router';
import { Avatar, Icon, Modal, Spinner, Verified, toast, toastError } from './kit';

/* ---------- ring colours (Plus) and ticks ---------- */

type Look = { ring: string; plus: boolean; verified: boolean };
const looks = new Map<string, Look>();
const asked = new Set<string>();

/**
 * Story cards carry neither the owner's chosen ring colour nor the tick, so both are looked up once
 * for everyone in the tray (profilesInOrder) and kept while the app is open.
 */
export function useLooks(ids: string[]): Map<string, Look> {
  const [, bump] = useState(0);
  const key = ids.join(',');
  useEffect(() => {
    const missing = ids.filter((id) => id && !asked.has(id));
    if (!missing.length) return;
    missing.forEach((id) => asked.add(id));
    let alive = true;
    profilesInOrder(missing).then(
      (people) => {
        for (const p of people) looks.set(p.id, { ring: p.ring_color ?? '', plus: !!p.plus, verified: !!p.verified });
        if (alive) bump((n) => n + 1);
      },
      () => missing.forEach((id) => asked.delete(id)),
    );
    return () => {
      alive = false;
    };
  }, [key]);
  return looks;
}

/** The gradient for a story ring: a Plus member's own colour, or the app's green. */
export function ringStyle(look: Look | undefined): React.CSSProperties | undefined {
  if (!look?.plus || !look.ring) return undefined;
  const c = ringColors(look.ring);
  return { ['--sv-ring' as any]: `linear-gradient(45deg, ${c.join(', ')})` };
}

/* ---------- muted stories (kept on this computer) ---------- */

const MUTE_KEY = 'community.mutedStories';
const muteListeners = new Set<() => void>();

export function mutedStories(): string[] {
  try {
    return JSON.parse(localStorage.getItem(MUTE_KEY) ?? '[]');
  } catch {
    return [];
  }
}

/** Muting someone's stories moves them to the end of the tray. The database has no such list yet, so it stays on this computer. */
export function setStoriesMuted(userId: string, on: boolean) {
  const next = new Set(mutedStories());
  if (on) next.add(userId);
  else next.delete(userId);
  try {
    localStorage.setItem(MUTE_KEY, JSON.stringify([...next]));
  } catch {
    // not kept
  }
  muteListeners.forEach((l) => l());
}

export function useMutedStories(): string[] {
  const [list, setList] = useState(mutedStories);
  useEffect(() => {
    const l = () => setList(mutedStories());
    muteListeners.add(l);
    return () => void muteListeners.delete(l);
  }, []);
  return list;
}

/* ---------- small helpers ---------- */

/** Why a story is reported. The English goes to the admins; the key is what the member reads. */
export const REPORT_REASONS: { reason: string; key: string }[] = [
  { reason: 'Spam', key: 'report.spam' },
  { reason: 'Harassment or hate', key: 'report.harassment' },
  { reason: 'Nudity or something unsuitable', key: 'd.stories.reasonUnsuitable' },
  { reason: 'Pretending to be someone else', key: 'profile.reportPretending' },
  { reason: 'Copyright or trademark', key: 'report.copyright' },
  { reason: 'Something else', key: 'report.other' },
];

/** The words written on a story, for text stories that have no picture. */
export function storyWords(item: StoryItem): string {
  const words = (item.overlays ?? []).filter((o) => o.kind === 'text').map((o) => o.text.trim()).filter(Boolean);
  return words.join('\n') || item.caption?.trim() || '';
}

/** "9 Oct" in English, as the app has always written it; the language's own short date otherwise. */
export function shortDay(d: Date): string {
  return languageCode() === 'en' ? dayLabel(d) : d.toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short' });
}

/** "October 2026" in English; the language's own month and year otherwise. */
function monthYear(d: Date): string {
  return languageCode() === 'en' ? `${monthName(d)} ${d.getFullYear()}` : d.toLocaleDateString(dateLocale(), { month: 'long', year: 'numeric' });
}

/** "2:41 pm" in English; the language's own clock otherwise. */
function clockTime(d: Date): string {
  if (languageCode() !== 'en') return d.toLocaleTimeString(dateLocale(), { hour: 'numeric', minute: '2-digit' });
  const h = d.getHours();
  return `${h % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
}

/** "2:41 pm", "Yesterday, 2:41 pm" or "9 Oct, 2:41 pm": when someone last watched. */
export function viewTime(iso: string): string {
  const d = new Date(iso);
  const time = clockTime(d);
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOf(new Date()) - startOf(d)) / 86400e3);
  if (days <= 0) return time;
  return days === 1 ? t('d.stories.yesterdayAt', { time }) : t('d.stories.dayAt', { day: shortDay(d), time });
}

/** "Active 2 hours ago": the shared agoLong's steps (minutes, hours, days, weeks), in the app's language. */
function activeAgo(iso: string): string {
  const a = ago(iso);
  if (a === 'now') return t('d.stories.activeJustNow');
  const n = parseInt(a, 10);
  const key = ({ m: 'd.stories.activeMinutes', h: 'd.stories.activeHours', d: 'd.stories.activeDays', w: 'd.stories.activeWeeks' } as Record<string, string>)[a.slice(-1)];
  return tn(key, n);
}

/** A switch row: the words on the left, the switch on the right. */
function SwitchRow({ label, on, onChange, sub }: { label: string; on: boolean; onChange: (on: boolean) => void; sub?: string }) {
  return (
    <label className="pop-toggle sv-switch-row">
      <span className="row-text">
        <b>{label}</b>
        {sub ? <span>{sub}</span> : null}
      </span>
      <input type="checkbox" role="switch" aria-label={label} checked={on} onChange={(e) => onChange(e.target.checked)} />
      <span className="switch" />
    </label>
  );
}

/* ---------- Viewers (your own story) ---------- */

/**
 * Who watched your story. Plus members also see how many times and when, and the bell on each row
 * (story alerts): they are told when that person watches their stories. The person isn't told.
 */
export function ViewersSheet({ story, onClose }: { story: Story; onClose: () => void }) {
  const { me } = useMe();
  const plus = !!me.plus;
  const [viewers, setViewers] = useState<Viewer[] | null>(null);
  const [watching, setWatching] = useState<Set<string> | null>(null);
  const [saving, setSaving] = useState<Set<string>>(new Set());
  useEffect(() => {
    fetchStoryViewersDetailed(story.id).then(setViewers, (e) => {
      toastError(e);
      setViewers([]);
    });
    if (plus) fetchStoryWatchList(me.id).then((list) => setWatching(new Set(list.map((p) => p.id))), () => setWatching(new Set()));
  }, [story.id]);

  const toggleWatch = async (p: Profile) => {
    if (!watching || saving.has(p.id)) return;
    const on = !watching.has(p.id);
    const flip = (cur: Set<string> | null, add: boolean) => {
      const next = new Set(cur ?? []);
      if (add) next.add(p.id);
      else next.delete(p.id);
      return next;
    };
    setSaving((s) => new Set(s).add(p.id));
    setWatching((cur) => flip(cur, on));
    try {
      await setStoryWatch(me.id, p.id, on);
      toast(t(on ? 'd.stories.alertOn' : 'd.stories.alertOff', { username: p.username }));
    } catch (e) {
      setWatching((cur) => flip(cur, !on));
      toastError(e);
    } finally {
      setSaving((s) => {
        const next = new Set(s);
        next.delete(p.id);
        return next;
      });
    }
  };

  const seenBy = Math.max(story.view_count ?? 0, viewers?.length ?? 0);
  return (
    <Modal title={t('d.stories.viewers')} onClose={onClose} className="sv-sheet">
      <div className="list-pad sv-viewers">
        {viewers === null ? <Spinner /> : null}
        {viewers && !viewers.length ? (
          <div className="empty small">
            <Icon name="eye" size={30} />
            <p>{t('d.stories.noViews')}</p>
          </div>
        ) : null}
        {viewers && viewers.length ? <p className="sv-seen-count">{tn('d.stories.seenByPeople', seenBy, { count: fmt(seenBy) })}</p> : null}
        {viewers && viewers.length && !plus ? (
          <button className="sv-plus-note" onClick={() => { onClose(); nav('/plus'); }}>
            <Icon name="crown" size={18} color="var(--accent2)" />
            <span>{t('d.stories.plusRewatches')}</span>
            <Icon name="right" size={14} color="var(--fg2)" stroke={2} />
          </button>
        ) : null}
        {(viewers ?? []).map((v) => {
          const p = v.profile;
          if (!p) return null;
          const on = !!watching?.has(p.id);
          const times = plus && v.view_count > 1 ? t('d.stories.watchedTimes', { count: fmt(v.view_count) }) : '';
          return (
            <div key={v.viewer_id} className="row sv-viewer">
              <button className="row-main" onClick={() => { onClose(); nav('/u/' + p.username); }}>
                <Avatar src={p.avatar_url} name={p.username} size={44} />
                <span className="row-text">
                  <b>
                    {p.username}
                    {p.verified ? <Verified size={12} /> : null}
                  </b>
                  <span>{p.full_name}</span>
                  {times ? <em className="sv-times">{times}</em> : null}
                </span>
                {plus ? <span className="sv-when">{viewTime(v.last_viewed_at)}</span> : null}
              </button>
              {plus ? (
                <button className="icon-btn" aria-pressed={on} aria-label={t(on ? 'd.stories.stopTelling' : 'd.stories.tellMe', { username: p.username })} onClick={() => toggleWatch(p)}>
                  <Icon name="bell" size={20} color={on ? 'var(--accent2)' : 'var(--fg2)'} fill={on ? 'var(--accent2)' : 'none'} />
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
    </Modal>
  );
}

/* ---------- the "…" menu ---------- */

/**
 * Someone else's story: Report, Mute, story notifications and About this account. Your own: Delete,
 * Add to highlight and Story settings. A highlight leaves out what only applies to a story.
 */
export function StoryMenu({ story, highlight, onClose, onDelete, onAddToHighlight, onSettings, onReport, onAbout, onMuted }: { story: Story; highlight?: boolean; onClose: () => void; onDelete: () => void; onAddToHighlight: () => void; onSettings: () => void; onReport: () => void; onAbout: () => void; onMuted: (on: boolean) => void }) {
  const { me } = useMe();
  const mine = story.user_id === me.id;
  const muted = useMutedStories().includes(story.user_id);
  const [alerts, setAlerts] = useState<FollowAlerts | null>(null);
  const [following, setFollowing] = useState(false);
  useEffect(() => {
    if (mine || highlight) return;
    // Story notifications are for people you follow (the database only tells followers).
    getProfile(story.user_id).then((p) => setFollowing(!!p?.is_following), () => {});
    fetchFollowAlerts(me.id, story.user_id).then(setAlerts, () => {});
  }, [story.user_id]);

  const setNotify = async (on: boolean) => {
    const before = alerts ?? { posts: false, stories: false, clips: false, live: false };
    const next = { ...before, stories: on };
    setAlerts(next);
    try {
      await setFollowAlerts(me.id, story.user_id, next);
      toast(t(on ? 'd.stories.notifyOn' : 'd.stories.notifyOff', { username: story.username }));
    } catch (e) {
      setAlerts(before);
      toastError(e);
    }
  };

  const item = (label: string, onClick: () => void, cls = '') => (
    <button className={cls} onClick={() => { onClose(); onClick(); }}>
      {label}
    </button>
  );
  return (
    <Modal onClose={onClose} className="choices sv-menu">
      {mine ? (
        <>
          {highlight ? null : item(t('common.delete'), onDelete, 'danger bold')}
          {highlight ? null : item(t('d.stories.addToHighlight'), onAddToHighlight)}
          {item(t('d.stories.settings'), onSettings)}
        </>
      ) : (
        <>
          {item(t('profile.report'), onReport, 'danger bold')}
          {highlight ? null : item(muted ? t('d.stories.unmuteStories') : t('d.stories.muteStories'), () => onMuted(!muted))}
          {!highlight && following && alerts ? <SwitchRow label={t('d.stories.notifyAbout', { username: story.username })} on={alerts.stories} onChange={setNotify} /> : null}
          {item(t('profile.about'), onAbout)}
        </>
      )}
      <button onClick={onClose}>{t('common.cancel')}</button>
    </Modal>
  );
}

/* ---------- Report ---------- */

export function ReportSheet({ story, onClose }: { story: Story; onClose: () => void }) {
  const { me } = useMe();
  return (
    <Modal onClose={onClose} title={t('d.stories.reportWhy')} className="sv-sheet">
      <div className="sv-reasons">
        {REPORT_REASONS.map(({ reason: r, key }) => (
          <button
            key={r}
            className="row full hover"
            onClick={async () => {
              onClose();
              try {
                await report(me.id, { userId: story.user_id }, `${r} (on a story)`);
                toast(t('d.stories.reportThanks'));
              } catch (e) {
                toastError(e);
              }
            }}
          >
            <Icon name="flag" size={18} />
            <span className="grow">{t(key)}</span>
            <Icon name="right" size={14} color="var(--fg3)" stroke={2} />
          </button>
        ))}
      </div>
    </Modal>
  );
}

/* ---------- About this account ---------- */

export function AboutAccount({ userId, onClose }: { userId: string; onClose: () => void }) {
  const [p, setP] = useState<Profile | null | undefined>(undefined);
  useEffect(() => {
    getProfile(userId).then(setP, (e) => {
      toastError(e);
      setP(null);
    });
  }, [userId]);
  const joined = p ? new Date(p.created_at) : null;
  const verifiedHow = p?.verified_via === 'notable' ? t('profile.verifiedNotable') : p?.verified_via === 'plus' ? t('profile.verifiedPlus') : t('common.verified');
  const verifiedWhy = p?.verified_via === 'notable' ? t('profile.verifiedWhyNotable') : p?.verified_via === 'plus' ? t('profile.verifiedWhyPlus') : t('profile.verifiedWhy');
  return (
    <Modal onClose={onClose} title={t('profile.about')} className="sv-sheet">
      {p === undefined ? <Spinner /> : null}
      {p ? (
        <div className="sv-about">
          <div className="sv-about-head">
            <Avatar src={p.avatar_url} name={p.username} size={76} />
            <b>
              {p.username}
              {p.verified ? <Verified size={14} /> : null}
            </b>
          </div>
          {joined && !Number.isNaN(joined.getTime()) ? <AboutRow icon="calendar" title={t('profile.dateJoined')} value={monthYear(joined)} /> : null}
          {p.country ? <AboutRow icon="location" title={t('profile.basedIn')} value={p.country} /> : null}
          {p.verified ? <AboutRow icon="verified" title={verifiedHow} value={verifiedWhy} /> : null}
          {p.active_at ? <AboutRow icon="clock" title={t('profile.activeStatus')} value={activeAgo(p.active_at)} /> : null}
        </div>
      ) : null}
    </Modal>
  );
}

function AboutRow({ icon, title, value }: { icon: 'calendar' | 'location' | 'verified' | 'clock'; title: string; value: string }) {
  return (
    <div className="row sv-about-row">
      <span className="sv-about-icon">{icon === 'verified' ? <Verified size={18} /> : <Icon name={icon} size={20} />}</span>
      <span className="row-text wrap">
        <b>{title}</b>
        <span>{value}</span>
      </span>
    </div>
  );
}

/* ---------- Add to highlight ---------- */

export function HighlightPicker({ item, onClose }: { item: StoryItem; onClose: () => void }) {
  const { me } = useMe();
  const [list, setList] = useState<Highlight[] | null>(null);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    fetchHighlights(me.id).then(setList, () => setList([]));
  }, []);
  const keep = async (h: { id?: string; title: string }) => {
    if (busy) return;
    setBusy(true);
    try {
      if (h.id) await addToHighlight(me.id, h.id, item);
      else await createHighlight(me.id, h.title, [item]);
      toast(t('d.stories.addedTo', { title: h.title }));
      onClose();
    } catch (e) {
      toastError(e);
      setBusy(false);
    }
  };
  return (
    <Modal onClose={onClose} title={t('d.stories.addToHighlight')} className="sv-sheet">
      <div className="sv-hl-grid">
        {list === null ? <Spinner /> : null}
        {(list ?? []).map((h) => (
          <button key={h.id} className="sv-hl" onClick={() => keep(h)} disabled={busy}>
            <span className="hl-ring">{h.cover_url ? <img src={h.cover_url} alt="" /> : <span className="hl-blank" />}</span>
            <span>{h.title}</span>
          </button>
        ))}
      </div>
      <form
        className="sv-hl-new"
        onSubmit={(e) => {
          e.preventDefault();
          if (title.trim()) keep({ title: title.trim() });
        }}
      >
        <input value={title} maxLength={30} placeholder={t('d.stories.newHighlightName')} aria-label={t('d.stories.newHighlightName')} onChange={(e) => setTitle(e.target.value)} />
        <button className="btn small" disabled={!title.trim() || busy}>
          {t('feed.add')}
        </button>
      </form>
    </Modal>
  );
}

/* ---------- Story settings ---------- */

// The labels are keys: t(label) where they are drawn.
const REPLY_CHOICES: { id: StoryReplies; label: string }[] = [
  { id: 'everyone', label: 'settings.repliesEveryone' },
  { id: 'following', label: 'settings.repliesFollowing' },
  { id: 'off', label: 'settings.repliesOff' },
];

/** Who can reply to your stories, close friends, the archive and (Plus) story alerts. */
export function StorySettings({ onClose, onLeave }: { onClose: () => void; onLeave: () => void }) {
  const { me, refresh } = useMe();
  const [replies, setReplies] = useState<StoryReplies>(me.story_replies ?? 'everyone');
  const [alerts, setAlerts] = useState<Profile[] | null>(null);
  useEffect(() => {
    if (me.plus) fetchStoryWatchList(me.id).then(setAlerts, () => setAlerts([]));
  }, []);
  const choose = async (r: StoryReplies) => {
    const before = replies;
    setReplies(r);
    try {
      await updateProfile(me.id, { story_replies: r });
      refresh().catch(() => {});
    } catch (e) {
      setReplies(before);
      toastError(e);
    }
  };
  const go = (to: string) => {
    onClose();
    onLeave();
    nav(to);
  };
  return (
    <Modal onClose={onClose} title={t('d.stories.settings')} className="sv-sheet">
      <div className="sv-settings">
        <h3>{t('d.stories.allowReplies')}</h3>
        <div role="radiogroup" aria-label={t('d.stories.allowReplies')}>
          {REPLY_CHOICES.map((c) => (
            <label key={c.id} className="row full hover sv-radio">
              <span className="grow">{t(c.label)}</span>
              <input type="radio" name="sv-replies" className="round-check" checked={replies === c.id} onChange={() => choose(c.id)} />
            </label>
          ))}
        </div>
        <button className="row full hover" onClick={() => go('/accounts/close-friends')}>
          <Icon name="star" size={20} />
          <span className="grow">{t('settings.closeFriends')}</span>
          <Icon name="right" size={14} color="var(--fg3)" stroke={2} />
        </button>
        <button className="row full hover" onClick={() => go('/archive')}>
          <Icon name="archive" size={20} />
          <span className="grow">{t('d.stories.archive')}</span>
          <Icon name="right" size={14} color="var(--fg3)" stroke={2} />
        </button>
        {me.plus ? (
          <>
            <h3>{t('settings.storyAlerts')}</h3>
            {alerts === null ? <Spinner size={20} /> : null}
            {alerts && !alerts.length ? <p className="sv-settings-note">{t('d.stories.noOneYet')}</p> : null}
            {(alerts ?? []).map((p) => (
              <div key={p.id} className="row sv-viewer">
                <Avatar src={p.avatar_url} name={p.username} size={36} />
                <span className="row-text">
                  <b>{p.username}</b>
                  <span>{p.full_name}</span>
                </span>
                <button
                  className="btn quiet small"
                  onClick={async () => {
                    setAlerts((cur) => (cur ?? []).filter((x) => x.id !== p.id));
                    try {
                      await setStoryWatch(me.id, p.id, false);
                    } catch (e) {
                      setAlerts((cur) => [p, ...(cur ?? [])]);
                      toastError(e);
                    }
                  }}
                >
                  {t('live.remove')}
                </button>
              </div>
            ))}
          </>
        ) : null}
      </div>
    </Modal>
  );
}

/* ---------- Send to people ---------- */

/** Sends the story's picture (or, for a text story, its words) to people in their messages. */
export function SendStory({ story, onClose }: { story: Story; onClose: () => void }) {
  const { me } = useMe();
  const [people, setPeople] = useState<Profile[] | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [q, setQ] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    peopleToMessage(me.id).then((list) => setPeople(list.filter((p) => p.id !== me.id)), (e) => {
      toastError(e);
      setPeople([]);
    });
  }, []);
  const shown = useMemo(() => (people ?? []).filter((p) => !q || p.username.includes(q.toLowerCase()) || p.full_name.toLowerCase().includes(q.toLowerCase())), [people, q]);
  const send = async () => {
    const cover = coverOf(story.item);
    const text = note.trim() || (cover ? '' : storyWords(story.item));
    if (!cover && !text) return toast(t('d.stories.addMessage'));
    setBusy(true);
    try {
      await sendToPeople(me.id, picked, { media: cover ? [cover] : [], text });
      toast(picked.length === 1 ? t('d.stories.sent') : t('d.stories.sentToPeople', { count: picked.length }));
      onClose();
    } catch (e) {
      toastError(e);
      setBusy(false);
    }
  };
  return (
    <Modal onClose={onClose} title={t('d.stories.sendTo')} className="share">
      <div className="share-search">
        <span>{t('d.stories.to')}</span>
        <input autoFocus placeholder={t('d.stories.searchHint')} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t('createFlow.searchPeople')} />
      </div>
      <div className="share-list">
        {people === null ? <Spinner /> : null}
        {people && !shown.length ? <p className="muted-text pad">{t('d.stories.noAccount')}</p> : null}
        {shown.map((p) => (
          <label key={p.id} className="row">
            <Avatar src={p.avatar_url} name={p.username} size={44} />
            <span className="row-text">
              <b>{p.full_name || p.username}</b>
              <span>{p.username}</span>
            </span>
            <input type="checkbox" className="round-check" aria-label={p.username} checked={picked.includes(p.id)} onChange={(e) => setPicked(e.target.checked ? [...picked, p.id] : picked.filter((x) => x !== p.id))} />
          </label>
        ))}
      </div>
      {picked.length ? <input className="share-note" placeholder={t('d.stories.writeMessageHint')} value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} aria-label={t('d.stories.writeMessage')} /> : null}
      <div className="modal-foot">
        <button className="btn block" disabled={!picked.length || busy} onClick={send}>
          {busy ? t('d.stories.sending') : picked.length > 1 ? t('d.stories.sendCount', { count: picked.length }) : t('common.send')}
        </button>
      </div>
    </Modal>
  );
}
